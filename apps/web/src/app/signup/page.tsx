'use client';

import { useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { btnPrimary, inputCls, labelCls } from '@/components/ui';

export default function SignupPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white">
            +
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Create your account</h1>
          <p className="mt-1 text-sm text-slate-500">Set up your clinic in minutes</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {sent ? (
            <div className="text-center">
              <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-teal-100 text-teal-700">
                ✓
              </div>
              <h2 className="text-base font-semibold text-slate-900">Check your email</h2>
              <p className="mt-2 text-sm text-slate-500">
                We sent a confirmation link to <span className="font-medium text-slate-700">{email}</span>.
                Click it to activate your account, then sign in.
              </p>
              <Link href="/login" className="mt-4 inline-block text-sm font-medium text-teal-600 hover:underline">
                Back to sign in
              </Link>
            </div>
          ) : (
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
                  minLength={8}
                  className={inputCls}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="new-password"
                />
                <p className="mt-1 text-xs text-slate-400">At least 8 characters</p>
              </div>
              <button type="submit" disabled={busy} className={`${btnPrimary} w-full`}>
                {busy ? 'Creating account…' : 'Sign up'}
              </button>
            </form>
          )}
        </div>
        {!sent && (
          <p className="mt-4 text-center text-sm text-slate-500">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-teal-600 hover:underline">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </main>
  );
}
