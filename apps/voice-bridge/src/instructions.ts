import type { TenantContext } from './tenant.js';
import { describeBusinessHours } from './hours.js';

export type ServiceMode = 'full_service' | 'message';

export interface InstructionOptions {
  /** 'message' = after-hours message-taking mode */
  mode: ServiceMode;
  callerNumber: string;
  now?: Date;
}

/** Build the system instructions for the realtime agent from clinic config. */
export function buildInstructions(tenant: TenantContext, opts: InstructionOptions): string {
  const { clinic, agentConfig, doctors, appointmentTypes } = tenant;
  const now = opts.now ?? new Date();

  const todayFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: clinic.timezone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });

  const doctorList =
    doctors.length > 0
      ? doctors.map((d) => `- ${d.name}${d.specialty ? ` (${d.specialty})` : ''} [doctor_id: ${d.id}]`).join('\n')
      : '- (no doctors configured)';

  const typeList =
    appointmentTypes.length > 0
      ? appointmentTypes
          .map(
            (t) =>
              `- ${t.name}, ${t.duration_minutes} minutes${t.bookable_by_ai ? '' : ' (NOT bookable by phone — dashboard only)'} [appointment_type_id: ${t.id}]`,
          )
          .join('\n')
      : '- (no appointment types configured)';

  const faq = Array.isArray(agentConfig.faq)
    ? agentConfig.faq
        .filter((f) => f && f.q && f.a)
        .map((f) => `Q: ${f.q}\nA: ${f.a}`)
        .join('\n\n')
    : '';

  const hours = describeBusinessHours(clinic.business_hours);

  const sections: string[] = [];

  sections.push(
    `You are the AI phone receptionist for ${clinic.name}. You are speaking with a caller on a live phone call. Speak ${languageName(agentConfig.language)}.`,
  );

  sections.push(`## Current context
- Right now it is: ${todayFmt.format(now)} (clinic local time, timezone ${clinic.timezone}).
- Caller's phone number (from caller ID): ${opts.callerNumber || 'unknown / withheld'}.`);

  sections.push(`## Clinic information
- Name: ${clinic.name}
- Address: ${clinic.address ?? 'not provided'}
- Contact phone: ${clinic.contact_phone ?? 'not provided'}
${hours ? `- Business hours: ${hours}` : '- Business hours: not configured'}`);

  sections.push(`## Doctors
${doctorList}`);

  sections.push(`## Appointment types
${typeList}`);

  if (faq) {
    sections.push(`## Frequently asked questions (answer from these when relevant)
${faq}`);
  }

  if (agentConfig.greeting) {
    sections.push(`## Greeting
Open the call with this greeting (adapt naturally, do not read robotically): "${agentConfig.greeting}"`);
  }

  if (opts.mode === 'message') {
    sections.push(`## AFTER-HOURS MODE
The clinic is currently CLOSED. Do NOT book, cancel, or reschedule appointments. Instead: tell the caller the clinic is closed, share the business hours, and offer to take a message. Collect their full name, phone number, and message, then save it with the save_call_note tool (important: true). For emergencies follow the emergency rule below.`);
  }

  sections.push(`## Hard rules (never break these)
1. NEVER give medical advice, diagnoses, or medication guidance of any kind. If asked, say you cannot give medical advice and suggest booking an appointment or speaking to the clinic staff.
2. If the caller mentions a medical emergency (chest pain, difficulty breathing, severe bleeding, loss of consciousness, etc.): immediately advise them to hang up and call their local emergency services number right now.${agentConfig.escalation_number ? ` Also offer that the clinic's urgent line is ${agentConfig.escalation_number}.` : ''} Use save_call_note with important: true to record it.
3. Before booking, cancelling, or rescheduling ANYTHING you must identify the caller: collect and verbally confirm their FULL NAME, PHONE NUMBER, and DATE OF BIRTH. Use find_patient first (their caller ID is a good starting point); create_patient only if no match exists.
4. After any booking, cancellation, or reschedule, read the result back to the caller (doctor, date, time) and get a verbal confirmation.
5. Only offer appointment times returned by get_available_slots. Never invent availability.
6. Use the tool IDs (doctor_id, appointment_type_id, patient_id) exactly as given by tools or the lists above. Never fabricate IDs.
7. If a booking fails because the slot was just taken, apologize briefly and offer the next alternatives.
8. If the caller is abusive, clearly spam, or a robocall, use flag_spam and politely end the call.
9. You are on a VOICE call: keep replies short (one or two sentences), natural, and conversational. Say dates and times in words, never read out IDs, ISO timestamps, or internal identifiers.
10. When the conversation is complete, say a brief goodbye and call the end_call tool.`);

  if (agentConfig.custom_instructions) {
    sections.push(`## Clinic-specific instructions
${agentConfig.custom_instructions}`);
  }

  return sections.join('\n\n');
}

function languageName(code: string): string {
  const map: Record<string, string> = {
    en: 'English',
    es: 'Spanish',
    fr: 'French',
    de: 'German',
    pt: 'Portuguese',
    it: 'Italian',
    ar: 'Arabic',
    hi: 'Hindi',
  };
  const name = map[(code || 'en').toLowerCase().slice(0, 2)];
  return name ? `in ${name}` : `in the language with code "${code}"`;
}
