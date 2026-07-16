import type { AppointmentStatus, CallOutcome } from '@/lib/types';

const STATUS_STYLES: Record<AppointmentStatus, string> = {
  booked: 'bg-sky-100 text-sky-800',
  confirmed: 'bg-teal-100 text-teal-800',
  completed: 'bg-slate-200 text-slate-700',
  cancelled: 'bg-rose-100 text-rose-700',
  no_show: 'bg-amber-100 text-amber-800',
};

export function StatusBadge({ status }: { status: AppointmentStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-slate-100 text-slate-700'}`}
    >
      {status.replace('_', ' ')}
    </span>
  );
}

const OUTCOME_STYLES: Record<CallOutcome, string> = {
  booked: 'bg-teal-100 text-teal-800',
  cancelled: 'bg-rose-100 text-rose-700',
  rescheduled: 'bg-sky-100 text-sky-800',
  info: 'bg-slate-100 text-slate-700',
  voicemail: 'bg-violet-100 text-violet-700',
  spam: 'bg-red-100 text-red-700',
  escalated: 'bg-amber-100 text-amber-800',
  incomplete: 'bg-slate-100 text-slate-500',
};

export function OutcomeBadge({ outcome }: { outcome: CallOutcome | null | undefined }) {
  if (!outcome) {
    return <span className="inline-flex rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-400">—</span>;
  }
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${OUTCOME_STYLES[outcome]}`}
    >
      {outcome}
    </span>
  );
}

export function SpamBadge() {
  return (
    <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-700">
      spam
    </span>
  );
}

export function Card({
  title,
  action,
  children,
  className = '',
}: {
  title?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
          {title && <h2 className="text-sm font-semibold text-slate-700">{title}</h2>}
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return <p className="py-6 text-center text-sm text-slate-400">{children}</p>;
}

// Shared class strings for form controls / buttons (keeps a consistent look).
export const inputCls =
  'w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder-slate-400 focus:border-teal-500 focus:outline-none focus:ring-1 focus:ring-teal-500 disabled:bg-slate-50 disabled:text-slate-400';

export const labelCls = 'mb-1 block text-xs font-medium text-slate-600';

export const btnPrimary =
  'inline-flex items-center justify-center rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50';

export const btnSecondary =
  'inline-flex items-center justify-center rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-1 disabled:opacity-50';

export const btnDanger =
  'inline-flex items-center justify-center rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-50 disabled:opacity-50';
