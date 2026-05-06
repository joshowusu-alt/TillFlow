'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { resolveBrandStyles, type StorefrontBranding } from '@/lib/storefront-branding';

type LoginClientProps = {
  slug: string;
  storefrontName: string;
  branding: StorefrontBranding;
  redirectTo: string;
};

type Step = 'phone' | 'code';

function describeChannel(channel: string | null, delivered: boolean): string {
  if (!delivered) {
    return 'Code generated for this test environment.';
  }
  if (channel === 'sms') return 'We sent a 6-digit code to your phone.';
  if (channel === 'email') return 'We sent a 6-digit code to your email.';
  return 'A 6-digit code is on the way.';
}

export default function LoginClient({ slug, storefrontName, branding, redirectTo }: LoginClientProps) {
  const router = useRouter();
  const brand = resolveBrandStyles(branding);
  const [step, setStep] = useState<Step>('phone');
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [devCode, setDevCode] = useState<string | null>(null);
  const [resendCountdown, setResendCountdown] = useState(0);
  const codeInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (step === 'code') {
      codeInputRef.current?.focus();
    }
  }, [step]);

  useEffect(() => {
    if (step !== 'code' || resendCountdown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCountdown((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [step, resendCountdown]);

  async function requestCode() {
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/storefront/account/request-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, phone, email: email || undefined }),
      });
      const payload = await response.json();
      if (!response.ok) {
        setError(payload.error ?? 'Could not send code. Try again.');
        return;
      }
      setStatusMessage(describeChannel(payload.channel, Boolean(payload.delivered)));
      if (payload.devCode) setDevCode(String(payload.devCode));
      setStep('code');
      setResendCountdown(30);
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRequestCode(event: React.FormEvent) {
    event.preventDefault();
    await requestCode();
  }

  async function handleVerify(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      const response = await fetch('/api/storefront/account/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          slug,
          phone,
          code,
          name: name || undefined,
          email: email || undefined,
        }),
      });
      const payload = await response.json();
      if (!response.ok) {
        const friendlyCodeError =
          typeof payload.error === 'string' &&
          (payload.error.toLowerCase().includes("didn't match") || payload.error.toLowerCase().includes('wrong'))
            ? "That code didn't match. Check your messages and try again."
            : payload.error;
        setError(friendlyCodeError ?? 'Could not verify code.');
        return;
      }
      router.replace(redirectTo);
      router.refresh();
    } catch {
      setError('Network error. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function backToPhone() {
    setStep('phone');
    setCode('');
    setError(null);
    setDevCode(null);
    setResendCountdown(0);
  }

  return (
    <div
      className="min-h-screen bg-slate-50"
      style={brand.cssVars as React.CSSProperties}
    >
      <header className="border-b border-black/5 bg-white pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href={`/shop/${slug}`} className="text-sm font-semibold text-slate-700 hover:underline">
            Back to {storefrontName}
          </Link>
        </div>
      </header>

      <main id="shop-main" className="mx-auto max-w-md px-4 py-6 sm:py-10">
        <div className="overflow-hidden rounded-3xl border border-black/5 bg-white shadow-sm">
          <div className="border-b border-black/5 bg-slate-50 px-6 py-5 sm:px-8">
            <div className="text-[10px] font-bold uppercase tracking-[0.22em] text-black/40">Customer account</div>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
              Sign in securely
            </h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">
              Use your phone number to see recent orders from {storefrontName}. No password to remember.
            </p>
          </div>

          {step === 'phone' ? (
            <form onSubmit={handleRequestCode} className="space-y-4 px-6 py-6 sm:px-8">
              <label className="block">
                <span className="text-sm font-medium text-slate-700">Mobile number</span>
                <div className="mt-1 flex h-12 items-center overflow-hidden rounded-2xl border border-slate-200 bg-white focus-within:border-slate-400">
                  <span className="select-none pl-4 text-base font-medium text-slate-500">+233</span>
                  <input
                    type="tel"
                    inputMode="numeric"
                    autoComplete="tel"
                    required
                    value={phone}
                    onChange={(event) => setPhone(event.target.value)}
                    placeholder="244 123 456"
                    className="h-full flex-1 bg-transparent pl-2 pr-4 text-base text-slate-900 placeholder:text-slate-400 focus:outline-none"
                  />
                </div>
                <p className="mt-1 text-xs text-slate-400">Ghana numbers only. Enter digits after +233 (e.g. 244123456 or 0244123456).</p>
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Name <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <input
                  type="text"
                  autoComplete="name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="mt-1 block h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
              </label>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">
                  Email <span className="font-normal text-slate-400">(optional, used as backup)</span>
                </span>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="mt-1 block h-12 w-full rounded-2xl border border-slate-200 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 focus:border-slate-400 focus:outline-none"
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-900">
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-sm font-bold text-[var(--brand-primary-foreground)] shadow-sm transition active:scale-[0.99] disabled:opacity-60"
              >
                {submitting ? 'Sending…' : 'Send code'}
              </button>
              <p className="text-center text-xs leading-5 text-slate-400">
                Works with Ghana mobile numbers. Keep this phone nearby for the one-time code.
              </p>
            </form>
          ) : (
            <form onSubmit={handleVerify} className="space-y-4 px-6 py-6 sm:px-8">
              <div className="rounded-2xl border border-sky-100 bg-sky-50 px-4 py-3 text-sm leading-6 text-sky-900">
                {statusMessage ?? 'A 6-digit code is on the way.'}
                {devCode ? (
                  <div className="mt-2 rounded-xl bg-white/70 px-3 py-2 font-mono text-xs text-sky-800">
                    Test code: <span className="font-bold">{devCode}</span>
                  </div>
                ) : null}
              </div>

              <label className="block">
                <span className="text-sm font-medium text-slate-700">6-digit code</span>
                <input
                  ref={codeInputRef}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]{6}"
                  autoComplete="one-time-code"
                  maxLength={6}
                  required
                  value={code}
                  onChange={(event) => setCode(event.target.value.replace(/\D/g, ''))}
                  placeholder="123456"
                  className="mt-1 block h-16 w-full rounded-2xl border border-slate-200 bg-white px-3 text-center font-mono text-2xl tracking-[0.35em] text-slate-900 placeholder:text-slate-300 focus:border-slate-400 focus:outline-none"
                />
              </label>

              {error ? (
                <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm leading-6 text-rose-900">
                  {error}
                </div>
              ) : null}

              {resendCountdown > 0 ? (
                <div className="text-center text-xs text-slate-500">
                  Resend code in {resendCountdown}s
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => void requestCode()}
                  disabled={submitting}
                  className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50 disabled:opacity-60"
                >
                  Resend code
                </button>
              )}

              <button
                type="submit"
                disabled={submitting || code.length !== 6}
                className="inline-flex h-12 w-full items-center justify-center rounded-2xl bg-[var(--brand-primary)] text-sm font-bold text-[var(--brand-primary-foreground)] shadow-sm transition active:scale-[0.99] disabled:opacity-60"
              >
                {submitting ? 'Verifying…' : 'Verify and sign in'}
              </button>

              <button
                type="button"
                onClick={backToPhone}
                className="inline-flex h-11 w-full items-center justify-center rounded-2xl border border-slate-200 bg-white text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                Use a different number
              </button>
            </form>
          )}

          <p className="border-t border-black/5 px-6 py-4 text-xs leading-5 text-slate-400 sm:px-8">
            By signing in you agree to receive a one-time code from {storefrontName} on the number above.
          </p>
        </div>
      </main>
    </div>
  );
}
