'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReadinessData, ReadinessStep } from '@/app/actions/onboarding';
import { completeOnboarding, toggleGuidedSetup } from '@/app/actions/onboarding';
import { generateDemoDay, wipeDemoData } from '@/app/actions/demo-day';

/* ────────────────────────────── Icons ────────────────────────────── */
const StepIcons: Record<string, React.ReactNode> = {
  store: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
    </svg>
  ),
  box: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
    </svg>
  ),
  users: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  ),
  play: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
    </svg>
  ),
  receipt: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />
    </svg>
  ),
  settings: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
    </svg>
  ),
};

const CheckIcon = () => (
  <svg className="h-5 w-5 text-success" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
  </svg>
);

/* ────────────────────────────── Progress Ring ────────────────────── */
function ReadinessRing({ pct }: { pct: number }) {
  const r = 54;
  const c = 2 * Math.PI * r;
  const offset = c - (pct / 100) * c;
  return (
    <div className="relative inline-flex items-center justify-center">
      <svg className="h-28 w-28 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={r} fill="none" stroke="currentColor" className="text-black/5" strokeWidth="8" />
        <circle
          cx="60" cy="60" r={r} fill="none"
          stroke="url(#ring-grad)" strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={offset}
          className="transition-all duration-700 ease-out"
        />
        <defs>
          <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#1E40AF" />
            <stop offset="100%" stopColor="#3B82F6" />
          </linearGradient>
        </defs>
      </svg>
      <span className="absolute text-2xl font-bold tabular-nums text-ink">{pct}%</span>
    </div>
  );
}

/* ────────────────────────────── Step Card ────────────────────────── */
function StepCard({ step, index }: { step: ReadinessStep; index: number }) {
  return (
    <Link
      href={step.href}
      className={`group flex items-start gap-4 rounded-2xl border p-4 transition-all duration-200 ${
        step.done
          ? 'border-success/20 bg-success/5'
          : 'border-black/5 bg-white hover:border-accent/30 hover:shadow-md hover:shadow-accent/5'
      }`}
      style={{ animationDelay: `${index * 0.07}s` }}
    >
      {/* Icon */}
      <div className={`mt-0.5 flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl ${
        step.done ? 'bg-success/10 text-success' : 'bg-accentSoft text-accent'
      }`}>
        {step.done ? <CheckIcon /> : StepIcons[step.icon]}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h3 className={`text-sm font-semibold ${step.done ? 'text-success line-through decoration-success/30' : 'text-ink'}`}>
            {step.title}
          </h3>
          {!step.done && (
            <span className="rounded-full bg-black/5 px-2 py-0.5 text-[10px] font-medium text-muted tabular-nums">
              ~{step.estimatedMinutes} min
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-muted">{step.subtitle}</p>
        {!step.done && (
          <p className="mt-1 text-[11px] italic text-accent/60">{step.benefit}</p>
        )}
      </div>

      {/* Arrow */}
      {!step.done && (
        <svg className="mt-3 h-4 w-4 flex-shrink-0 text-black/20 transition-transform group-hover:translate-x-1 group-hover:text-accent" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
        </svg>
      )}
    </Link>
  );
}

/* ────────────────────────────── Demo Day Section ──────────────────── */
function DemoDaySection({ hasDemoData, onGenerate, onWipe, isPending }: {
  hasDemoData: boolean;
  onGenerate: () => void;
  onWipe: () => void;
  isPending: boolean;
}) {
  return (
    <div id="demo" className="rounded-2xl border border-accent/10 bg-gradient-to-br from-accentSoft/60 via-white to-accentSoft/40 p-5">
      <div className="flex items-center gap-3 mb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent/10 text-accent">
          {StepIcons.play}
        </div>
        <div>
          <h3 className="text-sm font-bold text-ink">Demo Day</h3>
          <p className="text-xs text-muted">See TillFlow in action with a week of realistic data</p>
        </div>
      </div>

      {hasDemoData ? (
        <div className="space-y-3">
          <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-3 py-2">
            <CheckIcon />
            <span className="text-sm text-success font-medium">Demo data active — explore your dashboard!</span>
          </div>
          <div className="flex gap-2">
            <Link href="/pos" className="btn-primary flex-1 text-center text-sm py-2">
              Open POS
            </Link>
            <Link href="/reports" className="btn-ghost flex-1 text-center text-sm py-2 border border-black/10">
              View Reports
            </Link>
          </div>
          <button
            onClick={onWipe}
            disabled={isPending}
            className="w-full text-xs text-rose hover:text-rose/80 py-1.5 transition disabled:opacity-50"
          >
            {isPending ? 'Wiping...' : 'Wipe demo data — start fresh'}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <ul className="space-y-1.5">
            {['~30 sales across 7 days', 'Realistic expenses & margins', 'Reports & dashboards come alive'].map(t => (
              <li key={t} className="flex items-center gap-2 text-xs text-muted">
                <span className="h-1 w-1 rounded-full bg-accent/40" />
                {t}
              </li>
            ))}
          </ul>
          <button
            onClick={onGenerate}
            disabled={isPending}
            className="btn-primary w-full py-2.5 text-sm shadow-lg shadow-accent/10 flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isPending ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                Generating...
              </>
            ) : (
              <>
                {StepIcons.play}
                <span>Run Demo Day</span>
              </>
            )}
          </button>
          <p className="text-center text-[10px] text-muted">100% reversible — wipe anytime</p>
        </div>
      )}
    </div>
  );
}

/* ────────────────────────────── Guided Setup Toggle ─────────────── */
function GuidedToggle({ initial }: { initial: boolean }) {
  const [enabled, setEnabled] = useState(initial);
  const [, startTransition] = useTransition();

  const handleToggle = () => {
    const next = !enabled;
    setEnabled(next);
    startTransition(async () => {
      await toggleGuidedSetup(next);
    });
  };

  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={handleToggle}
      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-accent focus:ring-offset-2 ${
        enabled ? 'bg-accent' : 'bg-black/15'
      }`}
    >
      <span
        className={`inline-block h-4 w-4 rounded-full bg-white shadow transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  );
}

/* ────────────────────────────── Micro-Win Toast ──────────────────── */
function MicroWin({ message, show }: { message: string; show: boolean }) {
  if (!show) return null;
  return (
    <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-fade-in-up">
      <div className="flex items-center gap-2 rounded-xl bg-ink px-5 py-3 shadow-xl shadow-black/20">
        <svg className="h-5 w-5 text-success animate-check-draw" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
        <span className="text-sm font-medium text-white">{message}</span>
      </div>
    </div>
  );
}

/* ───────────────────────────── Celebration ────────────────────────── */
function CelebrationOverlay({ show }: { show: boolean }) {
  if (!show) return null;
  const colors = ['#1E40AF', '#3B82F6', '#059669', '#F59E0B', '#EC4899', '#8B5CF6'];
  return (
    <div className="pointer-events-none fixed inset-0 z-50 overflow-hidden">
      {Array.from({ length: 30 }).map((_, i) => (
        <div
          key={i}
          className="absolute h-2 w-2 rounded-full"
          style={{
            backgroundColor: colors[i % colors.length],
            left: `${Math.random() * 100}%`,
            top: '-20px',
            animation: `confetti-fall ${1.5 + Math.random() * 2}s ease-in ${Math.random() * 0.5}s forwards`,
          }}
        />
      ))}
    </div>
  );
}

/* ────────────────────────────── Main Journey ─────────────────────── */
export default function ReadinessJourney({ initial }: { initial: ReadinessData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [isPending, startTransition] = useTransition();
  const [toast, setToast] = useState('');
  const [showCelebration, setShowCelebration] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleGenerateDemo = () => {
    startTransition(async () => {
      const res = await generateDemoDay();
      if (res.ok && res.salesCount > 0) {
        showToast(`${res.salesCount} demo sales generated!`);
        // Refresh data
        setData(prev => ({
          ...prev,
          hasDemoData: true,
          steps: prev.steps.map(s => s.key === 'demo' ? { ...s, done: true, subtitle: 'Demo transactions generated' } : s),
          pct: Math.round(((prev.steps.filter(s => s.done).length + 1) / prev.steps.length) * 100),
        }));
      } else if (res.error) {
        showToast(res.error);
      }
      router.refresh();
    });
  };

  const handleWipeDemo = () => {
    startTransition(async () => {
      const res = await wipeDemoData();
      if (res.ok) {
        showToast('Demo data wiped — clean slate!');
        setData(prev => ({
          ...prev,
          hasDemoData: false,
          steps: prev.steps.map(s => s.key === 'demo' ? { ...s, done: false, subtitle: 'See TillFlow with a week of realistic data' } : s),
          pct: Math.round(((prev.steps.filter(s => s.done).length - 1) / prev.steps.length) * 100),
        }));
      } else if (res.error) {
        showToast(res.error);
      }
      router.refresh();
    });
  };

  const handleComplete = () => {
    startTransition(async () => {
      await completeOnboarding();
      if (data.pct === 100) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3000);
      }
      router.push('/pos');
    });
  };

  const allDone = data.pct === 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-accentSoft via-white to-paper">
      <CelebrationOverlay show={showCelebration} />
      <MicroWin message={toast} show={!!toast} />

      <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="animate-fade-in-up text-center mb-8">
          <div className="mb-4">
            <ReadinessRing pct={data.pct} />
          </div>
          <h1 className="text-2xl font-bold text-ink">
            {allDone ? 'You\'re all set!' : `Welcome, ${data.businessName}`}
          </h1>
          <p className="mt-1.5 text-sm text-muted max-w-sm mx-auto">
            {allDone
              ? 'TillFlow is ready. Your shop is about to level up.'
              : 'Let\'s get your shop running on TillFlow. Each step takes just a few minutes.'}
          </p>
        </div>

        {/* Next Best Action — only when not complete */}
        {data.nextStep && !allDone && (
          <div className="animate-fade-in-up mb-6" style={{ animationDelay: '.1s' }}>
            <div className="rounded-2xl border-2 border-accent/20 bg-white p-5 shadow-lg shadow-accent/5">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="animate-pulse-subtle text-accent text-lg">&#x2794;</span>
                <span className="text-xs font-bold uppercase tracking-wider text-accent">Next step</span>
              </div>
              <h2 className="text-lg font-bold text-ink">{data.nextStep.title}</h2>
              <p className="mt-0.5 text-sm text-muted">{data.nextStep.benefit}</p>
              {data.nextStep.key === 'demo' ? (
                <button
                  onClick={handleGenerateDemo}
                  disabled={isPending}
                  className="btn-primary mt-3 w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isPending ? 'Generating...' : 'Run Demo Day'}
                </button>
              ) : (
                <Link
                  href={data.nextStep.href}
                  className="btn-primary mt-3 block w-full py-2.5 text-center text-sm"
                >
                  {data.nextStep.title} &rarr;
                </Link>
              )}
            </div>
          </div>
        )}

        {/* Step List */}
        <div className="space-y-2.5 stagger-children mb-6">
          {data.steps.map((step, i) => (
            step.key === 'demo' ? null : <StepCard key={step.key} step={step} index={i} />
          ))}
        </div>

        {/* Demo Day Section */}
        <div className="animate-fade-in-up mb-6" style={{ animationDelay: '.3s' }}>
          <DemoDaySection
            hasDemoData={data.hasDemoData}
            onGenerate={handleGenerateDemo}
            onWipe={handleWipeDemo}
            isPending={isPending}
          />
        </div>

        {/* First Win — shown when setup is complete */}
        {allDone && (
          <div className="animate-fade-in-up mb-6 rounded-2xl border border-success/20 bg-success/5 p-5" style={{ animationDelay: '.35s' }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="text-xl">🎉</span>
              <h2 className="text-base font-bold text-ink">Your next 3 wins</h2>
            </div>
            <div className="space-y-2.5">
              {([
                { emoji: '📦', label: 'Add your first product', href: '/products', cta: 'Go to Products' },
                { emoji: '🛒', label: 'Receive your first purchase', href: '/purchases', cta: 'Record Purchase' },
                { emoji: '💳', label: 'Make your first real sale', href: '/pos', cta: 'Open POS' },
              ] as const).map(({ emoji, label, href, cta }) => (
                <div key={href} className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-white px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-lg">{emoji}</span>
                    <span className="text-sm font-medium text-ink">{label}</span>
                  </div>
                  <Link href={href} className="flex-shrink-0 text-xs font-semibold text-accent hover:underline">
                    {cta} &rarr;
                  </Link>
                </div>
              ))}
            </div>
            {/* Guided Setup Toggle */}
            <div className="mt-4 flex items-center justify-between rounded-xl border border-black/5 bg-white px-4 py-3">
              <div>
                <p className="text-sm font-medium text-ink">Guided Setup Tips</p>
                <p className="text-xs text-muted">Show helpful tooltips on POS, Purchases &amp; Catalog</p>
              </div>
              <GuidedToggle initial={data.guidedSetup} />
            </div>
          </div>
        )}

        {/* CTA */}
        <div className="animate-fade-in-up text-center space-y-3" style={{ animationDelay: '.4s' }}>
          {allDone ? (
            <button
              onClick={handleComplete}
              className="btn-primary w-full py-4 text-base shadow-xl shadow-blue-800/20 flex items-center justify-center gap-2"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.59 14.37a6 6 0 01-5.84 7.38v-4.8m5.84-2.58a14.98 14.98 0 006.16-12.12A14.98 14.98 0 009.631 8.41m5.96 5.96a14.926 14.926 0 01-5.841 2.58m-.119-8.54a6 6 0 00-7.381 5.84h4.8m2.58-5.84a14.927 14.927 0 00-2.58 5.84m2.699 2.7c-.103.021-.207.041-.311.06a15.09 15.09 0 01-2.448-2.448 14.9 14.9 0 01.06-.312m-2.24 2.39a4.493 4.493 0 00-1.757 4.306 4.493 4.493 0 004.306-1.758M16.5 9a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
              </svg>
              Open the POS — Start Selling
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="text-sm text-black/30 hover:text-black/50 transition"
            >
              Skip for now — go to POS
            </button>
          )}

          {/* Quick links */}
          <div className="flex items-center justify-center gap-4 text-xs text-muted">
            <Link href="/settings" className="hover:text-accent transition">Settings</Link>
            <span className="text-black/10">|</span>
            <Link href="/pos" className="hover:text-accent transition">POS</Link>
            <span className="text-black/10">|</span>
            <Link href="/reports" className="hover:text-accent transition">Reports</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
