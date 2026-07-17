import http from 'node:http';
import twilio from 'twilio';
import { config } from './config.js';
import { mintStreamToken } from './stream-auth.js';
import { getSupabase } from './db.js';
import { resolveTenantByNumber, isBlockedNumber, type TenantContext } from './tenant.js';
import { isWithinBusinessHours, describeBusinessHours } from './hours.js';
import { activeCallCount } from './bridge.js';

const VoiceResponse = twilio.twiml.VoiceResponse;

function readBody(req: http.IncomingMessage, limit = 64 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk: Buffer) => {
      body += chunk.toString('utf8');
      if (body.length > limit) {
        reject(new Error('body too large'));
        req.destroy();
      }
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function sendTwiml(res: http.ServerResponse, twiml: InstanceType<typeof VoiceResponse>): void {
  const xml = twiml.toString();
  res.writeHead(200, { 'Content-Type': 'text/xml', 'Content-Length': Buffer.byteLength(xml) });
  res.end(xml);
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  const json = JSON.stringify(body);
  res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(json) });
  res.end(json);
}

/** wss host for the <Stream> URL: prefer PUBLIC_BASE_URL, else the request Host. */
function streamHost(req: http.IncomingMessage): string {
  if (config.publicBaseUrl) return config.publicBaseUrl.replace(/^https?:\/\//, '');
  return req.headers.host ?? 'localhost';
}

function validateTwilioSignature(req: http.IncomingMessage, params: Record<string, string>): boolean {
  if (!config.publicBaseUrl) {
    console.warn('[server] PUBLIC_BASE_URL not set — SKIPPING Twilio signature validation (dev mode)');
    return true;
  }
  if (!config.twilioAuthToken) {
    console.warn('[server] TWILIO_AUTH_TOKEN not set — SKIPPING Twilio signature validation');
    return true;
  }
  const signature = String(req.headers['x-twilio-signature'] ?? '');
  const url = `${config.publicBaseUrl}${req.url ?? '/voice/incoming'}`;
  return twilio.validateRequest(config.twilioAuthToken, signature, url, params);
}

async function handleIncomingCall(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const body = await readBody(req);
  const params: Record<string, string> = {};
  for (const [k, v] of new URLSearchParams(body)) params[k] = v;

  if (!validateTwilioSignature(req, params)) {
    console.warn('[server] rejected webhook with invalid Twilio signature');
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    res.end('invalid signature');
    return;
  }

  const to = params.To ?? '';
  const from = params.From ?? '';
  const callSid = params.CallSid ?? '';
  const twiml = new VoiceResponse();

  // 1. Tenant resolution — the dialed number is the routing key.
  let tenant: TenantContext | null = null;
  try {
    tenant = await resolveTenantByNumber(to);
  } catch (err) {
    console.error('[server] tenant resolution failed:', err);
  }
  if (!tenant || tenant.clinic.status === 'suspended') {
    console.log(`[server] call to unknown/suspended number ${to} — rejecting`);
    if (tenant) {
      twiml.say('This business is currently unavailable. Please try again later.');
      twiml.hangup();
    } else {
      twiml.reject();
    }
    sendTwiml(res, twiml);
    return;
  }

  // 2. Blocked-number short circuit (saves an AI session).
  if (await isBlockedNumber(tenant.clinicId, from)) {
    console.log(`[server] blocked number ${from} calling clinic ${tenant.clinic.slug}`);
    twiml.say(`Thank you for calling ${tenant.clinic.name}. We are unable to take your call. Goodbye.`);
    twiml.hangup();
    sendTwiml(res, twiml);
    return;
  }

  // 3. Agent disabled → announce and hang up.
  if (!tenant.agentConfig.enabled) {
    twiml.say(
      `Thank you for calling ${tenant.clinic.name}. Our automated assistant is currently unavailable. Please call back later.`,
    );
    twiml.hangup();
    sendTwiml(res, twiml);
    return;
  }

  // 4. After-hours behavior.
  const open = isWithinBusinessHours(tenant.clinic.business_hours, tenant.clinic.timezone);
  let mode: 'full_service' | 'message' = 'full_service';
  if (!open) {
    const behavior = tenant.agentConfig.after_hours_behavior;
    if (behavior === 'announce_only') {
      const hours = describeBusinessHours(tenant.clinic.business_hours);
      twiml.say(
        `Thank you for calling ${tenant.clinic.name}. We are currently closed.` +
          (hours ? ` Our hours are: ${hours}.` : '') +
          ' Please call back during business hours. Goodbye.',
      );
      twiml.hangup();
      sendTwiml(res, twiml);
      return;
    }
    if (behavior === 'message') mode = 'message';
    // 'full_service' → proceed normally even after hours.
  }

  // 5. Create the calls row.
  let callId: string;
  try {
    const { data, error } = await getSupabase()
      .from('calls')
      .insert({
        clinic_id: tenant.clinicId,
        provider_call_id: callSid || null,
        direction: 'inbound',
        from_number: from || null,
        to_number: to || null,
        status: 'in_progress',
      })
      .select('id')
      .single();
    if (error || !data) throw new Error(error?.message ?? 'insert returned no row');
    callId = data.id as string;
  } catch (err) {
    console.error('[server] failed to create call row:', err);
    twiml.say('We are experiencing technical difficulties. Please call back shortly.');
    twiml.hangup();
    sendTwiml(res, twiml);
    return;
  }

  console.log(
    `[call ${callId}] incoming ${from || 'unknown'} → ${to} (clinic ${tenant.clinic.slug}, mode ${mode})`,
  );

  // 6. Bridge the audio: <Connect><Stream> to our /media WebSocket.
  const connect = twiml.connect();
  const stream = connect.stream({ url: `wss://${streamHost(req)}/media` });
  stream.parameter({ name: 'callId', value: callId });
  stream.parameter({ name: 'clinicId', value: tenant.clinicId });
  stream.parameter({ name: 'callSid', value: callSid });
  stream.parameter({ name: 'from', value: from });
  stream.parameter({ name: 'mode', value: mode });
  // The /media WebSocket has no Twilio signature — this token is the only
  // thing binding the stream to a webhook-validated call. Without it, anyone
  // reaching the wss endpoint could claim any clinicId.
  stream.parameter({ name: 'token', value: mintStreamToken(callId, tenant.clinicId) });
  sendTwiml(res, twiml);
}

export function createHttpServer(): http.Server {
  return http.createServer((req, res) => {
    const url = (req.url ?? '/').split('?')[0];

    if (req.method === 'GET' && url === '/health') {
      sendJson(res, 200, { ok: true, activeCalls: activeCallCount(), uptime: process.uptime() });
      return;
    }

    if (req.method === 'POST' && url === '/voice/incoming') {
      handleIncomingCall(req, res).catch((err) => {
        console.error('[server] /voice/incoming crashed:', err);
        if (!res.headersSent) {
          const twiml = new VoiceResponse();
          twiml.say('We are experiencing technical difficulties. Please call back shortly.');
          twiml.hangup();
          sendTwiml(res, twiml);
        }
      });
      return;
    }

    sendJson(res, 404, { error: 'not found' });
  });
}
