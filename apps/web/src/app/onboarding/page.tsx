import { OnboardingForm } from './onboarding-form';
import { signOut } from '@/lib/auth-actions';

export default function OnboardingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-teal-600 text-lg font-bold text-white">
            +
          </div>
          <h1 className="text-xl font-semibold text-slate-900">Set up your clinic</h1>
          <p className="mt-1 text-sm text-slate-500">
            Create your clinic workspace. You can add doctors and configure the AI receptionist next.
          </p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <OnboardingForm />
        </div>
        <form action={signOut} className="mt-4 text-center">
          <button type="submit" className="text-sm text-slate-400 hover:text-slate-600">
            Sign out
          </button>
        </form>
      </div>
    </main>
  );
}
