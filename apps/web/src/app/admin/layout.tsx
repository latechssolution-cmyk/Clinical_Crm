import Link from 'next/link';
import { requirePlatformAdmin } from '@/lib/platform-admin';
import { signOut } from '@/lib/auth-actions';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePlatformAdmin();

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-6">
        <div className="flex items-center gap-3">
          <Link href="/admin" className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-600 text-sm font-bold text-white">
              ★
            </div>
            <span className="text-sm font-semibold text-slate-900">Platform admin</span>
          </Link>
          <nav className="ml-4 flex items-center gap-1 text-sm">
            <Link href="/admin" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">
              Tenants
            </Link>
            <Link href="/admin/numbers" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">
              Numbers
            </Link>
            <Link href="/admin/new" className="rounded-md px-3 py-1.5 text-slate-600 hover:bg-slate-100">
              New tenant
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Link
            href="/"
            className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            Exit admin
          </Link>
          <span className="hidden text-xs text-slate-500 sm:block">{user.email}</span>
          <form action={signOut}>
            <button
              type="submit"
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Sign out
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">{children}</main>
    </div>
  );
}
