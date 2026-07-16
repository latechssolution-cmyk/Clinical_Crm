import WebSocket, { WebSocketServer } from 'ws';
import twilio from 'twilio';
import { config } from './config.js';
import { loadTenantByClinicId } from './tenant.js';
import { buildInstructions, type ServiceMode } from './instructions.js';
import { toolDefinitions } from './tools/definitions.js';
import { executeTool } from './tools/executor.js';
import { finalizeCall } from './finalize.js';
import type { CallSession } from './session.js';

const END_MARK = 'end-of-call';

// ---------------------------------------------------------------------------
// Twilio Media Streams message shapes (subset)
// ---------------------------------------------------------------------------
interface TwilioStreamMessage {
  event: 'connected' | 'start' | 'media' | 'stop' | 'mark';
  streamSid?: string;
  start?: {
    streamSid: string;
    callSid?: string;
    customParameters?: Record<string, string>;
  };
  media?: { payload: string };
  mark?: { name: string };
}

interface LiveCall {
  session: CallSession;
  twilioWs: WebSocket;
  openaiWs: WebSocket | null;
  streamSid: string;
  finalized: boolean;
}

const liveCalls = new Set<LiveCall>();

export function activeCallCount(): number {
  return liveCalls.size;
}

export async function closeAllCalls(): Promise<void> {
  await Promise.allSettled([...liveCalls].map((c) => teardown(c, 'shutdown')));
}

function safeSend(ws: WebSocket | null, data: unknown): void {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(typeof data === 'string' ? data : JSON.stringify(data));
    } catch (err) {
      console.error('[bridge] ws send failed:', err);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-call teardown & finalize (idempotent)
// ---------------------------------------------------------------------------
async function teardown(call: LiveCall, reason: string): Promise<void> {
  if (call.finalized) return;
  call.finalized = true;
  liveCalls.delete(call);
  console.log(`[call ${call.session.callId}] teardown (${reason})`);

  try {
    call.openaiWs?.close();
  } catch { /* ignore */ }
  try {
    if (call.twilioWs.readyState === WebSocket.OPEN) call.twilioWs.close();
  } catch { /* ignore */ }

  // Optional REST hangup so Twilio ends the PSTN leg promptly.
  if (call.session.callSid && config.twilioAccountSid && config.twilioAuthToken) {
    try {
      const client = twilio(config.twilioAccountSid, config.twilioAuthToken);
      await client.calls(call.session.callSid).update({ status: 'completed' });
    } catch (err) {
      // Normal when the caller already hung up.
      console.log(`[call ${call.session.callId}] REST hangup skipped: ${(err as Error).message}`);
    }
  }

  try {
    await finalizeCall(call.session);
  } catch (err) {
    console.error(`[call ${call.session.callId}] finalize failed:`, err);
  }
}

// ---------------------------------------------------------------------------
// OpenAI Realtime leg
// ---------------------------------------------------------------------------
function connectOpenAI(call: LiveCall, mode: ServiceMode): void {
  if (!config.openaiApiKey) {
    console.error(`[call ${call.session.callId}] OPENAI_API_KEY missing — cannot start AI session`);
    void teardown(call, 'no openai key');
    return;
  }

  const url = `wss://api.openai.com/v1/realtime?model=${encodeURIComponent(config.openaiRealtimeModel)}`;
  const openaiWs = new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      'OpenAI-Beta': 'realtime=v1',
    },
  });
  call.openaiWs = openaiWs;

  let greeted = false;

  openaiWs.on('open', () => {
    console.log(`[call ${call.session.callId}] openai connected`);
    safeSend(openaiWs, {
      type: 'session.update',
      session: {
        modalities: ['audio', 'text'],
        input_audio_format: 'g711_ulaw',
        output_audio_format: 'g711_ulaw',
        turn_detection: { type: 'server_vad' },
        input_audio_transcription: { model: 'whisper-1' },
        voice: call.session.tenant.agentConfig.voice || 'alloy',
        instructions: buildInstructions(call.session.tenant, {
          mode,
          callerNumber: call.session.fromNumber,
        }),
        tools: toolDefinitions,
        tool_choice: 'auto',
      },
    });
  });

  openaiWs.on('message', (data) => {
    void handleOpenAIEvent(call, openaiWs, data.toString()).catch((err) => {
      console.error(`[call ${call.session.callId}] openai event error:`, err);
    });
  });

  openaiWs.on('error', (err) => {
    console.error(`[call ${call.session.callId}] openai ws error:`, err.message);
    void teardown(call, 'openai error');
  });

  openaiWs.on('close', () => {
    if (!call.finalized) void teardown(call, 'openai closed');
  });

  async function handleOpenAIEvent(c: LiveCall, ws: WebSocket, raw: string): Promise<void> {
    let ev: Record<string, any>;
    try {
      ev = JSON.parse(raw);
    } catch {
      return;
    }

    switch (ev.type) {
      case 'session.updated': {
        // Kick off the initial greeting exactly once.
        if (!greeted) {
          greeted = true;
          safeSend(ws, { type: 'response.create' });
        }
        break;
      }

      case 'response.audio.delta': {
        // Base64 G.711 μ-law from OpenAI → Twilio media frame.
        if (typeof ev.delta === 'string' && c.streamSid) {
          safeSend(c.twilioWs, {
            event: 'media',
            streamSid: c.streamSid,
            media: { payload: ev.delta },
          });
        }
        break;
      }

      case 'input_audio_buffer.speech_started': {
        // Barge-in: stop playback on the phone and cancel the in-flight response.
        if (c.streamSid) safeSend(c.twilioWs, { event: 'clear', streamSid: c.streamSid });
        safeSend(ws, { type: 'response.cancel' });
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        const text = typeof ev.transcript === 'string' ? ev.transcript.trim() : '';
        if (text) c.session.transcript.push({ role: 'user', text, at: new Date().toISOString() });
        break;
      }

      case 'response.audio_transcript.done': {
        const text = typeof ev.transcript === 'string' ? ev.transcript.trim() : '';
        if (text) c.session.transcript.push({ role: 'assistant', text, at: new Date().toISOString() });
        break;
      }

      case 'response.function_call_arguments.done': {
        const name = String(ev.name ?? '');
        const callId = String(ev.call_id ?? '');
        const result = await executeTool(c.session, name, String(ev.arguments ?? '{}'));
        safeSend(ws, {
          type: 'conversation.item.create',
          item: {
            type: 'function_call_output',
            call_id: callId,
            output: JSON.stringify(result),
          },
        });
        safeSend(ws, { type: 'response.create' });
        break;
      }

      case 'response.done': {
        if (c.session.endRequested && c.streamSid) {
          // All audio deltas for the goodbye have been forwarded; ask Twilio to
          // echo a mark back once playback reaches this point, then hang up.
          safeSend(c.twilioWs, { event: 'mark', streamSid: c.streamSid, mark: { name: END_MARK } });
        }
        break;
      }

      case 'error': {
        console.error(`[call ${c.session.callId}] openai error event:`, JSON.stringify(ev.error ?? ev));
        break;
      }

      default:
        break;
    }
  }
}

// ---------------------------------------------------------------------------
// Twilio Media Streams leg
// ---------------------------------------------------------------------------
export function createMediaWss(): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true });

  wss.on('connection', (twilioWs) => {
    let call: LiveCall | null = null;

    twilioWs.on('message', (data) => {
      let msg: TwilioStreamMessage;
      try {
        msg = JSON.parse(data.toString());
      } catch {
        return;
      }

      switch (msg.event) {
        case 'connected':
          break;

        case 'start': {
          void (async () => {
            const params = msg.start?.customParameters ?? {};
            const clinicId = params.clinicId ?? '';
            const callId = params.callId ?? '';
            const mode: ServiceMode = params.mode === 'message' ? 'message' : 'full_service';
            const tenant = clinicId ? await loadTenantByClinicId(clinicId) : null;
            if (!tenant || !callId) {
              console.error('[bridge] stream start with unknown tenant/call — closing');
              twilioWs.close();
              return;
            }
            const session: CallSession = {
              callId,
              callSid: msg.start?.callSid ?? params.callSid ?? null,
              tenant,
              fromNumber: params.from ?? '',
              mode,
              startedAt: Date.now(),
              transcript: [],
              patientId: null,
              endRequested: false,
              flaggedSpam: false,
              toolCallCount: 0,
            };
            call = {
              session,
              twilioWs,
              openaiWs: null,
              streamSid: msg.start?.streamSid ?? msg.streamSid ?? '',
              finalized: false,
            };
            liveCalls.add(call);
            console.log(
              `[call ${callId}] media stream started (clinic ${tenant.clinic.slug}, mode ${mode}, from ${session.fromNumber || 'unknown'})`,
            );
            connectOpenAI(call, mode);
          })().catch((err) => {
            console.error('[bridge] start handling failed:', err);
            twilioWs.close();
          });
          break;
        }

        case 'media': {
          if (call?.openaiWs && msg.media?.payload) {
            safeSend(call.openaiWs, { type: 'input_audio_buffer.append', audio: msg.media.payload });
          }
          break;
        }

        case 'mark': {
          if (call && msg.mark?.name === END_MARK) {
            // Goodbye audio finished playing on the phone.
            void teardown(call, 'agent ended call');
          }
          break;
        }

        case 'stop': {
          if (call) void teardown(call, 'caller hung up');
          break;
        }
      }
    });

    twilioWs.on('error', (err) => {
      console.error('[bridge] twilio ws error:', err.message);
      if (call) void teardown(call, 'twilio ws error');
    });

    twilioWs.on('close', () => {
      if (call) void teardown(call, 'twilio ws closed');
    });
  });

  return wss;
}
