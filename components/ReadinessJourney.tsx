'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ToastProvider';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { ReadinessData } from '@/app/actions/onboarding';
import { clearSampleData, generateDemoDay } from '@/app/actions/demo-day';
import { getNavTodaySales } from '@/app/actions/nav-kpis';
import { formatMoney } from '@/lib/format';
import { hasPlanAccess } from '@/lib/features';
import type { ImproveRecordsResult } from '@/lib/improve-records';
import {
  countHomeAttentionActions,
  formatCloseShiftDescription,
  formatCommandCenterActionLabel,
  formatHeroStatusPill,
  formatHomeAttentionActionSummary,
} from '@/lib/home-attention-presentation';
import BusinessProfileEditor from '@/components/onboarding/BusinessProfileEditor';
import { useRouterRefreshOnVisibility } from '@/hooks/useRouterRefreshOnVisibility';

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
  payments: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  ),
  purchase: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0h6m5.25 0a1.5 1.5 0 01-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M8.25 18.75V7.5" />
    </svg>
  ),
  billing: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192A48.424 48.424 0 0012 3.75c-2.088 0-4.131.134-6.124.392C4.745 4.288 3.75 5.245 3.75 6.392V19.5a2.25 2.25 0 002.25 2.25h9.75" />
    </svg>
  ),
  report: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  ),
  complete: (
    <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const CheckIcon = () => (
  <svg className="h-5 w-5 text-success" viewBox="0 0 20 20" fill="currentColor">
    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
  </svg>
);

/* ────────────────────────────── Demo Day Section ──────────────────── */
function DemoDaySection({ hasDemoData, hasSeedData, onGenerate, onWipe, isPending }: {
  hasDemoData: boolean;
  hasSeedData: boolean;
  onGenerate: () => void;
  onWipe: () => void;
  isPending: boolean;
}) {
  const hasAnyDemoContent = hasDemoData || hasSeedData;
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

      {hasAnyDemoContent ? (
        <div className="space-y-3">
          {hasDemoData && (
            <div className="flex items-center gap-2 rounded-lg bg-success/10 border border-success/20 px-3 py-2">
              <CheckIcon />
              <span className="text-sm text-success font-medium">Preview data loaded — explore freely. Your real setup is unaffected.</span>
            </div>
          )}
          {hasSeedData && !hasDemoData && (
            <div className="flex items-center gap-2 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2">
              <svg className="h-4 w-4 text-amber-600 flex-shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126z" />
              </svg>
              <span className="text-sm text-amber-800 font-medium">Sample products are loaded. Remove them when you&apos;re ready to start fresh.</span>
            </div>
          )}
          {hasDemoData ? (
            <Link
              href="/reports/dashboard"
              className="btn-ghost inline-flex w-full min-h-11 items-center justify-center text-center text-sm py-2 border border-black/10"
            >
              Explore sample data
            </Link>
          ) : null}
          <button
            onClick={onWipe}
            disabled={isPending}
            className="w-full text-xs text-rose hover:text-rose/80 py-1.5 transition disabled:opacity-50"
          >
            {isPending ? 'Clearing...' : 'Clear all sample & demo data'}
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

function HomeIcon({ name }: { name: 'pos' | 'chart' | 'box' | 'settings' | 'shift' | 'alert' | 'reorder' | 'payables' | 'purchases' | 'sales' | 'inventory' | 'team' | 'setup' | 'receipt' | 'billing' | 'health' }) {
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
    receipt: <path {...pathProps} d="M9 14.25l6-6m4.5-3.493V21.75l-3.75-1.5-3.75 1.5-3.75-1.5-3.75 1.5V4.757c0-1.108.806-2.057 1.907-2.185a48.507 48.507 0 0111.186 0c1.1.128 1.907 1.077 1.907 2.185zM9.75 9h.008v.008H9.75V9zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm4.125 4.5h.008v.008h-.008V13.5zm.375 0a.375.375 0 11-.75 0 .375.375 0 01.75 0z" />,
    inventory: <path {...pathProps} d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L21.75 12l-4.179 2.25m0 0l4.179 2.25L12 21.75 2.25 16.5l4.179-2.25m11.142 0l-5.571 3-5.571-3" />,
    team: <path {...pathProps} d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />,
    setup: <path {...pathProps} d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />,
    billing: <path {...pathProps} d="M2.25 8.25h19.5M2.25 9h19.5m-16.5 5.25h6m-6 2.25h3m-3.75 3h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />,
    health: <path {...pathProps} d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />,
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function HomeActionCard({
  action,
  className = '',
  compact = false,
}: {
  action: HomeAction;
  className?: string;
  compact?: boolean;
}) {
  return (
    <Link
      href={action.href}
      className={`group relative flex items-center gap-4 rounded-2xl px-4 py-4 shadow-sm transition hover:-translate-y-0.5 active:scale-[0.985] ${
        action.primary
          ? 'bg-accent text-white shadow-md shadow-accent/25 hover:shadow-xl hover:shadow-accent/30 lg:bg-gradient-to-r lg:from-accent lg:to-blue-600'
          : action.urgent
          ? 'border border-amber-200 bg-amber-50 text-ink hover:border-amber-300'
          : 'border border-black/[0.06] bg-white text-ink hover:border-black/10 hover:shadow-md'
      } ${compact ? 'px-3.5 py-3.5' : ''} ${className}`}
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
      <svg className={`h-4 w-4 flex-shrink-0 transition group-hover:translate-x-0.5 ${
        action.primary ? 'text-white/40' : 'text-black/20 group-hover:text-accent/50'
      }`} fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
      </svg>
    </Link>
  );
}

function ImproveYourRecordsSection({ improveRecords }: { improveRecords: ImproveRecordsResult }) {
  return (
    <section aria-labelledby="improve-your-records-heading" className="rounded-2xl border border-black/8 bg-white p-4 sm:p-5">
      <h2 id="improve-your-records-heading" className="text-sm font-bold text-ink">
        Improve your records
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Optional improvements that make your records and reports more reliable.
      </p>
      {improveRecords.primary ? (
        <div className="mt-3 space-y-2">
          <Link
            href={improveRecords.primary.href}
            className="block rounded-xl border border-accent/25 bg-accentSoft/40 px-3.5 py-3 hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">
              Top improvement
            </p>
            <p className="mt-1 text-sm font-semibold text-ink">
              {improveRecords.primary.title}
            </p>
            <p className="mt-0.5 text-xs leading-5 text-muted">
              {improveRecords.primary.explanation}
            </p>
            <span className="mt-2 inline-block text-xs font-semibold text-accent">
              {improveRecords.primary.actionLabel} →
            </span>
          </Link>
          {improveRecords.secondary.length > 0 ? (
            <ul className="space-y-1">
              {improveRecords.secondary.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 flex-col gap-1 rounded-lg px-2.5 py-2.5 hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:flex-row lg:items-start lg:justify-between lg:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug text-ink">{item.title}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted">{item.explanation}</p>
                    </div>
                    <span className="mt-0.5 break-words text-xs font-semibold leading-5 text-accent lg:mt-0 lg:shrink-0 lg:pt-0.5 lg:text-right lg:whitespace-nowrap">
                      {item.actionLabel} →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-5 text-muted">
          {improveRecords.allClearMessage ??
            'Your key records are in good shape. TillFlow will surface the next useful improvement when needed.'}
        </p>
      )}
    </section>
  );
}

function TodaysAttentionSection({
  attentionActions,
  actionCount,
}: {
  attentionActions: HomeAction[];
  actionCount: number;
}) {
  const hasItems = attentionActions.length > 0;
  const hasCommandCenterAction = attentionActions.some((action) => action.href === '/reports/command-center');

  return (
    <section aria-labelledby="todays-attention-heading">
      <div className="mb-3">
        <h2 id="todays-attention-heading" className="text-[10px] font-bold uppercase tracking-[0.2em] text-black/35">
          Today&apos;s attention
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted">
          {formatHomeAttentionActionSummary(actionCount)}
        </p>
      </div>
      {hasItems ? (
        <div className="space-y-2">
          {attentionActions.map((action) => (
            <HomeActionCard
              key={`${action.href}-${action.label}`}
              action={action}
              compact
            />
          ))}
          {!hasCommandCenterAction ? (
            <Link
              href="/reports/command-center"
              className="flex min-h-11 items-center justify-between rounded-xl border border-black/[0.06] bg-white px-3 py-2 text-xs font-semibold text-accent shadow-sm transition hover:bg-accentSoft focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
            >
              View all tasks
              <span aria-hidden>&rarr;</span>
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function EstablishedSampleNotice({
  hasDemoData,
  hasSeedData,
  onWipe,
  isPending,
}: {
  hasDemoData: boolean;
  hasSeedData: boolean;
  onWipe: () => void;
  isPending: boolean;
}) {
  return (
    <div className="rounded-xl border border-amber-200/80 bg-amber-50/70 px-3.5 py-3">
      <p className="text-sm font-medium text-ink">
        {hasDemoData
          ? 'Sample trading data is still on this account.'
          : 'Sample products are still on this account.'}
      </p>
      <p className="mt-1 text-xs text-muted">
        {hasSeedData && !hasDemoData
          ? 'Remove them when you are ready to keep only your real catalogue.'
          : 'Clear them when you no longer need the preview activity.'}
      </p>
      <button
        type="button"
        onClick={onWipe}
        disabled={isPending}
        className="mt-2 text-xs font-semibold text-rose hover:text-rose/80 disabled:opacity-50"
      >
        {isPending ? 'Clearing…' : 'Clear sample & demo data'}
      </button>
    </div>
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
  const formatCurrency = (pence: number) => formatMoney(pence, data.currency);
  const isNewAccount = data.saleCount < 10;
  const hasRecordImprovements = Boolean(data.improveRecords?.primary);
  const canAccessReorder = hasPlanAccess(data.plan, 'GROWTH');
  const attentionFlags = {
    openShiftCount: data.openShiftCount,
    openIssueCount: data.openIssueCount,
    reorderNeededCount: data.reorderNeededCount,
    overdueSupplierInvoiceCount: data.overdueSupplierInvoiceCount,
    canAccessReorder,
  };
  const homeAttentionActionCount = countHomeAttentionActions(attentionFlags);
  // Status pill is the single hero-level attention summary (no duplicate subtitle under the name).
  const statusPillLabel = formatHeroStatusPill({
    actionCount: homeAttentionActionCount,
    openShiftCount: data.openShiftCount,
    hasRecordImprovements,
  });
  const statusPill =
    homeAttentionActionCount > 0
      ? {
          label: statusPillLabel,
          shell: 'border-amber-300/25 bg-amber-400/15 text-amber-200',
          dot: 'bg-amber-300',
        }
      : hasRecordImprovements
      ? {
          label: statusPillLabel,
          shell: 'border-blue-300/25 bg-blue-400/10 text-blue-100',
          dot: 'bg-blue-300',
        }
      : {
          label: statusPillLabel,
          shell: 'border-emerald-400/25 bg-emerald-500/15 text-emerald-300',
          dot: 'bg-emerald-400',
        };

  const lastCloseText = data.lastShiftClosedAt
    ? `Last close: ${new Date(data.lastShiftClosedAt).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'No close recorded yet';

  const todayVsYesterdayText = data.yesterdayRevenuePence > 0
    ? `${formatCurrency(data.todayRevenuePence)} today / ${formatCurrency(data.yesterdayRevenuePence)} yesterday`
    : `${formatCurrency(data.todayRevenuePence)} today`;

  const heroStats = data.saleCount === 0
    ? [
        { label: 'Products', displayLabel: 'Products', value: data.productCount.toLocaleString(), href: '/products', footer: `${data.productCount} listed`, primary: true },
        { label: "Today's Transactions", displayLabel: 'Transactions', value: data.todayTransactionCount.toLocaleString(), href: '/sales', footer: null, primary: false },
        { label: 'Expected Cash', displayLabel: 'Expected Cash', value: formatCurrency(data.expectedCashPence), href: '/reports/cash-drawer', footer: data.openShiftCount > 0 ? 'Current open till balance' : 'No open till', primary: false },
      ]
    : [
        { label: "Today's Revenue", displayLabel: 'Revenue', value: formatCurrency(data.todayRevenuePence), href: '/reports/dashboard', footer: todayVsYesterdayText, primary: true },
        { label: "Today's Transactions", displayLabel: 'Transactions', value: data.todayTransactionCount.toLocaleString(), href: '/sales', footer: null, primary: false },
        { label: 'Expected Cash', displayLabel: 'Expected Cash', value: formatCurrency(data.expectedCashPence), href: '/reports/cash-drawer', footer: data.openShiftCount > 0 ? 'Current open till balance' : 'No open till', primary: false },
      ];
  const getStatValueSize = (value: string, primary: boolean) => {
    if (value.length > 11) return primary ? 'text-sm sm:text-sm lg:text-base' : 'text-xs sm:text-sm lg:text-base';
    if (value.length > 8) return primary ? 'text-base sm:text-lg lg:text-lg' : 'text-sm lg:text-lg';
    return primary ? 'text-xl sm:text-2xl lg:text-2xl' : 'text-base sm:text-lg lg:text-2xl';
  };

  const openPosAction: HomeAction = {
    label: 'Open POS',
    desc: 'Serve customers and record sales',
    href: '/pos',
    primary: true,
    icon: <HomeIcon name="pos" />,
  };

  const attentionActions = ([
    data.openShiftCount > 0 ? {
      label: 'Close Shift',
      desc: formatCloseShiftDescription({
        salesCount: data.openShiftSalesCount,
        openedAt: data.openShiftOpenedAt,
      }),
      href: '/shifts',
      urgent: true,
      icon: <HomeIcon name="shift" />,
    } : null,
    data.openIssueCount > 0 ? {
      label: formatCommandCenterActionLabel(data.openIssueCount),
      desc: 'Review operational issues',
      href: '/reports/command-center',
      urgent: true,
      icon: <HomeIcon name="alert" />,
    } : null,
    data.reorderNeededCount > 0 && canAccessReorder ? {
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

  return (
    <div className="bg-[#f0f2f5] px-0 pb-[calc(var(--mobile-bottom-nav-clearance)+1rem)] lg:px-6 lg:pb-8">
      <div className="lg:mx-auto lg:max-w-[90rem]">
        <div
          className="relative overflow-hidden lg:mt-4 lg:rounded-[1.25rem] lg:shadow-[0_18px_50px_rgba(15,23,42,0.12)]"
          style={{ background: 'linear-gradient(135deg, #0f172a 0%, #1e3a8a 55%, #2563eb 100%)' }}
        >
          <div className="pointer-events-none absolute inset-0" style={{
            backgroundImage: 'radial-gradient(circle at 20% 50%, rgba(99,102,241,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(59,130,246,0.2) 0%, transparent 40%)',
          }} />
          <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-16 lg:h-12" style={{ background: 'linear-gradient(to bottom, transparent, rgba(15,23,42,0.25))' }} />

          <div className="relative mx-auto max-w-5xl px-4 pb-5 pt-6 sm:px-6 sm:pb-8 sm:pt-8 lg:max-w-none lg:px-8 lg:py-7 xl:px-10">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1.05fr)_minmax(18rem,1fr)] lg:items-end xl:grid-cols-[minmax(0,1fr)_minmax(22rem,1.02fr)] xl:gap-6">
              <div className="min-w-0">
                {hour < 12 && firstName ? (
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-300/60">
                    {greeting}, {firstName}
                  </p>
                ) : null}
                <h1 className="max-w-4xl text-[1.6rem] font-black leading-tight tracking-tight text-white sm:text-4xl lg:text-[2.35rem] xl:text-[2.65rem]">
                  {data.businessName}
                </h1>
                <p className="mt-1.5 text-[11px] text-blue-100/75">Today · All branches</p>
                <p className="mt-0.5 text-[11px] text-blue-100/70">{lastCloseText}</p>

                <div
                  className={`mt-3 inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-semibold ${statusPill.shell}`}
                  role="status"
                >
                  <span className="relative flex h-2 w-2" aria-hidden>
                    <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-60 ${statusPill.dot}`} />
                    <span className={`relative inline-flex h-2 w-2 rounded-full ${statusPill.dot}`} />
                  </span>
                  {statusPill.label}
                </div>
              </div>

              {/* Mobile: primary metric full-width + two compact secondary; sm+: three equal cards */}
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3">
                {heroStats.map(({ label, displayLabel, value, href, footer, primary }) => (
                  <Link
                    key={label}
                    href={href}
                    aria-label={`${label}: ${value}`}
                    className={`group relative flex min-w-0 flex-col rounded-2xl border border-white/10 bg-white/8 px-3 py-2.5 text-left backdrop-blur-md transition hover:border-white/20 hover:bg-white/14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:min-h-[6.5rem] sm:px-4 sm:py-3.5 lg:min-h-[6.5rem] lg:px-4 lg:py-3.5 ${
                      primary
                        ? 'col-span-2 min-h-[4.5rem] sm:col-span-1'
                        : 'min-h-[4rem]'
                    }`}
                  >
                    <span className="pointer-events-none relative z-10 whitespace-nowrap text-[11px] font-medium uppercase tracking-wider text-blue-100/80 lg:text-xs">{displayLabel}</span>
                    <span
                      className={`mt-1 block max-w-full overflow-hidden text-ellipsis whitespace-nowrap font-black leading-tight tracking-normal tabular-nums text-white ${getStatValueSize(value, primary)}`}
                      title={value}
                    >
                      {value}
                    </span>
                    {footer ? (
                      <span className="pointer-events-none relative z-10 mt-auto pt-1.5 text-[10px] font-semibold leading-snug text-blue-100/70 sm:pt-2">{footer}</span>
                    ) : (
                      <span className="pointer-events-none relative z-10 mt-auto pt-1.5 text-[10px] font-semibold text-blue-100/65 sm:pt-2">Today · All branches</span>
                    )}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-4 py-5 sm:px-6 lg:max-w-none lg:px-8 lg:py-6">
          {/*
            Single control grid — attention renders once:
            mobile/tablet (<lg): Open POS → Attention → IYR → extras
            desktop (lg+): main column Open POS + IYR; right rail Attention
          */}
          <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(20rem,24rem)] lg:items-start xl:grid-cols-[minmax(0,1fr)_minmax(22rem,26rem)] xl:gap-6">
            <div className="order-1 lg:col-start-1 lg:row-start-1">
              <HomeActionCard
                action={openPosAction}
                className="w-full min-h-14 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:min-h-[5.5rem] lg:p-5"
              />
            </div>

            <div className="order-2 lg:col-start-2 lg:row-span-3 lg:row-start-1">
              <TodaysAttentionSection
                attentionActions={attentionActions}
                actionCount={homeAttentionActionCount}
              />
            </div>

            <div className="order-3 lg:col-start-1 lg:row-start-2">
              <ImproveYourRecordsSection improveRecords={data.improveRecords} />
            </div>

            <div className="order-4 space-y-3 lg:col-start-1 lg:row-start-3">
              {isNewAccount ? (
                <DemoDaySection
                  hasDemoData={data.hasDemoData}
                  hasSeedData={data.hasSeedData}
                  onGenerate={onGenerateDemo}
                  onWipe={onWipeDemo}
                  isPending={isBusy}
                />
              ) : null}

              {!isNewAccount && (data.hasDemoData || data.hasSeedData) ? (
                <EstablishedSampleNotice
                  hasDemoData={data.hasDemoData}
                  hasSeedData={data.hasSeedData}
                  onWipe={onWipeDemo}
                  isPending={isBusy}
                />
              ) : null}

              {data.lastReceiptId ? (
                <Link
                  href={`/receipts/${data.lastReceiptId}`}
                  className="inline-flex min-h-11 w-full items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-3.5 py-2.5 text-sm font-medium text-ink shadow-sm transition hover:border-black/10 hover:bg-black/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accentSoft text-accent" aria-hidden>
                    <HomeIcon name="receipt" />
                  </span>
                  <span className="min-w-0 flex-1 text-left">
                    <span className="block text-sm font-semibold text-ink">Last receipt</span>
                    <span className="block text-xs font-normal text-muted">Reprint or review the latest sale</span>
                  </span>
                  <span aria-hidden className="text-accent">&rarr;</span>
                </Link>
              ) : null}
            </div>
          </div>

          <p className="mt-8 text-center text-xs leading-5 text-muted">
            Secure. Reliable. Built for Ghanaian businesses.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ────────────────────────────── Main Journey ─────────────────────── */
export default function ReadinessJourney({ initial }: { initial: ReadinessData }) {
  const router = useRouter();
  const [data, setData] = useState(initial);
  const [liveTodayKpis, setLiveTodayKpis] = useState({
    todayRevenuePence: initial.todayRevenuePence,
    todayTransactionCount: initial.todayTransactionCount,
  });
  const [isBusy, setIsBusy] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const lastLiveKpiRefreshAtRef = useRef(0);
  const { toast: showToast } = useToast();

  useEffect(() => {
    setData(initial);
  }, [initial]);

  useRouterRefreshOnVisibility(router, {
    enabled: data.onboardingComplete,
    // Improve Your Records must refresh promptly when the owner returns from a task.
    throttleMs: 1_500,
  });

  const refreshLiveTodayKpis = useCallback(async (force = false) => {
    const now = Date.now();
    if (!force && now - lastLiveKpiRefreshAtRef.current < 8_000) return;
    lastLiveKpiRefreshAtRef.current = now;

    try {
      const fresh = await getNavTodaySales();
      setLiveTodayKpis({
        todayRevenuePence: fresh.totalPence,
        todayTransactionCount: fresh.txCount,
      });
    } catch {
      // Keep the readiness snapshot values if the small live KPI refresh fails.
    }
  }, []);

  useEffect(() => {
    if (!data.onboardingComplete) return;
    // Local Home preview fixtures must keep seeded KPI values for visual QA.
    if (typeof window !== 'undefined' && window.location.pathname.includes('/dev/owner-home-preview')) {
      return;
    }

    void refreshLiveTodayKpis(true);

    const handleFocus = () => void refreshLiveTodayKpis(false);
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void refreshLiveTodayKpis(false);
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [data.onboardingComplete, initial, refreshLiveTodayKpis]);

  const displayData: ReadinessData = data.onboardingComplete
    ? {
        ...data,
        todayRevenuePence: liveTodayKpis.todayRevenuePence,
        todayTransactionCount: liveTodayKpis.todayTransactionCount,
      }
    : data;

  const handleGenerateDemo = async () => {
    setIsBusy(true);
    try {
      const res = await generateDemoDay();
      if (res.ok && res.salesCount > 0) {
        showToast(`${res.salesCount} sample sales added for practice`, 'success');
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
        showToast(res.removed.length > 0 ? `Cleared: ${res.removed.join(', ')}` : 'Sample data removed', 'success');
      } else if (res.error) {
        showToast(res.error, 'error');
      }
      router.refresh();
    } finally {
      setIsBusy(false);
    }
  };

  const handleStartSelling = () => {
    // Phase 1: navigate only — does not set onboardingCompletedAt.
    router.push('/pos');
  };

  const allDone = data.onboardingComplete;
  const upNext = data.upNext;
  const readyToSell = data.journey?.status === 'READY_TO_SELL';

  if (allDone) {
    return (
      <>
        <CelebrationOverlay show={showCelebration} />
        <WelcomeDashboard
          data={displayData}
          onGenerateDemo={handleGenerateDemo}
          onWipeDemo={handleWipeDemo}
          isBusy={isBusy}
        />
      </>
    );
  }

  // Ready to sell: one primary CTA + compact progress (no duplicated Start selling).
  if (readyToSell) {
    const stages = data.stages ?? [];
    return (
      <div className="min-h-screen bg-gradient-to-br from-accentSoft via-white to-paper">
        <div className="mx-auto max-w-xl px-4 py-8 pb-[calc(var(--mobile-bottom-nav-clearance)+1rem)] sm:py-10">
          <div className="mb-6 text-center">
            <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Ready to sell</p>
            <h1 className="mt-1 text-2xl font-bold text-ink">Ready to sell</h1>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
              Your business is ready. Make your first successful sale to finish onboarding.
            </p>
          </div>

          <button
            type="button"
            onClick={handleStartSelling}
            className="btn-primary w-full py-3.5 text-base shadow-lg shadow-accent/20"
          >
            Start selling
          </button>
          <p className="mt-3 text-center text-[11px] leading-snug text-black/65">
            Opening the POS does not finish onboarding. Your first successful sale does.
          </p>

          <div className="mt-8 space-y-2">
            <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-black/35">Your path</p>
            {stages.map((stage) => {
              if (stage.key === 'selling') {
                return (
                  <div
                    key={stage.key}
                    id={stage.key}
                    className="flex items-center gap-3 rounded-xl border border-accent/20 bg-white px-3 py-2.5 shadow-sm"
                  >
                    <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-accent/10 text-[11px] font-bold text-accent">
                      4
                    </span>
                    <p className="min-w-0 flex-1 text-sm font-medium text-ink">Make your first sale</p>
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-accent">
                      Up next
                    </span>
                  </div>
                );
              }

              if (stage.key === 'business') {
                return (
                  <div
                    key={stage.key}
                    id={stage.key}
                    className="rounded-xl border border-black/5 bg-white/80 px-3 py-2.5"
                  >
                    <div className="mb-1.5 flex items-center gap-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <CheckIcon />
                      </span>
                      <p className="flex-1 text-sm font-medium text-ink/70">{stage.title}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Done
                      </span>
                    </div>
                    <div className="pl-9">
                      <BusinessProfileEditor
                        compact
                        businessName={data.businessName}
                        businessCategory={data.businessCategory}
                        businessCategoryLabel={data.businessCategoryLabel}
                        onSaved={() => router.refresh()}
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={stage.key}
                  className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/80 px-3 py-2.5"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckIcon />
                  </span>
                  <p className="min-w-0 flex-1 text-sm font-medium text-ink/70">{stage.title}</p>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Done
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-accentSoft via-white to-paper">
      <div className="mx-auto max-w-xl px-4 py-8 pb-[calc(var(--mobile-bottom-nav-clearance)+1rem)] sm:py-10">
        <div className="mb-5 text-center">
          <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Setup</p>
          <h1 className="mt-1 text-2xl font-bold text-ink">{data.activationStatusLabel}</h1>
          <p className="mx-auto mt-1.5 max-w-sm text-sm text-muted">
            {data.stuckMessage ?? data.ownerMessage}
          </p>
        </div>

        {upNext ? (
          <div className="mb-5 rounded-2xl border-2 border-accent/25 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-accent">Up next</p>
            <h2 className="mt-1 text-lg font-bold text-ink">{upNext.title}</h2>
            <p className="mt-1 text-sm text-muted">{upNext.explanation}</p>
            {upNext.href.startsWith('/onboarding#') ? (
              <a href={upNext.href} className="btn-primary mt-3 block w-full py-2.5 text-center text-sm">
                Continue
              </a>
            ) : (
              <Link href={upNext.href} className="btn-primary mt-3 block w-full py-2.5 text-center text-sm">
                Continue
              </Link>
            )}
          </div>
        ) : null}

        <div className="mb-5 space-y-2">
          <p className="px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-black/35">Your path</p>
          {(data.stages ?? []).map((stage, index) => {
            const isCurrent = !stage.done && data.stages.slice(0, index).every((s) => s.done);
            if (stage.done && !isCurrent) {
              if (stage.key === 'business') {
                return (
                  <div
                    key={stage.key}
                    id={stage.key}
                    className="scroll-mt-[calc(var(--app-header-offset,4rem)+0.75rem)] scroll-mb-[var(--mobile-bottom-nav-clearance)] rounded-xl border border-black/5 bg-white/80 px-3 py-2.5"
                  >
                    <div className="mb-1.5 flex items-center gap-3">
                      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                        <CheckIcon />
                      </span>
                      <p className="flex-1 text-sm font-medium text-ink/70">{stage.title}</p>
                      <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                        Done
                      </span>
                    </div>
                    <div className="pl-9">
                      <BusinessProfileEditor
                        compact
                        businessName={data.businessName}
                        businessCategory={data.businessCategory}
                        businessCategoryLabel={data.businessCategoryLabel}
                        onSaved={() => router.refresh()}
                      />
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={stage.key}
                  className="flex items-center gap-3 rounded-xl border border-black/5 bg-white/80 px-3 py-2.5"
                >
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                    <CheckIcon />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-ink/70">{stage.title}</p>
                  </div>
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                    Done
                  </span>
                </div>
              );
            }

            return (
              <div
                key={stage.key}
                id={stage.key}
                className={`scroll-mt-[calc(var(--app-header-offset,4rem)+0.75rem)] scroll-mb-[var(--mobile-bottom-nav-clearance)] rounded-2xl border px-4 py-3 ${
                  isCurrent ? 'border-accent/30 bg-white shadow-sm' : 'border-black/8 bg-white/70'
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-black/5 text-[11px] font-bold text-ink">
                    {index + 1}
                  </span>
                  <h3 className="text-sm font-bold text-ink">{stage.title}</h3>
                </div>
                <p className="mt-1 text-xs text-muted">{stage.explanation}</p>

                {stage.key === 'business' ? (
                  <div className="mt-3">
                    <BusinessProfileEditor
                      businessName={data.businessName}
                      businessCategory={data.businessCategory}
                      businessCategoryLabel={data.businessCategoryLabel}
                      onSaved={() => router.refresh()}
                    />
                  </div>
                ) : null}

                {stage.key === 'products' && isCurrent ? (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <Link href="/products/new" className="btn-primary py-2.5 text-center text-sm">
                      Add a product manually
                    </Link>
                    <Link
                      href="/settings/import-stock"
                      className="btn-ghost border border-black/10 py-2.5 text-center text-sm"
                    >
                      Import products
                    </Link>
                    <p className="text-[11px] text-muted sm:col-span-2">
                      Use Catalogue for product lists without stock. Use Opening Stock when you already have
                      quantities and costs. Purchases mode is not part of setup.
                    </p>
                  </div>
                ) : null}

                {stage.key === 'stock' && isCurrent ? (
                  <div className="mt-3 space-y-2">
                    {data.journey?.zeroStockBlockMessage ? (
                      <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
                        {data.journey.zeroStockBlockMessage}
                      </p>
                    ) : null}
                    {data.journey?.stockDeferredMessage ? (
                      <p className="rounded-xl border border-black/8 bg-black/[0.02] px-3 py-2 text-xs text-muted">
                        {data.journey.stockDeferredMessage}
                      </p>
                    ) : null}
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Link
                        href="/settings/import-stock"
                        className="btn-ghost border border-black/10 py-2.5 text-center text-sm"
                      >
                        Import opening stock
                      </Link>
                      <Link
                        href="/setup/opening-stock"
                        className="btn-ghost border border-black/10 py-2.5 text-center text-sm"
                      >
                        Add stock to products
                      </Link>
                    </div>
                    <p className="rounded-xl border border-dashed border-black/12 px-3 py-2 text-center text-xs text-muted">
                      Complete the rest later — a full stock count is not required before your first sale.
                    </p>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
