import WebSocket, { WebSocketServer } from 'ws';
import twilio from 'twilio';
import { config } from './config.js';
import { loadTenantByClinicId, takeCachedTenant } from './tenant.js';
import { buildInstructions, type ServiceMode } from './instructions.js';
import { getToolDefinitions } from './tools/definitions.js';
import { executeTool } from './tools/executor.js';
import { finalizeCall } from './finalize.js';
import { verifyStreamToken } from './stream-auth.js';
import { boostOutputAudio } from './audio.js';
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
  /** a model response is currently being generated/spoken */
  responseActive: boolean;
  /** pending debounced barge-in timer */
  bargeInTimer: NodeJS.Timeout | null;
  /** stall watchdog: caller spoke but no response started */
  stallTimer: NodeJS.Timeout | null;
  /** when the caller last finished speaking (input_audio_buffer.speech_stopped) */
  lastSpeechStoppedAt: number;
  /** when the model last started a response */
  lastResponseCreatedAt: number;
}

/** Sustained speech required before we interrupt the assistant (noise guard).
 * Tuned down from 300ms: callers reported the agent "keeps talking over me" —
 * 180ms still filters horn blips but cuts playback fast enough to feel heard. */
const BARGE_IN_DEBOUNCE_MS = 180;

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
  if (call.bargeInTimer) clearTimeout(call.bargeInTimer);
  if (call.stallTimer) clearTimeout(call.stallTimer);
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
    },
  });
  call.openaiWs = openaiWs;

  openaiWs.on('open', () => {
    console.log(`[call ${call.session.callId}] openai connected`);
    // GA Realtime API session shape (the beta shape was retired by OpenAI).
    safeSend(openaiWs, {
      type: 'session.update',
      session: {
        type: 'realtime',
        output_modalities: ['audio'],
        audio: {
          input: {
            format: { type: 'audio/pcmu' },
            // semantic_vad: the model judges real speech/interruptions instead
            // of a raw volume threshold — far more robust in noisy settings.
            // interrupt_response: the SERVER cancels + truncates its own
            // context when the caller interrupts, so the model never believes
            // it said words the caller didn't hear. We only clear Twilio's
            // playback buffer; no client-side cancel logic.
            turn_detection: { type: 'semantic_vad', create_response: true, interrupt_response: true },
            // far_field: tuned for speakerphones / background noise (traffic).
            noise_reduction: { type: 'far_field' },
            transcription: { model: 'whisper-1' },
          },
          output: {
            format: { type: 'audio/pcmu' },
            voice: call.session.tenant.agentConfig.voice || 'alloy',
          },
        },
        instructions: buildInstructions(call.session.tenant, {
          mode,
          callerNumber: call.session.fromNumber,
        }),
        tools: getToolDefinitions(call.session.tenant.vertical),
        tool_choice: 'auto',
      },
    });
    // Client events are processed in order — the greeting request can ride
    // immediately behind session.update instead of waiting a full round-trip
    // for session.updated. Shaves ~200-500ms off the caller's first hello.
    safeSend(openaiWs, { type: 'response.create' });
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
      case 'response.output_audio.delta':
      case 'response.audio.delta': {
        // Base64 G.711 μ-law from OpenAI → Twilio media frame. Drop stragglers
        // from a cancelled response — they'd refill the buffer we just cleared
        // and the agent would keep talking over the caller.
        if (!c.responseActive) break;
        if (typeof ev.delta === 'string' && c.streamSid) {
          safeSend(c.twilioWs, {
            event: 'media',
            streamSid: c.streamSid,
            media: { payload: boostOutputAudio(ev.delta) },
          });
        }
        break;
      }

      case 'response.created': {
        c.responseActive = true;
        c.lastResponseCreatedAt = Date.now();
        if (c.stallTimer) {
          clearTimeout(c.stallTimer);
          c.stallTimer = null;
        }
        break;
      }

      case 'input_audio_buffer.speech_started': {
        // The server decides whether this is a real interruption (semantic_vad
        // interrupt_response) and cancels itself. Our only job: stop the audio
        // already buffered at Twilio, debounced so a horn blip doesn't cut
        // playback. Mark inactive first so in-flight deltas are dropped.
        if (!c.responseActive) break;
        if (c.bargeInTimer) clearTimeout(c.bargeInTimer);
        c.bargeInTimer = setTimeout(() => {
          c.bargeInTimer = null;
          if (!c.responseActive) return;
          c.responseActive = false;
          if (c.streamSid) safeSend(c.twilioWs, { event: 'clear', streamSid: c.streamSid });
        }, BARGE_IN_DEBOUNCE_MS);
        break;
      }

      case 'input_audio_buffer.speech_stopped': {
        // Speech ended before the debounce window elapsed → treat as noise blip.
        if (c.bargeInTimer) {
          clearTimeout(c.bargeInTimer);
          c.bargeInTimer = null;
        }
        // Stall watchdog, keyed on the PROMPT signal (speech_stopped), not the
        // laggy whisper transcription: if the caller finished speaking and no
        // response starts within 3s, nudge one. The lastResponseCreatedAt
        // guard prevents double-answering a turn the model already handled —
        // the previous transcription-based version re-answered settled turns
        // and made the agent repeat itself.
        c.lastSpeechStoppedAt = Date.now();
        if (c.stallTimer) clearTimeout(c.stallTimer);
        c.stallTimer = setTimeout(() => {
          c.stallTimer = null;
          if (c.finalized || c.responseActive) return;
          if (c.lastResponseCreatedAt >= c.lastSpeechStoppedAt) return; // turn already answered
          console.log(`[call ${c.session.callId}] stall watchdog: nudging response`);
          safeSend(ws, { type: 'response.create' });
        }, 3000);
        break;
      }

      case 'conversation.item.input_audio_transcription.completed': {
        // NOTE: whisper transcriptions lag the model's own audio understanding
        // by seconds — never use this event to decide conversation state.
        // Stamp the turn at the time the caller STOPPED SPEAKING so the saved
        // transcript reads in true conversational order (finalize sorts by at).
        const text = typeof ev.transcript === 'string' ? ev.transcript.trim() : '';
        const at = new Date(c.lastSpeechStoppedAt || Date.now()).toISOString();
        if (text) c.session.transcript.push({ role: 'user', text, at });
        break;
      }

      case 'response.output_audio_transcript.done':
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
        c.responseActive = false;
        if (c.session.endRequested && c.streamSid) {
          // All audio deltas for the goodbye have been forwarded; ask Twilio to
          // echo a mark back once playback reaches this point, then hang up.
          safeSend(c.twilioWs, { event: 'mark', streamSid: c.streamSid, mark: { name: END_MARK } });
        }
        break;
      }

      case 'error': {
        // Benign race: the stall-watchdog nudge raced a server response.
        if (ev.error?.code === 'conversation_already_has_active_response') break;
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
            // The token minted by the (Twilio-signature-validated) webhook is
            // the stream's only credential — reject spoofed clinicId sessions.
            if (!verifyStreamToken(params.token ?? '', callId, clinicId)) {
              console.warn('[bridge] stream start with missing/invalid token — closing');
              twilioWs.close();
              return;
            }
            // Prefer the context the webhook just loaded (saves ~0.5s of DB
            // round-trips before the greeting); fall back to a fresh load.
            const tenant =
              takeCachedTenant(callId) ?? (clinicId ? await loadTenantByClinicId(clinicId) : null);
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
              qualification: {},
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
              responseActive: false,
              bargeInTimer: null,
              stallTimer: null,
              lastSpeechStoppedAt: 0,
              lastResponseCreatedAt: 0,
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
