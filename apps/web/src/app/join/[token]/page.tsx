import { getInvitePreview } from './actions';
import { AcceptForm } from './accept-form';

const REASONS: Record<string, string> = {
  invalid: 'This invitation link is not valid.',
  expired: 'This invitation has expired. Ask the workspace owner to send a new one.',
  accepted: 'This invitation has already been used.',
};

export default async function JoinPage({ params }: { params: { token: string } }) {
  const preview = await getInvitePreview(params.token);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white">
            +
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Workspace invitation</h1>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          {preview.ok ? (
            <>
              <p className="mb-4 text-center text-sm text-slate-600">
                You have been invited to join{' '}
                <span className="font-semibold text-slate-900">{preview.clinicName}</span> as{' '}
                <span className="font-semibold text-teal-700">{preview.role}</span>.
              </p>
              <AcceptForm token={params.token} />
            </>
          ) : (
            <p className="text-center text-sm text-slate-600">
              {REASONS[preview.reason ?? 'invalid']}
            </p>
          )}
        </div>
      </div>
    </main>
  );
}
