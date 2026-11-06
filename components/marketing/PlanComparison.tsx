import { getFeatures } from '@/lib/features';
const plans = ['STARTER', 'GROWTH', 'PRO'] as const;
const features = plans.map(p => getFeatures(p, p === 'PRO' ? 'MULTI_STORE' : 'SINGLE_STORE'));
const rows = [
  { label: 'POS, products, inventory and receipts', values: plans.map(() => 'Included') },
  { label: 'Offline selling', values: plans.map(() => 'Included') },
  { label: 'Financial and advanced reports', values: features.map(f => f.financialReports ? 'Included' : 'Upgrade to Growth') },
  { label: 'Audit log and cashflow forecast', values: features.map(f => f.auditLog && f.cashflowForecast ? 'Included' : 'Upgrade to Pro') },
  { label: 'Multi-branch operations', values: features.map(f => f.multiStore ? 'Included' : 'Single store') },
  { label: 'Online storefront', values: ['Not included', '+GH₵200/month', 'Included'] },
];
export default function PlanComparison() {
  return <details className="mt-5 rounded-2xl border border-slate-200 bg-white p-4 sm:p-6">
    <summary className="min-h-11 cursor-pointer text-base font-bold text-ink">Compare what’s included</summary>
    <div tabIndex={0} role="region" aria-label="Plan comparison table" className="mt-3 overflow-x-auto rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"><table className="w-full min-w-[560px] text-left text-sm">
      <caption className="sr-only">TillFlow plan capabilities</caption>
      <thead><tr><th scope="col" className="p-3">Capability</th>{plans.map(p => <th scope="col" key={p} className="p-3 capitalize">{p.toLowerCase()}</th>)}</tr></thead>
      <tbody>{rows.map(row => <tr key={row.label} className="border-t border-slate-100"><th scope="row" className="p-3 font-medium">{row.label}</th>{row.values.map((v,i) => <td key={plans[i]} className="p-3 text-slate-600">{v}</td>)}</tr>)}</tbody>
    </table></div>
    <p className="mt-3 text-sm leading-6 text-slate-600">Need stock conversion, supplier workflows, cash closing, or a particular staff and device setup? Ask us to demonstrate your workflow and confirm the plan before subscribing.</p>
  </details>;
}
