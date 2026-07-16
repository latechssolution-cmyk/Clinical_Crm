'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { ClinicMember, Invitation, MemberRole } from '@/lib/types';
import { btnDanger, btnPrimary, inputCls, labelCls } from '@/components/ui';
import { inviteMember, removeMember, revokeInvitation } from '../actions';

const ROLE_STYLES: Record<MemberRole, string> = {
  owner: 'bg-violet-100 text-violet-700',
  doctor: 'bg-teal-100 text-teal-800',
  staff: 'bg-sky-100 text-sky-800',
};

function CopyLink({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  const link = `${typeof window !== 'undefined' ? window.location.origin : ''}/join/${token}`;
  return (
    <button
      className="text-xs font-medium text-teal-600 hover:underline"
      onClick={async () => {
        await navigator.clipboard.writeText(link);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
    >
      {copied ? 'Copied ✓' : 'Copy invite link'}
    </button>
  );
}

export function TeamClient({
  slug,
  isOwner,
  currentUserId,
  currentUserEmail,
  members,
  invitations,
}: {
  slug: string;
  isOwner: boolean;
  currentUserId: string;
  currentUserEmail: string;
  members: ClinicMember[];
  invitations: Invitation[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<MemberRole>('staff');

  function run(fn: () => Promise<{ ok?: boolean; error?: string }>) {
    setError(null);
    startTransition(async () => {
      const res = await fn();
      if (res.error) setError(res.error);
      else router.refresh();
    });
  }

  return (
    <div className="max-w-2xl space-y-6">
      {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p>}

      <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-5 py-3">
          <h2 className="text-sm font-semibold text-slate-700">Members</h2>
        </div>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between gap-3 px-5 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">
                  {m.user_id === currentUserId ? currentUserEmail : `User ${m.user_id.slice(0, 8)}…`}
                  {m.user_id === currentUserId && <span className="ml-2 text-xs text-slate-400">(you)</span>}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${ROLE_STYLES[m.role]}`}>
                  {m.role}
                </span>
                {isOwner && m.user_id !== currentUserId && (
                  <button className={btnDanger} disabled={pending} onClick={() => run(() => removeMember(slug, m.id))}>
                    Remove
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>

      {isOwner ? (
        <>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-700">Invite a team member</h2>
            <div className="flex flex-wrap items-end gap-3">
              <div className="flex-1 min-w-[200px]">
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  className={inputCls}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="colleague@clinic.com"
                />
              </div>
              <div>
                <label className={labelCls}>Role</label>
                <select className={`${inputCls} w-auto`} value={role} onChange={(e) => setRole(e.target.value as MemberRole)}>
                  <option value="staff">Staff</option>
                  <option value="doctor">Doctor</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              <button
                className={btnPrimary}
                disabled={pending || !email.includes('@')}
                onClick={() =>
                  run(async () => {
                    const res = await inviteMember({ slug, email, role });
                    if (res.ok) setEmail('');
                    return res;
                  })
                }
              >
                Create invite
              </button>
            </div>
            <p className="mt-2 text-xs text-slate-400">
              Invitation emails are not sent automatically yet — copy the invite link below and share it with the person.
            </p>
          </div>

          {invitations.length > 0 && (
            <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="border-b border-slate-100 px-5 py-3">
                <h2 className="text-sm font-semibold text-slate-700">Pending invitations</h2>
              </div>
              <ul className="divide-y divide-slate-100">
                {invitations.map((inv) => {
                  const expired = new Date(inv.expires_at) < new Date();
                  return (
                    <li key={inv.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
                      <div>
                        <p className="text-sm font-medium text-slate-800">{inv.email}</p>
                        <p className="text-xs text-slate-400">
                          {inv.role} · {expired ? 'expired' : `expires ${new Date(inv.expires_at).toLocaleDateString()}`}
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {!expired && <CopyLink token={inv.token} />}
                        <button className={btnDanger} disabled={pending} onClick={() => run(() => revokeInvitation(slug, inv.id))}>
                          Revoke
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      ) : (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Only clinic owners can invite or remove team members.
        </p>
      )}
    </div>
  );
}
