'use client';

import { useState } from 'react';
import TodayScreen from '@/components/reports/today/TodayScreen';
import { todayNextActions } from '@/lib/reports/today/model';
import {
  reviewLinks,
  reviewScopeLabel,
  reviewSnapshot,
  type ReviewPlan,
  type ReviewRole,
  type ReviewScenario,
} from '@/lib/reports/today/review-samples';
import type { Stage3aSection } from '@/lib/reports/today/stage3a-nav';

const WIDTHS = {
  '320': 320,
  '390': 390,
  laptop: 1180,
  large: 1440,
} as const;

type Viewport = keyof typeof WIDTHS;

export default function Stage3aReview() {
  const [viewport, setViewport] = useState<Viewport>('390');
  const [plan, setPlan] = useState<ReviewPlan>('GROWTH');
  const [role, setRole] = useState<ReviewRole>('OWNER');
  const [consolidated, setConsolidated] = useState(false);
  const [scenario, setScenario] = useState<ReviewScenario>('empty');
  const [section, setSection] = useState<Stage3aSection>('today');
  const [analyticsVisible, setAnalyticsVisible] = useState(true);

  const growthDenied = consolidated && plan !== 'PRO';
  const scopeLabel = growthDenied ? '' : reviewScopeLabel(plan, consolidated);
  const { links, explore } = reviewLinks({ section, plan, role, analyticsVisible });
  const readOnly = scenario === 'restricted';
  const snapshot = growthDenied ? null : reviewSnapshot(scenario, plan, consolidated && plan === 'PRO');

  return (
    <div className="min-h-screen bg-slate-100">
      <div className="border-b border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950" role="note">
        <p className="font-semibold">Review controls — not part of the customer screen</p>
        <p className="mt-1">Sample data only. This page does not read or change a real business.</p>
      </div>
      <form
        className="grid gap-3 border-b border-slate-200 bg-white px-4 py-3 sm:grid-cols-2 lg:grid-cols-4"
        aria-label="Review controls"
        onSubmit={(event) => event.preventDefault()}
      >
        <Field label="Width" value={viewport} onChange={(value) => setViewport(value as Viewport)} options={['320', '390', 'laptop', 'large']} />
        <Field label="Plan" value={plan} onChange={(value) => setPlan(value as ReviewPlan)} options={['STARTER', 'GROWTH', 'PRO']} />
        <Field label="Role" value={role} onChange={(value) => setRole(value as ReviewRole)} options={['OWNER', 'MANAGER']} />
        <Field label="Scope" value={consolidated ? 'consolidated' : 'branch'} onChange={(value) => setConsolidated(value === 'consolidated')} options={['branch', 'consolidated']} />
        <Field label="State" value={scenario} onChange={(value) => setScenario(value as ReviewScenario)} options={['empty', 'healthy', 'attention', 'partial', 'missing-cost', 'error', 'restricted', 'cancelled']} />
        <Field label="Section" value={section} onChange={(value) => setSection(value as Stage3aSection)} options={['today', 'activity', 'more']} />
        <Field label="Sales analytics" value={analyticsVisible ? 'visible' : 'replaced'} onChange={(value) => setAnalyticsVisible(value === 'visible')} options={['visible', 'replaced']} />
      </form>
      <div className="overflow-x-auto p-4">
        <div className="mx-auto overflow-x-hidden rounded-2xl border border-slate-300 bg-[#F8FAFC] shadow-card" style={{ width: WIDTHS[viewport] }} data-review-frame={viewport}>
          <div className="border-b border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-500">Sample · {WIDTHS[viewport]}px</div>
          <TodayScreen
            section={section}
            scopeLabel={scopeLabel}
            dateLabel="Wednesday 30 September 2026 · Local time"
            zoneName="GMT"
            updatedLabel="14:10"
            readOnly={readOnly}
            currency="GHS"
            storeId={consolidated && plan === 'PRO' ? 'ALL' : 'sample-branch'}
            links={links}
            exploreLinks={explore}
            nextActions={todayNextActions({ role, readOnly })}
            salesHref="/reports/dashboard"
            snapshot={snapshot}
            blocked={
              growthDenied
                ? {
                  title: 'All branches is part of Pro',
                  body: 'This plan reports on one branch. No combined total is shown.',
                  href: '/reports',
                  action: 'View this branch',
                }
                : scenario === 'cancelled'
                  ? {
                    title: 'Reports are not available',
                    body: 'This account is cancelled. No figures are shown.',
                    href: '/settings/billing',
                    action: 'View billing',
                  }
                  : null
            }
            failed={scenario === 'error'}
          />
        </div>
      </div>
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
  const id = `review-${label.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <label className="block text-xs font-semibold text-slate-600" htmlFor={id}>
      {label}
      <select id={id} className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-2 py-2 text-sm text-ink" value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}
