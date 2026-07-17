-- Cross-table tenant consistency, enforced by the database itself.
--
-- RLS `with check` only validates the inserted row's own clinic_id; the plain
-- FKs on appointments/availability let a member of clinic A reference clinic
-- B's doctor or patient (occupying the victim doctor's calendar through the
-- global no_double_booking exclusion constraint). Composite FKs make the
-- (id, clinic_id) pair the reference target, so a foreign id simply cannot
-- be attached to another tenant's row — regardless of which app wrote it.

alter table doctors add constraint doctors_id_clinic_key unique (id, clinic_id);
alter table patients add constraint patients_id_clinic_key unique (id, clinic_id);
alter table appointment_types add constraint appointment_types_id_clinic_key unique (id, clinic_id);

alter table appointments
  add constraint appointments_doctor_same_clinic_fk
    foreign key (doctor_id, clinic_id) references doctors (id, clinic_id),
  add constraint appointments_patient_same_clinic_fk
    foreign key (patient_id, clinic_id) references patients (id, clinic_id),
  add constraint appointments_type_same_clinic_fk
    foreign key (appointment_type_id, clinic_id) references appointment_types (id, clinic_id);

alter table availability_rules
  add constraint availability_rules_doctor_same_clinic_fk
    foreign key (doctor_id, clinic_id) references doctors (id, clinic_id);

alter table availability_exceptions
  add constraint availability_exceptions_doctor_same_clinic_fk
    foreign key (doctor_id, clinic_id) references doctors (id, clinic_id);
