import { getUser } from '@/lib/auth';
import { Logo } from '@/components/Logo';
import BrandTagline from '@/components/BrandTagline';
import { ChristmasMessage } from '@/components/SeasonalBranding';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import LoginForm from '@/components/auth/LoginForm';
import ClearLaunchIdentityOnAuthEntry from '@/components/ClearLaunchIdentityOnAuthEntry';
import { parseLoginErrorParam } from '@/lib/auth/login-form-state';

export default async function LoginPage(props: { searchParams: Promise<{ error?: string; success?: string }> }) {
  const searchParams = await props.searchParams;
  // If the user already has a valid session, send them to their landing page
  const user = await getUser();
  if (user) redirect(user.role === 'OWNER' ? '/onboarding' : '/pos');

  const initialError = parseLoginErrorParam(searchParams?.error);
  const success = searchParams?.success;

  return (
    <div className="space-y-6">
      <ClearLaunchIdentityOnAuthEntry />
      <div className="text-center">
        <Logo variant="lockup" seasonal size={62} className="mx-auto mb-4 justify-center" alt="TillFlow" />
        <BrandTagline />
        <p className="mt-3 text-sm text-black/60">Sign in to your account</p>
        <ChristmasMessage className="mt-2 pt-1" />
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
