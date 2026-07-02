'use client';

import { useEffect } from 'react';
import { useFormState, useFormStatus } from 'react-dom';
import Link from 'next/link';
import { login } from '@/app/actions/auth';
import SubmitButton from '@/components/SubmitButton';
import { getLoginErrorMessage, type LoginErrorCode } from '@/lib/auth/login-form-state';
import { notifyLoginSubmitting } from '@/lib/pwa/login-submit-guard';

function LoginSubmitGuard() {
  const { pending } = useFormStatus();

  useEffect(() => {
    notifyLoginSubmitting(pending);
  }, [pending]);

  return null;
}

type LoginFormProps = {
  initialError?: LoginErrorCode;
};

export default function LoginForm({ initialError }: LoginFormProps) {
  const [state, formAction] = useFormState(login, null);
  const errorCode = state?.error ?? initialError;
  const errorMessage = getLoginErrorMessage(errorCode);

  return (
    <>
      {errorMessage ? (
        <div
          className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700"
          role="alert"
          aria-live="polite"
        >
          {errorMessage}
        </div>
      ) : null}
      <form action={formAction} className="space-y-4">
        <LoginSubmitGuard />
        <div>
          <label className="label">Email</label>
          <input name="email" type="email" className="input" placeholder="you@yourstore.com" required />
        </div>
        <div>
          <label className="label">Password</label>
          <input name="password" type="password" className="input" placeholder="••••••••" required />
          <div className="mt-1 text-right">
            <Link
              href="/login/forgot-password"
              className="inline-flex min-h-11 items-center text-xs text-accent underline-offset-4 hover:underline"
            >
              Forgot password?
            </Link>
          </div>
        </div>
        <div>
          <label className="label">2FA Code (if enabled)</label>
          <input name="otp" inputMode="numeric" pattern="[0-9]*" className="input" placeholder="123456" />
        </div>
        <SubmitButton className="btn-primary min-h-11 w-full" loadingText="Signing in…">
          Sign in
        </SubmitButton>
      </form>
    </>
  );
}
