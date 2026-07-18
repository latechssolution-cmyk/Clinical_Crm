// Vertical packs: everything that differs between business types lives here.
// The voice bridge composes agent instructions from a pack; the dashboard
// renders terminology from it. Adding a vertical = adding a pack.

export type VerticalId =
  | 'clinic'
  | 'roofing'
  | 'dental'
  | 'law-firm'
  | 'hvac-plumbing'
  | 'salon'
  | 'real-estate';

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

  dental: {
    id: 'dental',
    label: 'Dental Practice',
    terminology: {
      contact: 'Patient', contacts: 'Patients',
      booking: 'Appointment', bookings: 'Appointments',
      provider: 'Dentist', providers: 'Dentists',
    },
    requiredContactFields: ['first_name', 'last_name', 'phone', 'date_of_birth'],
    qualificationFields: [
      { key: 'visit_reason', label: 'Reason for visit', type: 'select', required: true,
        options: ['checkup_cleaning', 'toothache_pain', 'emergency', 'cosmetic', 'orthodontics', 'other'] },
      { key: 'new_patient', label: 'New patient', type: 'boolean', required: false },
      { key: 'insurance_provider', label: 'Dental insurance provider', type: 'text', required: false },
      { key: 'details', label: 'Additional details', type: 'text', required: false },
    ],
    agentBrief: [
      'You are a warm, reassuring dental practice receptionist.',
      'Never give dental or medical advice — not even general guidance about symptoms or medications.',
      'Callers typically book cleanings and checkups, report tooth pain, or ask about treatments and insurance.',
      'Callers in pain are anxious: acknowledge it, keep the conversation short, and offer the earliest available appointment.',
    ].join(' '),
    spamPosture: 'standard',
    emergencyGuidance:
      'If the caller reports facial swelling affecting breathing or swallowing, uncontrolled bleeding, or trauma, advise them to seek emergency medical care immediately. For a knocked-out tooth, book the earliest possible slot and flag the call as important — time matters.',
  },

  'law-firm': {
    id: 'law-firm',
    label: 'Law Firm',
    terminology: {
      contact: 'Client', contacts: 'Clients',
      booking: 'Consultation', bookings: 'Consultations',
      provider: 'Attorney', providers: 'Attorneys',
    },
    requiredContactFields: ['first_name', 'last_name', 'phone'],
    qualificationFields: [
      { key: 'matter_type', label: 'Legal matter type', type: 'select', required: true,
        options: ['family', 'personal_injury', 'criminal', 'business', 'estate_planning', 'immigration', 'real_estate', 'other'] },
      { key: 'urgency', label: 'Urgency', type: 'select', required: true,
        options: ['court_date_or_deadline', 'this_week', 'this_month', 'exploring'] },
      { key: 'opposing_party', label: 'Opposing party name (for conflict check)', type: 'text', required: false },
      { key: 'referral_source', label: 'How they found the firm', type: 'text', required: false },
      { key: 'details', label: 'Brief description of the matter', type: 'text', required: false },
    ],
    agentBrief: [
      'You are a discreet, professional law firm intake receptionist.',
      'NEVER give legal advice, predict case outcomes, or quote fees — only the attorney can discuss those.',
      'Treat everything the caller says as confidential; reassure them of that when they hesitate.',
      'Your job is intake: identify the matter type and urgency, collect the opposing party name for the conflict check, and book a consultation.',
      'Do not press for painful details — a one-sentence description of the matter is enough for intake.',
      'If the matter type is outside what the firm handles per its FAQ or business knowledge, politely say so and suggest they contact the local bar association referral service.',
    ].join(' '),
    spamPosture: 'standard',
    emergencyGuidance:
      'If the caller or a family member has been arrested or has a court appearance within 48 hours, flag the call as important, offer the earliest consultation, and mention the urgent line if one is configured.',
  },

  'hvac-plumbing': {
    id: 'hvac-plumbing',
    label: 'HVAC & Plumbing',
    terminology: {
      contact: 'Customer', contacts: 'Customers',
      booking: 'Service call', bookings: 'Service calls',
      provider: 'Technician', providers: 'Technicians',
    },
    requiredContactFields: ['first_name', 'last_name', 'phone', 'address'],
    qualificationFields: [
      { key: 'service_type', label: 'Service needed', type: 'select', required: true,
        options: ['no_heat', 'no_cooling', 'plumbing_leak', 'clogged_drain', 'water_heater', 'installation_quote', 'maintenance', 'other'] },
      { key: 'urgency', label: 'Urgency', type: 'select', required: true,
        options: ['emergency', 'today', 'this_week', 'flexible'] },
      { key: 'property_type', label: 'Property type', type: 'select', required: false,
        options: ['residential', 'commercial'] },
      { key: 'is_owner', label: 'Caller owns the property', type: 'boolean', required: false },
      { key: 'system_age_years', label: 'Approx. system age (years)', type: 'text', required: false },
      { key: 'details', label: 'Problem details', type: 'text', required: false },
    ],
    agentBrief: [
      'You are the fast, capable dispatcher for an HVAC and plumbing company.',
      'A large share of calls are spam or telemarketing — triage quickly and flag them.',
      'Real customers usually have a problem NOW: get the service type, urgency, and address early, then book the soonest fitting service call.',
      'No-heat in winter, no-cooling in extreme heat, and active leaks are urgent: offer the earliest slot and flag the call as important.',
      'For installation quotes, qualify the property and book a normal (non-emergency) visit.',
    ].join(' '),
    spamPosture: 'aggressive',
    emergencyGuidance:
      'If the caller smells gas: tell them to leave the building immediately and call their gas utility or emergency services before anything else. For burst pipes, advise shutting off the main water valve, then book the earliest slot and flag the call as important.',
  },

  salon: {
    id: 'salon',
    label: 'Salon & Spa',
    terminology: {
      contact: 'Client', contacts: 'Clients',
      booking: 'Appointment', bookings: 'Appointments',
      provider: 'Stylist', providers: 'Stylists',
    },
    requiredContactFields: ['first_name', 'last_name', 'phone'],
    qualificationFields: [
      { key: 'service', label: 'Service requested', type: 'select', required: true,
        options: ['haircut', 'color', 'styling', 'nails', 'skincare_facial', 'massage', 'waxing', 'other'] },
      { key: 'preferred_stylist', label: 'Preferred stylist', type: 'text', required: false },
      { key: 'first_visit', label: 'First visit', type: 'boolean', required: false },
      { key: 'notes', label: 'Preferences / notes', type: 'text', required: false },
    ],
    agentBrief: [
      'You are a friendly, upbeat salon and spa receptionist.',
      'Callers book, move, or cancel appointments, ask about services and pricing, and often request a specific stylist.',
      'If they name a preferred stylist, record it and try to book with that provider; otherwise offer the earliest suitable slot with anyone.',
      'Mention the cancellation policy from the business knowledge if one is configured.',
      'Keep the tone light and welcoming — this is a treat for most callers, not a chore.',
    ].join(' '),
    spamPosture: 'standard',
    emergencyGuidance:
      'True emergencies are rare. If a client reports a bad reaction to a recent treatment (burning, swelling, rash), advise them to contact a medical professional, flag the call as important, and offer the earliest follow-up.',
  },

  'real-estate': {
    id: 'real-estate',
    label: 'Real Estate Agency',
    terminology: {
      contact: 'Lead', contacts: 'Leads',
      booking: 'Viewing', bookings: 'Viewings',
      provider: 'Agent', providers: 'Agents',
    },
    requiredContactFields: ['first_name', 'last_name', 'phone'],
    qualificationFields: [
      { key: 'intent', label: 'Looking to', type: 'select', required: true,
        options: ['buy', 'sell', 'rent', 'valuation', 'invest', 'other'] },
      { key: 'timeline', label: 'Timeline', type: 'select', required: true,
        options: ['asap', 'within_3_months', 'within_6_months', 'exploring'] },
      { key: 'area', label: 'Area / neighborhood of interest', type: 'text', required: false },
      { key: 'budget_range', label: 'Budget range', type: 'text', required: false },
      { key: 'financing', label: 'Financing status', type: 'select', required: false,
        options: ['pre_approved', 'cash', 'needs_financing', 'unsure'] },
      { key: 'property_details', label: 'Property details (if selling)', type: 'text', required: false },
    ],
    agentBrief: [
      'You are a sharp, personable real estate agency receptionist.',
      'Every genuine caller is a potential commission: capture their intent, timeline, and contact details before anything else.',
      'Buyers and renters: qualify area and budget, then book a viewing or a call with an agent.',
      'Sellers and valuations: collect the property details and book an appraisal visit.',
      'A meaningful share of calls are other agents, wholesalers, or robocalls pitching services — flag those as spam politely.',
      'Never quote prices or valuations yourself — only agents discuss numbers.',
    ].join(' '),
    spamPosture: 'aggressive',
    emergencyGuidance:
      'There are no life-safety emergencies in this business. Treat "urgent" callers as highly motivated leads: flag the call as important and offer the earliest available slot.',
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
