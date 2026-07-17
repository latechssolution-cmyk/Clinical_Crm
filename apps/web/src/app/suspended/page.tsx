export default function SuspendedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-4 flex h-11 w-11 items-center justify-center rounded-xl bg-rose-100 text-lg">
          ⏸
        </div>
        <h1 className="text-xl font-semibold text-slate-900">Workspace suspended</h1>
        <p className="mt-2 text-sm text-slate-500">
          This workspace has been suspended by the platform. Incoming calls and dashboard access are
          paused. If you believe this is a mistake, please contact support.
        </p>
      </div>
    </main>
  );
}
