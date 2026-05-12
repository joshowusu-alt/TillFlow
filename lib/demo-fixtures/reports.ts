import type { DemoSnapshot, DemoProduct } from './types';

// ── Dashboard KPIs ────────────────────────────────────────────────────────────

export function getDashboardKPIs(s: DemoSnapshot) {
  const { totals, salesInvoices, products, inventoryBalances, period } = s;

  // "Today" KPIs – last day of the demo window
  const todayStart = new Date(period.end);
  todayStart.setHours(0, 0, 0, 0);
  const todayInvoices = salesInvoices.filter(i => i.date >= todayStart);

  const todaySalesPence = todayInvoices.reduce((acc, i) => acc + i.subtotalPence, 0);
  const todayTxCount    = todayInvoices.length;
  const todayCOGS       = todayInvoices.reduce(
    (acc, i) => acc + i.lines.reduce((a, l) => a + l.qty * l.costPricePence, 0), 0,
  );
  const todayGP   = todaySalesPence - todayCOGS;
  const todayGPpct = todaySalesPence > 0 ? Math.round((todayGP / todaySalesPence) * 100) : 0;

  const lowStockCount = products.filter(p => {
    const bal = inventoryBalances.get(p.id);
    return bal ? bal.endingQty <= p.reorderPoint : false;
  }).length;

  const periodDays = 14;
  const avgDailySalesPence = Math.round(totals.totalRevenuePence / periodDays);

  return {
    // Period (14-day) totals
    periodRevenuePence:     totals.totalRevenuePence,
    periodGrossProfitPence: totals.grossProfitPence,
    periodGrossMarginPct:   Math.round(totals.grossMarginBps / 100),
    periodNetProfitPence:   totals.netProfitPence,
    periodTxCount:          salesInvoices.length,
    avgDailySalesPence,
    // Today
    todaySalesPence,
    todayTxCount,
    todayGP,
    todayGPpct,
    // Balances
    cashPositionPence:   totals.endingCashPence,
    momoPositionPence:   totals.endingMomoPence,
    arBalancePence:      totals.arBalancePence,
    apBalancePence:      totals.apBalancePence,
    lowStockCount,
  };
}

// ── Sales by day ──────────────────────────────────────────────────────────────

export function getSalesByDay(s: DemoSnapshot) {
  const map = new Map<string, { pence: number; count: number; cogs: number }>();

  for (const inv of s.salesInvoices) {
    const key = inv.date.toISOString().slice(0, 10);
    const cur = map.get(key) ?? { pence: 0, count: 0, cogs: 0 };
    const cogs = inv.lines.reduce((a, l) => a + l.qty * l.costPricePence, 0);
    map.set(key, {
      pence: cur.pence + inv.subtotalPence,
      count: cur.count + 1,
      cogs:  cur.cogs  + cogs,
    });
  }

  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({
      date,
      revenuePence: v.pence,
      count:        v.count,
      cogsPence:    v.cogs,
      gpPence:      v.pence - v.cogs,
    }));
}

// ── Top products ──────────────────────────────────────────────────────────────

export function getTopProducts(s: DemoSnapshot, n = 10) {
  const map = new Map<string, { revenue: number; qty: number; cogs: number }>();

  for (const inv of s.salesInvoices) {
    for (const l of inv.lines) {
      const cur = map.get(l.productId) ?? { revenue: 0, qty: 0, cogs: 0 };
      map.set(l.productId, {
        revenue: cur.revenue + l.qty * l.unitPricePence,
        qty:     cur.qty     + l.qty,
        cogs:    cur.cogs    + l.qty * l.costPricePence,
      });
    }
  }

  const productMap = new Map<string, DemoProduct>(s.products.map(p => [p.id, p]));

  return Array.from(map.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .slice(0, n)
    .map(([id, v]) => ({
      product:      productMap.get(id)!,
      revenuePence: v.revenue,
      soldQty:      v.qty,
      cogsPence:    v.cogs,
      gpPence:      v.revenue - v.cogs,
    }));
}

// ── Category performance ──────────────────────────────────────────────────────

export function getCategoryPerformance(s: DemoSnapshot) {
  const catMap = new Map<string, { revenue: number; cogs: number; qty: number }>();
  const productCat = new Map<string, string>(
    s.products.map(p => [p.id, p.categoryId]),
  );

  for (const inv of s.salesInvoices) {
    for (const l of inv.lines) {
      const catId = productCat.get(l.productId) ?? 'unknown';
      const cur   = catMap.get(catId) ?? { revenue: 0, cogs: 0, qty: 0 };
      catMap.set(catId, {
        revenue: cur.revenue + l.qty * l.unitPricePence,
        cogs:    cur.cogs    + l.qty * l.costPricePence,
        qty:     cur.qty     + l.qty,
      });
    }
  }

  const catInfoMap = new Map(s.categories.map(c => [c.id, c]));

  return Array.from(catMap.entries())
    .sort(([, a], [, b]) => b.revenue - a.revenue)
    .map(([catId, v]) => ({
      category:    catInfoMap.get(catId)!,
      revenuePence: v.revenue,
      cogsPence:    v.cogs,
      gpPence:      v.revenue - v.cogs,
      gpPct:        v.revenue > 0 ? Math.round(((v.revenue - v.cogs) / v.revenue) * 100) : 0,
      unitsSold:    v.qty,
    }));
}

// ── Stock movement summary ────────────────────────────────────────────────────

export function getStockMovements(s: DemoSnapshot) {
  return s.products.map(p => {
    const bal = s.inventoryBalances.get(p.id)!;
    const cat = s.categories.find(c => c.id === p.categoryId)!;
    return {
      product:       p,
      category:      cat,
      openingQty:    bal.openingQty,
      purchasedQty:  bal.purchasedQty,
      soldQty:       bal.soldQty,
      endingQty:     bal.endingQty,
      isLowStock:    bal.endingQty <= p.reorderPoint,
      endingValuePence: bal.endingQty * p.costPricePence,
    };
  });
}

// ── Low-stock / reorder list ──────────────────────────────────────────────────

export function getLowStockProducts(s: DemoSnapshot) {
  return getStockMovements(s)
    .filter(r => r.isLowStock)
    .sort((a, b) => {
      const pctA = a.endingQty / (a.product.reorderPoint || 1);
      const pctB = b.endingQty / (b.product.reorderPoint || 1);
      return pctA - pctB;
    });
}

// ── Debtor balances ───────────────────────────────────────────────────────────

export function getDebtorBalances(s: DemoSnapshot) {
  const invoiced  = new Map<string, number>();
  const collected = new Map<string, number>();

  for (const inv of s.salesInvoices) {
    if (inv.paymentMethod === 'CREDIT' && inv.customerId) {
      invoiced.set(inv.customerId, (invoiced.get(inv.customerId) ?? 0) + inv.subtotalPence);
    }
  }
  for (const rct of s.customerReceipts) {
    collected.set(rct.customerId, (collected.get(rct.customerId) ?? 0) + rct.amountPence);
  }

  return s.customers
    .map(c => ({
      customer:       c,
      invoicedPence:  invoiced.get(c.id) ?? 0,
      collectedPence: collected.get(c.id) ?? 0,
      balancePence:   (invoiced.get(c.id) ?? 0) - (collected.get(c.id) ?? 0),
    }))
    .filter(r => r.invoicedPence > 0)
    .sort((a, b) => b.balancePence - a.balancePence);
}

// ── Supplier payables ─────────────────────────────────────────────────────────

export function getSupplierPayables(s: DemoSnapshot) {
  const supMap = new Map(s.suppliers.map(sup => [sup.id, sup]));

  return s.purchaseInvoices
    .filter(po => po.paidPence < po.totalPence)
    .map(po => ({
      supplier:        supMap.get(po.supplierId)!,
      invoice:         po,
      outstandingPence: po.totalPence - po.paidPence,
    }))
    .sort((a, b) => b.outstandingPence - a.outstandingPence);
}

// ── Income statement ──────────────────────────────────────────────────────────

export function getIncomeStatement(s: DemoSnapshot) {
  const { totals } = s;
  return {
    revenuePence:      totals.totalRevenuePence,
    cogsPence:         totals.totalCOGSPence,
    grossProfitPence:  totals.grossProfitPence,
    grossMarginPct:    Math.round(totals.grossMarginBps / 100),
    expensesPence:     totals.totalExpensesPence,
    netProfitPence:    totals.netProfitPence,
    netMarginPct:      totals.totalRevenuePence > 0
      ? Math.round((totals.netProfitPence / totals.totalRevenuePence) * 100)
      : 0,
  };
}

// ── Cash flow summary ─────────────────────────────────────────────────────────

export function getCashFlow(s: DemoSnapshot) {
  const { totals } = s;
  return {
    openingCashPence:      totals.openingCashPence,
    cashSalesPence:        totals.cashSalesPence,
    momoSalesPence:        totals.momoSalesPence,
    creditCollectedPence:  totals.creditCollectedPence,
    purchasesPaidPence:    totals.purchasesPaidPence,
    expensesPaidPence:     totals.totalExpensesPence,
    endingCashPence:       totals.endingCashPence,
    endingMomoPence:       totals.endingMomoPence,
    totalLiquidPence:      totals.endingCashPence + totals.endingMomoPence,
  };
}

// ── Payment method split ──────────────────────────────────────────────────────

export function getPaymentSplit(s: DemoSnapshot) {
  const total = s.totals.totalRevenuePence || 1;
  return {
    cashPct:   Math.round((s.totals.cashSalesPence   / total) * 100),
    momoPct:   Math.round((s.totals.momoSalesPence   / total) * 100),
    creditPct: Math.round((s.totals.creditSalesPence / total) * 100),
    cashPence:   s.totals.cashSalesPence,
    momoPence:   s.totals.momoSalesPence,
    creditPence: s.totals.creditSalesPence,
  };
}
