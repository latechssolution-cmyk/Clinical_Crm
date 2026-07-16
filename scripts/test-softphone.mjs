// Minimal browser softphone for testing the AI receptionist without a
// second phone number. Serves a dial page + mints Twilio Voice access
// tokens; calls route through the TwiML app straight to the voice bridge.
// Usage: node scripts/test-softphone.mjs   → open http://localhost:3333
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import dotenv from 'dotenv';

const require = createRequire(import.meta.url);
const twilio = require('twilio');

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
dotenv.config({ path: path.join(root, '.env') });

const {
  TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET,
  TWILIO_PHONE_NUMBER, TWIML_APP_SID = 'AP11bad6f5df69770ca448f5f28212b439',
} = process.env;

const PORT = 3333;

function mintToken() {
  const AccessToken = twilio.jwt.AccessToken;
  const token = new AccessToken(TWILIO_ACCOUNT_SID, TWILIO_API_KEY, TWILIO_API_SECRET, {
    identity: 'test-patient',
    ttl: 3600,
  });
  token.addGrant(new AccessToken.VoiceGrant({ outgoingApplicationSid: TWIML_APP_SID }));
  return token.toJwt();
}

const PAGE = /* html */ `<!doctype html>
<html><head><meta charset="utf-8"><title>Test Softphone — Clinical CRM</title>
<script src="/twilio.js"></script>
<style>
  body{font-family:system-ui;display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:90vh;background:#f8fafc}
  .card{background:#fff;border:1px solid #e2e8f0;border-radius:16px;padding:40px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,.05)}
  h1{font-size:18px;color:#0f172a}
  p{color:#64748b;font-size:14px}
  button{font-size:16px;padding:12px 32px;border-radius:999px;border:0;cursor:pointer;margin-top:16px}
  #call{background:#059669;color:#fff}
  #hangup{background:#dc2626;color:#fff;display:none}
  #status{margin-top:16px;font-size:13px;color:#334155;min-height:20px}
</style></head><body>
<div class="card">
  <h1>📞 Demo Family Clinic — Test Call</h1>
  <p>Calls the AI receptionist on ${TWILIO_PHONE_NUMBER}<br>through your browser microphone.</p>
  <button id="call">Call the clinic</button>
  <button id="hangup">Hang up</button>
  <div id="status">loading…</div>
</div>
<script>
  const status = (t) => document.getElementById('status').textContent = t;
  let device, activeCall;
  async function setup() {
    const res = await fetch('/token');
    const { token } = await res.json();
    device = new Twilio.Device(token, { logLevel: 'error' });
    await device.register();
    status('ready — click Call');
  }
  document.getElementById('call').onclick = async () => {
    if (!device) return;
    status('connecting…');
    activeCall = await device.connect({ params: { To: '${TWILIO_PHONE_NUMBER}' } });
    activeCall.on('accept', () => { status('connected — talk to the receptionist'); toggle(true); });
    activeCall.on('disconnect', () => { status('call ended'); toggle(false); });
    activeCall.on('error', (e) => { status('error: ' + e.message); toggle(false); });
  };
  document.getElementById('hangup').onclick = () => activeCall && activeCall.disconnect();
  function toggle(inCall) {
    document.getElementById('call').style.display = inCall ? 'none' : 'inline-block';
    document.getElementById('hangup').style.display = inCall ? 'inline-block' : 'none';
  }
  setup().catch(e => status('setup failed: ' + e.message));
</script>
</body></html>`;

import fs from 'node:fs';
const SDK = fs.readFileSync(path.join(root, 'tools', 'twilio-voice-sdk.js'));

http.createServer((req, res) => {
  if (req.url === '/token') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ token: mintToken() }));
  } else if (req.url === '/twilio.js') {
    res.writeHead(200, { 'Content-Type': 'application/javascript' });
    res.end(SDK);
  } else {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(PAGE);
  }
}).listen(PORT, () => {
  console.log(`[softphone] open http://localhost:${PORT} and click "Call the clinic"`);
});
