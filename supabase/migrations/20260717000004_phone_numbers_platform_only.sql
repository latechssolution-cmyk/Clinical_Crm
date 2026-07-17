-- Phone numbers are the GLOBAL call-routing key (resolveTenantByNumber routes
-- every inbound call by phone_numbers.number, unique across tenants). Letting
-- tenant owners insert rows made registration first-come-first-served: a
-- malicious owner could pre-claim a number the platform was about to assign to
-- another tenant and receive its calls. Number lifecycle is a platform-admin
-- operation (the /admin/numbers switcher); tenants keep read-only visibility.

drop policy if exists phones_write on public.phone_numbers;
drop policy if exists phones_update on public.phone_numbers;
drop policy if exists phones_delete on public.phone_numbers;

create policy phones_write on public.phone_numbers for insert to authenticated
  with check (private.is_platform_admin());
create policy phones_update on public.phone_numbers for update to authenticated
  using (private.is_platform_admin());
create policy phones_delete on public.phone_numbers for delete to authenticated
  using (private.is_platform_admin());
