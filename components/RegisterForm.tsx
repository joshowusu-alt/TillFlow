'use client';

import { useState } from 'react';
import { register } from '@/app/actions/register';
import SubmitButton from '@/components/SubmitButton';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import Link from 'next/link';

const errorMessages: Record<string, string> = {
  missing: 'Please fill in all fields.',
  weak: 'Password must be at least 6 characters.',
  exists: 'An account with that email already exists. Please sign in instead.',
};

const CURRENCIES = [
  { value: 'GHS', label: 'GHS — Ghana Cedi' },
  { value: 'NGN', label: 'NGN — Nigerian Naira' },
  { value: 'KES', label: 'KES — Kenyan Shilling' },
  { value: 'UGX', label: 'UGX — Ugandan Shilling' },
  { value: 'TZS', label: 'TZS — Tanzanian Shilling' },
  { value: 'ZAR', label: 'ZAR — South African Rand' },
  { value: 'XOF', label: 'XOF — West African CFA' },
  { value: 'XAF', label: 'XAF — Central African CFA' },
  { value: 'GBP', label: 'GBP — British Pound' },
  { value: 'USD', label: 'USD — US Dollar' },
  { value: 'EUR', label: 'EUR — Euro' },
];

interface RegisterFormProps {
  isDemo: boolean;
  error?: string;
}

export default function RegisterForm({ isDemo, error }: RegisterFormProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const canAdvanceFrom1 = businessName.trim().length > 0 && ownerName.trim().length > 0;
  const canAdvanceFrom2 = email.trim().length > 0 && password.length >= 6;

  const stepLabels = ['Business', 'Account', 'Currency'];
  const accentClasses = isDemo
    ? {
        badge: 'bg-amber-50 border-amber-200 text-amber-800',
        ping: 'bg-amber-400',
        dot: 'bg-amber-500',
        infoBox: 'bg-amber-50 border-amber-200 text-amber-900',
        progressFill: 'bg-gradient-to-r from-amber-400 to-amber-500',
        nextBtn: 'w-full rounded-xl bg-amber-500 py-2.5 text-sm font-semibold text-white transition hover:bg-amber-600 disabled:opacity-40 disabled:cursor-not-allowed',
      }
    : {
        badge: 'bg-accentSoft border-accent/20 text-accent',
        ping: 'bg-blue-400',
        dot: 'bg-blue-500',
        infoBox: 'bg-accentSoft border-accent/10 text-accent',
        progressFill: 'bg-gradient-to-r from-accent to-accent/80',
        nextBtn: 'w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed',
      };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <img src="/icon.svg" alt="TillFlow" className="mx-auto h-14 w-14 rounded-2xl shadow-lg mb-3" />
        <h1 className="text-2xl font-bold font-display">
          <span className="text-accent">Till</span>
          <span className="text-gray-800">Flow</span>
        </h1>
        <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-black/40">Sales made simple</p>

        {isDemo ? (
          <div className="mt-4">
            <div className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-semibold mb-2 ${accentClasses.badge}`}>
              <span className="relative flex h-2 w-2">
                <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${accentClasses.ping}`} />
                <span className={`relative inline-flex h-2 w-2 rounded-full ${accentClasses.dot}`} />
              </span>
              🎮 Demo Mode
            </div>
            <p className="text-sm text-black/60">
              Explore TillFlow with a full Ghana-ready sample business — products, customers, and Mobile Money flows, ready to test instantly.
            </p>
          </div>
        ) : (
          <div className="mt-4">
            <p className="text-sm text-black/60">Your products, your prices, your currency. Clean start — yours from day one.</p>
          </div>
        )}

        {/* Social proof */}
        <div className="mt-3 text-xs text-black/35 font-medium">
          Trusted by 500+ shops across Ghana, Nigeria &amp; Kenya
        </div>
      </div>

      {/* Step progress */}
      <div className="flex gap-2 items-end">
        {stepLabels.map((label, i) => {
          const stepNum = i + 1;
          const isComplete = stepNum < step;
          const isCurrent = stepNum === step;
          return (
            <div key={i} className="flex-1 text-center">
              <div className="h-1.5 rounded-full bg-black/8 overflow-hidden mb-1">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${accentClasses.progressFill} ${isComplete ? 'w-full' : isCurrent ? 'w-1/2' : 'w-0'}`}
                />
              </div>
              <span className={`text-[10px] font-medium ${isCurrent ? 'text-black/60' : isComplete ? 'text-black/30' : 'text-black/20'}`}>
                {label}
              </span>
            </div>
          );
        })}
      </div>

      {/* Error banner */}
      {error && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700">
          {errorMessages[error] || 'Something went wrong. Please try again.'}
        </div>
      )}

      {/* Step 1: Business info */}
      {step === 1 && (
        <div className="space-y-4">
          <div>
            <label className="label">Business Name</label>
            <input
              type="text"
              className="input"
              placeholder={isDemo ? 'e.g. Demo Supermarket' : 'e.g. El-Shaddai Supermarket'}
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Your Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Kingsley Atakorah"
              value={ownerName}
              onChange={(e) => setOwnerName(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={() => setStep(2)}
            disabled={!canAdvanceFrom1}
            className={accentClasses.nextBtn}
          >
            Next — Account Details
          </button>
        </div>
      )}

      {/* Step 2: Account credentials */}
      {step === 2 && (
        <div className="space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              className="input"
              placeholder="you@yourstore.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              className="input"
              placeholder="At least 6 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              minLength={6}
            />
            <PasswordStrengthMeter password={password} />
          </div>
          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="flex-1 rounded-xl border border-black/10 py-2.5 text-sm font-semibold text-black/60 transition hover:border-black/20 hover:text-black/80"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(3)}
              disabled={!canAdvanceFrom2}
              className={`flex-[2] ${accentClasses.nextBtn}`}
            >
              Next — Currency
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Currency + final submit */}
      {step === 3 && (
        <form action={register} className="space-y-4">
          {/* Carry forward all data as hidden fields */}
          <input type="hidden" name="mode" value={isDemo ? 'demo' : 'fresh'} />
          <input type="hidden" name="businessName" value={businessName} />
          <input type="hidden" name="ownerName" value={ownerName} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="password" value={password} />

          <div>
            <label className="label">Currency</label>
            <select name="currency" className="input" defaultValue="GHS">
              {CURRENCIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>
            <div className="mt-1 text-xs text-black/50">
              Start with GHS if you trade in Ghana. You can change your currency later in settings.
            </div>
          </div>

          {isDemo ? (
            <div className={`rounded-xl border px-4 py-3 text-sm ${accentClasses.infoBox}`}>
              <span className="font-semibold">Demo includes:</span> everyday supermarket products, sample customers, supplier data, and a ready-to-test Ghanaian setup.
            </div>
          ) : (
            <div className={`rounded-xl border px-4 py-3 text-sm ${accentClasses.infoBox}`}>
              <span className="font-semibold">Clean start:</span> Your business will be created empty so you can add your own products from scratch.
            </div>
          )}

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 rounded-xl border border-black/10 py-2.5 text-sm font-semibold text-black/60 transition hover:border-black/20 hover:text-black/80"
            >
              Back
            </button>
            <div className="flex-[2]">
              <SubmitButton loadingText={isDemo ? 'Setting up demo...' : 'Creating your business...'}>
                {isDemo ? 'Launch Demo Business' : 'Create My Business'}
              </SubmitButton>
            </div>
          </div>
        </form>
      )}

      {/* Footer links */}
      <div className="text-center space-y-2">
        {isDemo ? (
          <p className="text-sm text-black/40">
            Want a clean start instead?{' '}
            <Link href="/register" className="font-medium text-accent underline underline-offset-4 hover:text-accent/80">
              Create from scratch
            </Link>
          </p>
        ) : (
          <>
            <p className="text-sm text-black/40">
              Want to explore first?{' '}
              <Link href="/register?mode=demo" className="font-medium text-accent underline underline-offset-4 hover:text-accent/80">
                Try the demo
              </Link>
            </p>
            <p className="text-sm text-black/40">
              Already have an account?{' '}
              <Link href="/login" className="font-medium text-accent underline underline-offset-4 hover:text-accent/80">
                Sign in
              </Link>
            </p>
          </>
        )}
        {isDemo && (
          <p className="text-sm text-black/40">
            Already have an account?{' '}
            <Link href="/login" className="font-medium text-accent underline underline-offset-4 hover:text-accent/80">
              Sign in
            </Link>
          </p>
        )}
      </div>
    </div>
  );
}
