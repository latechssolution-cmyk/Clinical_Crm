// Vertical packs: everything that differs between business types lives here.
// The voice bridge composes agent instructions from a pack; the dashboard
// renders terminology from it. Adding a vertical = adding a pack.

export type VerticalId = 'clinic' | 'roofing';

export interface QualificationField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'boolean';
  options?: string[];
  /** the agent must collect this before booking */
  required: boolean;
}

export interface VerticalPack {
  id: VerticalId;
  label: string;
  terminology: {
    contact: string;
    contacts: string;
    booking: string;
    bookings: string;
    provider: string;
    providers: string;
  };
  /** identity fields the agent must collect and confirm before booking */
  requiredContactFields: Array<'first_name' | 'last_name' | 'phone' | 'date_of_birth' | 'address'>;
  /** vertical-specific data the agent collects into `qualification` jsonb */
  qualificationFields: QualificationField[];
  /** behavioral brief injected into the agent instructions */
  agentBrief: string;
  /** how aggressively to treat unidentified/suspicious callers */
  spamPosture: 'standard' | 'aggressive';
  /** what to say if the caller describes an emergency */
  emergencyGuidance: string;
}

export const VERTICALS: Record<VerticalId, VerticalPack> = {
  clinic: {
    id: 'clinic',
    label: 'Medical Clinic',
    terminology: {
      contact: 'Patient', contacts: 'Patients',
      booking: 'Appointment', bookings: 'Appointments',
      provider: 'Doctor', providers: 'Doctors',
    },
    requiredContactFields: ['first_name', 'last_name', 'phone', 'date_of_birth'],
    qualificationFields: [],
    agentBrief: [
      'You are a warm, professional medical clinic receptionist.',
      'Never give medical advice of any kind — not even general guidance.',
      'Callers typically want to book, reschedule or cancel appointments, or ask about the clinic.',
    ].join(' '),
    spamPosture: 'standard',
    emergencyGuidance:
      'If the caller describes a medical emergency, immediately advise them to hang up and call local emergency services. Do not attempt to triage.',
  },

  roofing: {
    id: 'roofing',
    label: 'Roofing Contractor',
    terminology: {
      contact: 'Lead', contacts: 'Leads',
      booking: 'Inspection', bookings: 'Inspections',
      provider: 'Estimator', providers: 'Estimators',
    },
    requiredContactFields: ['first_name', 'last_name', 'phone', 'address'],
    qualificationFields: [
      { key: 'service_type', label: 'Service needed', type: 'select', required: true,
        options: ['inspection', 'repair', 'replacement', 'emergency', 'gutter', 'other'] },
      { key: 'property_type', label: 'Property type', type: 'select', required: false,
        options: ['residential', 'commercial'] },
      { key: 'urgency', label: 'Urgency', type: 'select', required: true,
        options: ['emergency_leak', 'this_week', 'this_month', 'exploring'] },
      { key: 'roof_age_years', label: 'Approx. roof age (years)', type: 'text', required: false },
      { key: 'insurance_claim', label: 'Insurance claim involved', type: 'boolean', required: false },
      { key: 'details', label: 'Project details', type: 'text', required: false },
    ],
    agentBrief: [
      'You are the friendly, efficient phone assistant for a roofing contractor.',
      'A large share of incoming calls are spam, robocalls or telemarketing — your first job is to triage.',
      'Robocalls, recorded messages, sales pitches, or callers who refuse to say what property they are calling about: politely end the call and flag it as spam.',
      'For genuine prospects: qualify the lead by collecting the required details, then offer inspection appointment slots and book directly on the call.',
      'A qualified lead has: a name, a reachable phone number, a property address, a service need, and an urgency level.',
      'Emergency leaks are the highest priority — offer the earliest available slot and flag the call as important.',
    ].join(' '),
    spamPosture: 'aggressive',
    emergencyGuidance:
      'If the caller reports active flooding or structural danger, advise immediate safety precautions, offer the earliest slot, and flag the call as important.',
  },
};

/** Unknown vertical ids we have already warned about (once per id, not per call). */
const warnedUnknownVerticals = new Set<string>();

export function getVertical(id: string | null | undefined): VerticalPack {
  const pack = VERTICALS[(id as VerticalId) ?? 'clinic'];
  if (!pack && id != null && !warnedUnknownVerticals.has(id)) {
    warnedUnknownVerticals.add(id);
    console.warn(`[verticals] unknown vertical id "${id}" — falling back to clinic pack (registry/DB skew?)`);
  }
  return pack ?? VERTICALS.clinic;
}
