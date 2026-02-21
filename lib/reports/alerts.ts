export type BusinessAlert = {
  id: string;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  title: string;
  explanation: string;
  cta: { label: string; href: string };
};

export type AlertInputs = {
  gpPercent: number;
  totalSalesPence: number;
  arTotalPence: number;
  arOver60Pence: number;
  arOver90Pence: number;
  urgentReorderCount: number;
  cashVarianceTotalPence: number;
  cashVarianceThresholdPence: number;
  thisWeekExpensesPence: number;
  fourWeekAvgExpensesPence: number;
  forecastNegativeWithin14Days: boolean;
  lowestProjectedBalancePence: number;
  negativeMarginProductCount: number;
  momoPendingCount: number;
  momoPendingThreshold: number;
  stockoutImminentCount: number; // products with <= 2 days cover
  discountOverrideCount: number;
  discountOverrideThreshold: number;
};

type AlertRule = {
  id: string;
  evaluate: (inputs: AlertInputs) => BusinessAlert | null;
};

const rules: AlertRule[] = [
  {
    id: 'MARGIN_FALLING',
    evaluate: (inputs) => {
      if (inputs.totalSalesPence === 0) return null;
      if (inputs.gpPercent >= 15) return null;
      return {
        id: 'MARGIN_FALLING',
        severity: 'HIGH',
        title: 'Gross margin below 15%',
        explanation: `Your gross margin is ${inputs.gpPercent.toFixed(1)}%, which is below the 15% safety threshold. This could indicate pricing issues or rising costs.`,
        cta: { label: 'Review margins', href: '/reports/margins' },
      };
    },
  },
  {
    id: 'NEGATIVE_MARGIN_ITEMS',
    evaluate: (inputs) => {
      if (inputs.negativeMarginProductCount === 0) return null;
      return {
        id: 'NEGATIVE_MARGIN_ITEMS',
        severity: 'HIGH',
        title: `${inputs.negativeMarginProductCount} product${inputs.negativeMarginProductCount > 1 ? 's' : ''} selling below cost`,
        explanation: `You have ${inputs.negativeMarginProductCount} product${inputs.negativeMarginProductCount > 1 ? 's' : ''} where the selling price is lower than cost price among your top sellers.`,
        cta: { label: 'Review margins', href: '/reports/margins' },
      };
    },
  },
  {
    id: 'AR_AGING',
    evaluate: (inputs) => {
      if (inputs.arTotalPence === 0) return null;
      const over60Pct = (inputs.arOver60Pence / inputs.arTotalPence) * 100;
      if (over60Pct < 20) return null;
      return {
        id: 'AR_AGING',
        severity: 'HIGH',
        title: 'Receivables ageing rapidly',
        explanation: `${Math.round(over60Pct)}% of your outstanding receivables are over 60 days old (${(inputs.arOver60Pence / 100).toFixed(2)} out of ${(inputs.arTotalPence / 100).toFixed(2)}).`,
        cta: { label: 'Review debtors', href: '/reports/dashboard' },
      };
    },
  },
  {
    id: 'CASH_VARIANCE_TREND',
    evaluate: (inputs) => {
      if (inputs.cashVarianceTotalPence <= inputs.cashVarianceThresholdPence) return null;
      return {
        id: 'CASH_VARIANCE_TREND',
        severity: 'HIGH',
        title: 'Cash variance spike',
        explanation: `Total cash variances of ${(inputs.cashVarianceTotalPence / 100).toFixed(2)} in the last 7 days exceeded your threshold of ${(inputs.cashVarianceThresholdPence / 100).toFixed(2)}.`,
        cta: { label: 'Review risk monitor', href: '/reports/risk-monitor' },
      };
    },
  },
  {
    id: 'STOCKOUT_IMMINENT',
    evaluate: (inputs) => {
      if (inputs.stockoutImminentCount === 0) return null;
      const severity = inputs.stockoutImminentCount > 3 ? 'HIGH' as const : 'MEDIUM' as const;
      return {
        id: 'STOCKOUT_IMMINENT',
        severity,
        title: `${inputs.stockoutImminentCount} product${inputs.stockoutImminentCount > 1 ? 's' : ''} near stockout`,
        explanation: `${inputs.stockoutImminentCount} top-selling product${inputs.stockoutImminentCount > 1 ? 's have' : ' has'} 2 days or less of cover remaining.`,
        cta: { label: 'Review reorder suggestions', href: '/reports/reorder-suggestions' },
      };
    },
  },
  {
    id: 'FORECAST_NEGATIVE',
    evaluate: (inputs) => {
      if (!inputs.forecastNegativeWithin14Days) return null;
      return {
        id: 'FORECAST_NEGATIVE',
        severity: 'HIGH',
        title: 'Cash forecast goes negative within 14 days',
        explanation: `Your projected cash balance drops to ${(inputs.lowestProjectedBalancePence / 100).toFixed(2)} within the next 14 days based on current AR/AP and expenses.`,
        cta: { label: 'Review cashflow forecast', href: '/reports/cashflow-forecast' },
      };
    },
  },
  {
    id: 'MOMO_PENDING_SPIKE',
    evaluate: (inputs) => {
      if (inputs.momoPendingCount <= inputs.momoPendingThreshold) return null;
      return {
        id: 'MOMO_PENDING_SPIKE',
        severity: 'HIGH',
        title: `${inputs.momoPendingCount} MoMo payments pending`,
        explanation: `You have ${inputs.momoPendingCount} mobile money collections still pending reconciliation, which exceeds your threshold of ${inputs.momoPendingThreshold}.`,
        cta: { label: 'Reconcile payments', href: '/payments/reconciliation' },
      };
    },
  },
  {
    id: 'EXPENSE_SPIKE',
    evaluate: (inputs) => {
      if (inputs.fourWeekAvgExpensesPence === 0) return null;
      const ratio = inputs.thisWeekExpensesPence / inputs.fourWeekAvgExpensesPence;
      if (ratio < 1.5) return null;
      return {
        id: 'EXPENSE_SPIKE',
        severity: 'MEDIUM',
        title: 'Operating expenses higher than usual',
        explanation: `This week's expenses are ${Math.round(ratio * 100)}% of your 4-week average, indicating an unusual spike.`,
        cta: { label: 'Review expenses', href: '/expenses' },
      };
    },
  },
  {
    id: 'DISCOUNT_OVERRIDE_FREQUENT',
    evaluate: (inputs) => {
      if (inputs.discountOverrideCount <= inputs.discountOverrideThreshold) return null;
      return {
        id: 'DISCOUNT_OVERRIDE_FREQUENT',
        severity: 'MEDIUM',
        title: 'Unusual discount approval frequency',
        explanation: `${inputs.discountOverrideCount} discount overrides this week (threshold: ${inputs.discountOverrideThreshold}). This may indicate pricing issues or policy abuse.`,
        cta: { label: 'Review risk monitor', href: '/reports/risk-monitor' },
      };
    },
  },
  {
    id: 'LOW_STOCK_CRITICAL',
    evaluate: (inputs) => {
      if (inputs.urgentReorderCount <= 3) return null;
      return {
        id: 'LOW_STOCK_CRITICAL',
        severity: 'MEDIUM',
        title: `${inputs.urgentReorderCount} products need urgent reorder`,
        explanation: `${inputs.urgentReorderCount} products are at URGENT reorder level, risking stockouts and lost sales.`,
        cta: { label: 'Review reorder suggestions', href: '/reports/reorder-suggestions' },
      };
    },
  },
];

const severityOrder: Record<string, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };

export function computeBusinessAlerts(inputs: AlertInputs): BusinessAlert[] {
  return rules
    .map((rule) => rule.evaluate(inputs))
    .filter((alert): alert is BusinessAlert => alert !== null)
    .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);
}
