import React from 'react';
import { createRoot } from 'react-dom/client';
import '@/app/globals.css';
import { HomeOverviewLayout, HomeFigures, HomeTills, HomeAttentionList, type HomeFigure, type HomeAttentionRow } from '@/components/owner-home/HomeOverviewView';

const scenario = new URLSearchParams(location.search).get('scenario') ?? 'healthy';
const amount = scenario === 'large' ? 'GH₵123,456,789.00' : scenario === 'empty' ? 'GH₵0.00' : 'GH₵1,250.00';
const figures: HomeFigure[] = [
  { label: 'Sales', value: amount, href: '/reports/dashboard?storeId=main' },
  { label: 'Money received', value: scenario === 'empty' ? 'GH₵0.00' : amount, note: scenario === 'empty' ? undefined : 'GH₵35.00 on credit today', href: '/reports/money-received?storeId=main' },
  scenario === 'incomplete' ? { label: 'Profit', value: null, incomplete: true, href: '/reports/income-statement/entries?issues=1' } :
    scenario === 'starter' ? { label: 'Profit', value: null, upgrade: true } :
      { label: 'Profit', value: amount, href: '/reports/income-statement' },
  { label: 'Transactions', value: scenario === 'empty' ? '0' : '12', href: '/reports/dashboard?storeId=main' },
];
const rows: HomeAttentionRow[] = scenario === 'cash' ? [
  { rank: 1, title: 'Till 1 was opened yesterday', detail: 'Close or review the shift', action: 'Review', href: '/reports?storeId=main' },
  { rank: 2, title: 'Cash difference · GH₵100.00', detail: 'Fixture cashier · Main branch', action: 'Review', href: '/shifts/variance/example', storeId: 'main' },
  { rank: 3, title: 'Mobile Money needs confirmation', detail: 'GH₵50.00', action: 'Review', href: '/reports/momo-confirmation' },
  { rank: 4, title: 'Customer payment overdue', detail: 'Review debt', action: 'Review', href: '/reports?storeId=main' },
] : [];
const loading = scenario === 'loading';
const failed = scenario === 'failure';
createRoot(document.getElementById('root')!).render(
  <HomeOverviewLayout businessName="Synthetic Ghana Business" figures={loading ? <p role="status">Loading today’s figures…</p> :
    <HomeFigures scope="Main branch" figures={failed ? figures.map(({ label }) => ({ label, value: null })) : figures} />}
    tills={loading ? <p role="status">Checking tills…</p> : <HomeTills count={scenario === 'empty' ? 0 : scenario === 'multiple' ? 3 : 2} expected={scenario === 'empty' ? null : amount} />}
    attention={loading ? <p role="status">Checking what needs your attention…</p> : <HomeAttentionList rows={failed ? null : rows} reportsHref="/reports?storeId=main" />}
    records={<p className="p-3 text-sm">Review product costs</p>} extras={null} />,
);
