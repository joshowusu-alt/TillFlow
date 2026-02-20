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
  const time = new Date(brief.generatedAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

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

  // ── Derived values for HTML view ─────────────────────────────────────────
  const grade = brief.healthScore.grade;
  const score = brief.healthScore.score;
  const scoreColour = grade === 'GREEN' ? '#059669' : grade === 'AMBER' ? '#D97706' : '#DC2626';
  const gradeLabelMap: Record<string, string> = { GREEN: 'Healthy', AMBER: 'Needs Attention', RED: 'Critical' };
  const gradeLabel = gradeLabelMap[grade] ?? grade;
  const scoreBg = grade === 'GREEN' ? '#ECFDF5' : grade === 'AMBER' ? '#FFFBEB' : '#FEF2F2';

  const r = 40;
  const c = 2 * Math.PI * r;
  const offset = c - (Math.min(score, 100) / 100) * c;

  const sevColour = (s: string) =>
    s === 'critical' ? '#DC2626' : s === 'warn' ? '#D97706' : '#1E40AF';
  const sevBg = (s: string) =>
    s === 'critical' ? '#FEF2F2' : s === 'warn' ? '#FFFBEB' : '#EFF6FF';
  const sevBorder = (s: string) =>
    s === 'critical' ? '#FECACA' : s === 'warn' ? '#FDE68A' : '#BFDBFE';

  const m = (pence: number) => formatMoney(pence / 100, brief.currency);
  const forecastNeg = brief.moneyPulse.forecastLowestPence < 0;

  // HTML print view
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Owner Brief — ${business.name} — ${date}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --brand:#1D4ED8;--brand-dark:#1E3A8A;--brand-light:#EFF6FF;
      --ink:#111827;--muted:#6B7280;--border:#E5E7EB;--surface:#F9FAFB;
      --success:#059669;--warn:#D97706;--danger:#DC2626;
      --radius:12px;
    }
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;background:#F3F4F6;color:var(--ink);min-height:100vh}
    a{color:inherit;text-decoration:none}

    /* ── Back bar ───────────────────────── */
    .back-bar{background:var(--brand-dark);padding:0.6rem 1.5rem;display:flex;align-items:center;justify-content:space-between;gap:1rem;position:sticky;top:0;z-index:50}
    .back-btn{display:inline-flex;align-items:center;gap:0.4rem;color:#fff;font-size:0.8rem;font-weight:600;background:rgba(255,255,255,0.15);border:1px solid rgba(255,255,255,0.25);border-radius:6px;padding:0.35rem 0.75rem;cursor:pointer;text-decoration:none;transition:background .15s}
    .back-btn:hover{background:rgba(255,255,255,0.25)}
    .back-bar-title{color:rgba(255,255,255,0.7);font-size:0.75rem}
    .print-btn{display:inline-flex;align-items:center;gap:0.4rem;background:#fff;color:var(--brand-dark);font-size:0.8rem;font-weight:600;border:none;border-radius:6px;padding:0.35rem 0.875rem;cursor:pointer}
    @media print{.back-bar,.no-print{display:none!important}}

    /* ── Hero ───────────────────────────── */
    .hero{background:linear-gradient(135deg,var(--brand-dark) 0%,#2563EB 100%);color:#fff;padding:2rem 1.5rem 1.5rem}
    .hero-inner{max-width:900px;margin:0 auto;display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:1.5rem}
    .hero-text h1{font-size:1.5rem;font-weight:800;letter-spacing:-0.02em}
    .hero-text .biz{font-size:1rem;font-weight:600;opacity:.85;margin-top:0.2rem}
    .hero-text .meta{font-size:0.75rem;opacity:.65;margin-top:0.35rem}
    .score-wrap{display:flex;flex-direction:column;align-items:center;text-align:center;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);border-radius:${r_css(r)}px;padding:1.25rem 1.5rem}
    .score-ring{position:relative;width:100px;height:100px}
    .score-ring svg{width:100%;height:100%;transform:rotate(-90deg)}
    .score-num{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center}
    .score-num .n{font-size:1.75rem;font-weight:800;line-height:1;color:#fff}
    .score-num .d{font-size:0.65rem;opacity:.7;color:#fff}
    .score-grade{font-size:0.8rem;font-weight:700;margin-top:0.5rem;padding:0.2rem 0.75rem;border-radius:99px;background:${scoreBg};color:${scoreColour}}
    .score-label{font-size:0.7rem;opacity:.7;margin-top:0.25rem;color:#fff}

    /* ── Page body ──────────────────────── */
    .page{max-width:900px;margin:0 auto;padding:1.5rem}
    .grid2{display:grid;grid-template-columns:repeat(2,1fr);gap:1rem}
    .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:0.75rem}
    @media(max-width:640px){.grid2,.grid4{grid-template-columns:1fr}}

    /* ── Cards ──────────────────────────── */
    .card{background:#fff;border:1px solid var(--border);border-radius:var(--radius);overflow:hidden}
    .card-head{padding:0.875rem 1rem 0;font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
    .card-body{padding:0.75rem 1rem 1rem}

    /* ── Stat tiles ─────────────────────── */
    .stat-tile{background:#fff;border:1px solid var(--border);border-radius:var(--radius);padding:1rem;display:flex;flex-direction:column;gap:0.25rem}
    .stat-label{font-size:0.7rem;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--muted)}
    .stat-value{font-size:1.25rem;font-weight:800;tabular-nums;letter-spacing:-0.02em}
    .stat-sub{font-size:0.7rem;color:var(--muted);margin-top:0.1rem}

    /* ── Row ────────────────────────────── */
    .data-row{display:flex;justify-content:space-between;align-items:center;padding:0.45rem 0;border-bottom:1px solid var(--border);font-size:0.85rem}
    .data-row:last-child{border-bottom:none}
    .data-row .lbl{color:var(--muted)}
    .data-row .val{font-weight:700;tabular-nums}

    /* ── Alert action cards ─────────────── */
    .action-card{border-radius:10px;padding:0.875rem 1rem;margin-bottom:0.625rem;border:1.5px solid}
    .action-header{display:flex;align-items:flex-start;justify-content:space-between;gap:0.75rem;margin-bottom:0.4rem}
    .action-title{font-size:0.875rem;font-weight:700}
    .severity-badge{font-size:0.65rem;font-weight:800;text-transform:uppercase;letter-spacing:.07em;padding:0.2rem 0.6rem;border-radius:99px;white-space:nowrap;flex-shrink:0}
    .action-why{font-size:0.78rem;color:var(--muted);margin-bottom:0.4rem;line-height:1.4}
    .action-rec{font-size:0.78rem;font-weight:600;line-height:1.4}

    /* ── Driver chips ───────────────────── */
    .chips{display:flex;flex-wrap:wrap;gap:0.4rem;margin-top:0.75rem}
    .chip{font-size:0.72rem;color:var(--muted);background:var(--surface);border:1px solid var(--border);border-radius:99px;padding:0.2rem 0.6rem}

    /* ── Section title ──────────────────── */
    .section-title{font-size:0.95rem;font-weight:700;color:var(--ink);margin-bottom:0.875rem;display:flex;align-items:center;gap:0.5rem}
    .section-title .badge{background:var(--brand-light);color:var(--brand);border-radius:99px;padding:0.1rem 0.55rem;font-size:0.7rem;font-weight:700}

    /* ── Footer ─────────────────────────── */
    .footer{text-align:center;padding:2rem 1rem;font-size:0.75rem;color:var(--muted);border-top:1px solid var(--border);margin-top:1.5rem}
    .footer strong{color:var(--ink)}

    /* ── Colours ────────────────────────── */
    .c-success{color:var(--success)}
    .c-warn{color:var(--warn)}
    .c-danger{color:var(--danger)}
    .c-brand{color:var(--brand)}
    .alert-banner{background:#FEF2F2;border:1px solid #FECACA;border-radius:8px;padding:0.6rem 0.875rem;font-size:0.78rem;color:#991B1B;margin-bottom:0.75rem}
    .ok-banner{background:#ECFDF5;border:1px solid #A7F3D0;border-radius:8px;padding:0.6rem 0.875rem;font-size:0.78rem;color:#065F46;margin-bottom:0.75rem}
    .space1{margin-bottom:1rem}
    .space15{margin-bottom:1.5rem}
  </style>
</head>
<body>

<!-- Back bar (hidden on print) -->
<div class="back-bar no-print">
  <a href="/reports/owner" class="back-btn">&#8592; Back to Dashboard</a>
  <span class="back-bar-title">Owner Intelligence Brief · ${business.name}</span>
  <button class="print-btn" onclick="window.print()">&#128438; Print / Save PDF</button>
</div>

<!-- Hero with health score -->
<div class="hero">
  <div class="hero-inner">
    <div class="hero-text">
      <h1>Owner Intelligence Brief</h1>
      <div class="biz">${escHtml(business.name)}</div>
      <div class="meta">Generated ${date} at ${time} &nbsp;·&nbsp; Confidential</div>
      ${brief.healthScore.topDrivers.length > 0 ? `
      <div class="chips">
        ${brief.healthScore.topDrivers.slice(0,3).map((d) => `<span class="chip">${escHtml(d)}</span>`).join('')}
      </div>` : ''}
    </div>
    <div class="score-wrap">
      <div class="score-ring">
        <svg viewBox="0 0 100 100">
          <circle cx="50" cy="50" r="${r}" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="8"/>
          <circle cx="50" cy="50" r="${r}" fill="none" stroke="${scoreColour}" stroke-width="8"
            stroke-linecap="round"
            stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>
        </svg>
        <div class="score-num">
          <span class="n">${score}</span>
          <span class="d">/100</span>
        </div>
      </div>
      <div class="score-grade">${gradeLabel}</div>
      <div class="score-label">Business Health Score</div>
    </div>
  </div>
</div>

<div class="page">

  <!-- Priority Actions -->
  <div class="space15">
    <div class="section-title">
      Priority Actions
      ${brief.priorityActions.length > 0 ? `<span class="badge">${brief.priorityActions.length}</span>` : ''}
    </div>
    ${brief.priorityActions.length === 0
      ? `<div class="ok-banner">&#10003; No priority issues right now — your business metrics are within healthy ranges.</div>`
      : brief.priorityActions.map((a) => `
    <div class="action-card" style="background:${sevBg(a.severity)};border-color:${sevBorder(a.severity)}">
      <div class="action-header">
        <div class="action-title" style="color:${sevColour(a.severity)}">${escHtml(a.title)}</div>
        <div class="severity-badge" style="background:${sevBorder(a.severity)};color:${sevColour(a.severity)}">${a.severity.toUpperCase()}</div>
      </div>
      <div class="action-why">${escHtml(a.why)}</div>
      <div class="action-rec" style="color:${sevColour(a.severity)}">&#8594; ${escHtml(a.recommendation)}</div>
    </div>`).join('')}
  </div>

  <!-- Money Pulse + Leakage / Stock -->
  <div class="grid2 space15">
    <div class="card">
      <div class="card-head">Money Pulse</div>
      <div class="card-body">
        <div class="data-row"><span class="lbl">Cash on hand today</span><span class="val c-success">${m(brief.moneyPulse.cashTodayPence)}</span></div>
        <div class="data-row"><span class="lbl">Receivables due (7 days)</span><span class="val c-brand">${m(brief.moneyPulse.arDue7DaysPence)}</span></div>
        <div class="data-row"><span class="lbl">Payables due (7 days)</span><span class="val c-warn">${m(brief.moneyPulse.apDue7DaysPence)}</span></div>
        <div class="data-row"><span class="lbl">Forecast lowest (14 days)</span><span class="val ${forecastNeg ? 'c-danger' : 'c-success'}">${m(brief.moneyPulse.forecastLowestPence)}</span></div>
        ${brief.moneyPulse.daysUntilNegative !== null
          ? `<div class="alert-banner" style="margin-top:0.75rem;margin-bottom:0">&#9888; Cash projected negative in <strong>${brief.moneyPulse.daysUntilNegative} day${brief.moneyPulse.daysUntilNegative !== 1 ? 's' : ''}</strong></div>`
          : `<div class="ok-banner" style="margin-top:0.75rem;margin-bottom:0">&#10003; Cash stays positive for 14 days</div>`}
      </div>
    </div>
    <div>
      <div class="card space1">
        <div class="card-head">Leakage Watch</div>
        <div class="card-body">
          <div class="data-row"><span class="lbl">Discount overrides (7 days)</span><span class="val ${brief.leakageWatch.discountOverrideCount > 10 ? 'c-danger' : ''}">${brief.leakageWatch.discountOverrideCount}</span></div>
          <div class="data-row"><span class="lbl">Items selling below cost</span><span class="val ${brief.leakageWatch.negativeMarginProductCount > 0 ? 'c-danger' : 'c-success'}">${brief.leakageWatch.negativeMarginProductCount}</span></div>
          <div class="data-row"><span class="lbl">Cash variance (7 days)</span><span class="val ${brief.leakageWatch.cashVariancePence / 100 > 20 ? 'c-danger' : ''}">${m(brief.leakageWatch.cashVariancePence)}</span></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head">Stock Risk</div>
        <div class="card-body">
          <div class="data-row"><span class="lbl">Products near stockout</span><span class="val ${brief.stockRisk.stockoutImminentCount > 0 ? 'c-warn' : 'c-success'}">${brief.stockRisk.stockoutImminentCount}</span></div>
          <div class="data-row"><span class="lbl">Urgent reorder needed</span><span class="val ${brief.stockRisk.urgentReorderCount > 3 ? 'c-danger' : brief.stockRisk.urgentReorderCount > 0 ? 'c-warn' : 'c-success'}">${brief.stockRisk.urgentReorderCount}</span></div>
        </div>
      </div>
    </div>
  </div>

  <div class="footer">
    <strong>TillFlow — Owner Intelligence Brief</strong><br/>
    ${escHtml(business.name)} · Generated ${date} at ${time}<br/>
    This document is confidential. Produced automatically by TillFlow.
  </div>

</div>
</body>
</html>`;

  return new NextResponse(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}

function escHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function r_css(r: number): number {
  return r + 4;
}
