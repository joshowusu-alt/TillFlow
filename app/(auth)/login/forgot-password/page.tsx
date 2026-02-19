import { requestPasswordReset } from '@/app/actions/password-reset';
import SubmitButton from '@/components/SubmitButton';
import Link from 'next/link';

export default function ForgotPasswordPage({
  searchParams,
}: {
  searchParams: { error?: string; success?: string };
}) {
  const { error, success } = searchParams;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <img src="/icon.svg" alt="TillFlow" className="mx-auto h-14 w-14 rounded-2xl shadow-lg mb-3" />
        <h1 className="text-2xl font-bold font-display">Forgot Password</h1>
        <p className="mt-2 text-sm text-black/60">
          Enter your email and we&apos;ll send you a link to reset your password.
        </p>
      </div>

      {error === 'missing' && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          Please enter your email address.
        </div>
      )}

      {success === '1' ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <p className="font-semibold">Check your email</p>
            <p className="mt-1">
              If an account exists with that email, we&apos;ve sent a password reset link. It expires in 1 hour.
            </p>
          </div>
          <div className="text-center">
            <Link
              href="/login"
              className="text-sm font-medium text-accent hover:underline underline-offset-4"
            >
              &larr; Back to Sign in
            </Link>
          </div>
        </div>
      ) : (
        <>
          <form action={requestPasswordReset} className="space-y-4">
            <div>
              <label className="label">Email</label>
              <input
                name="email"
                type="email"
                className="input"
                placeholder="you@yourstore.com"
                required
                autoFocus
              />
            </div>
            <SubmitButton loadingText="Sending…">Send Reset Link</SubmitButton>
          </form>
          <div className="text-center">
            <Link
              href="/login"
              className="text-sm text-black/50 hover:text-black/70 transition"
            >
              &larr; Back to Sign in
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
