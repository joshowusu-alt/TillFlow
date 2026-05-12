import { DEMO_CATEGORIES, DEMO_PRODUCTS } from './products';
import { DEMO_SUPPLIERS } from './suppliers';
import { DEMO_CUSTOMERS } from './customers';
import {
  buildPurchaseInvoices,
  buildExpenses,
  buildCustomerReceipts,
  buildSalesInvoices,
} from './transactions';
import type {
  DemoSnapshot,
  DemoInventoryBalance,
  DemoTotals,
} from './types';

// The demo window always ends "yesterday" so the data feels current.
function getDemoWindow(): { start: Date; end: Date } {
  const end = new Date();
  end.setHours(23, 59, 59, 0);
  end.setDate(end.getDate() - 1);

  const start = new Date(end);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 13); // 14 days total (start + 13 more)

  return { start, end };
}

let cachedDateKey: string | null = null;
let cachedSnapshot: DemoSnapshot | null = null;

export function buildDemoLedger(): DemoSnapshot {
  const { start, end } = getDemoWindow();
  const dateKey = end.toISOString().slice(0, 10);
  if (cachedSnapshot && cachedDateKey === dateKey) return cachedSnapshot;

  const purchaseInvoices = buildPurchaseInvoices(start);
  const expenses         = buildExpenses(start);
  const customerReceipts = buildCustomerReceipts(start);
  const salesInvoices    = buildSalesInvoices(DEMO_PRODUCTS, DEMO_CUSTOMERS, purchaseInvoices, start);

  // ── Inventory balances ──────────────────────────────────────────────────
  const purchasedQtyMap = new Map<string, number>();
  for (const po of purchaseInvoices) {
    for (const l of po.lines) {
      purchasedQtyMap.set(l.productId, (purchasedQtyMap.get(l.productId) ?? 0) + l.qty);
    }
  }

  const soldQtyMap = new Map<string, number>();
  for (const inv of salesInvoices) {
    for (const l of inv.lines) {
      soldQtyMap.set(l.productId, (soldQtyMap.get(l.productId) ?? 0) + l.qty);
    }
  }

  const inventoryBalances = new Map<string, DemoInventoryBalance>();
  for (const p of DEMO_PRODUCTS) {
    const purchasedQty = purchasedQtyMap.get(p.id) ?? 0;
    const soldQty      = soldQtyMap.get(p.id) ?? 0;
    inventoryBalances.set(p.id, {
      productId:   p.id,
      openingQty:  p.openingQty,
      purchasedQty,
      soldQty,
      endingQty:   p.openingQty + purchasedQty - soldQty,
    });
  }

  // ── Opening balances ────────────────────────────────────────────────────
  const openingCashPence = 500_000; // GHS 5,000

  const openingInventoryValuePence = DEMO_PRODUCTS.reduce(
    (s, p) => s + p.openingQty * p.costPricePence, 0,
  );

  // ── Revenue & COGS ──────────────────────────────────────────────────────
  let totalRevenuePence = 0;
  let totalCOGSPence    = 0;
  let cashSalesPence    = 0;
  let momoSalesPence    = 0;
  let creditSalesPence  = 0;

  for (const inv of salesInvoices) {
    totalRevenuePence += inv.subtotalPence;
    for (const l of inv.lines) {
      totalCOGSPence += l.qty * l.costPricePence;
    }
    if (inv.paymentMethod === 'CASH')   cashSalesPence   += inv.subtotalPence;
    if (inv.paymentMethod === 'MOMO')   momoSalesPence   += inv.subtotalPence;
    if (inv.paymentMethod === 'CREDIT') creditSalesPence += inv.subtotalPence;
  }

  const grossProfitPence = totalRevenuePence - totalCOGSPence;
  const grossMarginBps   = totalRevenuePence > 0
    ? Math.round((grossProfitPence / totalRevenuePence) * 10_000)
    : 0;

  // ── Purchases ───────────────────────────────────────────────────────────
  const totalPurchasesPence = purchaseInvoices.reduce((s, po) => s + po.totalPence, 0);
  const purchasesPaidPence  = purchaseInvoices.reduce((s, po) => s + po.paidPence, 0);
  const purchasesOutstandingPence = totalPurchasesPence - purchasesPaidPence;

  // ── Expenses ────────────────────────────────────────────────────────────
  const totalExpensesPence = expenses.reduce((s, e) => s + e.amountPence, 0);

  // ── Net profit ──────────────────────────────────────────────────────────
  const netProfitPence = grossProfitPence - totalExpensesPence;

  // ── AR & AP ─────────────────────────────────────────────────────────────
  // AR: unpaid credit sales minus customer receipts already collected
  const creditCollectedPence = customerReceipts.reduce((s, r) => s + r.amountPence, 0);
  const arBalancePence       = Math.max(0, creditSalesPence - creditCollectedPence);
  const apBalancePence       = purchasesOutstandingPence;

  // ── Cash position ────────────────────────────────────────────────────────
  // Cash = opening + cash sales + credit collected - cash purchase payments - cash expenses
  const endingCashPence = openingCashPence
    + cashSalesPence
    + creditCollectedPence
    - purchasesPaidPence
    - totalExpensesPence;

  const endingMomoPence = momoSalesPence;

  // ── Ending inventory value ───────────────────────────────────────────────
  const endingInventoryValuePence = DEMO_PRODUCTS.reduce((s, p) => {
    const bal = inventoryBalances.get(p.id)!;
    return s + bal.endingQty * p.costPricePence;
  }, 0);

  const totals: DemoTotals = {
    totalRevenuePence,
    totalCOGSPence,
    grossProfitPence,
    grossMarginBps,
    totalPurchasesPence,
    purchasesPaidPence,
    purchasesOutstandingPence,
    totalExpensesPence,
    netProfitPence,
    openingCashPence,
    cashSalesPence,
    momoSalesPence,
    creditSalesPence,
    creditCollectedPence,
    endingCashPence,
    endingMomoPence,
    arBalancePence,
    apBalancePence,
    openingInventoryValuePence,
    endingInventoryValuePence,
  };

  cachedDateKey = dateKey;
  cachedSnapshot = {
    businessName: 'Kwame & Family Supermarket',
    currency: 'GHS',
    period: { start, end },
    categories: DEMO_CATEGORIES,
    products: DEMO_PRODUCTS,
    suppliers: DEMO_SUPPLIERS,
    customers: DEMO_CUSTOMERS,
    openingCashPence,
    salesInvoices,
    purchaseInvoices,
    expenses,
    customerReceipts,
    inventoryBalances,
    totals,
  };

  return cachedSnapshot;
}
