/** Demo-safe static figures for welcome marketing visuals only. */
export const DEMO_BUSINESS = {
  name: 'Adom Retail Demo',
  branch: 'Main Branch',
  owner: 'Ama Owner',
  cashier: 'Kwame Cashier',
} as const;

export const DEMO_KPIS = {
  todaySales: 'GH₵8,420',
  grossMargin: '24.8%',
  todayReceipts: '126',
  outstandingDebtors: 'GH₵960',
  openIssues: '3',
  expectedCash: 'GH₵3,185',
  revenue: 'GH₵8,420',
  // 2,088 / 8,420 = 24.8% so the margin figure stays arithmetically honest.
  grossProfit: 'GH₵2,088',
  transactions: '126',
  lowStock: '14',
} as const;

/** Numeric twins of DEMO_KPIS used to drive count-up animation without re-parsing formatted strings. */
export const DEMO_KPI_NUMBERS = {
  todaySales: 8420,
  grossMargin: 24.8,
  todayReceipts: 126,
  outstandingDebtors: 960,
  openIssues: 3,
  expectedCash: 3185,
  revenue: 8420,
  grossProfit: 2088,
  transactions: 126,
  lowStock: 14,
} as const;

export const DEMO_STOCK_SUMMARY = {
  totalProducts: 1024,
  lowStock: 14,
  outOfStock: 2,
} as const;

export const DEMO_POS_CART = [
  { name: 'Royal Aroma Rice 5kg', qty: 1, price: 'GH₵82.00', priceValue: 82 },
  { name: 'Frytol Oil 1L', qty: 1, price: 'GH₵45.00', priceValue: 45 },
  { name: 'Peak Milk Sachet', qty: 1, price: 'GH₵12.00', priceValue: 12 },
] as const;

export const DEMO_POS_TOTALS = {
  amountDue: 'GH₵139.00',
  cashTendered: 'GH₵150.00',
  change: 'GH₵11.00',
} as const;

export const DEMO_SHIFT_LINES = [
  { label: 'Opening float', value: '+GH₵500', tone: 'neutral' as const },
  { label: 'Cash sales', value: '+GH₵2,940', tone: 'neutral' as const },
  { label: 'Supplier payments', value: '−GH₵180', tone: 'negative' as const },
  { label: 'Expenses paid from till', value: '−GH₵75', tone: 'negative' as const },
  { label: 'Refunds', value: 'GH₵0', tone: 'neutral' as const },
  { label: 'Cash added / adjustments', value: 'GH₵0', tone: 'neutral' as const },
] as const;

/** A different, in-progress transaction used only in the hero teaser so it never repeats the completed checkout shown in the Product Proof section. */
export const DEMO_LIVE_SALE = {
  item: 'Indomie Chicken Flavour Pack',
  itemsSoFar: 2,
  runningTotal: 'GH₵57.00',
} as const;

export const DEMO_ANALYTICS = {
  revenue: DEMO_KPIS.todaySales,
  grossProfit: DEMO_KPIS.grossProfit,
  margin: DEMO_KPIS.grossMargin,
  transactions: DEMO_KPIS.transactions,
  topProduct: 'Royal Aroma Rice 5kg',
  peakHour: '6 PM',
  trend: [42, 58, 50, 72, 65, 86, 78],
} as const;

export const DEMO_PEOPLE = {
  customers: '248',
  suppliers: '36',
  customerPaymentsDue: 'GH₵960',
  // Matches the two payables rows shown in StockSuppliersPreview (640 + 420).
  supplierPaymentsDue: 'GH₵1,060',
} as const;
