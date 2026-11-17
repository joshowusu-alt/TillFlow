'use client';

import { useLayoutEffect, useState } from 'react';
import TodayScreen from '@/components/reports/today/TodayScreen';
import { HubHead } from '@/components/reports/presentation/HubHead';
import { ProposedToday } from '@/components/reports/presentation/ProposedToday';
import { ReportDirectory } from '@/components/reports/presentation/ReportDirectory';
import { ReportsCanvas } from '@/components/reports/presentation/canvas';
import { todayNextActions, type TodaySnapshot } from '@/lib/reports/today/model';
import {
  reviewLinks,
  reviewScopeLabel,
  reviewSnapshot,
  type ReviewPlan,
  type ReviewRole,
} from '@/lib/reports/today/review-samples';
import type { Stage3aSection } from '@/lib/reports/today/stage3a-nav';
import {
  CustomerScreen,
  ShellBottomNav,
  stayOnReview,
} from '@/app/reviews/reports-presentation/CustomerScreen';
import { ExistingHomePanel } from '@/app/reviews/reports-presentation/ExistingHomePanel';
import { formatGeometry, measureCustomerScreens } from '@/app/reviews/reports-presentation/geometry';

const DATE = 'Wednesday 30 September 2026 · Local time';
const UPDATED = '14:10';

type Screen =
  | 'today-healthy'
  | 'today-attention'
  | 'today-empty'
  | 'today-long'
  | 'activity'
  | 'more'
  | 'home';

type View = 'current' | 'proposed' | 'both';

const LONG_SALES = 9_876_543_210;

export default function Stage3a1Review() {
  const [screen, setScreen] = useState<Screen>('today-healthy');
  const [plan, setPlan] = useState<ReviewPlan>('GROWTH');
  const [role, setRole] = useState<ReviewRole>('OWNER');
  const [consolidated, setConsolidated] = useState(false);
  const [banner, setBanner] = useState(false);
  const [view, setView] = useState<View>('proposed');
  const [controlsOpen, setControlsOpen] = useState(true);
  const [geometry, setGeometry] = useState('');

  const growthDenied = consolidated && plan !== 'PRO';
  const scopeLabel = growthDenied ? '' : reviewScopeLabel(plan, consolidated && plan === 'PRO');
  const section: Stage3aSection = screen === 'activity' ? 'activity' : screen === 'more' ? 'more' : 'today';
  const { links, explore } = reviewLinks({ section, plan, role, analyticsVisible: true });
  const snapshot = growthDenied ? null : presentSnapshot(screen, plan, consolidated && plan === 'PRO');
  const storeId = consolidated && plan === 'PRO' ? 'ALL' : 'sample-branch';
  const nextActions = todayNextActions({ role, readOnly: false });

  useLayoutEffect(() => {
    const publish = () => setGeometry(formatGeometry(measureCustomerScreens()));
    publish();
    window.addEventListener('resize', publish);
    return () => window.removeEventListener('resize', publish);
  }, [screen, plan, role, consolidated, banner, view, controlsOpen]);

  const showCurrent = view !== 'proposed';
  const showProposed = view !== 'current';

  return (
    <div className="min-h-screen bg-slate-100">
      {controlsOpen ? (
        <div data-review-controls="" className="border-b border-amber-300 bg-amber-50">
          <div className="flex items-start justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-amber-950">Review controls — not part of the customer screen</p>
              <p className="mt-1 max-w-[65ch] text-sm text-amber-950">
                Sample data only. Nothing here reads or changes a real business. Layout follows the browser width.
              </p>
            </div>
            <button type="button" className="min-h-11 shrink-0 rounded-lg border border-amber-300 bg-white px-3 text-sm font-semibold" onClick={() => setControlsOpen(false)}>
              Hide controls
            </button>
          </div>
          <form className="grid grid-cols-2 gap-2 px-4 pb-3 sm:grid-cols-3 lg:grid-cols-6" aria-label="Review controls" onSubmit={(event) => event.preventDefault()}>
            <Field label="Screen" value={screen} onChange={(value) => setScreen(value as Screen)} options={['today-healthy', 'today-attention', 'today-empty', 'today-long', 'activity', 'more', 'home']} />
            <Field label="View" value={view} onChange={(value) => setView(value as View)} options={['current', 'proposed', 'both']} />
            <Field label="Plan" value={plan} onChange={(value) => setPlan(value as ReviewPlan)} options={['STARTER', 'GROWTH', 'PRO']} />
            <Field label="Role" value={role} onChange={(value) => setRole(value as ReviewRole)} options={['OWNER', 'MANAGER']} />
            <Field label="Scope" value={consolidated ? 'consolidated' : 'branch'} onChange={(value) => setConsolidated(value === 'consolidated')} options={['branch', 'consolidated']} />
            <Field label="Banner" value={banner ? 'compact' : 'none'} onChange={(value) => setBanner(value === 'compact')} options={['none', 'compact']} />
          </form>
          <pre data-geometry="" className="max-w-full whitespace-pre-wrap px-4 pb-3 text-xs leading-5 text-amber-950">{geometry}</pre>
        </div>
      ) : (
        <div data-review-controls="" className="border-b border-amber-300 bg-amber-50 px-4 py-2">
          <button type="button" className="min-h-11 text-sm font-semibold text-amber-950" onClick={() => setControlsOpen(true)}>
            Show review controls — not part of the customer screen
          </button>
        </div>
      )}

      {screen === 'home' && showCurrent ? (
        <CustomerScreen label="current-home" banner={banner}>
          <ExistingHomePanel />
        </CustomerScreen>
      ) : null}

      {screen !== 'home' && showCurrent ? (
        <CustomerScreen label={`current-${screen}`} banner={banner}>
          <TodayScreen
            section={section}
            scopeLabel={scopeLabel}
            dateLabel={DATE}
            zoneName="GMT"
            updatedLabel={UPDATED}
            readOnly={false}
            currency="GHS"
            storeId={storeId}
            links={links}
            exploreLinks={explore}
            nextActions={nextActions}
            salesHref="/reports/dashboard"
            moneyHref="/reports/money-received"
            cashHref="/reports/cash-drawer"
            snapshot={snapshot}
            blocked={growthDenied ? blockedCopy() : null}
            failed={false}
          />
        </CustomerScreen>
      ) : null}

      {showProposed && screen === 'home' ? (
        <CustomerScreen label="proposed-today" banner={banner}>
          <ProposedToday
            scopeLabel={reviewScopeLabel('GROWTH', false)}
            dateLabel={DATE}
            zoneName="GMT"
            updatedLabel={UPDATED}
            currency="GHS"
            storeId="sample-branch"
            salesHref="/reports/dashboard"
            moneyHref="/reports/money-received"
            snapshot={reviewSnapshot('healthy', 'GROWTH', false) as TodaySnapshot}
            exploreLinks={reviewLinks({ section: 'today', plan: 'GROWTH', role: 'OWNER', analyticsVisible: true }).explore}
            nextActions={todayNextActions({ role: 'OWNER', readOnly: false })}
            readOnly={false}
            onStay={stayOnReview}
          />
        </CustomerScreen>
      ) : null}

      {showProposed && screen !== 'home' && (section === 'activity' || section === 'more') ? (
        <CustomerScreen label={`proposed-${screen}`} banner={banner}>
          <ReportsCanvas>
            <HubHead
              title={section === 'activity' ? 'Activity' : 'More reports'}
              section={section}
              storeId={storeId}
              scopeLabel={scopeLabel}
              onStay={stayOnReview}
            />
            {growthDenied ? <Blocked /> : <ReportDirectory links={links} onStay={stayOnReview} />}
          </ReportsCanvas>
        </CustomerScreen>
      ) : null}

      {showProposed && screen !== 'home' && section === 'today' ? (
        <CustomerScreen label={`proposed-${screen}`} banner={banner}>
          {growthDenied || !snapshot ? (
            <ReportsCanvas>
              <HubHead title="Today" section="today" storeId={storeId} scopeLabel={scopeLabel} onStay={stayOnReview} />
              <Blocked />
            </ReportsCanvas>
          ) : (
            <ProposedToday
              scopeLabel={scopeLabel}
              dateLabel={DATE}
              zoneName="GMT"
              updatedLabel={UPDATED}
              currency="GHS"
              storeId={storeId}
              salesHref="/reports/dashboard"
              moneyHref="/reports/money-received"
              snapshot={snapshot}
              exploreLinks={explore}
              nextActions={nextActions}
              readOnly={false}
              onStay={stayOnReview}
            />
          )}
        </CustomerScreen>
      ) : null}

      <ShellBottomNav />
    </div>
  );
}

function presentSnapshot(screen: Screen, plan: ReviewPlan, consolidated: boolean): TodaySnapshot | null {
  if (screen === 'today-empty') return reviewSnapshot('empty', plan, consolidated);
  if (screen === 'today-attention') {
    const base = reviewSnapshot('attention', plan, consolidated);
    if (!base) return null;
    return { ...base, cashDifferencePence: -500 };
  }
  const healthy = reviewSnapshot('healthy', plan, consolidated);
  if (!healthy) return null;
  if (screen !== 'today-long') return healthy;
  return {
    ...healthy,
    salesTodayPence: LONG_SALES,
    yesterdayPence: 1_234_567_890,
    moneyReceivedPence: LONG_SALES,
    cashDifferencePence: -LONG_SALES,
    methods: [
      { method: 'CASH', label: 'Cash', amountPence: 7_000_000_000 },
      { method: 'MOBILE_MONEY', label: 'Mobile Money', amountPence: 2_876_543_210 },
    ],
  };
}

function blockedCopy() {
  return {
    title: 'All branches is part of Pro',
    body: 'This plan reports on one branch. No combined total is shown.',
    href: '/reports',
    action: 'View this branch',
  };
}

function Blocked() {
  const copy = blockedCopy();
  return (
    <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-card" role="status">
      <h2 className="font-display text-xl font-semibold text-ink">{copy.title}</h2>
      <p className="mt-2 max-w-[65ch] text-sm text-muted">{copy.body}</p>
    </div>
  );
}

function Field({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
}) {
  const id = `stage3a1-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label className="block min-w-0 text-xs font-semibold text-amber-950" htmlFor={id}>
      {label}
      <select
        id={id}
        className="mt-1 w-full min-w-0 rounded-lg border border-amber-200 bg-white px-2 py-2 text-sm text-ink"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
