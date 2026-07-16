'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { AgentConfig } from '@/lib/types';
import { btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/ui';
import { updateAgentConfig } from '../actions';

const VOICES = ['alloy', 'echo', 'shimmer', 'coral', 'sage'] as const;
const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'es', label: 'Spanish' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'pt', label: 'Portuguese' },
  { value: 'ar', label: 'Arabic' },
  { value: 'hi', label: 'Hindi' },
  { value: 'zh', label: 'Chinese' },
];

export function AiForm({
  slug,
  config,
  canEdit,
}: {
  slug: string;
  config: AgentConfig;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [greeting, setGreeting] = useState(config.greeting ?? '');
  const [voice, setVoice] = useState(config.voice);
  const [language, setLanguage] = useState(config.language);
  const [instructions, setInstructions] = useState(config.custom_instructions ?? '');
  const [faq, setFaq] = useState<{ q: string; a: string }[]>(Array.isArray(config.faq) ? config.faq : []);
  const [escalation, setEscalation] = useState(config.escalation_number ?? '');
  const [afterHours, setAfterHours] = useState(config.after_hours_behavior);
  const [enabled, setEnabled] = useState(config.enabled);

  const bp = config.booking_policy ?? {};

  function save() {
    setError(null);
    const cleanFaq = faq.filter((f) => f.q.trim() && f.a.trim());
    startTransition(async () => {
      const res = await updateAgentConfig({
        slug,
        greeting: greeting.trim() || null,
        voice: voice as (typeof VOICES)[number],
        language,
        custom_instructions: instructions.trim() || null,
        faq: cleanFaq,
        escalation_number: escalation.trim() || null,
        after_hours_behavior: afterHours,
        enabled,
      });
      if (res.error) setError(res.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  }

  return (
    <div className="max-w-2xl space-y-5">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {!canEdit && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only clinic owners can change AI receptionist settings.
        </p>
      )}

      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          disabled={!canEdit}
          className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
        />
        <span className="text-sm font-medium text-slate-700">AI receptionist enabled</span>
      </label>

      <div>
        <label className={labelCls}>Greeting</label>
        <textarea
          rows={2}
          className={inputCls}
          value={greeting}
          onChange={(e) => setGreeting(e.target.value)}
          disabled={!canEdit}
          placeholder="Thank you for calling… How can I help you today?"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className={labelCls}>Voice</label>
          <select className={inputCls} value={voice} onChange={(e) => setVoice(e.target.value)} disabled={!canEdit}>
            {VOICES.map((v) => (
              <option key={v} value={v}>{v}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Language</label>
          <select className={inputCls} value={language} onChange={(e) => setLanguage(e.target.value)} disabled={!canEdit}>
            {!LANGUAGES.some((l) => l.value === language) && <option value={language}>{language}</option>}
            {LANGUAGES.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className={labelCls}>Escalation number (E.164)</label>
          <input
            className={inputCls}
            value={escalation}
            onChange={(e) => setEscalation(e.target.value)}
            disabled={!canEdit}
            placeholder="+15551234567"
          />
        </div>
        <div>
          <label className={labelCls}>After-hours behavior</label>
          <select
            className={inputCls}
            value={afterHours}
            onChange={(e) => setAfterHours(e.target.value as AgentConfig['after_hours_behavior'])}
            disabled={!canEdit}
          >
            <option value="full_service">Full AI service</option>
            <option value="message">Take a message</option>
            <option value="announce_only">Announce info only</option>
          </select>
        </div>
      </div>

      <div>
        <label className={labelCls}>Custom instructions</label>
        <textarea
          rows={4}
          className={inputCls}
          value={instructions}
          onChange={(e) => setInstructions(e.target.value)}
          disabled={!canEdit}
          placeholder="Extra guidance for the AI receptionist (tone, policies, parking info…)"
        />
      </div>

      {/* FAQ editor */}
      <div>
        <h3 className="mb-2 text-sm font-semibold text-slate-700">FAQ</h3>
        <div className="space-y-3">
          {faq.map((f, i) => (
            <div key={i} className="rounded-xl border border-slate-200 bg-white p-3">
              <div className="flex items-start gap-2">
                <div className="flex-1 space-y-2">
                  <input
                    className={inputCls}
                    placeholder="Question"
                    value={f.q}
                    disabled={!canEdit}
                    onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, q: e.target.value } : x)))}
                  />
                  <textarea
                    rows={2}
                    className={inputCls}
                    placeholder="Answer"
                    value={f.a}
                    disabled={!canEdit}
                    onChange={(e) => setFaq(faq.map((x, j) => (j === i ? { ...x, a: e.target.value } : x)))}
                  />
                </div>
                {canEdit && (
                  <button
                    className="rounded-lg p-1.5 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    onClick={() => setFaq(faq.filter((_, j) => j !== i))}
                    aria-label="Remove FAQ"
                  >
                    ✕
                  </button>
                )}
              </div>
            </div>
          ))}
          {canEdit && (
            <button className={btnSecondary} onClick={() => setFaq([...faq, { q: '', a: '' }])}>
              + Add FAQ
            </button>
          )}
        </div>
      </div>

      {/* Booking policy (read only) */}
      <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-700">Booking policy (read-only)</h3>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <div><dt className="text-xs text-slate-400">Minimum notice</dt><dd className="text-slate-700">{bp.min_notice_minutes ?? 120} minutes</dd></div>
          <div><dt className="text-xs text-slate-400">Maximum advance</dt><dd className="text-slate-700">{bp.max_advance_days ?? 60} days</dd></div>
          <div><dt className="text-xs text-slate-400">Max active appointments / patient</dt><dd className="text-slate-700">{bp.max_active_appointments_per_patient ?? 2}</dd></div>
          <div><dt className="text-xs text-slate-400">Required patient fields</dt><dd className="text-slate-700">{(bp.required_patient_fields ?? []).join(', ') || '—'}</dd></div>
        </dl>
      </div>

      {canEdit && (
        <button className={btnPrimary} onClick={save} disabled={pending}>
          {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save AI settings'}
        </button>
      )}
    </div>
  );
}
