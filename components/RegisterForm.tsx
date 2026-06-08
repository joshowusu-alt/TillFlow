'use client';

import { useState } from 'react';
import { register } from '@/app/actions/register';
import SubmitButton from '@/components/SubmitButton';
import PasswordStrengthMeter from '@/components/PasswordStrengthMeter';
import { Logo } from '@/components/Logo';
import Link from 'next/link';
import type { BusinessPlan } from '@/lib/features';
import { computeSubscriptionPricing } from '@/lib/plan-pricing';

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
  error?: string;
}

export default function RegisterForm({ error }: RegisterFormProps) {
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [businessName, setBusinessName] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedPlan, setSelectedPlan] = useState<BusinessPlan>('STARTER');
  const [addonOnlineStorefront, setAddonOnlineStorefront] = useState(false);
  const [referralSource, setReferralSource] = useState('');
  const [referredByName, setReferredByName] = useState('');
  const [referredByPhone, setReferredByPhone] = useState('');

  const canAdvanceFrom1 = businessName.trim().length > 0 && ownerName.trim().length > 0;
  const canAdvanceFrom2 = email.trim().length > 0 && password.length >= 6;

  const stepLabels = ['Business', 'Account', 'Plan', 'Currency'];
  const accentClasses = {
    infoBox: 'bg-accentSoft border-accent/10 text-accent',
    progressFill: 'bg-gradient-to-r from-accent to-accent/80',
    nextBtn: 'w-full rounded-xl bg-accent py-2.5 text-sm font-semibold text-white transition hover:bg-accent/90 disabled:opacity-40 disabled:cursor-not-allowed',
  };

  const pricing = computeSubscriptionPricing({
    plan: selectedPlan,
    addonOnlineStorefront: selectedPlan === 'GROWTH' && addonOnlineStorefront,
    billingInterval: 'MONTHLY',
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <Logo variant="mark" size={56} className="mx-auto h-14 w-14 rounded-2xl shadow-lg mb-3" alt="TillFlow" />
        <h1 className="text-2xl font-bold font-display">
          <span className="text-accent">Till</span>
          <span className="text-gray-800">Flow</span>
        </h1>
        <p className="mt-0.5 text-xs uppercase tracking-[0.2em] text-black/40">Sales made simple</p>

        <div className="mt-4">
          <p className="text-sm text-black/60">Your products, your prices, your currency. Clean start — yours from day one.</p>
        </div>

        {/* Social proof */}
        <div className="mt-3 text-xs text-black/35 font-medium">
          Built for product-based businesses in Ghana
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
              placeholder="e.g. El-Shaddai Supermarket"
              value={businessName}
              onChange={(e) => setBusinessName(e.target.value)}
              autoComplete="organization"
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
              autoComplete="name"
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
              autoComplete="off"
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
              autoComplete="new-password"
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
              Next — Choose Plan
            </button>
          </div>
        </div>
      )}

      {/* Step 3 (fresh only): Plan selection */}
      {step === 3 && (
        <div className="space-y-4">
          <div>
            <p className="text-sm font-semibold text-black/70 mb-1">Choose your plan</p>
            <p className="text-xs text-black/45 mb-3">You can upgrade at any time. All plans include the core POS, inventory, and receipts.</p>
          </div>
          <div className="space-y-3">
            {([
              {
                id: 'STARTER' as BusinessPlan,
                name: 'Starter',
                tagline: 'Core retail operations',
                features: ['POS & daily sales', 'Inventory management', 'Receipts & payments', 'Offline selling', 'Basic reporting'],
                color: 'text-gray-700',
                ring: 'ring-gray-400',
                bg: 'bg-gray-50',
              },
              {
                id: 'GROWTH' as BusinessPlan,
                name: 'Growth',
                tagline: 'Stronger business insight',
                features: ['Everything in Starter', 'Advanced & financial reports', 'Expense categories', 'Risk monitoring', 'Loyalty points', 'Online storefront (add-on)'],
                color: 'text-blue-700',
                ring: 'ring-blue-500',
                bg: 'bg-blue-50',
                recommended: true,
              },
              {
                id: 'PRO' as BusinessPlan,
                name: 'Pro',
                tagline: 'Multi-branch & online selling',
                features: ['Everything in Growth', 'Online storefront included', 'Multi-branch management', 'Cash-flow forecasting', 'Executive analytics', 'Full audit log'],
                color: 'text-purple-700',
                ring: 'ring-purple-500',
                bg: 'bg-purple-50',
              },
            ] as const).map((plan) => (
              <button
                key={plan.id}
                type="button"
                onClick={() => {
                  setSelectedPlan(plan.id);
                  if (plan.id !== 'GROWTH') {
                    setAddonOnlineStorefront(false);
                  }
                }}
                className={`w-full rounded-xl border-2 p-3 text-left transition ${
                  selectedPlan === plan.id
                    ? `border-transparent ring-2 ${plan.ring} ${plan.bg}`
                    : 'border-black/8 bg-white hover:border-black/15'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${plan.color}`}>{plan.name}</span>
                    {'recommended' in plan && plan.recommended && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full">Popular</span>
                    )}
                  </div>
                  <div className={`h-4 w-4 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                    selectedPlan === plan.id ? `${plan.ring} border-transparent` : 'border-black/20'
                  }`}>
                    {selectedPlan === plan.id && (
                      <div className={`h-2 w-2 rounded-full ${plan.id === 'STARTER' ? 'bg-gray-500' : plan.id === 'GROWTH' ? 'bg-blue-500' : 'bg-purple-500'}`} />
                    )}
                  </div>
                </div>
                <p className="text-xs text-black/45 mb-1.5">{plan.tagline}</p>
                <ul className="space-y-0.5">
                  {plan.features.map((f) => (
                    <li key={f} className="text-xs text-black/60 flex items-center gap-1.5">
                      <span className="text-black/25">·</span> {f}
                    </li>
                  ))}
                </ul>
              </button>
            ))}
          </div>

          {selectedPlan === 'GROWTH' ? (
            <div className="rounded-xl border-2 border-blue-200 bg-blue-50/80 p-4 space-y-3">
              <div>
                <p className="text-sm font-semibold text-blue-900">Add Online Storefront — +GHS 200/month</p>
                <p className="text-xs text-blue-800/80 mt-1">
                  Let customers browse products and place pickup orders online.
                </p>
              </div>
              <label className="flex items-start gap-3 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={addonOnlineStorefront}
                  onChange={(e) => setAddonOnlineStorefront(e.target.checked)}
                  className="mt-0.5 h-4 w-4 rounded border-blue-300"
                />
                <span className="text-blue-900">Add online storefront to my Growth plan</span>
              </label>
            </div>
          ) : null}

          <div className="rounded-xl border border-black/8 bg-white/90 px-4 py-3 text-sm space-y-1">
            {selectedPlan === 'GROWTH' ? (
              <>
                <p>Growth plan: GHS {pricing.basePlanMonthlyGhs}/month</p>
                {addonOnlineStorefront ? (
                  <p>Online Storefront: +GHS {pricing.addOnMonthlyGhs}/month</p>
                ) : null}
              </>
            ) : selectedPlan === 'PRO' ? (
              <p className="text-purple-900">Online Storefront included in Pro — no extra charge.</p>
            ) : (
              <p className="text-black/55">Online Storefront is available on Growth add-on or included in Pro.</p>
            )}
            <p className="font-semibold text-black/80 pt-1">
              Total today: GHS {pricing.totalMonthlyGhs}/month
            </p>
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(2)}
              className="flex-1 rounded-xl border border-black/10 py-2.5 text-sm font-semibold text-black/60 transition hover:border-black/20 hover:text-black/80"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => setStep(4)}
              className={`flex-[2] ${accentClasses.nextBtn}`}
            >
              Next — Currency
            </button>
          </div>
        </div>
      )}

      {/* Step 3 (demo) or step 4 (fresh): Currency + final submit */}
      {step === 4 && (
        <form action={register} className="space-y-4">
          {/* Carry forward all data as hidden fields */}
          <input type="hidden" name="mode" value="fresh" />
          <input type="hidden" name="businessName" value={businessName} />
          <input type="hidden" name="ownerName" value={ownerName} />
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="password" value={password} />
          <input type="hidden" name="plan" value={selectedPlan} />
          {selectedPlan === 'GROWTH' && addonOnlineStorefront ? (
            <input type="hidden" name="addonOnlineStorefront" value="on" />
          ) : null}

          <input type="hidden" name="referralSource" value={referralSource} />
          <input type="hidden" name="referredByName" value={referredByName} />
          <input type="hidden" name="referredByPhone" value={referredByPhone} />
          <input type="hidden" name="sourceChannel" value="INBOUND" />

          <details className="rounded-xl border border-black/8 bg-white/80 px-4 py-3 text-sm">
            <summary className="cursor-pointer font-semibold text-black/70">How did you hear about TillFlow? (optional)</summary>
            <div className="mt-3 space-y-3">
              <select
                value={referralSource}
                onChange={(e) => setReferralSource(e.target.value)}
                className="input w-full"
              >
                <option value="">Select…</option>
                <option value="WHATSAPP_GROUP">WhatsApp group</option>
                <option value="EXISTING_CUSTOMER">Existing customer</option>
                <option value="FAMILY_FRIEND">Family / friend</option>
                <option value="AGENT_REFERRAL">Agent referral</option>
                <option value="SOCIAL_MEDIA">Social media</option>
                <option value="WEBSITE">Website</option>
                <option value="OTHER">Other</option>
              </select>
              <input
                className="input w-full"
                placeholder="Referred by (name)"
                value={referredByName}
                onChange={(e) => setReferredByName(e.target.value)}
              />
              <input
                className="input w-full"
                placeholder="Referrer phone (optional)"
                value={referredByPhone}
                onChange={(e) => setReferredByPhone(e.target.value)}
              />
            </div>
          </details>

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

          <div className={`rounded-xl border px-4 py-3 text-sm ${accentClasses.infoBox}`}>
            <span className="font-semibold">Clean start:</span> Your business will be created empty so you can add your own products from scratch.
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={() => setStep(3)}
              className="flex-1 rounded-xl border border-black/10 py-2.5 text-sm font-semibold text-black/60 transition hover:border-black/20 hover:text-black/80"
            >
              Back
            </button>
            <div className="flex-[2]">
              <SubmitButton loadingText="Creating your business...">
                Create My Business
              </SubmitButton>
            </div>
          </div>
        </form>
      )}

      {/* Footer links */}
      <div className="text-center space-y-2">
        <>
          <p className="text-sm text-black/40">
            Want to explore first?{' '}
            <Link href="/demo" className="font-medium text-accent underline underline-offset-4 hover:text-accent/80">
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
      </div>
    </div>
  );
}
