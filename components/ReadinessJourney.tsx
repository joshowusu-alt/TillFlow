'use client';

import { useState, useTransition } from 'react';
import { useToast } from '@/components/ToastProvider';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReadinessData, ReadinessStep } from '@/app/actions/onboarding';
import { completeOnboarding, toggleGuidedSetup } from '@/app/actions/onboarding';
import { generateDemoDay, wipeDemoData, clearSampleData } from '@/app/actions/demo-day';

const OPTIONAL_STEP_KEYS = new Set(['demo']);

function getRequiredSteps(steps: ReadinessStep[]) {
  return steps.filter((step) => !OPTIONAL_STEP_KEYS.has(step.key));
}

function getReadinessPct(steps: ReadinessStep[]) {
  const requiredSteps = getRequiredSteps(steps);
  if (requiredSteps.length === 0) return 100;

  const doneCount = requiredSteps.filter((step) => step.done).length;
  return Math.round((doneCount / requiredSteps.length) * 100);
}

function getNextStep(steps: ReadinessStep[]) {
  return getRequiredSteps(steps).find((step) => !step.done) ?? null;
}

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
  inventory: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
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
            <stop offset="0%" stopColor="#06b6d4" />
            <stop offset="60%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#10b981" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="text-2xl font-black tabular-nums text-ink">{pct}%</span>
        <span className="text-[9px] font-bold uppercase tracking-widest text-black/30 mt-0.5">
          {pct === 100 ? 'Ready' : pct >= 67 ? 'Almost' : pct >= 33 ? 'In progress' : 'Getting started'}
        </span>
      </div>
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
          <h3 className="text-sm font-bold text-ink">Live preview mode</h3>
          <p className="text-xs text-muted">Explore every chart and report with a week of realistic trading activity</p>
        </div>
      </div>

      {hasDemoData ? (
        <div className="space-y-3">
            <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-3 py-2">
              <CheckIcon />
              <span className="text-sm text-success font-medium">Preview data loaded — explore freely. Your real setup is unaffected.</span>
            </div>
          <div className="flex gap-2">
            <Link href="/pos" className="btn-primary flex-1 text-center text-sm py-2">
              Open POS
            </Link>
            <Link href="/reports/dashboard" className="btn-ghost flex-1 text-center text-sm py-2 border border-black/10">
              View Reports
            </Link>
          </div>
          <button
            onClick={onWipe}
            disabled={isPending}
            className="w-full text-xs text-rose hover:text-rose/80 py-1.5 transition disabled:opacity-50"
          >
            {isPending ? 'Wiping...' : 'Clear all sample & demo data'}
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
                Loading preview data...
              </>
            ) : (
              <>
                {StepIcons.play}
                <span>Load preview data</span>
              </>
            )}
          </button>
          <p className="text-center text-[10px] text-muted">Removed with one click — your real setup is never affected</p>
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
    <div className="safe-floating-bottom fixed left-1/2 z-50 -translate-x-1/2 animate-fade-in-up">
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

/* ────────────────────────────── Welcome Dashboard (post-setup) ──── */
type HomeAction = {
  label: string;
  desc: string;
  href: string;
  primary?: boolean;
  urgent?: boolean;
  breakBefore?: boolean;
  icon: React.ReactNode;
};

function HomeIcon({ name }: { name: 'pos' | 'chart' | 'box' | 'settings' | 'shift' | 'alert' | 'reorder' | 'payables' | 'purchases' | 'sales' | 'inventory' | 'team' | 'setup' }) {
  const common = { className: 'h-5 w-5', fill: 'none', viewBox: '0 0 24 24', strokeWidth: 1.8, stroke: 'currentColor' };
  const pathProps = { strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const };
  const paths: Record<typeof name, React.ReactNode> = {
    pos: <path {...pathProps} d="M2.25 3h1.386c.51 0 .955.343 1.087.835l.383 1.437M7.5 14.25a3 3 0 00-3 3h15.75m-12.75-3h11.218c1.121-2.3 2.1-4.684 2.924-7.138a60.114 60.114 0 00-16.536-1.84M7.5 14.25L5.106 5.272M6 20.25a.75.75 0 11-1.5 0 .75.75 0 011.5 0zm12.75 0a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />,
    chart: <path {...pathProps} d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />,
    box: <path {...pathProps} d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5m8.25 3v6.75m0 0l-3-3m3 3l3-3M3.375 7.5h17.25" />,
    settings: <><path {...pathProps} d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" /><path {...pathProps} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></>,
    shift: <path {...pathProps} d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />,
    alert: <path {...pathProps} d="M12 9v3.75m0 3.75h.007v.008H12V16.5zm-9.303-.374c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />,
    reorder: <path {...pathProps} d="M8.25 6.75h12M8.25 12h12m-12 5.25h12M3.75 6.75h.007v.008H3.75V6.75zm0 5.25h.007v.008H3.75V12zm0 5.25h.007v.008H3.75v-.008z" />,
    payables: <path {...pathProps} d="M12 21v-8.25M15.75 21v-8.25M8.25 21v-8.25M3 9l9-6 9 6m-1.5 12V10.332A48.36 48.36 0 0012 9.75c-2.551 0-5.056.2-7.5.582V21M3 21h18" />,
    purchases: <path {...pathProps} d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0h6m5.25 0a1.5 1.5 0 01-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25m0 11.177v-12.135c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v10.51c0 .621.504 1.125 1.125 1.125H5.25" />,
    sales: <path {...pathProps} d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192A48.424 48.424 0 0012 3.75c-2.088 0-4.131.134-6.124.392C4.745 4.288 3.75 5.245 3.75 6.392V19.5a2.25 2.25 0 002.25 2.25h9.75" />,
    inventory: <path {...pathProps} d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />,
    team: <path {...pathProps} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />,
    setup: <path {...pathProps} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function HomeActionCard({ action }: { action: HomeAction }) {
  return (
    <Link
      href={action.href}
      className={`group relative flex items-center gap-4 rounded-2xl px-4 py-4 shadow-sm transition hover:-translate-y-0.5 active:scale-[0.985] sm:min-h-[9.25rem] sm:flex-col sm:items-start sm:p-5 ${
        action.primary
          ? 'bg-accent text-white shadow-md shadow-accent/25 hover:shadow-xl hover:shadow-accent/30'
          : action.urgent
          ? 'border border-amber-200 bg-amber-50 text-ink hover:border-amber-300'
          : 'border border-black/[0.06] bg-white text-ink hover:shadow-md'
      } ${action.breakBefore ? 'mt-3 sm:mt-0 sm:border-t-4 sm:border-t-black/10' : ''}`}
    >
      <div className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl transition ${
        action.primary
          ? 'bg-white/20 text-white'
          : action.urgent
          ? 'bg-amber-100 text-amber-700'
          : 'bg-accentSoft text-accent group-hover:bg-accent group-hover:text-white'
      }`}>
        {action.icon}
      </div>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-bold ${action.primary ? 'text-white' : 'text-ink'}`}>{action.label}</p>
        <p className={`mt-0.5 text-xs ${action.primary ? 'text-white/65' : action.urgent ? 'text-amber-800/70' : 'text-muted'}`}>
          {action.desc}
        </p>
      </div>
      <svg className={`h-4 w-4 flex-shrink-0 transition group-hover:translate-x-0.5 sm:absolute sm:bottom-4 sm:right-4 ${
        action.primary ? 'text-white/40' : 'text-black/20 group-hover:text-accent/50'
      }`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  );
}

function WelcomeDashboard({
  data,
  onGenerateDemo,
  onWipeDemo,
  isBusy,
}: {
  data: ReadinessData;
  onGenerateDemo: () => void;
  onWipeDemo: () => void;
  isBusy: boolean;
}) {
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = data.userName ? data.userName.split(' ')[0] : null;
  const formatMoney = (pence: number) =>
    new Intl.NumberFormat('en-GB', { style: 'currency', currency: data.currency }).format(pence / 100);
  const revenueAheadPence = data.todayRevenuePence - data.yesterdayRevenuePence;
  const isNewAccount = data.saleCount < 10;
  const statusPill = data.openIssueCount > 0
    ? {
        label: `${data.openIssueCount} item${data.openIssueCount === 1 ? ' needs' : 's need'} attention`,
        shell: 'border-amber-300/25 bg-amber-400/15 text-amber-200',
        dot: 'bg-amber-300',
      }
    : {
        label: 'All systems active',
        shell: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-300',
        dot: 'bg-emerald-400',
      };

  const buildDelta = (current: number, previous: number) => {
    const diff = current - previous;
    if (previous === 0 && current === 0) return null;
    if (previous === 0) return { text: 'New today', positive: true };
    const pct = Math.round((Math.abs(diff) / previous) * 100);
    return {
      text: `${diff >= 0 ? '+' : '-'}${pct}% vs yesterday`,
      positive: diff >= 0,
    };
  };

  const smartSubtitle = data.openIssueCount > 0
    ? { text: `You have ${data.openIssueCount} item${data.openIssueCount === 1 ? '' : 's'} needing attention today.`, href: '/reports/command-center' }
    : hour < 11 && data.todayTransactionCount === 0
    ? { text: 'No sales recorded yet today. Ready to open?', href: '/pos' }
    : revenueAheadPence > 0 && data.yesterdayRevenuePence > 0
    ? { text: `Great day so far - ${formatMoney(revenueAheadPence)} ahead of yesterday.`, href: '/reports/dashboard' }
    : { text: "Here's your business at a glance.", href: '/reports/dashboard' };

  const heroStats = data.saleCount === 0
    ? [
        { label: 'Products', value: data.productCount.toLocaleString(), href: '/products', delta: null },
        { label: "Today's Transactions", value: data.todayTransactionCount.toLocaleString(), href: '/sales', delta: buildDelta(data.todayTransactionCount, data.yesterdayTransactionCount) },
        { label: 'Open Issues', value: data.openIssueCount.toLocaleString(), href: '/reports/command-center', delta: null },
      ]
    : [
        { label: "Today's Revenue", value: formatMoney(data.todayRevenuePence), href: '/reports/dashboard', delta: buildDelta(data.todayRevenuePence, data.yesterdayRevenuePence) },
        { label: "Today's Transactions", value: data.todayTransactionCount.toLocaleString(), href: '/sales', delta: buildDelta(data.todayTransactionCount, data.yesterdayTransactionCount) },
        { label: 'Open Issues', value: data.openIssueCount.toLocaleString(), href: '/reports/command-center', delta: null },
      ];

  const dynamicActions = ([
    data.openShiftCount > 0 ? {
      label: 'Close Shift',
      desc: `${data.openShiftSalesCount} sale${data.openShiftSalesCount === 1 ? '' : 's'} recorded`,
      href: '/shifts',
      urgent: true,
      icon: <HomeIcon name="shift" />,
    } : null,
    data.openIssueCount > 0 ? {
      label: `${data.openIssueCount} issue${data.openIssueCount === 1 ? ' needs' : 's need'} attention`,
      desc: 'Open Command Center',
      href: '/reports/command-center',
      urgent: true,
      icon: <HomeIcon name="alert" />,
    } : null,
    data.reorderNeededCount > 0 ? {
      label: 'Reorder needed',
      desc: `${data.reorderNeededCount} product${data.reorderNeededCount === 1 ? '' : 's'}`,
      href: '/reports/reorder-suggestions',
      urgent: true,
      icon: <HomeIcon name="reorder" />,
    } : null,
    data.overdueSupplierInvoiceCount > 0 ? {
      label: 'Supplier payments due',
      desc: `${data.overdueSupplierInvoiceCount} overdue invoice${data.overdueSupplierInvoiceCount === 1 ? '' : 's'}`,
      href: '/payments/supplier-payments',
      urgent: true,
      icon: <HomeIcon name="payables" />,
    } : null,
  ] as Array<HomeAction | null>).filter((action): action is HomeAction => action !== null);

  const staticActions: HomeAction[] = [
    { label: 'Open POS', desc: 'Serve customers and record sales', href: '/pos', primary: true, icon: <HomeIcon name="pos" /> },
    { label: 'Dashboard', desc: "Today's performance", href: '/reports/dashboard', icon: <HomeIcon name="chart" /> },
    { label: 'Products', desc: 'Manage your catalogue', href: '/products', icon: <HomeIcon name="box" /> },
    { label: 'Settings', desc: 'Business and team config', href: '/settings', icon: <HomeIcon name="settings" /> },
    { label: 'Purchases', desc: 'Record deliveries and costs', href: '/purchases', breakBefore: true, icon: <HomeIcon name="purchases" /> },
    { label: 'Sales History', desc: 'Find invoices and returns', href: '/sales', icon: <HomeIcon name="sales" /> },
    { label: 'Inventory', desc: 'Review stock movements', href: '/reports/stock-movements', icon: <HomeIcon name="inventory" /> },
    { label: 'Team', desc: 'Users and approvals', href: '/users', icon: <HomeIcon name="team" /> },
    { label: 'Setup Checklist', desc: 'Review launch progress', href: '/onboarding', icon: <HomeIcon name="setup" /> },
  ];
  const quickActions = [...dynamicActions, ...staticActions];

  const previewCard = (
    <DemoDaySection
      hasDemoData={data.hasDemoData}
      onGenerate={onGenerateDemo}
      onWipe={onWipeDemo}
      isPending={isBusy}
    />
  );

  return (
    <div className="min-h-screen" style={{ background: '#f0f2f5' }}>
      <div className="relative overflow-hidden" style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)' }}>
        <div className="pointer-events-none absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(59,130,246,0.2) 0%, transparent 40%)',
        }} />
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-20" style={{ background: 'linear-gradient(to bottom, transparent, rgba(15,23,42,0.3))' }} />

        <div className="relative mx-auto max-w-5xl px-4 pb-8 pt-7 sm:px-6 sm:pb-12 sm:pt-10 lg:pb-16 lg:pt-14">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-300/60">
            {greeting}{firstName ? `, ${firstName}` : ''}
          </p>
          <h1 className="text-[1.75rem] font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-5xl">
            {data.businessName}
          </h1>
          <Link href={smartSubtitle.href} className="mt-2 inline-block text-sm font-medium text-blue-100/75 underline-offset-4 hover:text-white hover:underline">
            {smartSubtitle.text}
          </Link>
          {data.onboardingCompletedAt && (
            <p className="mt-1 text-[11px] text-blue-200/45">
              Trading live since {new Date(data.onboardingCompletedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          )}

          <div className={`mt-4 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusPill.shell}`}>
            <span className="relative flex h-2 w-2">
              <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${statusPill.dot}`} />
              <span className={`relative inline-flex h-2 w-2 rounded-full ${statusPill.dot}`} />
            </span>
            {statusPill.label}
          </div>

          <div className="mt-5 grid grid-cols-3 gap-2 sm:flex sm:gap-3">
            {heroStats.map(({ label, value, href, delta }) => (
              <Link
                key={label}
                href={href}
                className="group flex min-h-[7rem] flex-col justify-between rounded-2xl border border-white/10 bg-white/8 px-3 py-3 text-left backdrop-blur-md transition hover:border-white/20 hover:bg-white/15 sm:min-w-[150px] sm:px-5 sm:py-4"
              >
                <span className="text-[10px] font-medium uppercase tracking-wide text-blue-200/50">{label}</span>
                <span className="mt-1 break-words text-xl font-black tabular-nums text-white sm:text-3xl">{value}</span>
                {delta ? (
                  <span className={`mt-1 text-[10px] font-semibold ${delta.positive ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {delta.text}
                  </span>
                ) : (
                  <span className="mt-1 text-[10px] font-semibold text-blue-200/35">Live</span>
                )}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:py-8">
        {isNewAccount ? <div className="mb-5">{previewCard}</div> : null}

        <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">Quick access</p>
        <div className="grid gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
          {quickActions.map((action) => (
            <HomeActionCard key={`${action.href}-${action.label}`} action={action} />
          ))}
        </div>

        {!isNewAccount && data.hasDemoData ? <div className="mt-6">{previewCard}</div> : null}
      </div>
    </div>
  );
}

/* ────────────────────────────── Main Journey ─────────────────────── */
export default function ReadinessJourney({ initial }: { initial: ReadinessData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [isBusy, setIsBusy] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const { toast: showToast } = useToast();

  const handleGenerateDemo = async () => {
    setIsBusy(true);
    try {
      const res = await generateDemoDay();
      if (res.ok && res.salesCount > 0) {
        showToast(`${res.salesCount} demo sales generated!`, 'success');
        // Refresh data
        setData(prev => {
          const steps = prev.steps.map(s => s.key === 'demo' ? { ...s, done: true, subtitle: 'Demo transactions generated' } : s);
          const pct = getReadinessPct(steps);
          return {
            ...prev,
            hasDemoData: true,
            steps,
            pct,
            nextStep: getNextStep(steps),
            onboardingComplete: prev.onboardingComplete || pct === 100,
          };
        });
      } else if (res.error) {
        showToast(res.error, 'error');
      }
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  };

  const handleWipeDemo = async () => {
    setIsBusy(true);
    try {
      const res = await clearSampleData();
      if (res.ok) {
        showToast(res.removed.length > 0 ? `Cleared: ${res.removed.join(', ')}` : 'Demo data wiped — clean slate!', 'success');
        setData(prev => {
          const steps = prev.steps.map(s => s.key === 'demo' ? { ...s, done: false, subtitle: 'See TillFlow with a week of realistic data' } : s);
          const pct = getReadinessPct(steps);
          return {
            ...prev,
            hasDemoData: false,
            steps,
            pct,
            nextStep: getNextStep(steps),
            onboardingComplete: prev.onboardingComplete || pct === 100,
          };
        });
      } else if (res.error) {
        showToast(res.error, 'error');
      }
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  };

  const handleComplete = async () => {
    setIsBusy(true);
    try {
      await completeOnboarding();
      if (data.onboardingComplete || data.pct === 100) {
        setShowCelebration(true);
        setTimeout(() => setShowCelebration(false), 3000);
      }
      router.push('/pos');
    } finally {
      setIsBusy(false);
    }
  };

  const allDone = data.onboardingComplete || data.pct === 100;

  // ── When setup is complete, show the premium welcome experience ──
  if (allDone) {
    return (
      <>
        <CelebrationOverlay show={showCelebration} />
        <WelcomeDashboard
          data={data}
          onGenerateDemo={handleGenerateDemo}
          onWipeDemo={handleWipeDemo}
          isBusy={isBusy}
        />
      </>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-accentSoft via-white to-paper">
      <CelebrationOverlay show={showCelebration} />

      <div className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        {/* Header */}
        <div className="animate-fade-in-up text-center mb-8">
          <div className="mb-4">
            <ReadinessRing pct={data.pct} />
          </div>
          <h1 className="text-2xl font-bold text-ink">
            {allDone ? 'TillFlow is ready' : `Set up ${data.businessName}`}
          </h1>
          <p className="mt-1.5 text-sm text-muted max-w-sm mx-auto">
            {allDone
              ? 'Your core setup is in place. Keep operating and refine the remaining details as you go.'
              : 'Start with what matters most. You can open the POS before every setting is configured.'}
          </p>
        </div>

        {!allDone && (
          <div className="animate-fade-in-up mb-6 rounded-2xl border border-slate-200 bg-white/90 p-5 shadow-sm" style={{ animationDelay: '.05s' }}>
            <div className="text-xs font-semibold uppercase tracking-[0.22em] text-slate-500">Your launch sequence</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {[
                { step: '1', title: 'Load your key products', detail: 'Just your top sellers to start — the rest of the catalogue can follow.' },
                { step: '2', title: 'Record opening stock', detail: 'The quantities on your shelf today, entered once.' },
                { step: '3', title: 'Complete your first real sale', detail: 'One checkout and your financial reports go live.' },
              ].map((item) => (
                <div key={item.step} className="rounded-xl border border-black/5 bg-slate-50 px-4 py-3">
                  <div className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent text-xs font-bold text-white">
                    {item.step}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-ink">{item.title}</div>
                  <div className="mt-1 text-xs text-muted">{item.detail}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Next Best Action — only when not complete */}
        {data.nextStep && !allDone && (
          <div className="animate-fade-in-up mb-6" style={{ animationDelay: '.1s' }}>
            <div className="rounded-2xl border-2 border-accent/20 bg-white p-5 shadow-lg shadow-accent/5">
              <div className="flex items-center gap-1.5 mb-2">
                <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-accent text-white text-[10px] font-black">→</span>
                <span className="text-xs font-bold uppercase tracking-wider text-accent">Up next</span>
              </div>
              <h2 className="text-lg font-bold text-ink">{data.nextStep.title}</h2>
              <p className="mt-0.5 text-sm text-muted">{data.nextStep.subtitle}</p>
              <p className="mt-1 text-xs text-accent/70">{data.nextStep.benefit}</p>
              {data.nextStep.key === 'demo' ? (
                <button
                  onClick={handleGenerateDemo}
                  disabled={isBusy}
                  className="btn-primary mt-3 w-full py-2.5 text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isBusy ? 'Generating...' : 'Run Demo Day'}
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
            isPending={isBusy}
          />
        </div>

        {/* First Win — shown when setup is complete */}
        {allDone && (
          <div className="animate-fade-in-up mb-6 rounded-2xl border border-success/20 bg-success/5 p-5" style={{ animationDelay: '.35s' }}>
            <div className="mb-4 flex items-center gap-2">
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-success text-white">
                <CheckIcon />
              </span>
              <h2 className="text-base font-bold text-ink">Your next operational checks</h2>
            </div>
            <div className="space-y-2.5">
              {([
                { label: 'Add your first product', href: '/products', cta: 'Go to products' },
                { label: 'Receive your first purchase', href: '/purchases', cta: 'Record purchase' },
                { label: 'Complete your first live sale', href: '/pos', cta: 'Open POS' },
              ] as const).map(({ label, href, cta }, index) => (
                <div key={href} className="flex items-center justify-between gap-3 rounded-xl border border-black/5 bg-white px-4 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-slate-100 text-xs font-bold text-slate-700">{index + 1}</span>
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
                <p className="text-xs text-muted">Keep gentle prompts visible while your team learns the flow</p>
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
              Open POS and start trading
            </button>
          ) : (
            <button
              onClick={handleComplete}
              className="text-sm text-black/30 hover:text-black/50 transition"
            >
              Skip to POS
            </button>
          )}

          {/* Quick links */}
          <div className="flex items-center justify-center gap-4 text-xs text-muted">
            <Link href="/settings" className="hover:text-accent transition">Settings</Link>
            <span className="text-black/10">|</span>
            <Link href="/pos" className="hover:text-accent transition">POS</Link>
            <span className="text-black/10">|</span>
            <Link href="/reports/dashboard" className="hover:text-accent transition">Reports</Link>
          </div>
        </div>
      </div>
    </div>
  );
}
