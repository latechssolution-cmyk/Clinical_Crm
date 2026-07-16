'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPatientBlocked, updatePatient } from '../actions';
import { btnPrimary, btnSecondary, inputCls, labelCls } from '@/components/ui';

export function NotesEditor({
  slug,
  patientId,
  initialNotes,
}: {
  slug: string;
  patientId: string;
  initialNotes: string;
}) {
  const router = useRouter();
  const [notes, setNotes] = useState(initialNotes);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function save() {
    setError(null);
    startTransition(async () => {
      const res = await updatePatient({ slug, patientId, notes: notes.trim() || null });
      if (res.error) setError(res.error);
      else {
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        router.refresh();
      }
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <label className={labelCls}>Notes</label>
      <textarea
        rows={4}
        className={inputCls}
        value={notes}
        onChange={(e) => setNotes(e.target.value)}
        placeholder="Clinical or administrative notes…"
      />
      <button className={btnPrimary} onClick={save} disabled={pending}>
        {pending ? 'Saving…' : saved ? 'Saved ✓' : 'Save notes'}
      </button>
    </div>
  );
}

export function BlockedToggle({
  slug,
  patientId,
  blocked,
}: {
  slug: string;
  patientId: string;
  blocked: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function toggle() {
    setError(null);
    startTransition(async () => {
      const res = await setPatientBlocked(slug, patientId, !blocked);
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div>
      {error && <p className="mb-2 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      <button
        onClick={toggle}
        disabled={pending}
        className={
          blocked
            ? btnSecondary
            : 'inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50'
        }
      >
        {pending ? 'Updating…' : blocked ? 'Unblock patient' : 'Block patient'}
      </button>
      <p className="mt-1 text-xs text-slate-400">
        {blocked
          ? 'This patient is flagged as blocked for the AI receptionist.'
          : 'Blocking flags this patient so the AI receptionist will not book for them.'}
      </p>
    </div>
  );
}
