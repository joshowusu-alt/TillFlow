import { completePasswordReset } from '@/app/actions/password-reset';
import SubmitButton from '@/components/SubmitButton';
import Link from 'next/link';

export default function ResetPasswordPage({
  searchParams,
}: {
  searchParams: { token?: string; error?: string };
}) {
  const { token, error } = searchParams;

  const errorMessages: Record<string, string> = {
    invalid: 'This reset link is invalid. Please request a new one.',
    expired: 'This reset link has expired. Please request a new one.',
    password_short: 'Password must be at least 6 characters.',
    mismatch: 'Passwords do not match.',
    server: 'Something went wrong. Please try again.',
  };

  // No token or invalid/expired token
  if (!token || error === 'invalid' || error === 'expired') {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <img src="/icon.svg" alt="TillFlow" className="mx-auto h-14 w-14 rounded-2xl shadow-lg mb-3" />
          <h1 className="text-2xl font-bold font-display">Reset Password</h1>
        </div>
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {error ? errorMessages[error] : 'This reset link is invalid. Please request a new one.'}
        </div>
        <div className="text-center">
          <Link
            href="/login/forgot-password"
            className="text-sm font-medium text-accent hover:underline underline-offset-4"
          >
            Request a new reset link
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="text-center">
        <img src="/icon.svg" alt="TillFlow" className="mx-auto h-14 w-14 rounded-2xl shadow-lg mb-3" />
        <h1 className="text-2xl font-bold font-display">Set New Password</h1>
        <p className="mt-2 text-sm text-black/60">
          Choose a new password for your account.
        </p>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessages[error] || 'An error occurred. Please try again.'}
        </div>
      )}

      <form action={completePasswordReset} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div>
          <label className="label">New Password</label>
          <input
            name="newPassword"
            type="password"
            className="input"
            minLength={6}
            required
            placeholder="Min 6 characters"
            autoFocus
          />
        </div>
        <div>
          <label className="label">Confirm Password</label>
          <input
            name="confirmPassword"
            type="password"
            className="input"
            minLength={6}
            required
            placeholder="Re-enter password"
          />
        </div>
        <SubmitButton loadingText="Resetting…">Reset Password</SubmitButton>
      </form>

      <div className="text-center">
        <Link
          href="/login"
          className="text-sm text-black/50 hover:text-black/70 transition"
        >
          &larr; Back to Sign in
        </Link>
      </div>
    </div>
  );
}
