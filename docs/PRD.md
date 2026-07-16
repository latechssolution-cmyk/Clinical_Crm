# PRD — AI Clinic Receptionist SaaS Platform

**Working name:** Clinical CRM
**Version:** 0.1 (draft for review)
**Date:** 2026-07-16
**Status:** Awaiting review — no implementation started

---

## 1. Product Vision & Goals

A multi-tenant SaaS platform where any clinic can sign up and immediately get an AI voice receptionist that answers their phone, books appointments, and maintains patient records — plus a simple CRM dashboard for staff.

### Goals
1. **Zero custom development per clinic.** Onboarding a clinic = configuration, not code. Target: a new clinic fully live in under 30 minutes.
2. **Trustworthy appointment core.** Availability is always real, double booking is impossible at the database level, and every interface (AI agent, dashboard, future patient portal) sees the same truth instantly.
3. **A CRM doctors actually use.** Simple and focused: patients, calls, appointments, schedule. No feature sprawl.
4. **Strict tenant isolation.** A clinic's data is invisible to every other clinic, enforced in the database itself — not just in application code.

### Non-goals (v1)
- Billing/payments for patients (co-pays, invoicing)
- Insurance verification
- EHR/EMR integration (HL7/FHIR)
- Outbound campaign calling
- Multi-location clinics (one clinic = one location in v1; schema should not preclude it later)
- Patient-facing self-booking web portal (schema supports it; UI deferred)

### Success criteria for MVP
- A test clinic can be onboarded through the dashboard alone
- The AI answers a real inbound call, books a real appointment, and the appointment appears on the dashboard before the call ends
- Two concurrent booking attempts on the same slot: exactly one succeeds
- A user from clinic A can never read or write clinic B's data, verified by RLS tests

---

## 2. User Roles & Workflows

### Roles (per clinic)

| Role | Description | Permissions |
|---|---|---|
| **Owner** | Clinic administrator, typically the practice owner | Everything: billing, integrations, staff management, AI config, all clinical data |
| **Doctor** | Practicing clinician | Own schedule and availability, patients, appointments, call history; cannot manage integrations or staff |
| **Staff** | Front desk / assistants | Patients, appointments (all doctors), call history; cannot manage integrations, staff, or AI config |

A **platform admin** role (us, the operators) exists outside the tenant model for support and monitoring. It is not part of clinic-facing UI in v1.

One user account can belong to multiple clinics (e.g., a doctor working at two practices). Role is assigned per clinic membership.

### Key workflows

**W1 — Clinic onboarding (Owner)**
1. Sign up (email/password via Supabase Auth) → creates user + clinic + owner membership atomically
2. Guided setup wizard:
   - Clinic profile: name, address, timezone, business hours, services offered, FAQ content
   - Add doctors: name, specialty, weekly availability template, appointment types/durations
   - Connect telephony: link Twilio subaccount or enter own Twilio credentials; select/provision phone number; platform auto-configures the webhook
   - AI receptionist config: greeting, voice, language, escalation rules, booking policies
3. Test call → clinic goes live

**W2 — Inbound call (Patient ↔ AI agent)**
1. Patient calls clinic number → Twilio hits our voice webhook → we identify the clinic by the called number
2. Voice bridge connects call audio to OpenAI Realtime with the clinic's config (greeting, hours, doctors, FAQ) injected as instructions
3. Agent converses: identifies caller intent, collects/confirms patient identity, invokes backend tools (availability, booking, etc.)
4. On call end: transcript, summary, outcome, and any appointment changes are persisted; dashboard updates in real time

**W3 — Manual appointment management (Staff/Doctor)**
1. Staff views schedule (day/week), creates appointment for a patient in an open slot
2. Slot instantly becomes unavailable to the AI agent (same source of truth)
3. Cancel/reschedule from the dashboard with reason tracking

**W4 — Reviewing calls (Doctor/Staff)**
1. Call list with outcome badges (booked / cancelled / question answered / voicemail / spam / escalated)
2. Click into a call → summary, full transcript, linked patient, linked appointment, audio recording (if enabled)

**W5 — Managing availability (Doctor/Owner)**
1. Doctor sets weekly recurring availability (e.g., Mon/Wed 9–5, Fri 9–1)
2. Adds exceptions: vacations, blocked times, extra sessions
3. Changes propagate to slot search immediately

---

## 3. Multi-Tenant Architecture Requirements

**Model: shared database, shared schema, row-level isolation.** Every tenant-owned table carries a `clinic_id` column. Postgres Row-Level Security (RLS) enforces isolation at the database layer.

### Rules
1. **Every tenant table has `clinic_id NOT NULL REFERENCES clinics(id)`** — no exceptions.
2. **RLS enabled on every tenant table.** Policies derive the user's allowed clinics from their memberships (via JWT claims / a security-definer helper). App code never "remembers" to filter by clinic — the database refuses to return foreign rows even if app code is buggy.
3. **Two access paths:**
   - *Dashboard (browser)*: Supabase client with the user's JWT → RLS applies automatically.
   - *Voice bridge & internal services*: service-role key, but **every query goes through a tenant-scoped data layer** that requires an explicit `clinic_id` resolved from the call context (the dialed phone number). No raw service-role queries outside this layer.
4. **Composite uniqueness is tenant-scoped** (e.g., patient phone unique *per clinic*, not globally).
5. **Per-clinic secrets** (Twilio credentials, calendar tokens) stored encrypted (Supabase Vault / pgsodium), never readable via the anon/authenticated API, decrypted only server-side.
6. **No cross-tenant aggregation in v1** except internal platform metrics via service role.

Why not schema-per-tenant or DB-per-tenant: operational overhead (migrations × N tenants) kills the "onboarding is configuration" goal, and RLS on shared schema is the well-trodden Supabase path. Revisit only if a large enterprise tenant demands physical isolation.

---

## 4. Core Modules

1. **Tenancy & Auth** — clinics, users, memberships, roles, invitations
2. **Clinic Configuration** — profile, business hours, services, FAQ/knowledge base, AI agent settings
3. **Providers & Availability** — doctors, appointment types, recurring availability, exceptions
4. **Appointments** — slot computation, booking/cancel/reschedule with concurrency safety, status lifecycle
5. **Patients** — records, search/dedup by phone, notes
6. **Voice Agent** — Twilio webhook, realtime bridge, tool execution, transcript/summary persistence, spam detection
7. **Calls & Outcomes** — call log, transcripts, summaries, recordings, outcome classification
8. **CRM Dashboard** — schedule views, patient views, call views, analytics
9. **Integrations** — per-clinic telephony credentials, phone number management, calendar sync (stub in v1), webhook configuration
10. **Platform Ops** — health checks, per-tenant usage metrics, error monitoring

---

## 5. Database Entities & Relationships

All tables have `id UUID PK`, `created_at`, `updated_at`. All tenant tables have `clinic_id` (marked 🔒 = RLS enforced).

### Tenancy
- **clinics** — name, slug, timezone, address, phone, business_hours (jsonb), settings (jsonb), status (active/suspended/onboarding)
- **profiles** 🔒(self) — 1:1 with auth.users; display name, avatar
- **clinic_members** 🔒 — user_id + clinic_id + role (owner/doctor/staff); UNIQUE(user_id, clinic_id)
- **invitations** 🔒 — email, role, token, expires_at, accepted_at

### Providers & scheduling
- **doctors** 🔒 — name, specialty, optional link to a user_id (a doctor may or may not have a login), active flag
- **appointment_types** 🔒 — name (e.g., "New patient consult"), duration_minutes, buffer_minutes, bookable_by_ai flag
- **availability_rules** 🔒 — doctor_id, weekday, start_time, end_time (recurring weekly template)
- **availability_exceptions** 🔒 — doctor_id, date, type (blocked/extra), start_time, end_time, reason

### Appointments
- **appointments** 🔒 — doctor_id, patient_id, appointment_type_id, starts_at (timestamptz), ends_at, status (booked/confirmed/completed/cancelled/no_show), source (ai_call/dashboard/api), created_by (user or call reference), cancellation_reason, notes
  - **Double-booking guard:** exclusion constraint `EXCLUDE USING gist (doctor_id WITH =, tstzrange(starts_at, ends_at) WITH &&) WHERE (status IN ('booked','confirmed'))` — the database physically cannot hold two overlapping active appointments for one doctor. Plus `btree_gist` extension. This is the cornerstone of real-time correctness.

### Patients
- **patients** 🔒 — first_name, last_name, phone (E.164), email, date_of_birth, notes, flags (jsonb: verified, blocked); UNIQUE(clinic_id, phone)

### Calls
- **calls** 🔒 — twilio_call_sid, from_number, to_number, started_at, ended_at, duration, direction, status, patient_id (nullable — linked when identified), recording_url, spam_score, spam_reasons (jsonb)
- **call_transcripts** 🔒 — call_id, full transcript (jsonb array of turns), summary, outcome (booked/cancelled/rescheduled/info/voicemail/spam/escalated/incomplete), extracted_data (jsonb)
- **call_events** 🔒 — call_id, event_type (tool_call, escalation, error), payload (jsonb), timestamp — audit trail of what the AI actually did

### AI & integrations
- **agent_configs** 🔒 — greeting, voice id, language, model params, custom instructions, booking policy (jsonb: min notice, max advance days, required patient fields), escalation phone number, after_hours_behavior; 1:1 with clinic
- **clinic_integrations** 🔒 — provider (twilio/sip/google_calendar/...), credentials_ref (pointer to Vault secret), config (jsonb), status; UNIQUE(clinic_id, provider)
- **phone_numbers** 🔒 — e164 number, provider, integration_id, is_primary; **globally UNIQUE(number)** — this is the tenant-routing key for inbound calls

### Relationships (summary)
```
clinics 1—n clinic_members n—1 auth.users (via profiles)
clinics 1—n doctors 1—n availability_rules / availability_exceptions
clinics 1—n appointment_types
clinics 1—n patients 1—n appointments n—1 doctors
clinics 1—n calls 1—1 call_transcripts, 1—n call_events
clinics 1—1 agent_configs
clinics 1—n clinic_integrations 1—n phone_numbers
appointments n—1 calls (nullable: which call created it)
```

---

## 6. AI Voice Agent Workflows

### Call lifecycle
1. **Inbound** → Twilio webhook `POST /voice/incoming` (voice bridge service)
2. **Tenant resolution:** look up `phone_numbers` by the dialed number → clinic. Unknown number → reject. Suspended clinic → polite unavailable message.
3. **Session setup:** create `calls` row; open Twilio Media Stream ↔ OpenAI Realtime WebSocket bridge; inject system instructions built from clinic profile + agent_config + doctor list + FAQ; register the tool set scoped to this clinic.
4. **Conversation:** agent follows this state machine (encoded in instructions, enforced by tool preconditions):
   - Greet → identify intent → **identify caller** (phone match against patients; confirm name + DOB for existing, collect required fields for new) → execute intent via tools → confirm back to caller → offer further help → close
5. **Teardown:** on hangup/completion, persist transcript, generate summary + outcome classification (single non-realtime OpenAI call), update `calls`, emit realtime event to dashboard.

### Tool set (backend functions the agent invokes)
Every tool executes server-side with the clinic_id fixed by the session — the model can never pass a different tenant.

| Tool | Behavior |
|---|---|
| `find_patient` | Search by phone (auto from caller ID) or name+DOB; returns match candidates |
| `create_patient` | Requires clinic's configured minimum fields (default: full name + phone + DOB); phone verified against caller ID unless caller states booking for someone else |
| `get_available_slots` | doctor (optional), appointment type, date range → computed open slots from availability rules − exceptions − existing appointments |
| `book_appointment` | patient_id + doctor_id + slot + type → INSERT; on exclusion-constraint conflict returns "slot just taken" so the agent gracefully offers alternatives |
| `cancel_appointment` | Finds the patient's upcoming appointment(s), confirms which, cancels with reason |
| `reschedule_appointment` | Atomic cancel+book in one transaction |
| `get_clinic_info` | Hours, address, services, parking, insurance accepted — answers from clinic FAQ config |
| `save_call_note` | Mid-call flagging of important info (e.g., "patient mentions chest pain" → also triggers escalation policy) |
| `escalate_to_human` | Twilio call transfer to the clinic's configured escalation number, or take-a-message flow |
| `flag_spam` | Marks the call; agent politely disengages |

### Spam & abuse mitigation
- Signals: caller ID absent/invalid, repeated calls from same number without completed intent, refusal to provide identity, requests to block many slots, known-spam list per clinic
- Actions: `spam_score` on every call; agent requires full identity before booking; per-phone-number rate limit on bookings (e.g., max 2 active future appointments per patient by default, configurable); blocked-number list short-circuits before the AI session starts (saves cost)

### Safety & escalation
- Medical emergencies: instructions require immediately advising emergency services and offering transfer — the agent never gives medical advice
- Configurable escalation: keywords/situations that trigger human transfer
- After-hours behavior per clinic: full AI service, message-taking only, or emergency-info announcement

---

## 7. Appointment Booking Logic

### Source of truth
Slots are **never stored** — they are computed on demand:
```
open_slots(doctor, type, range) =
  availability_rules for weekday
  + extra availability_exceptions
  − blocked availability_exceptions
  − active appointments (booked/confirmed)
  discretized by appointment_type.duration + buffer
  filtered by booking policy (min notice, max advance)
```
Because slots are derived, there is nothing to "sync" — dashboard and AI always compute from the same rows.

### Concurrency correctness (the critical invariant)
1. **Database-level exclusion constraint** (§5) makes overlapping active appointments impossible — regardless of how many services write concurrently.
2. Booking is a single `INSERT`; a constraint violation is caught and surfaced as "slot no longer available." No check-then-insert race window.
3. Reschedule = one transaction (cancel + insert), atomic.

### Real-time propagation
- Supabase Realtime (Postgres changes) on `appointments` and `calls` → dashboard subscriptions update schedule and call list live, mid-call.
- The AI agent doesn't need push updates: it reads current state at tool-call time, and insert conflicts handle the sub-second race.

### Booking policies (per clinic, enforced in tools + dashboard API)
- Minimum notice (e.g., no booking < 2h ahead), maximum advance window (e.g., 60 days)
- Required patient fields before AI booking
- Max active future appointments per patient (anti-blocking)
- Which appointment types the AI may book vs. dashboard-only

---

## 8. CRM Dashboard Functionality

Next.js app, per-clinic workspace at `/app/[clinic-slug]/…` (or clinic switcher for multi-clinic users).

### v1 pages
1. **Today** (home) — today's appointments per doctor, live call activity, recent call outcomes, quick stats
2. **Schedule** — day/week calendar by doctor; create/edit/cancel appointments; drag-to-reschedule (stretch)
3. **Patients** — searchable list; detail view: contact info, appointment history, call history, notes
4. **Calls** — filterable log (outcome, date, spam); detail: summary, transcript, audio, linked patient/appointment; mark/unmark spam
5. **Analytics (basic)** — calls per day, booking conversion (calls → appointments), no-show rate, AI vs. manual booking ratio, peak call hours
6. **Settings** —
   - Clinic profile & hours
   - Doctors & availability
   - Appointment types
   - AI receptionist (greeting, voice, policies, FAQ, escalation) with test-call button
   - Integrations (Twilio, phone numbers, calendar)
   - Team (invite/remove members, roles)

### Design principles
- Live-updating (Supabase Realtime) — no refresh needed
- Role-aware: doctors default to their own schedule; staff see all
- Mobile-usable for the schedule and call views (doctors check phones between patients)

---

## 9. Integration Requirements

### Telephony (v1: Twilio; architecture: provider-agnostic)
- `TelephonyProvider` interface in the voice bridge: `provisionNumber`, `configureWebhook`, `transferCall`, `parseInboundWebhook`, media-stream adapter. Twilio is the first implementation; SIP/others later implement the same interface.
- Per-clinic credential models: (a) clinic's own Twilio account credentials, or (b) platform-managed Twilio subaccount (recommended default — simplest onboarding). Both stored in Vault.
- Webhook auto-configuration on number connect (no manual Twilio console steps for the clinic).
- Twilio signature validation on every inbound webhook.

### OpenAI
- Platform-level API key in v1 (usage metered per clinic via call records for future billing). Schema allows per-clinic keys later.
- Realtime API for voice; standard API for post-call summarization/classification.

### Calendar (v1: minimal)
- v1 ships **iCal read-only feed per doctor** (subscribe from Google/Apple/Outlook — zero OAuth complexity).
- Google Calendar two-way sync is a fast-follow (OAuth per clinic, tokens in Vault, sync worker). Schema (`clinic_integrations`) supports it from day one.

### Webhooks/events (future)
- `clinic_integrations` supports an outbound-webhook provider type for clinics wanting event pushes (appointment.created etc.). Not in v1 UI.

---

## 10. Security Considerations

1. **Tenant isolation:** RLS on all tenant tables (§3); automated cross-tenant access tests in CI (attempt reads/writes across clinics with real JWTs — must fail).
2. **Secrets:** per-clinic credentials in Supabase Vault; service-role key only in server environments (voice bridge, API routes); never in browser bundles.
3. **Webhook authenticity:** Twilio signature validation; reject unsigned/invalid requests.
4. **Voice-agent hardening:** tools are tenant-pinned server-side; model output is never trusted for tenant/id resolution; tool inputs validated (zod) before touching the DB; prompt-injection from callers cannot reach other tenants because the tool layer is scoped, not the model.
5. **PHI awareness:** this is health-adjacent data. v1 measures: encryption at rest (Supabase default) and in transit, audit trail (`call_events`, appointment status history), role-based access, recording opt-in per clinic with caller notification ("this call may be recorded") baked into the greeting, data-retention config per clinic. Full HIPAA compliance (BAAs with Twilio/OpenAI/Supabase, formal policies) is flagged as a **pre-launch business requirement for US clinics** — BAA-eligible tiers exist for all three vendors but require paid plans and signed agreements. v1 architecture must not preclude it (it doesn't).
6. **Auth:** Supabase Auth, email+password with email verification; JWT carries active clinic + role claims; session invalidation on membership removal.
7. **Rate limiting:** on auth endpoints, on booking tools per caller number, on webhook endpoints per clinic.
8. **Least privilege in UI:** role checks server-side (RLS + API), UI hiding is cosmetic only.

---

## 11. MVP vs Future

### MVP (build now)
- Multi-tenant schema + RLS + auth + roles (owner/doctor/staff)
- Clinic onboarding wizard (profile, doctors, availability, appointment types)
- Twilio integration: platform-managed subaccounts, number provisioning, webhook auto-config
- Voice bridge service: Twilio Media Streams ↔ OpenAI Realtime, full tool set (§6), transcripts, summaries, outcomes
- Appointment engine: computed slots, exclusion-constraint booking, cancel/reschedule, booking policies
- Patients module with phone-based identity matching
- Dashboard: Today, Schedule, Patients, Calls, Settings, basic analytics
- Supabase Realtime live updates
- Spam scoring + blocked numbers
- iCal feeds per doctor

### Fast-follow (v1.x)
- Google Calendar two-way sync
- SMS confirmations & reminders (Twilio SMS — trivially adjacent)
- Drag-and-drop rescheduling
- Multi-language agent per clinic
- Platform admin panel

### Future (v2+)
- Patient self-booking portal
- Other telephony providers / BYO-SIP
- Platform billing (Stripe) & usage-based pricing
- Multi-location clinics
- EHR integrations (FHIR)
- Outbound calls (reminder calls, waitlist filling)
- Advanced analytics & reporting
- HIPAA compliance program (BAAs, audit certification) — timing driven by go-to-market

### Explicitly out of scope
- Medical advice of any kind from the AI
- Insurance claims processing
- Telemedicine/video visits

---

## 12. Recommended Technical Architecture

```
                        ┌──────────────────────────────┐
  Patient ──phone──▶    │  Twilio (per-clinic number)  │
                        └──────┬───────────────┬───────┘
                          webhook          media stream (WS)
                               ▼               ▼
                        ┌──────────────────────────────┐      ┌─────────────┐
                        │  Voice Bridge Service        │◀────▶│ OpenAI      │
                        │  (Node/TS, long-lived WS)    │      │ Realtime API│
                        │  Fly.io / Railway / Render   │      └─────────────┘
                        │  - tenant resolution         │
                        │  - realtime session mgmt     │
                        │  - tool execution layer      │─────────────┐
                        │  - transcript persistence    │             │
                        └──────────────────────────────┘             │ service role,
                                                                     │ tenant-scoped
                        ┌──────────────────────────────┐             ▼
  Clinic staff ──▶      │  Next.js Dashboard (Vercel)  │      ┌─────────────────────┐
                        │  - App Router, RSC           │◀────▶│  Supabase           │
                        │  - Supabase client (RLS)     │ auth │  - Postgres + RLS   │
                        │  - Realtime subscriptions    │  +   │  - Auth             │
                        │  - API routes (server ops)   │ data │  - Realtime         │
                        └──────────────────────────────┘      │  - Vault (secrets)  │
                                                              │  - Storage (audio)  │
                                                              └─────────────────────┘
```

### Key decisions & rationale

| Decision | Choice | Why |
|---|---|---|
| Voice bridge hosting | **Dedicated Node service (Fly.io/Railway), NOT Vercel** | Twilio Media Streams and OpenAI Realtime both require persistent WebSockets held for the full call duration. Vercel serverless cannot hold them. This is the one component outside the Vercel/Supabase stack — unavoidable. |
| Tenancy | Shared schema + RLS | §3 — operationally simplest, Supabase-native, meets isolation bar |
| Double-booking prevention | Postgres exclusion constraint | Correct under any concurrency, no locks/queues to build, provably no race window |
| Slots | Computed, never stored | Nothing to sync or invalidate; single source of truth |
| Realtime UI | Supabase Realtime | Native, no extra infra |
| Secrets | Supabase Vault | Encrypted at rest, server-only access |
| Twilio model | Platform subaccounts (default) + BYO-account (option) | Subaccounts = one-click onboarding; BYO for clinics with existing numbers |
| Monorepo | Single repo: `apps/web` (Next.js), `apps/voice-bridge` (Node), `packages/db` (schema, migrations, generated types), `packages/core` (shared domain logic: slot computation, booking, validation) | Slot/booking logic must be identical for dashboard and agent — shared package guarantees it |
| Migrations | Supabase CLI migrations in repo, CI-applied | Reproducible, reviewable schema history |
| Language | TypeScript everywhere | Shared types from DB to UI to agent tools |

### Proposed repo structure
```
apps/
  web/            # Next.js dashboard (Vercel)
  voice-bridge/   # Twilio<->OpenAI realtime service (Fly.io/Railway)
packages/
  db/             # migrations, seed, generated types
  core/           # domain logic: slots, booking, policies, validation (shared)
  telephony/      # TelephonyProvider interface + Twilio impl
supabase/         # supabase CLI config, migrations
docs/             # this PRD, ADRs
```

### Build order (proposed, after PRD approval)
1. Schema + RLS + migrations + isolation tests (foundation everything depends on)
2. Auth + clinic creation + memberships + onboarding wizard skeleton
3. Availability + slot computation + booking engine (`packages/core`) with unit tests incl. concurrency test
4. Dashboard: Schedule + Patients (manual CRM works end-to-end without AI)
5. Voice bridge: Twilio webhook → Realtime session → tools → transcripts
6. Calls UI + analytics + spam handling
7. Onboarding polish: subaccount provisioning, number purchase, test-call flow
```
Each phase is independently verifiable; the AI agent lands on an already-proven booking core.
```

---

## 13. Decisions (resolved 2026-07-16)

1. **Twilio model:** Use the existing platform Twilio account directly for the first clinic (single-clinic launch). Subaccount provisioning deferred until the model proves out. The `clinic_integrations` schema still supports per-clinic credentials from day one, so this is a config default, not an architectural constraint.
2. **Recording:** OFF by default — Twilio recording costs extra ($0.0025/min + storage). Transcripts/summaries are unaffected (generated from the live media stream at no additional cost). Per-clinic opt-in remains in the schema.
3. **Region:** Region-agnostic build — E.164 phone numbers, per-clinic timezone, English-first agent with per-clinic language config. HIPAA deferred to future (§11).
4. **Voice bridge hosting:** Development = local + ngrok tunnel (free). Demo/first deployment = Render free tier (caveat: sleeps after 15 min idle; upgrade to paid ~$7/mo when a real clinic goes live). Host-agnostic Node service — a Dockerfile and a start script, portable anywhere.
5. **Platform billing:** deferred (v2+).
