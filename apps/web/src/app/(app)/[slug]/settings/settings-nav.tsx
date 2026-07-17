'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function SettingsNav({
  slug,
  providersLabel,
  bookingLabel,
}: {
  slug: string;
  providersLabel: string;
  bookingLabel: string;
}) {
  const pathname = usePathname();
  const base = `/${slug}/settings`;

  const TABS = [
    { label: 'General', segment: '' },
    { label: providersLabel, segment: 'doctors' },
    { label: `${bookingLabel} types`, segment: 'appointment-types' },
    { label: 'AI Receptionist', segment: 'ai' },
    { label: 'Team', segment: 'team' },
    { label: 'Phone', segment: 'phone' },
  ];

  return (
    <nav className="flex flex-wrap gap-1 border-b border-slate-200 pb-px">
      {TABS.map((tab) => {
        const href = tab.segment ? `${base}/${tab.segment}` : base;
        const active = tab.segment === '' ? pathname === base : pathname.startsWith(`${base}/${tab.segment}`);
        return (
          <Link
            key={tab.label}
            href={href}
            className={`rounded-t-lg border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'border-teal-600 text-teal-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
