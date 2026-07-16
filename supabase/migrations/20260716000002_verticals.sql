-- =============================================================================
-- Multi-vertical platform layer
-- Tenants (the `clinics` table — legacy name, means "tenant") gain a vertical.
-- Platform admins are cross-tenant operators, outside the membership system.
-- =============================================================================

-- Which business template a tenant runs (drives agent behavior + UI labels).
alter table public.clinics
  add column if not exists vertical text not null default 'clinic'
    check (vertical in ('clinic', 'roofing')),
  add column if not exists default_country text not null default 'US'; -- ISO 3166-1 alpha-2, for phone normalization

-- Vertical-specific structured data captured by the AI (lead qualification,
-- roof/service details, urgency, score, ...). Shape defined per vertical pack.
alter table public.patients
  add column if not exists address text,
  add column if not exists qualification jsonb not null default '{}'::jsonb;

alter table public.call_transcripts
  add column if not exists qualification jsonb not null default '{}'::jsonb;

-- ---------------------------------------------------------------------------
-- Platform admins (super admins) — cross-tenant operators.
-- ---------------------------------------------------------------------------
create table public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.platform_admins enable row level security;

-- Only admins can see the admin list; membership is managed via service role.
create policy platform_admins_select on public.platform_admins for select to authenticated
  using (user_id = auth.uid());

create or replace function private.is_platform_admin()
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.platform_admins where user_id = auth.uid())
$$;
grant execute on function private.is_platform_admin() to authenticated;

-- ---------------------------------------------------------------------------
-- Platform-admin read/manage access across tenants (additive policies).
-- Admin dashboards read tenants, numbers, stats; deep tenant work happens by
-- joining the tenant as a member (or via service role server-side).
-- ---------------------------------------------------------------------------
create policy admin_clinics_select on public.clinics for select to authenticated
  using (private.is_platform_admin());
create policy admin_clinics_update on public.clinics for update to authenticated
  using (private.is_platform_admin());
create policy admin_phones_select on public.phone_numbers for select to authenticated
  using (private.is_platform_admin());
create policy admin_phones_update on public.phone_numbers for update to authenticated
  using (private.is_platform_admin());
create policy admin_members_select on public.clinic_members for select to authenticated
  using (private.is_platform_admin());
create policy admin_members_insert on public.clinic_members for insert to authenticated
  with check (private.is_platform_admin());
create policy admin_calls_select on public.calls for select to authenticated
  using (private.is_platform_admin());
create policy admin_appointments_select on public.appointments for select to authenticated
  using (private.is_platform_admin());
create policy admin_agentcfg_select on public.agent_configs for select to authenticated
  using (private.is_platform_admin());

-- create_clinic RPC: accept a vertical
create or replace function public.create_clinic(
  p_name text, p_slug text, p_timezone text default 'UTC', p_vertical text default 'clinic'
)
returns public.clinics
language plpgsql security definer set search_path = public as $$
declare
  v_clinic public.clinics;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into public.clinics (name, slug, timezone, vertical)
  values (p_name, p_slug, p_timezone, p_vertical)
  returning * into v_clinic;

  insert into public.clinic_members (clinic_id, user_id, role)
  values (v_clinic.id, auth.uid(), 'owner');

  insert into public.agent_configs (clinic_id, greeting)
  values (v_clinic.id, format('Thank you for calling %s. How can I help you today?', p_name));

  return v_clinic;
end $$;

grant execute on function public.create_clinic(text, text, text, text) to authenticated;
