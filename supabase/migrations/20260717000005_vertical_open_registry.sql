-- =============================================================================
-- Open the vertical registry
--
-- 20260716000002_verticals.sql added `vertical` with an inline check
-- constraint `check (vertical in ('clinic', 'roofing'))` (auto-named
-- clinics_vertical_check). That hardcoded list duplicated the vertical
-- registry in code, so every new vertical required a migration.
--
-- From now on the registry in packages/core (VERTICALS in
-- packages/core/src/verticals.ts) is the single source of truth for which
-- vertical ids exist. The database only enforces the *shape* of the id
-- (slug-like: lowercase letter first, then lowercase letters / digits /
-- underscore / hyphen, 2-31 chars total). An id stored here that the code
-- doesn't recognize is harmless: getVertical() falls back to the 'clinic'
-- pack for unknown ids.
-- =============================================================================

alter table public.clinics
  drop constraint if exists clinics_vertical_check;

alter table public.clinics
  add constraint clinics_vertical_check
    check (vertical ~ '^[a-z][a-z0-9_-]{1,30}$');

-- Note: the create_clinic RPC (recreated in 20260716000002_verticals.sql)
-- does not validate the vertical against a hardcoded list — it just inserts
-- p_vertical and relies on this table constraint — so it needs no change.
