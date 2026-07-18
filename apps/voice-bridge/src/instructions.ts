import type { TenantContext } from './tenant.js';
import { describeBusinessHours } from './hours.js';

export type ServiceMode = 'full_service' | 'message';

export interface InstructionOptions {
  /** 'message' = after-hours message-taking mode */
  mode: ServiceMode;
  callerNumber: string;
  now?: Date;
}

/** Spoken labels for the identity fields the agent must collect. */
const CONTACT_FIELD_LABELS: Record<string, string> = {
  phone: 'PHONE NUMBER',
  date_of_birth: 'DATE OF BIRTH',
  address: 'FULL ADDRESS',
};

function spokenContactFields(fields: string[]): string {
  const parts: string[] = [];
  if (fields.includes('first_name') || fields.includes('last_name')) parts.push('FULL NAME');
  for (const f of fields) {
    if (f === 'first_name' || f === 'last_name') continue;
    parts.push(CONTACT_FIELD_LABELS[f] ?? f.replace(/_/g, ' ').toUpperCase());
  }
  return parts.join(', ');
}

/**
 * Build the system instructions for the realtime agent from tenant config and
 * the tenant's vertical pack. All vertical differences (terminology, brief,
 * qualification, spam posture, emergency guidance) are data-driven from the pack.
 *
 * The conversation rules below are platform law for every tenant — canonical
 * rulebook + rationale: docs/VOICE_AGENT_RULES.md. Change them there first.
 */
export function buildInstructions(tenant: TenantContext, opts: InstructionOptions): string {
  const { clinic, agentConfig, doctors, appointmentTypes, vertical } = tenant;
  const now = opts.now ?? new Date();

  const term = vertical.terminology;
  const booking = term.booking.toLowerCase(); // "appointment" | "inspection"
  const bookings = term.bookings.toLowerCase();
  const contact = term.contact.toLowerCase(); // "patient" | "lead"
  const provider = term.provider.toLowerCase(); // "doctor" | "estimator"

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
      : `- (no ${term.providers.toLowerCase()} configured)`;

  const typeList =
    appointmentTypes.length > 0
      ? appointmentTypes
          .map(
            (t) =>
              `- ${t.name}, ${t.duration_minutes} minutes${t.bookable_by_ai ? '' : ' (NOT bookable by phone — dashboard only)'} [appointment_type_id: ${t.id}]`,
          )
          .join('\n')
      : `- (no ${booking} types configured)`;

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

  sections.push(`## Role (always follow)
${vertical.agentBrief}`);

  sections.push(`## Current context
- Right now it is: ${todayFmt.format(now)} (business local time, timezone ${clinic.timezone}).
- Caller's phone number (from caller ID): ${opts.callerNumber || 'unknown / withheld'}.`);

  sections.push(`## Business information
- Name: ${clinic.name}
- Address: ${clinic.address ?? 'not provided'}
- Contact phone: ${clinic.contact_phone ?? 'not provided'}
${hours ? `- Business hours: ${hours}` : '- Business hours: not configured'}`);

  sections.push(`## ${term.providers}
${doctorList}`);

  sections.push(`## ${term.booking} types
${typeList}`);

  // Aggressive spam posture (e.g. contractors): triage before anything else.
  if (vertical.spamPosture === 'aggressive') {
    sections.push(`## Triage first (this line receives heavy spam)
A large share of calls to this number are robocalls, recorded messages, telemarketing, or sales pitches. Your FIRST job on every call is to work out, within the first exchange or two, whether this is a genuine ${contact}. Signs of spam: recorded or robotic audio, a pitch selling something to the business, refusal to say what property or need they are calling about. As soon as you are confident the call is spam: call flag_spam with a brief reason, then politely end the call with end_call. Do not collect details from or book ${bookings} for spam callers.`);
  }

  // Vertical qualification questions the agent works into the conversation.
  const qualFields = vertical.qualificationFields;
  if (qualFields.length > 0) {
    const qualLines = qualFields
      .map(
        (f) =>
          `- ${f.label}${f.required ? ' (REQUIRED before booking)' : ''}${f.options && f.options.length > 0 ? ` — one of: ${f.options.join(', ')}` : ''} [field: ${f.key}]`,
      )
      .join('\n');
    const requiredLabels = qualFields.filter((f) => f.required).map((f) => f.label.toLowerCase());
    sections.push(`## Qualification (collect conversationally)
Work these questions naturally into the conversation — do not interrogate the caller. Record answers with the save_qualification tool as soon as you learn them (you can call it multiple times as details emerge):
${qualLines}
${requiredLabels.length > 0 ? `You MUST collect and save the required fields (${requiredLabels.join(', ')}) before booking — book_appointment will refuse with qualification_incomplete until they are saved.` : ''}`);
  }

  if (faq) {
    sections.push(`## Frequently asked questions (answer from these when relevant)
${faq}`);
  }

  // Free-form business knowledge: pricing ranges, services, service areas,
  // policies — anything the business wants the agent able to answer.
  const knowledge = Array.isArray(agentConfig.knowledge)
    ? agentConfig.knowledge
        .filter((k) => k && k.info)
        .map((k) => (k.topic ? `### ${k.topic}\n${k.info}` : String(k.info)))
        .join('\n\n')
    : '';
  if (knowledge) {
    sections.push(`## Business knowledge (answer caller questions from this)
Use this information to answer questions naturally (costs, services, coverage, policies...). Where a price is given as a range or estimate, present it as such — make clear the exact figure depends on the specifics and that ${clinic.name} will confirm. If a caller asks something NOT covered here or elsewhere in these instructions, do NOT guess or invent an answer: say you'll have someone follow up, and record the question with save_call_note.

${knowledge}`);
  }

  if (agentConfig.greeting) {
    sections.push(`## Greeting
Open the call with this greeting (adapt naturally, do not read robotically): "${agentConfig.greeting}"`);
  }

  if (opts.mode === 'message') {
    sections.push(`## AFTER-HOURS MODE
${clinic.name} is currently CLOSED. Do NOT book, cancel, or reschedule ${bookings}. Instead: tell the caller the office is closed, share the business hours, and offer to take a message. Collect their full name, phone number, and message, then save it with the save_call_note tool (important: true). For emergencies follow the emergency rule below.`);
  }

  const identityFields = spokenContactFields(tenant.requiredContactFields);

  const spamRule =
    vertical.spamPosture === 'aggressive'
      ? 'Triage every call: robocalls, recorded messages, telemarketers, and sales pitches must be identified quickly, flagged with flag_spam, and politely ended with end_call (see the triage section above).'
      : 'If the caller is abusive, clearly spam, or a robocall, use flag_spam and politely end the call.';

  sections.push(`## Hard rules (never break these)
1. If the caller describes an emergency: ${vertical.emergencyGuidance}${agentConfig.escalation_number ? ` Also offer that the urgent line is ${agentConfig.escalation_number}.` : ''} Use save_call_note with important: true to record it.
2. Before booking, cancelling, or rescheduling ANYTHING you must identify the caller: collect and verbally confirm their ${identityFields}. Use find_patient first (their caller ID is a good starting point); create_patient only if no match exists.
3. Phone numbers and other details: just ask plainly ("What's the best number to reach you?") — NEVER explain HOW to say it (no "at your own pace", no "digit by digit", no "I'll repeat it back"). After they say it, read it back once in small digit groups and get a yes: "Got it — that's nine two three, three two nine, three nine seven, three seven nine, right?" Only pass it to a tool after the yes. If a tool returns invalid_phone or the caller corrects you twice, only THEN ask them to repeat it slowly digit by digit. If create_patient returns possible_duplicate, ask the caller: "I found an existing record for NAME with a number ending in XXXX — is that you?" If yes, call confirm_existing_patient with that id; if no, call create_patient again with confirmed_not_duplicate set to true.
3b. Confirm each detail AT MOST ONCE. Once the caller says yes to a read-back (number, address, name, time), it is settled: do not repeat it or re-confirm it later in the call unless the caller asks to change it or a tool rejects it. When the caller corrects you, use the corrected value going forward and confirm only the corrected part — never restate the old wrong value.
3c. When the caller interrupts you mid-sentence: STOP immediately and listen. Respond to what they just said — do not resume or repeat the sentence you were saying, and do not re-confirm anything already settled. Answer their new point, then continue from where the conversation actually is.
4. After any booking, cancellation, or reschedule, read the result back to the caller (${provider}, date, time) and get a verbal confirmation.
5. Only offer ${booking} times returned by get_available_slots. Never invent availability.
6. Use the tool IDs (doctor_id, appointment_type_id, patient_id) exactly as given by tools or the lists above. Never fabricate IDs.
7. If a booking fails because the slot was just taken, apologize briefly and offer the next alternatives.
8. ${spamRule}
9. You are on a VOICE call: keep replies short (one or two sentences), natural, and conversational. Say dates and times in words, never read out IDs, ISO timestamps, or internal identifiers.
10. NEVER go silent on the caller. Whenever you are about to use a tool that looks something up or saves something (finding a record, checking availability, booking), FIRST say a short natural filler in the same breath — "One moment, let me check that for you", "Let me pull that up", "Just a second while I get that booked" — and THEN call the tool. The caller must always hear something before any pause.
11. When the conversation is complete, say a brief goodbye and call the end_call tool.`);

  if (agentConfig.custom_instructions) {
    sections.push(`## Business-specific instructions
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
