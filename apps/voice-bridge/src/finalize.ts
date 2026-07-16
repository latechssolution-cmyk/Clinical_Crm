import { z } from 'zod';
import { config } from './config.js';
import { getSupabase } from './db.js';
import type { CallSession } from './session.js';

const CALL_OUTCOMES = [
  'booked',
  'cancelled',
  'rescheduled',
  'info',
  'voicemail',
  'spam',
  'escalated',
  'incomplete',
] as const;

const summarySchema = z.object({
  summary: z.string(),
  outcome: z.enum(CALL_OUTCOMES).catch('incomplete'),
  extracted_data: z.record(z.unknown()).catch({}),
});

/** Persist everything about a finished call. Never throws. */
export async function finalizeCall(session: CallSession): Promise<void> {
  const db = getSupabase();
  const durationSeconds = Math.max(0, Math.round((Date.now() - session.startedAt) / 1000));

  // 1. Call row: status, duration, identified patient.
  const callUpdate: Record<string, unknown> = {
    status: 'completed',
    ended_at: new Date().toISOString(),
    duration_seconds: durationSeconds,
  };
  if (session.patientId) callUpdate.patient_id = session.patientId;

  // 2. Simple spam heuristic (unless already hard-flagged by the agent).
  if (!session.flaggedSpam) {
    const reasons: string[] = [];
    if (!session.fromNumber) reasons.push('caller ID absent');
    if (!session.patientId && durationSeconds < 20 && session.transcript.length <= 2) {
      reasons.push('very short call, no identity given');
    }
    if (reasons.length > 0) {
      callUpdate.spam_score = Math.min(0.3 * reasons.length, 0.9);
      callUpdate.spam_reasons = reasons;
    }
  }

  const upd = await db.from('calls').update(callUpdate).eq('clinic_id', session.tenant.clinicId).eq('id', session.callId);
  if (upd.error) console.error(`[call ${session.callId}] calls update failed:`, upd.error.message);

  // 3. Transcript.
  const transcriptRow: Record<string, unknown> = {
    clinic_id: session.tenant.clinicId,
    call_id: session.callId,
    turns: session.transcript,
  };

  // 4. Summary + outcome classification (best-effort, non-realtime model).
  if (config.openaiApiKey && session.transcript.length > 0) {
    const analyzed = await summarizeCall(session);
    if (analyzed) {
      transcriptRow.summary = analyzed.summary;
      transcriptRow.outcome = session.flaggedSpam ? 'spam' : analyzed.outcome;
      transcriptRow.extracted_data = analyzed.extracted_data;
    }
  } else if (session.flaggedSpam) {
    transcriptRow.outcome = 'spam';
  }

  const ins = await db.from('call_transcripts').upsert(transcriptRow, { onConflict: 'call_id' });
  if (ins.error) console.error(`[call ${session.callId}] transcript upsert failed:`, ins.error.message);

  console.log(
    `[call ${session.callId}] finalized: ${durationSeconds}s, ${session.transcript.length} turns, ${session.toolCallCount} tool calls${session.patientId ? ', patient linked' : ''}`,
  );
}

async function summarizeCall(session: CallSession): Promise<z.infer<typeof summarySchema> | null> {
  const conversation = session.transcript
    .map((t) => `${t.role === 'user' ? 'Caller' : 'Receptionist'}: ${t.text}`)
    .join('\n');

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${config.openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: config.summaryModel,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You classify finished clinic reception phone calls. Reply with JSON: {"summary": string (2-3 sentences for clinic staff), "outcome": one of ${JSON.stringify(CALL_OUTCOMES)}, "extracted_data": object (any names, phone numbers, dates, requests mentioned)}.`,
          },
          { role: 'user', content: `Transcript:\n${conversation}` },
        ],
      }),
    });
    if (!res.ok) {
      console.error(`[call ${session.callId}] summary request failed: ${res.status}`);
      return null;
    }
    const body = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
    const content = body.choices?.[0]?.message?.content;
    if (!content) return null;
    return summarySchema.parse(JSON.parse(content));
  } catch (err) {
    console.error(`[call ${session.callId}] summarization failed:`, err);
    return null;
  }
}
