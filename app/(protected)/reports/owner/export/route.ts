import { requireBusiness } from '@/lib/auth';
import { getOwnerBrief } from '@/lib/owner-intel';
import { formatMoney } from '@/lib/format';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { business } = await requireBusiness(['OWNER', 'MANAGER']);
  const { searchParams } = new URL(request.url);
  const format = searchParams.get('format') ?? 'csv';

  const brief = await getOwnerBrief(business.id, business.currency);
  const date = new Date(brief.generatedAt).toLocaleDateString('en-GB');

  if (format === 'csv') {
    const rows: string[][] = [
      ['Owner Intelligence Brief', date],
      [],
      ['HEALTH SCORE', brief.healthScore.score.toString(), brief.healthScore.grade],
      ['Top Drivers', ...brief.healthScore.topDrivers],
      [],
      ['MONEY PULSE'],
      ['Cash on hand', formatMoney(brief.moneyPulse.cashTodayPence / 100, brief.currency)],
      ['AR due 7 days', formatMoney(brief.moneyPulse.arDue7DaysPence / 100, brief.currency)],
      ['AP due 7 days', formatMoney(brief.moneyPulse.apDue7DaysPence / 100, brief.currency)],
      ['Forecast lowest (14d)', formatMoney(brief.moneyPulse.forecastLowestPence / 100, brief.currency)],
      ['Days until negative', brief.moneyPulse.daysUntilNegative?.toString() ?? 'N/A'],
      [],
      ['LEAKAGE WATCH'],
      ['Discount overrides (7d)', brief.leakageWatch.discountOverrideCount.toString()],
      ['Items below cost', brief.leakageWatch.negativeMarginProductCount.toString()],
      ['Cash variances (7d)', formatMoney(brief.leakageWatch.cashVariancePence / 100, brief.currency)],
      [],
      ['STOCK RISK'],
      ['Near stockout', brief.stockRisk.stockoutImminentCount.toString()],
      ['Urgent reorder', brief.stockRisk.urgentReorderCount.toString()],
      [],
      ['PRIORITY ACTIONS'],
      ['Severity', 'Title', 'Why', 'Recommendation', 'Link'],
      ...brief.priorityActions.map((a) => [a.severity, a.title, a.why, a.recommendation, a.href]),
    ];

    const csv = rows.map((r) => r.map((c) => `"${(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="owner-brief-${date.replace(/\//g, '-')}.csv"`,
      },
    });
  }

  // HTML print view
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <title>Owner Brief — ${date}</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 800px; margin: 0 auto; padding: 2rem; color: #111827; }
    h1 { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #6B7280; font-size: 0.875rem; margin-bottom: 2rem; }
    h2 { font-size: 1rem; font-weight: 600; border-bottom: 1px solid #E5E7EB; padding-bottom: 0.5rem; margin: 1.5rem 0 0.75rem; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1.5rem; }
    .row { display: flex; justify-content: space-between; padding: 0.25rem 0; font-size: 0.875rem; }
    .label { color: #6B7280; }
    .value { font-weight: 600; }
    .critical { color: #DC2626; }
    .warn { color: #D97706; }
    .info { color: #1E40AF; }
    .action { border: 1px solid #E5E7EB; border-radius: 8px; padding: 0.75rem; margin-bottom: 0.75rem; }
    .action-title { font-weight: 600; font-size: 0.875rem; }
    .action-why { color: #6B7280; font-size: 0.75rem; margin-top: 0.25rem; }
    .action-rec { font-size: 0.75rem; font-weight: 500; margin-top: 0.25rem; }
    @media print { .no-print { display: none; } }
  </style>
</head>
<body>
  <h1>Owner Intelligence Brief</h1>
  <p class="subtitle">Generated ${date} · ${business.name}</p>
  <button class="no-print" onclick="window.print()" style="padding:0.5rem 1rem;background:#1E40AF;color:#fff;border:none;border-radius:6px;cursor:pointer;margin-bottom:1rem;">Print / Save PDF</button>

  <h2>Business Health: ${brief.healthScore.score}/100 — ${brief.healthScore.grade}</h2>
  <ul>${brief.healthScore.topDrivers.map((d) => `<li>${d}</li>`).join('')}</ul>

  <div class="grid">
    <div>
      <h2>Money Pulse</h2>
      <div class="row"><span class="label">Cash on hand</span><span class="value">${formatMoney(brief.moneyPulse.cashTodayPence / 100, brief.currency)}</span></div>
      <div class="row"><span class="label">AR due 7 days</span><span class="value">${formatMoney(brief.moneyPulse.arDue7DaysPence / 100, brief.currency)}</span></div>
      <div class="row"><span class="label">AP due 7 days</span><span class="value">${formatMoney(brief.moneyPulse.apDue7DaysPence / 100, brief.currency)}</span></div>
      <div class="row"><span class="label">Forecast lowest (14d)</span><span class="value ${brief.moneyPulse.forecastLowestPence < 0 ? 'critical' : ''}">${formatMoney(brief.moneyPulse.forecastLowestPence / 100, brief.currency)}</span></div>
    </div>
    <div>
      <h2>Leakage Watch</h2>
      <div class="row"><span class="label">Discount overrides (7d)</span><span class="value">${brief.leakageWatch.discountOverrideCount}</span></div>
      <div class="row"><span class="label">Items below cost</span><span class="value">${brief.leakageWatch.negativeMarginProductCount}</span></div>
      <div class="row"><span class="label">Cash variance (7d)</span><span class="value">${formatMoney(brief.leakageWatch.cashVariancePence / 100, brief.currency)}</span></div>

      <h2>Stock Risk</h2>
      <div class="row"><span class="label">Near stockout</span><span class="value ${brief.stockRisk.stockoutImminentCount > 0 ? 'warn' : ''}">${brief.stockRisk.stockoutImminentCount}</span></div>
      <div class="row"><span class="label">Urgent reorder</span><span class="value ${brief.stockRisk.urgentReorderCount > 3 ? 'critical' : brief.stockRisk.urgentReorderCount > 0 ? 'warn' : ''}">${brief.stockRisk.urgentReorderCount}</span></div>
    </div>
  </div>

  <h2>Priority Actions (${brief.priorityActions.length})</h2>
  ${brief.priorityActions.length === 0 ? '<p>No priority issues today.</p>' : brief.priorityActions.map((a) => `
    <div class="action">
      <div class="action-title ${a.severity}">[${a.severity.toUpperCase()}] ${a.title}</div>
      <div class="action-why">${a.why}</div>
      <div class="action-rec">→ ${a.recommendation}</div>
    </div>
  `).join('')}
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
