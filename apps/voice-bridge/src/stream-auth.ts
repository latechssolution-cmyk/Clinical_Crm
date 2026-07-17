import crypto from 'node:crypto';
import { config } from './config.js';

// The /voice/incoming webhook is authenticated by Twilio's request signature,
// but the /media WebSocket Twilio opens afterwards carries no signature — the
// bridge would otherwise have to trust a client-supplied clinicId. So the
// webhook mints a short-lived HMAC token binding (callId, clinicId), and the
// bridge refuses any stream start that doesn't present a valid one.

const TOKEN_TTL_MS = 5 * 60 * 1000;

function signingKey(): string {
  // Twilio auth token doubles as the HMAC key: it is already required for
  // webhook validation and never leaves the server.
  return config.twilioAuthToken || 'dev-insecure-key';
}

function hmac(payload: string): string {
  return crypto.createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

export function mintStreamToken(callId: string, clinicId: string): string {
  const exp = Date.now() + TOKEN_TTL_MS;
  const payload = `${callId}:${clinicId}:${exp}`;
  return `${exp}.${hmac(payload)}`;
}

export function verifyStreamToken(token: string, callId: string, clinicId: string): boolean {
  const dot = token.indexOf('.');
  if (dot < 1) return false;
  const exp = Number(token.slice(0, dot));
  const mac = token.slice(dot + 1);
  if (!Number.isFinite(exp) || Date.now() > exp) return false;
  const expected = hmac(`${callId}:${clinicId}:${exp}`);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
