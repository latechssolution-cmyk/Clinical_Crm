// One-command dev launcher for the voice stack:
//   1. starts a Cloudflare quick tunnel to localhost:8080
//   2. starts the voice bridge with PUBLIC_BASE_URL set to the tunnel URL
//   3. points the Twilio number's voice webhook at the tunnel
// Usage: node scripts/dev-voice.mjs
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import dotenv from 'dotenv';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env') });

const PORT = process.env.PORT || '8080';
const CLOUDFLARED = path.join(root, 'tools', 'cloudflared.exe');

const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER_SID, TWIML_APP_SID } = process.env;

async function twilioPost(pathname, body) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}${pathname}`, {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(body),
  });
  return res.json();
}

function log(tag, msg) {
  console.log(`[${tag}] ${msg}`);
}

// --- 1. tunnel ---
log('tunnel', 'starting Cloudflare quick tunnel...');
const tunnel = spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${PORT}`], {
  stdio: ['ignore', 'pipe', 'pipe'],
});

const tunnelUrl = await new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('tunnel URL not found within 60s')), 60_000);
  const scan = (chunk) => {
    const m = String(chunk).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) {
      clearTimeout(timeout);
      resolve(m[0]);
    }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan);
  tunnel.on('exit', (code) => reject(new Error(`cloudflared exited early (code ${code})`)));
});
log('tunnel', `up: ${tunnelUrl}`);

// --- 2. voice bridge ---
log('bridge', 'starting voice bridge...');
const bridge = spawn('npx', ['tsx', 'src/index.ts'], {
  cwd: path.join(root, 'apps', 'voice-bridge'),
  env: { ...process.env, PUBLIC_BASE_URL: tunnelUrl, PORT },
  stdio: 'inherit',
  shell: true,
});

// --- 3. twilio webhook ---
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWILIO_PHONE_NUMBER_SID) {
  const data = await twilioPost(`/IncomingPhoneNumbers/${TWILIO_PHONE_NUMBER_SID}.json`, {
    VoiceUrl: `${tunnelUrl}/voice/incoming`,
    VoiceMethod: 'POST',
  });
  if (data.sid) log('twilio', `webhook set: ${data.phone_number} -> ${data.voice_url}`);
  else log('twilio', `FAILED to set webhook: ${data.message}`);
} else {
  log('twilio', 'TWILIO_* env vars missing — webhook not updated');
}

// Keep the browser test-softphone's TwiML app pointed at the current tunnel too.
if (TWILIO_ACCOUNT_SID && TWILIO_AUTH_TOKEN && TWIML_APP_SID) {
  const data = await twilioPost(`/Applications/${TWIML_APP_SID}.json`, {
    VoiceUrl: `${tunnelUrl}/voice/incoming`,
    VoiceMethod: 'POST',
  });
  if (data.sid) log('twilio', `twiml app (softphone) -> ${data.voice_url}`);
  else log('twilio', `FAILED to update twiml app: ${data.message}`);
}

log('ready', `Call your Twilio number. Health check: ${tunnelUrl}/health`);

const shutdown = () => {
  tunnel.kill();
  bridge.kill();
  process.exit(0);
};
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
bridge.on('exit', shutdown);
