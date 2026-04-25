'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

interface Props {
  userName: string;
  isDemo: boolean;
}

const CLEAN_START_STEPS = [
  {
    number: '01',
    title: 'Add your products',
    desc: 'Head to Products and add your inventory — set names, prices, units, and categories.',
    href: '/products',
    cta: 'Add Products',
  },
  {
    number: '02',
    title: 'Open a till and make a sale',
    desc: 'Go to the POS, select your till, scan or search products, and complete your first transaction.',
    href: '/pos',
    cta: 'Open POS',
  },
  {
    number: '03',
    title: 'Check your dashboard',
    desc: 'See today\'s sales, cash position, and key insights on your owner dashboard.',
    href: '/',
    cta: 'Open Dashboard',
  },
];

const DEMO_STEPS = [
  {
    number: '01',
    title: 'Explore the POS',
    desc: 'Your demo is loaded with Ghanaian products, customers, and pricing. Try making a sale.',
    href: '/pos',
    cta: 'Open POS',
  },
  {
    number: '02',
    title: 'Review the reports',
    desc: 'Check margins, stock movements, and daily cash close — all pre-filled with demo data.',
    href: '/',
    cta: 'Open Dashboard',
  },
  {
    number: '03',
    title: 'Set up your real business',
    desc: 'Ready to go live? Create a fresh account with your own products, prices, and team.',
    href: '/register',
    cta: 'Create Real Account',
  },
];

export default function GettingStartedClient({ userName, isDemo }: Props) {
  const [visible, setVisible] = useState(false);
  const steps = isDemo ? DEMO_STEPS : CLEAN_START_STEPS;
  const firstName = userName?.split(' ')[0] ?? 'there';

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 80);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div
      className={`min-h-screen bg-gradient-to-br from-accentSoft/60 via-white to-accentSoft/40 flex items-center justify-center px-4 py-10 transition-opacity duration-700 ${
        visible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      <div className="w-full max-w-lg space-y-8">
        {/* Header card */}
        <div className="rounded-3xl border border-black/5 bg-white/90 p-8 text-center shadow-xl shadow-black/5 backdrop-blur-sm">
          {/* Animated checkmark */}
          <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-emerald-400 to-emerald-500 shadow-lg shadow-emerald-500/30">
            <svg
              className="h-10 w-10 text-white"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2.5}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>

          <h1 className="text-2xl font-bold font-display text-gray-900">
            {isDemo ? `Your demo is ready, ${firstName}!` : `Your business is ready, ${firstName}!`}
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-black/55">
            {isDemo
              ? 'Your TillFlow demo is loaded with a full Ghana-ready supermarket setup — products, customers, MoMo flows, and sample data to explore.'
              : 'TillFlow has set up your store, tills, and chart of accounts. Here\'s how to get started.'}
          </p>

          {isDemo && (
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-4 py-1.5 text-sm font-semibold text-amber-800">
              <span>🎮</span>
              Demo mode — explore freely
            </div>
          )}
        </div>

        {/* Steps */}
        <div className="space-y-3">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className="flex items-start gap-4 rounded-2xl border border-black/5 bg-white/85 p-5 shadow-sm backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:shadow-md"
              style={{ transitionDelay: `${i * 60}ms` }}
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-accent to-accent/80 text-sm font-bold text-white shadow-md shadow-accent/20">
                {step.number}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold font-display text-gray-900">{step.title}</h3>
                <p className="mt-0.5 text-xs leading-relaxed text-black/50">{step.desc}</p>
              </div>
              <Link
                href={step.href}
                className="shrink-0 rounded-lg border border-black/10 bg-white px-3 py-1.5 text-xs font-semibold text-black/60 transition hover:border-accent/20 hover:text-accent"
              >
                {step.cta}
              </Link>
            </div>
          ))}
        </div>

        {/* Primary CTA */}
        <div className="text-center space-y-3">
          <Link
            href="/onboarding"
            className="block w-full rounded-2xl bg-gradient-to-r from-accent to-accent/80 py-4 text-base font-bold text-white shadow-xl shadow-accent/25 transition-all hover:shadow-2xl hover:-translate-y-0.5"
          >
            {isDemo ? 'See Full Setup Checklist' : 'Complete My Setup'}
          </Link>
          <Link
            href="/pos"
            className="block w-full rounded-2xl border-2 border-black/8 bg-white py-3.5 text-sm font-semibold text-black/60 transition hover:border-accent/20 hover:text-accent"
          >
            Go straight to POS
          </Link>
        </div>
      </div>
    </div>
  );
}
