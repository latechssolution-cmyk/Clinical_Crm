-- =============================================================================
-- Clinical CRM — initial multi-tenant schema
-- Tenancy model: shared schema, clinic_id on every tenant table, RLS everywhere.
-- =============================================================================

create extension if not exists btree_gist;
create extension if not exists pgcrypto;

-- Private schema for security-definer helpers (not exposed via PostgREST)
create schema if not exists private;

-- -----------------------------------------------------------------------------
-- Enums
-- -----------------------------------------------------------------------------
create type public.member_role as enum ('owner', 'doctor', 'staff');
create type public.appointment_status as enum ('booked', 'confirmed', 'completed', 'cancelled', 'no_show');
create type public.appointment_source as enum ('ai_call', 'dashboard', 'api');
create type public.call_outcome as enum ('booked', 'cancelled', 'rescheduled', 'info', 'voicemail', 'spam', 'escalated', 'incomplete');
create type public.clinic_status as enum ('onboarding', 'active', 'suspended');

-- -----------------------------------------------------------------------------
-- updated_at trigger
-- -----------------------------------------------------------------------------
create or replace function private.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- -----------------------------------------------------------------------------
-- Tenancy
-- -----------------------------------------------------------------------------
create table public.clinics (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  timezone text not null default 'UTC',
  address text,
  contact_phone text,
  contact_email text,
  business_hours jsonb not null default '{}'::jsonb,
  settings jsonb not null default '{}'::jsonb,
  status public.clinic_status not null default 'onboarding',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clinic_members (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.member_role not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, user_id)
);
create index on public.clinic_members (user_id);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  email text not null,
  role public.member_role not null,
  token uuid not null default gen_random_uuid() unique,
  expires_at timestamptz not null default now() + interval '7 days',
  accepted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.invitations (clinic_id);

-- -----------------------------------------------------------------------------
-- Providers & scheduling
-- -----------------------------------------------------------------------------
create table public.doctors (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  name text not null,
  specialty text,
  bio text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.doctors (clinic_id);

create table public.appointment_types (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  name text not null,
  duration_minutes int not null check (duration_minutes between 5 and 480),
  buffer_minutes int not null default 0 check (buffer_minutes between 0 and 120),
  bookable_by_ai boolean not null default true,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.appointment_types (clinic_id);

create table public.availability_rules (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  weekday int not null check (weekday between 0 and 6), -- 0=Sunday
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time < end_time)
);
create index on public.availability_rules (clinic_id, doctor_id);

create table public.availability_exceptions (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  date date not null,
  kind text not null check (kind in ('blocked', 'extra')),
  start_time time, -- null = whole day
  end_time time,
  reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_time is null or end_time is null or start_time < end_time)
);
create index on public.availability_exceptions (clinic_id, doctor_id, date);

-- -----------------------------------------------------------------------------
-- Patients
-- -----------------------------------------------------------------------------
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  phone text not null, -- E.164
  email text,
  date_of_birth date,
  notes text,
  flags jsonb not null default '{}'::jsonb, -- {verified, blocked, ...}
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, phone)
);
create index on public.patients (clinic_id);
create index on public.patients (clinic_id, last_name, first_name);

-- -----------------------------------------------------------------------------
-- Calls (created before appointments so appointments can reference calls)
-- -----------------------------------------------------------------------------
create table public.calls (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider_call_id text, -- e.g. Twilio CallSid
  direction text not null default 'inbound' check (direction in ('inbound', 'outbound')),
  from_number text,
  to_number text,
  patient_id uuid references public.patients(id) on delete set null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  duration_seconds int,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed', 'failed', 'rejected')),
  recording_url text,
  spam_score numeric(3,2) check (spam_score between 0 and 1),
  spam_reasons jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.calls (clinic_id, started_at desc);
create unique index on public.calls (provider_call_id) where provider_call_id is not null;

create table public.call_transcripts (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade unique,
  turns jsonb not null default '[]'::jsonb, -- [{role, text, at}]
  summary text,
  outcome public.call_outcome,
  extracted_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.call_transcripts (clinic_id);

create table public.call_events (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  call_id uuid not null references public.calls(id) on delete cascade,
  event_type text not null, -- tool_call | escalation | error | ...
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index on public.call_events (call_id);
create index on public.call_events (clinic_id);

-- -----------------------------------------------------------------------------
-- Appointments — with the double-booking exclusion constraint
-- -----------------------------------------------------------------------------
create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  doctor_id uuid not null references public.doctors(id) on delete cascade,
  patient_id uuid not null references public.patients(id) on delete cascade,
  appointment_type_id uuid references public.appointment_types(id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.appointment_status not null default 'booked',
  source public.appointment_source not null default 'dashboard',
  created_by_user uuid references auth.users(id) on delete set null,
  created_by_call uuid references public.calls(id) on delete set null,
  cancellation_reason text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at),
  -- THE core invariant: one doctor can never hold two overlapping active
  -- appointments, no matter how many writers race.
  constraint no_double_booking exclude using gist (
    doctor_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status in ('booked', 'confirmed'))
);
create index on public.appointments (clinic_id, starts_at);
create index on public.appointments (doctor_id, starts_at);
create index on public.appointments (patient_id);

-- -----------------------------------------------------------------------------
-- AI config & integrations
-- -----------------------------------------------------------------------------
create table public.agent_configs (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade unique,
  greeting text,
  voice text not null default 'alloy',
  language text not null default 'en',
  custom_instructions text,
  faq jsonb not null default '[]'::jsonb, -- [{q, a}]
  booking_policy jsonb not null default '{"min_notice_minutes": 120, "max_advance_days": 60, "max_active_appointments_per_patient": 2, "required_patient_fields": ["first_name", "last_name", "phone", "date_of_birth"]}'::jsonb,
  escalation_number text,
  after_hours_behavior text not null default 'message' check (after_hours_behavior in ('full_service', 'message', 'announce_only')),
  recording_enabled boolean not null default false,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clinic_integrations (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  provider text not null, -- twilio | sip | google_calendar | ...
  credentials_ref text,   -- Vault secret name; never the secret itself
  config jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'active', 'error', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (clinic_id, provider)
);

create table public.phone_numbers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  integration_id uuid references public.clinic_integrations(id) on delete set null,
  number text not null unique, -- E.164; global uniqueness = tenant routing key
  provider text not null default 'twilio',
  is_primary boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.phone_numbers (clinic_id);

-- -----------------------------------------------------------------------------
-- Blocked numbers (spam short-circuit before AI session)
-- -----------------------------------------------------------------------------
create table public.blocked_numbers (
  id uuid primary key default gen_random_uuid(),
  clinic_id uuid not null references public.clinics(id) on delete cascade,
  number text not null,
  reason text,
  created_at timestamptz not null default now(),
  unique (clinic_id, number)
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'clinics','profiles','clinic_members','invitations','doctors','appointment_types',
    'availability_rules','availability_exceptions','patients','calls','call_transcripts',
    'appointments','agent_configs','clinic_integrations','phone_numbers'
  ] loop
    execute format('create trigger set_updated_at before update on public.%I for each row execute function private.set_updated_at()', t);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Security-definer helpers (owned by postgres → bypass RLS, no recursion)
-- -----------------------------------------------------------------------------
create or replace function private.user_clinic_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select clinic_id from public.clinic_members where user_id = auth.uid()
$$;

create or replace function private.is_member(p_clinic uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clinic_members
    where clinic_id = p_clinic and user_id = auth.uid()
  )
$$;

create or replace function private.has_role(p_clinic uuid, p_roles public.member_role[])
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.clinic_members
    where clinic_id = p_clinic and user_id = auth.uid() and role = any(p_roles)
  )
$$;

grant usage on schema private to authenticated;
grant execute on function private.user_clinic_ids() to authenticated;
grant execute on function private.is_member(uuid) to authenticated;
grant execute on function private.has_role(uuid, public.member_role[]) to authenticated;

-- -----------------------------------------------------------------------------
-- Auto-create profile on signup
-- -----------------------------------------------------------------------------
create or replace function private.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- -----------------------------------------------------------------------------
-- Atomic clinic creation (clinic + owner membership + default agent config)
-- -----------------------------------------------------------------------------
create or replace function public.create_clinic(p_name text, p_slug text, p_timezone text default 'UTC')
returns public.clinics
language plpgsql security definer set search_path = public as $$
declare
  v_clinic public.clinics;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.clinics (name, slug, timezone)
  values (p_name, p_slug, p_timezone)
  returning * into v_clinic;

  insert into public.clinic_members (clinic_id, user_id, role)
  values (v_clinic.id, auth.uid(), 'owner');

  insert into public.agent_configs (clinic_id, greeting)
  values (v_clinic.id, format('Thank you for calling %s. How can I help you today?', p_name));

  return v_clinic;
end $$;

grant execute on function public.create_clinic(text, text, text) to authenticated;

-- -----------------------------------------------------------------------------
-- Row-Level Security
-- -----------------------------------------------------------------------------
alter table public.clinics enable row level security;
alter table public.profiles enable row level security;
alter table public.clinic_members enable row level security;
alter table public.invitations enable row level security;
alter table public.doctors enable row level security;
alter table public.appointment_types enable row level security;
alter table public.availability_rules enable row level security;
alter table public.availability_exceptions enable row level security;
alter table public.patients enable row level security;
alter table public.calls enable row level security;
alter table public.call_transcripts enable row level security;
alter table public.call_events enable row level security;
alter table public.appointments enable row level security;
alter table public.agent_configs enable row level security;
alter table public.clinic_integrations enable row level security;
alter table public.phone_numbers enable row level security;
alter table public.blocked_numbers enable row level security;

-- clinics: members read; owners update; insert only via create_clinic RPC
create policy clinics_select on public.clinics for select to authenticated
  using (private.is_member(id));
create policy clinics_update on public.clinics for update to authenticated
  using (private.has_role(id, array['owner']::public.member_role[]));

-- profiles: own row only
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_insert on public.profiles for insert to authenticated
  with check (id = auth.uid());
create policy profiles_update on public.profiles for update to authenticated
  using (id = auth.uid());

-- clinic_members: members read their clinic's roster; owners manage
create policy members_select on public.clinic_members for select to authenticated
  using (private.is_member(clinic_id));
create policy members_insert on public.clinic_members for insert to authenticated
  with check (private.has_role(clinic_id, array['owner']::public.member_role[]));
create policy members_update on public.clinic_members for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.member_role[]));
create policy members_delete on public.clinic_members for delete to authenticated
  using (
    private.has_role(clinic_id, array['owner']::public.member_role[])
    or user_id = auth.uid() -- anyone may leave a clinic
  );

-- invitations: owners manage
create policy invitations_all on public.invitations for all to authenticated
  using (private.has_role(clinic_id, array['owner']::public.member_role[]))
  with check (private.has_role(clinic_id, array['owner']::public.member_role[]));

-- doctors: members read; owner/staff write
create policy doctors_select on public.doctors for select to authenticated
  using (private.is_member(clinic_id));
create policy doctors_write on public.doctors for insert to authenticated
  with check (private.has_role(clinic_id, array['owner','staff']::public.member_role[]));
create policy doctors_update on public.doctors for update to authenticated
  using (
    private.has_role(clinic_id, array['owner','staff']::public.member_role[])
    or user_id = auth.uid() -- a doctor may edit their own profile row
  );
create policy doctors_delete on public.doctors for delete to authenticated
  using (private.has_role(clinic_id, array['owner']::public.member_role[]));

-- appointment_types: members read; owner/staff write
create policy apttypes_select on public.appointment_types for select to authenticated
  using (private.is_member(clinic_id));
create policy apttypes_write on public.appointment_types for all to authenticated
  using (private.has_role(clinic_id, array['owner','staff']::public.member_role[]))
  with check (private.has_role(clinic_id, array['owner','staff']::public.member_role[]));

-- availability: members read; owner/staff or the doctor's own user write
create policy avail_rules_select on public.availability_rules for select to authenticated
  using (private.is_member(clinic_id));
create policy avail_rules_write on public.availability_rules for all to authenticated
  using (
    private.has_role(clinic_id, array['owner','staff']::public.member_role[])
    or exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid())
  )
  with check (
    private.has_role(clinic_id, array['owner','staff']::public.member_role[])
    or exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid())
  );
create policy avail_exc_select on public.availability_exceptions for select to authenticated
  using (private.is_member(clinic_id));
create policy avail_exc_write on public.availability_exceptions for all to authenticated
  using (
    private.has_role(clinic_id, array['owner','staff']::public.member_role[])
    or exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid())
  )
  with check (
    private.has_role(clinic_id, array['owner','staff']::public.member_role[])
    or exists (select 1 from public.doctors d where d.id = doctor_id and d.user_id = auth.uid())
  );

-- patients / appointments / calls / transcripts / events: all members read+write
create policy patients_all on public.patients for all to authenticated
  using (private.is_member(clinic_id)) with check (private.is_member(clinic_id));
create policy appointments_all on public.appointments for all to authenticated
  using (private.is_member(clinic_id)) with check (private.is_member(clinic_id));
create policy calls_select on public.calls for select to authenticated
  using (private.is_member(clinic_id));
create policy calls_update on public.calls for update to authenticated
  using (private.is_member(clinic_id)); -- e.g. mark spam
create policy transcripts_select on public.call_transcripts for select to authenticated
  using (private.is_member(clinic_id));
create policy call_events_select on public.call_events for select to authenticated
  using (private.is_member(clinic_id));

-- agent_configs: members read; owners write
create policy agentcfg_select on public.agent_configs for select to authenticated
  using (private.is_member(clinic_id));
create policy agentcfg_write on public.agent_configs for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.member_role[]));

-- clinic_integrations & phone_numbers: owners only (contain sensitive refs)
create policy integrations_all on public.clinic_integrations for all to authenticated
  using (private.has_role(clinic_id, array['owner']::public.member_role[]))
  with check (private.has_role(clinic_id, array['owner']::public.member_role[]));
create policy phones_select on public.phone_numbers for select to authenticated
  using (private.is_member(clinic_id));
create policy phones_write on public.phone_numbers for insert to authenticated
  with check (private.has_role(clinic_id, array['owner']::public.member_role[]));
create policy phones_update on public.phone_numbers for update to authenticated
  using (private.has_role(clinic_id, array['owner']::public.member_role[]));
create policy phones_delete on public.phone_numbers for delete to authenticated
  using (private.has_role(clinic_id, array['owner']::public.member_role[]));

-- blocked_numbers: members manage
create policy blocked_all on public.blocked_numbers for all to authenticated
  using (private.is_member(clinic_id)) with check (private.is_member(clinic_id));

-- -----------------------------------------------------------------------------
-- Realtime: publish appointment & call changes for live dashboard
-- -----------------------------------------------------------------------------
alter publication supabase_realtime add table public.appointments;
alter publication supabase_realtime add table public.calls;
