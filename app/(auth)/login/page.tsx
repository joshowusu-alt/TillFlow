import { getUser } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/auth/LoginForm';
import { parseLoginErrorParam } from '@/lib/auth/login-form-state';

export default async function LoginPage({ searchParams }: { searchParams: { error?: string; success?: string } }) {
  // If the user already has a valid session, send them to their landing page
  const user = await getUser();
  if (user) redirect(user.role === 'OWNER' ? '/onboarding' : '/pos');

  const initialError = parseLoginErrorParam(searchParams?.error);
  const success = searchParams?.success;

  return (
    <div className="space-y-6">
      <div className="text-center">
        <Logo variant="lockup" size={62} className="mx-auto mb-4 justify-center" alt="TillFlow" />
        <p className="mt-2 text-xs uppercase tracking-[0.2em] text-black/40">Sales made simple</p>
        <p className="mt-3 text-sm text-black/60">Sign in to your account</p>
      </div>
      {success === 'password_reset' && (
        <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
          Your password has been reset. Please sign in with your new password.
        </div>
      )}
      <LoginForm initialError={initialError} />
      <div className="text-center space-y-2">
        <p className="text-sm text-black/50">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="inline-flex min-h-11 items-center font-medium text-accent underline underline-offset-4 hover:text-accent">
            Create one free
          </Link>
        </p>
        <p className="text-sm text-black/30">
          <Link href="/welcome" className="inline-flex min-h-11 items-center transition hover:text-black/50">
            &larr; Back to TillFlow
          </Link>
        </p>
      </div>
    </div>
  );
}
