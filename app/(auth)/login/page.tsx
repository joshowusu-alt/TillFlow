import { login } from '@/app/actions/auth';
import SubmitButton from '@/components/SubmitButton';
import Link from 'next/link';

export default async function LoginPage({ searchParams }: { searchParams: { error?: string } }) {
  const error = searchParams?.error;
  return (
    <div className="space-y-6">
      <div className="text-center">
        <img src="/icon.svg" alt="TillFlow" className="mx-auto h-16 w-16 rounded-2xl shadow-lg mb-4" />
        <h1 className="text-3xl font-bold font-display">
          <span className="text-emerald-600">Till</span>
          <span className="text-gray-800">Flow</span>
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.2em] text-black/40">Sales made simple</p>
        <p className="mt-4 text-sm text-black/60">Sign in to your account</p>
      </div>
      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {error === 'missing'
            ? 'Please enter your email and password.'
            : error === 'locked'
            ? 'Too many failed attempts. Please wait and try again.'
            : error === 'otp_required'
            ? 'This account requires a 2FA code from your authenticator app.'
            : error === 'otp_invalid'
            ? 'Invalid 2FA code. Please try again.'
            : 'Invalid credentials. Please try again.'}
        </div>
      )}
      <form action={login} className="space-y-4">
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" placeholder="you@yourstore.com" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" className="input" placeholder="••••••••" required />
        </div>
        <div>
          <label className="label">2FA Code (if enabled)</label>
          <input
            name="otp"
            inputMode="numeric"
            pattern="[0-9]*"
            className="input"
            placeholder="123456"
          />
        </div>
        <SubmitButton loadingText="Signing in…">Sign in</SubmitButton>
      </form>
      <div className="text-center space-y-2">
        <p className="text-sm text-black/50">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="font-medium text-emerald-600 hover:text-emerald-700 underline underline-offset-4">
            Create one free
          </Link>
        </p>
        <p className="text-sm text-black/30">
          <Link href="/welcome" className="hover:text-black/50 transition">
            &larr; Back to TillFlow
          </Link>
        </p>
      </div>
    </div>
  );
}

