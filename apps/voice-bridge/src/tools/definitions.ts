// OpenAI Realtime function-tool schemas. Execution is server-side in
// executor.ts with the clinic pinned by the session — these schemas never
// include any tenant identifier.

export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export const toolDefinitions: RealtimeTool[] = [
  {
    type: 'function',
    name: 'find_patient',
    description:
      'Search for an existing patient record by phone number, name, and/or date of birth. Use the caller ID phone first. Returns candidate matches with masked phone numbers.',
    parameters: {
      type: 'object',
      properties: {
        phone: { type: 'string', description: 'Phone number (any format; E.164 preferred)' },
        name: { type: 'string', description: 'Full or partial name' },
        date_of_birth: { type: 'string', description: 'YYYY-MM-DD' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'create_patient',
    description:
      'Create a new patient record after collecting and confirming their details. Only call after find_patient found no match.',
    parameters: {
      type: 'object',
      properties: {
        first_name: { type: 'string' },
        last_name: { type: 'string' },
        phone: { type: 'string', description: 'Phone number; defaults to caller ID if omitted' },
        date_of_birth: { type: 'string', description: 'YYYY-MM-DD' },
        email: { type: 'string' },
      },
      required: ['first_name', 'last_name'],
    },
  },
  {
    type: 'function',
    name: 'get_available_slots',
    description:
      'Get open appointment slots for a date range. Returns up to 10 slots with a spoken description each. Always use this before offering times.',
    parameters: {
      type: 'object',
      properties: {
        doctor_id: { type: 'string', description: 'Optional: restrict to one doctor' },
        appointment_type_id: { type: 'string' },
        from_date: { type: 'string', description: 'YYYY-MM-DD (clinic-local)' },
        to_date: { type: 'string', description: 'YYYY-MM-DD (clinic-local, inclusive)' },
      },
      required: ['appointment_type_id', 'from_date', 'to_date'],
    },
  },
  {
    type: 'function',
    name: 'book_appointment',
    description:
      'Book an appointment for an identified patient at a slot returned by get_available_slots. If it returns slot_taken, fetch fresh slots and offer alternatives.',
    parameters: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
        doctor_id: { type: 'string' },
        appointment_type_id: { type: 'string' },
        starts_at: { type: 'string', description: 'ISO 8601 start time exactly as returned by get_available_slots' },
      },
      required: ['patient_id', 'doctor_id', 'appointment_type_id', 'starts_at'],
    },
  },
  {
    type: 'function',
    name: 'cancel_appointment',
    description: 'Cancel an upcoming appointment (find it first with find_patient_appointments and confirm with the caller).',
    parameters: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string' },
        reason: { type: 'string', description: 'Brief reason given by the caller' },
      },
      required: ['appointment_id'],
    },
  },
  {
    type: 'function',
    name: 'reschedule_appointment',
    description:
      'Move an existing appointment to a new start time (from get_available_slots). If it returns slot_taken the original appointment is unchanged.',
    parameters: {
      type: 'object',
      properties: {
        appointment_id: { type: 'string' },
        new_starts_at: { type: 'string', description: 'ISO 8601 start time from get_available_slots' },
      },
      required: ['appointment_id', 'new_starts_at'],
    },
  },
  {
    type: 'function',
    name: 'find_patient_appointments',
    description: 'List an identified patient\'s upcoming appointments (for cancel/reschedule/confirmation).',
    parameters: {
      type: 'object',
      properties: {
        patient_id: { type: 'string' },
      },
      required: ['patient_id'],
    },
  },
  {
    type: 'function',
    name: 'get_clinic_info',
    description: 'Get clinic hours, address, services, and FAQ answers.',
    parameters: {
      type: 'object',
      properties: {
        topic: { type: 'string', description: 'Optional topic, e.g. "hours", "address", "parking"' },
      },
      required: [],
    },
  },
  {
    type: 'function',
    name: 'save_call_note',
    description: 'Save an important note about this call for clinic staff (messages, concerns, escalations).',
    parameters: {
      type: 'object',
      properties: {
        note: { type: 'string' },
        important: { type: 'boolean', description: 'True for urgent items staff must see' },
      },
      required: ['note'],
    },
  },
  {
    type: 'function',
    name: 'flag_spam',
    description: 'Flag this call as spam/abuse, then politely end the call.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string' },
      },
      required: ['reason'],
    },
  },
  {
    type: 'function',
    name: 'end_call',
    description: 'End the call after saying goodbye. Call this once the caller has no further requests.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
];
