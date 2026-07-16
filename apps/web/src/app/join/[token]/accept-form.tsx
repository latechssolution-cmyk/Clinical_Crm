'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { acceptInvitation } from './actions';
import { btnPrimary } from '@/components/ui';

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${btnPrimary} w-full`}>
      {pending ? 'Joining…' : 'Accept invitation'}
    </button>
  );
}

export function AcceptForm({ token }: { token: string }) {
  const [state, formAction] = useFormState(acceptInvitation, null);
  return (
    <form action={formAction} className="space-y-3">
      {state?.error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{state.error}</p>
      )}
      <input type="hidden" name="token" value={token} />
      <SubmitButton />
    </form>
  );
}
