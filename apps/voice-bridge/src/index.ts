import { config, warnMissingEnv } from './config.js';
import { createHttpServer } from './server.js';
import { createMediaWss, closeAllCalls, activeCallCount } from './bridge.js';

warnMissingEnv();

const server = createHttpServer();
const mediaWss = createMediaWss();

server.on('upgrade', (req, socket, head) => {
  const url = (req.url ?? '').split('?')[0];
  if (url === '/media') {
    mediaWss.handleUpgrade(req, socket, head, (ws) => {
      mediaWss.emit('connection', ws, req);
    });
  } else {
    socket.destroy();
  }
});

server.listen(config.port, () => {
  console.log(`[voice-bridge] listening on http://localhost:${config.port}`);
  console.log(`[voice-bridge] webhook:      POST ${config.publicBaseUrl || 'http://localhost:' + config.port}/voice/incoming`);
  console.log(`[voice-bridge] media stream: wss://${(config.publicBaseUrl || 'localhost:' + config.port).replace(/^https?:\/\//, '')}/media`);
});

// One bad call must never take down the process.
process.on('uncaughtException', (err) => {
  console.error('[voice-bridge] uncaught exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('[voice-bridge] unhandled rejection:', reason);
});

let shuttingDown = false;
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[voice-bridge] ${signal} received — shutting down (${activeCallCount()} active calls)`);
  server.close();
  await closeAllCalls();
  // give finalize writes a moment, then exit
  setTimeout(() => process.exit(0), 500).unref();
}

process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
