/**
 * Summarise Gate E laboratory JSON into a comparison the decision rules can use.
 */
const fs = require('node:fs');
const path = require('node:path');

const jsonPath = process.argv[2] || path.join(__dirname, '..', 'tmp', 'gate-e', 'gate-e-bench.json');
const report = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));

function pct(from, to) {
  if (from == null || to == null || from === 0) return null;
  return Math.round(((to - from) / from) * 1000) / 10;
}

const KEY_SCENARIOS = [
  'mobile-portrait-throttled|mobile-portrait|cold|/onboarding',
  'mobile-portrait-throttled|mobile-portrait|warm|/onboarding',
  'mobile-portrait-throttled|mobile-portrait|warm|home-to-pos',
  'mobile-portrait-throttled|mobile-portrait|warm|/pos',
  'mobile-portrait-throttled|mobile-portrait|warm|/products',
  'mobile-portrait-throttled|mobile-portrait|warm|/purchases',
  'mobile-portrait-throttled|mobile-portrait|warm|/shifts',
  'mobile-portrait-throttled|mobile-portrait|warm|/reports',
  'mobile-portrait-throttled|mobile-portrait|warm|orientation-change',
  'mobile-portrait-throttled|mobile-portrait|warm|open-pos-click',
  'mobile-landscape-throttled|mobile-landscape|cold|/onboarding',
  'mobile-landscape-throttled|mobile-landscape|warm|/onboarding',
  'mobile-landscape-throttled|mobile-landscape|warm|home-to-pos',
  'mobile-landscape-throttled|mobile-landscape|warm|/pos',
  'desktop-unthrottled|desktop|cold|/onboarding',
  'desktop-unthrottled|desktop|warm|/onboarding',
  'desktop-unthrottled|desktop|warm|home-to-pos',
  'desktop-unthrottled|desktop|warm|/pos',
];

const METRICS = ['usefulShellMs', 'interactiveMs', 'checkoutReadyMs', 'lcpMs', 'cls', 'ttfbMs', 'interactionMs', 'transferredJsBytes', 'hydrationMs'];

const rows = [];
const regressions = [];
for (const scenario of KEY_SCENARIOS) {
  const block = report.table[scenario];
  if (!block) {
    rows.push({ scenario, missing: true });
    continue;
  }
  const prod = block.production;
  const phase1 = block.phase1;
  const final = block.final;
  const entry = { scenario, production: {}, phase1: {}, final: {}, vsProd: {}, vsPhase1: {} };
  for (const metric of METRICS) {
    const p = prod?.metrics?.[metric];
    const a = phase1?.metrics?.[metric];
    const f = final?.metrics?.[metric];
    entry.production[metric] = p || null;
    entry.phase1[metric] = a || null;
    entry.final[metric] = f || null;
    entry.vsProd[metric] = pct(p?.median, f?.median);
    entry.vsPhase1[metric] = pct(a?.median, f?.median);
    if (['usefulShellMs', 'interactiveMs', 'checkoutReadyMs', 'lcpMs', 'interactionMs', 'transferredJsBytes'].includes(metric)) {
      const delta = entry.vsProd[metric];
      const p75delta = pct(p?.p75, f?.p75);
      if (delta != null && delta > 10 && (p75delta == null || p75delta > 5)) {
        regressions.push({ scenario, metric, medianPct: delta, p75Pct: p75delta, prodMedian: p?.median, finalMedian: f?.median, prodN: p?.n, finalN: f?.n });
      }
    }
    if (metric === 'cls' && f?.median != null && f.median > 0.1) {
      regressions.push({ scenario, metric: 'cls-budget', median: f.median });
    }
    if (metric === 'lcpMs' && scenario.includes('mobile-portrait') && scenario.includes('cold') && f?.median != null && f.median > 2500) {
      regressions.push({ scenario, metric: 'lcp-budget', median: f.median });
    }
  }
  rows.push(entry);
}

const dualNav = {};
for (const [scenario, block] of Object.entries(report.table)) {
  if (!scenario.includes('/onboarding')) continue;
  dualNav[scenario] = {
    production: block.production?.dualNavLinks,
    phase1: block.phase1?.dualNavLinks,
    final: block.final?.dualNavLinks,
    productionBytes: block.production?.dualNavBytes,
    finalBytes: block.final?.dualNavBytes,
  };
}

const out = {
  meta: report.meta,
  proofs: report.proofs,
  coldWarmProof: report.coldWarmProof,
  scenarioCount: Object.keys(report.table).length,
  measuredRows: report.raw?.length,
  regressions,
  dualNav,
  rows,
};
const outPath = path.join(path.dirname(jsonPath), 'gate-e-summary.json');
fs.writeFileSync(outPath, JSON.stringify(out, null, 2));
console.log(JSON.stringify({ outPath, regressions, coldWarm: report.coldWarmProof, measuredRows: report.raw?.length, scenarios: Object.keys(report.table).length }, null, 2));
