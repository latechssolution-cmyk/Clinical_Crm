'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { createPatient } from './actions';
import { btnPrimary, inputCls, labelCls } from '@/components/ui';

function SubmitButton({ contactLabel }: { contactLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={btnPrimary}>
      {pending ? 'Saving…' : `Create ${contactLabel.toLowerCase()}`}
    </button>
  );
}

export function NewPatientForm({
  slug,
  contactLabel = 'Patient',
  showAddress = false,
  showDateOfBirth = true,
}: {
  slug: string;
  contactLabel?: string;
  showAddress?: boolean;
  showDateOfBirth?: boolean;
}) {
  const [state, formAction] = useFormState(createPatient, null);

  return (
    <form action={formAction} className="space-y-3">
      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}
      <input type="hidden" name="slug" value={slug} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className={labelCls}>First name *</label>
          <input name="first_name" required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Last name *</label>
          <input name="last_name" required className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Phone (E.164) *</label>
          <input name="phone" required placeholder="+15551234567" className={inputCls} />
        </div>
        <div>
          <label className={labelCls}>Email</label>
          <input name="email" type="email" className={inputCls} />
        </div>
        {showDateOfBirth && (
          <div>
            <label className={labelCls}>Date of birth</label>
            <input name="date_of_birth" type="date" className={inputCls} />
          </div>
        )}
        {showAddress && (
          <div className={showDateOfBirth ? '' : 'sm:col-span-2'}>
            <label className={labelCls}>Address *</label>
            <input name="address" required className={inputCls} placeholder="Street, city, state" />
          </div>
        )}
      </div>
      <div>
        <label className={labelCls}>Notes</label>
        <textarea name="notes" rows={2} className={inputCls} />
      </div>
      <SubmitButton contactLabel={contactLabel} />
    </form>
  );
}
