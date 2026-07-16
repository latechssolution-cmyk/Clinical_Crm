# voice-bridge

Twilio ↔ OpenAI Realtime bridge for the AI clinic receptionist.

One Node process serves:

- `POST /voice/incoming` — Twilio Voice webhook (signature-validated). Resolves the clinic from the dialed number, checks blocked numbers / agent enabled / after-hours behavior, creates the `calls` row, and answers with `<Connect><Stream>`.
- `wss://…/media` — Twilio Media Streams leg. Bridges G.711 μ-law audio to an OpenAI Realtime session with clinic-scoped instructions and tools. Every tool executes server-side with the clinic id pinned from the dialed number — the model can never reach another tenant.
- `GET /health` — liveness + active call count.

On hangup the call is finalized: duration, transcript turns, an LLM-generated summary/outcome (gpt-4o-mini, JSON mode), spam heuristics, and the identified patient are persisted.

## Run locally

```bash
# from the repo root (deps are already installed at the workspace root)
npm run dev --workspace apps/voice-bridge
```

Expose it and wire up Twilio:

```bash
ngrok http 8080
```

1. Set `PUBLIC_BASE_URL=https://<your-subdomain>.ngrok-free.app` in the root `.env` and restart.
2. In the Twilio console (or via API), set the phone number's **Voice webhook** to `POST {PUBLIC_BASE_URL}/voice/incoming`.
3. The dialed number must exist in the `phone_numbers` table and belong to a clinic with an `agent_configs` row.
4. Call the number.

## Environment variables

Loaded from the repo-root `.env` (and an optional `apps/voice-bridge/.env` override). Missing vars are logged at startup, never fatal.

| Variable | Required | Purpose |
|---|---|---|
| `SUPABASE_URL` | yes | Supabase project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | yes | Service-role key (tenant scoping enforced in code) |
| `OPENAI_API_KEY` | yes for AI sessions | Realtime voice + post-call summarization |
| `TWILIO_AUTH_TOKEN` | yes in prod | Webhook signature validation + REST hangup |
| `TWILIO_ACCOUNT_SID` | optional | Enables REST hangup when the agent ends the call |
| `PUBLIC_BASE_URL` | yes in prod | Public https base URL (ngrok/Render). Unset → signature validation is skipped with a warning (dev mode) |
| `PORT` | no (default 8080) | Listen port |
| `OPENAI_REALTIME_MODEL` | no (default `gpt-realtime`) | Realtime model override |
| `OPENAI_SUMMARY_MODEL` | no (default `gpt-4o-mini`) | Post-call summary model |

## Docker

```bash
# from the repo root
docker build -f apps/voice-bridge/Dockerfile -t voice-bridge .
docker run -p 8080:8080 --env-file .env voice-bridge
```
