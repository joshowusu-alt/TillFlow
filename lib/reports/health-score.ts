export type HealthScoreInputs = {
  totalSalesPence: number;
  grossMarginPence: number;
  targetGpPercent: number; // default 20
  cashOnHandPence: number;
  dailyOperatingExpensesPence: number;
  arTotalPence: number;
  arOver90Pence: number;
  totalTrackedProducts: number;
  productsAboveReorderPoint: number;
  openHighAlerts: number;
};

export type HealthDimension = {
  name: string;
  score: number;
  max: number;
  detail: string;
};

export type HealthAction = { label: string; href: string };

export type HealthScoreResult = {
  score: number;
  grade: 'GREEN' | 'AMBER' | 'RED';
  dimensions: HealthDimension[];
  topDrivers: string[];
  actions: HealthAction[];
};

function clamp(val: number, min: number, max: number) {
  return Math.max(min, Math.min(max, val));
}

function linearScore(value: number, low: number, high: number, max: number): number {
  if (value >= high) return max;
  if (value <= low) return 0;
  return Math.round((max * (value - low)) / (high - low));
}

export function calculateHealthScore(inputs: HealthScoreInputs): HealthScoreResult {
  const MAX_PER_DIM = 20;
  const dimensions: HealthDimension[] = [];
  const actions: HealthAction[] = [];

  // 1. Margin Health: GP% vs target
  const gpPercent = inputs.totalSalesPence > 0
    ? (inputs.grossMarginPence / inputs.totalSalesPence) * 100
    : inputs.totalSalesPence === 0 ? inputs.targetGpPercent : 0; // No sales = neutral

  const marginScore = linearScore(gpPercent, 0, inputs.targetGpPercent, MAX_PER_DIM);
  dimensions.push({
    name: 'Margin Health',
    score: marginScore,
    max: MAX_PER_DIM,
    detail: inputs.totalSalesPence > 0
      ? `Gross margin ${gpPercent.toFixed(1)}% vs ${inputs.targetGpPercent}% target`
      : 'No sales data yet',
  });
  if (marginScore < 14) {
    actions.push({ label: 'Review profit margins', href: '/reports/margins' });
  }

  // 2. Cash Position: days of operating expenses covered
  const cashDays = inputs.dailyOperatingExpensesPence > 0
    ? inputs.cashOnHandPence / inputs.dailyOperatingExpensesPence
    : inputs.cashOnHandPence > 0 ? 30 : 15; // No expenses = assume healthy

  const cashScore = linearScore(cashDays, 0, 30, MAX_PER_DIM);
  dimensions.push({
    name: 'Cash Position',
    score: cashScore,
    max: MAX_PER_DIM,
    detail: inputs.dailyOperatingExpensesPence > 0
      ? `${Math.round(cashDays)} days of operating expenses covered`
      : 'No expense data — cash position estimated',
  });
  if (cashScore < 14) {
    actions.push({ label: 'Review cashflow forecast', href: '/reports/cashflow-forecast' });
  }

  // 3. Receivables Quality: % of AR that is current (not 90+ days)
  const arCurrentPercent = inputs.arTotalPence > 0
    ? ((inputs.arTotalPence - inputs.arOver90Pence) / inputs.arTotalPence) * 100
    : 100; // No AR = perfect

  const arScore = linearScore(arCurrentPercent, 50, 90, MAX_PER_DIM);
  dimensions.push({
    name: 'Receivables',
    score: arScore,
    max: MAX_PER_DIM,
    detail: inputs.arTotalPence > 0
      ? `${Math.round(arCurrentPercent)}% of receivables are current`
      : 'No outstanding receivables',
  });
  if (arScore < 14) {
    actions.push({ label: 'Chase overdue debtors', href: '/reports/dashboard' });
  }

  // 4. Inventory Health: % of tracked products above reorder point
  const invHealthPercent = inputs.totalTrackedProducts > 0
    ? (inputs.productsAboveReorderPoint / inputs.totalTrackedProducts) * 100
    : 100; // No tracked products = neutral

  const invScore = linearScore(invHealthPercent, 50, 95, MAX_PER_DIM);
  dimensions.push({
    name: 'Inventory',
    score: invScore,
    max: MAX_PER_DIM,
    detail: inputs.totalTrackedProducts > 0
      ? `${Math.round(invHealthPercent)}% of products above reorder point`
      : 'No reorder points configured',
  });
  if (invScore < 14) {
    actions.push({ label: 'Review reorder suggestions', href: '/reports/reorder-suggestions' });
  }

  // 5. Controls: open high-severity risk alerts
  const controlsScore = inputs.openHighAlerts === 0
    ? MAX_PER_DIM
    : inputs.openHighAlerts >= 5
      ? 0
      : clamp(MAX_PER_DIM - inputs.openHighAlerts * 4, 0, MAX_PER_DIM);

  dimensions.push({
    name: 'Controls',
    score: controlsScore,
    max: MAX_PER_DIM,
    detail: inputs.openHighAlerts === 0
      ? 'No open high-severity alerts'
      : `${inputs.openHighAlerts} open high-severity alert${inputs.openHighAlerts > 1 ? 's' : ''}`,
  });
  if (controlsScore < 14) {
    actions.push({ label: 'Review risk alerts', href: '/reports/risk-monitor' });
  }

  const score = clamp(dimensions.reduce((s, d) => s + d.score, 0), 0, 100);
  const grade: HealthScoreResult['grade'] = score >= 70 ? 'GREEN' : score >= 40 ? 'AMBER' : 'RED';

  // Top 3 drivers = lowest-scoring dimensions
  const topDrivers = [...dimensions]
    .sort((a, b) => (a.score / a.max) - (b.score / b.max))
    .slice(0, 3)
    .map((d) => d.detail);

  return {
    score,
    grade,
    dimensions,
    topDrivers,
    actions: actions.slice(0, 3),
  };
}
