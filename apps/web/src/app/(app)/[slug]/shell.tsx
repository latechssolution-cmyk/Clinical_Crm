'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export interface NavLabels {
  /** e.g. "Appointments" (clinic) or "Inspections" (roofing) — for /schedule */
  schedule: string;
  /** e.g. "Patients" or "Leads" — for /patients */
  patients: string;
}

const ICONS: Record<string, JSX.Element> = {
  today: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2m0 14v2m9-9h-2M5 12H3m14.5-6.5-1.4 1.4M7 17l-1.4 1.4M17 17l1.4 1.4M7 7 5.6 5.6M12 8a4 4 0 1 0 0 8 4 4 0 0 0 0-8Z" />
    </svg>
  ),
  schedule: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M8 3v3m8-3v3M4 8h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />
    </svg>
  ),
  patients: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M16 19a4 4 0 0 0-8 0m8 0h4a5 5 0 0 0-4-4.9M8 19H4a5 5 0 0 1 4-4.9M15 7a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
  calls: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 5.5C3 4.7 3.7 4 4.5 4h2.6c.7 0 1.3.5 1.5 1.2l.9 3a1.5 1.5 0 0 1-.8 1.8l-1.5.7a11.5 11.5 0 0 0 6.1 6.1l.7-1.5a1.5 1.5 0 0 1 1.8-.8l3 .9c.7.2 1.2.8 1.2 1.5v2.6c0 .8-.7 1.5-1.5 1.5H18C9.7 21 3 14.3 3 6v-.5Z" />
    </svg>
  ),
  settings: (
    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M10.3 4.3a1.7 1.7 0 0 1 3.4 0l.1.7a1.7 1.7 0 0 0 2.5 1l.6-.3a1.7 1.7 0 0 1 2.4 2.4l-.4.6a1.7 1.7 0 0 0 1 2.5l.8.1a1.7 1.7 0 0 1 0 3.4l-.7.1a1.7 1.7 0 0 0-1 2.5l.3.6a1.7 1.7 0 0 1-2.4 2.4l-.6-.4a1.7 1.7 0 0 0-2.5 1l-.1.8a1.7 1.7 0 0 1-3.4 0l-.1-.7a1.7 1.7 0 0 0-2.5-1l-.6.3a1.7 1.7 0 0 1-2.4-2.4l.4-.6a1.7 1.7 0 0 0-1-2.5l-.8-.1a1.7 1.7 0 0 1 0-3.4l.7-.1a1.7 1.7 0 0 0 1-2.5l-.3-.6A1.7 1.7 0 0 1 7 5.7l.6.4a1.7 1.7 0 0 0 2.5-1l.2-.8ZM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
    </svg>
  ),
};

export function AppShell({
  slug,
  clinicName,
  userEmail,
  navLabels,
  isPlatformAdmin = false,
  signOutAction,
  children,
}: {
  slug: string;
  clinicName: string;
  userEmail: string;
  navLabels: NavLabels;
  isPlatformAdmin?: boolean;
  signOutAction: () => Promise<void>;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  const NAV = [
    { icon: 'today', label: 'Today', segment: '' },
    { icon: 'schedule', label: navLabels.schedule, segment: 'schedule' },
    { icon: 'patients', label: navLabels.patients, segment: 'patients' },
    { icon: 'calls', label: 'Calls', segment: 'calls' },
    { icon: 'settings', label: 'Settings', segment: 'settings' },
  ];

  function isActive(segment: string) {
    const base = `/${slug}`;
    if (segment === '') return pathname === base;
    return pathname.startsWith(`${base}/${segment}`);
  }

  const nav = (
    <nav className="flex flex-col gap-1 px-3">
      {NAV.map((item) => {
        const href = item.segment ? `/${slug}/${item.segment}` : `/${slug}`;
        const active = isActive(item.segment);
        return (
          <Link
            key={item.icon}
            href={href}
            onClick={() => setOpen(false)}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active
                ? 'bg-teal-50 text-teal-700'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            {ICONS[item.icon]}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 lg:pl-64">
        <div className="flex items-center gap-3">
          <button
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setOpen(!open)}
            aria-label="Toggle navigation"
          >
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
          <span className="text-sm font-semibold text-slate-900 lg:pl-4">{clinicName}</span>
        </div>
        <div className="flex items-center gap-3">
          {isPlatformAdmin && (
            <Link
              href="/admin"
              className="rounded-lg border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-medium text-violet-700 hover:bg-violet-100"
            >
              Platform admin
            </Link>
          )}
          <span className="hidden text-xs text-slate-500 sm:block">{userEmail}</span>
          <form action={signOutAction}>
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>

      {/* Sidebar (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-slate-200 bg-white lg:flex">
        <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
            +
          </div>
          <span className="text-sm font-semibold text-slate-900">Clinical CRM</span>
        </div>
        <div className="flex-1 overflow-y-auto py-4">{nav}</div>
      </aside>

      {/* Sidebar (mobile drawer) */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/30" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-60 flex-col bg-white shadow-xl">
            <div className="flex h-14 items-center gap-2 border-b border-slate-100 px-5">
              <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-teal-600 text-sm font-bold text-white">
                +
              </div>
              <span className="text-sm font-semibold text-slate-900">Clinical CRM</span>
            </div>
            <div className="flex-1 overflow-y-auto py-4">{nav}</div>
          </aside>
        </div>
      )}

      <main className="px-4 py-6 sm:px-6 lg:pl-[17rem] lg:pr-8">{children}</main>
    </div>
  );
}
