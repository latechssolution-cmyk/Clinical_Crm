// OpenAI Realtime function-tool schemas. Execution is server-side in
// executor.ts with the tenant pinned by the session — these schemas never
// include any tenant identifier. Tool NAMES are stable across verticals
// (the executor dispatch table keys never change); only descriptions and the
// vertical-specific save_qualification schema are derived from the pack.

import type { VerticalPack } from '@clinical-crm/core';

export interface RealtimeTool {
  type: 'function';
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export function getToolDefinitions(pack: VerticalPack): RealtimeTool[] {
  const t = pack.terminology;
  const contact = t.contact.toLowerCase(); // "patient" | "lead"
  const booking = t.booking.toLowerCase(); // "appointment" | "inspection"
  const bookings = t.bookings.toLowerCase();
  const provider = t.provider.toLowerCase(); // "doctor" | "estimator"

  const needsAddress = pack.requiredContactFields.includes('address');
  const needsDob = pack.requiredContactFields.includes('date_of_birth');

  const tools: RealtimeTool[] = [
    {
      type: 'function',
      name: 'find_patient',
      description: `Search for an existing ${contact} record by phone number, name${needsDob ? ', and/or date of birth' : ''}. Use the caller ID phone first. Returns candidate matches with masked phone numbers.`,
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
      description: `Create a new ${contact} record after collecting and confirming their details. Only call after find_patient found no match. If it returns possible_duplicate, confirm with the caller (confirm_existing_patient if it is them; retry with confirmed_not_duplicate=true if not).`,
      parameters: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          phone: { type: 'string', description: 'Phone number; defaults to caller ID if omitted' },
          date_of_birth: { type: 'string', description: 'YYYY-MM-DD' },
          address: {
            type: 'string',
            description: needsAddress
              ? `Full street address${pack.id === 'roofing' ? ' of the property' : ''} — required`
              : 'Street address (optional)',
          },
          email: { type: 'string' },
          confirmed_not_duplicate: {
            type: 'boolean',
            description: 'Set true only after the caller confirmed a similar existing record is NOT them',
          },
        },
        required: ['first_name', 'last_name'],
      },
    },
    {
      type: 'function',
      name: 'confirm_existing_patient',
      description: `Link this call to an existing ${contact} record after the caller verbally confirms it is them (e.g. after find_patient or a possible_duplicate result).`,
      parameters: {
        type: 'object',
        properties: {
          patient_id: { type: 'string', description: `The existing ${contact} id to confirm` },
        },
        required: ['patient_id'],
      },
    },
    {
      type: 'function',
      name: 'get_available_slots',
      description: `Get open ${booking} slots for a date range. Returns up to 10 slots with a spoken description each. Always use this before offering times.`,
      parameters: {
        type: 'object',
        properties: {
          doctor_id: { type: 'string', description: `Optional: restrict to one ${provider}` },
          appointment_type_id: { type: 'string' },
          from_date: { type: 'string', description: 'YYYY-MM-DD (business-local)' },
          to_date: { type: 'string', description: 'YYYY-MM-DD (business-local, inclusive)' },
        },
        required: ['appointment_type_id', 'from_date', 'to_date'],
      },
    },
    {
      type: 'function',
      name: 'book_appointment',
      description: `Book an ${booking} for an identified ${contact} at a slot returned by get_available_slots. If it returns slot_taken, fetch fresh slots and offer alternatives.${
        pack.qualificationFields.some((f) => f.required)
          ? ' Refuses with qualification_incomplete until the required qualification fields are saved via save_qualification.'
          : ''
      }`,
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
      description: `Cancel an upcoming ${booking} (find it first with find_patient_appointments and confirm with the caller).`,
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
      description: `Move an existing ${booking} to a new start time (from get_available_slots). If it returns slot_taken the original ${booking} is unchanged.`,
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
      description: `List an identified ${contact}'s upcoming ${bookings} (for cancel/reschedule/confirmation).`,
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
      description: 'Get business hours, address, services, and FAQ answers.',
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
      description: 'Save an important note about this call for office staff (messages, concerns, escalations).',
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

  // save_qualification exists only for verticals that define qualification fields.
  if (pack.qualificationFields.length > 0) {
    const fieldProps: Record<string, unknown> = {};
    for (const f of pack.qualificationFields) {
      fieldProps[f.key] =
        f.type === 'boolean'
          ? { type: 'boolean', description: f.label }
          : f.options && f.options.length > 0
            ? { type: 'string', enum: f.options, description: f.label }
            : { type: 'string', description: f.label };
    }
    const requiredKeys = pack.qualificationFields.filter((f) => f.required).map((f) => f.key);
    tools.splice(3, 0, {
      type: 'function',
      name: 'save_qualification',
      description: `Record qualification details as the caller mentions them (call it as many times as needed; values merge). Required before booking: ${requiredKeys.join(', ') || 'none'}.`,
      parameters: {
        type: 'object',
        properties: {
          fields: {
            type: 'object',
            description: 'Only include fields the caller actually answered',
            properties: fieldProps,
            required: [],
          },
        },
        required: ['fields'],
      },
    });
  }

  return tools;
}
