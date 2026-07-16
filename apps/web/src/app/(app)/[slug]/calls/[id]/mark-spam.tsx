'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { markCallAsSpam } from '../actions';
import { btnDanger } from '@/components/ui';

export function MarkSpamButton({
  slug,
  callId,
  hasFromNumber,
  alreadySpam,
}: {
  slug: string;
  callId: string;
  hasFromNumber: boolean;
  alreadySpam: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [block, setBlock] = useState(true);
  const [error, setError] = useState<string | null>(null);

  if (alreadySpam) {
    return <p className="text-sm text-slate-400">This call is marked as spam.</p>;
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const res = await markCallAsSpam({ slug, callId, blockNumber: block && hasFromNumber });
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="space-y-2">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}
      {hasFromNumber && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={block}
            onChange={(e) => setBlock(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-teal-600 focus:ring-teal-500"
          />
          Also block this caller&apos;s number
        </label>
      )}
      <button className={btnDanger} onClick={submit} disabled={pending}>
        {pending ? 'Marking…' : 'Mark as spam'}
      </button>
    </div>
  );
}
