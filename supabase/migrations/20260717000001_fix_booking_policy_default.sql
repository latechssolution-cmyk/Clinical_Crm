-- The agent_configs.booking_policy default hardcoded required_patient_fields
-- to the clinic vertical's fields (first_name, last_name, phone, date_of_birth).
-- Every new tenant — regardless of vertical — inherited this on creation,
-- silently overriding the vertical pack's requiredContactFields fallback in
-- apps/voice-bridge/src/tenant.ts (bookingPolicy.required_patient_fields ??
-- vertical.requiredContactFields). Drop the key from the default so it's
-- genuinely absent for new rows and the vertical pack applies as designed.
alter table agent_configs
  alter column booking_policy set default
    '{"min_notice_minutes": 120, "max_advance_days": 60, "max_active_appointments_per_patient": 2}'::jsonb;

-- Existing rows that never customized this (still holding the old clinic-shaped
-- default verbatim) get the key stripped so they fall back to their own
-- vertical's fields instead of clinic's.
update agent_configs ac
set booking_policy = booking_policy - 'required_patient_fields'
from clinics c
where ac.clinic_id = c.id
  and c.vertical <> 'clinic'
  and ac.booking_policy -> 'required_patient_fields' = '["first_name", "last_name", "phone", "date_of_birth"]'::jsonb;
