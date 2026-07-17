'use client';

import { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { btnPrimary, inputCls, labelCls } from '@/components/ui';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    searchParams.get('error') === 'confirmation_failed'
      ? 'Email confirmation failed or the link expired. Try signing in, or sign up again.'
      : null
  );
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push(searchParams.get('next') ?? '/');
    router.refresh();
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>
      )}
      <div>
        <label className={labelCls} htmlFor="email">Email</label>
        <input
          id="email"
          type="email"
          required
          className={inputCls}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </div>
      <div>
        <label className={labelCls} htmlFor="password">Password</label>
        <input
          id="password"
          type="password"
          required
          className={inputCls}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </div>
      <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
        {busy ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white">
            +
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Clinical CRM</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to your workspace</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
        <p className="mt-4 text-center text-sm text-slate-500">
          No account?{' '}
          <Link href="/signup" className="font-medium text-teal-600 hover:underline">
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
