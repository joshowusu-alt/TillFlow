import type {
  DemoProduct,
  DemoCustomer,
  DemoSalesInvoice,
  DemoSalesLine,
  DemoPurchaseInvoice,
  DemoExpense,
  DemoCustomerReceipt,
} from './types';

// ── Deterministic PRNG (Mulberry32) ──────────────────────────────────────────
function makePrng(seed: number) {
  let s = seed >>> 0;
  return function rand(): number {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleSample<T>(arr: T[], n: number, rand: () => number): T[] {
  const copy = arr.slice();
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

// ── Purchase orders (hand-crafted, deterministic) ─────────────────────────────

export function buildPurchaseInvoices(start: Date): DemoPurchaseInvoice[] {
  const day = (d: number) => new Date(start.getTime() + d * 86_400_000);

  return [
    {
      id: 'PO-001', ref: 'GFD/2026/0427', supplierId: 'SUP-001',
      date: day(3),
      lines: [
        { productId: 'P001', qty: 50,  unitCostPence: 3200 },
        { productId: 'P002', qty: 30,  unitCostPence: 5800 },
        { productId: 'P006', qty: 36,  unitCostPence: 1800 },
        { productId: 'P007', qty: 12,  unitCostPence: 8200 },
        { productId: 'P005', qty: 48,  unitCostPence: 600  },
      ],
      totalPence: 50*3200 + 30*5800 + 36*1800 + 12*8200 + 48*600,  // 526 000
      paidPence:  50*3200 + 30*5800 + 36*1800 + 12*8200 + 48*600,  // fully paid
      status: 'PAID',
    },
    {
      id: 'PO-002', ref: 'ABD/2026/0429', supplierId: 'SUP-002',
      date: day(5),
      lines: [
        { productId: 'P018', qty: 120, unitCostPence: 400  },
        { productId: 'P016', qty: 240, unitCostPence: 150  },
        { productId: 'P021', qty: 36,  unitCostPence: 2800 },
        { productId: 'P023', qty: 48,  unitCostPence: 1800 },
        { productId: 'P025', qty: 72,  unitCostPence: 450  },
      ],
      totalPence: 120*400 + 240*150 + 36*2800 + 48*1800 + 72*450,  // 303 600
      paidPence:  200_000,
      status: 'PART_PAID',
    },
    {
      id: 'PO-003', ref: 'CHW/2026/0503', supplierId: 'SUP-003',
      date: day(7),
      lines: [
        { productId: 'P050', qty: 48,  unitCostPence: 1200 },
        { productId: 'P070', qty: 15,  unitCostPence: 6000 },
        { productId: 'P062', qty: 36,  unitCostPence: 1100 },
        { productId: 'P060', qty: 48,  unitCostPence: 600  },
      ],
      totalPence: 48*1200 + 15*6000 + 36*1100 + 48*600,  // 216 000
      paidPence:  48*1200 + 15*6000 + 36*1100 + 48*600,  // fully paid
      status: 'PAID',
    },
    {
      id: 'PO-004', ref: 'GFD/2026/0506', supplierId: 'SUP-001',
      date: day(9),
      lines: [
        { productId: 'P004', qty: 72,  unitCostPence: 700  },
        { productId: 'P008', qty: 48,  unitCostPence: 500  },
        { productId: 'P014', qty: 48,  unitCostPence: 600  },
        { productId: 'P015', qty: 20,  unitCostPence: 2800 },
      ],
      totalPence: 72*700 + 48*500 + 48*600 + 20*2800,  // 159 200
      paidPence:  0,
      status: 'UNPAID',
    },
    {
      id: 'PO-005', ref: 'ABD/2026/0507', supplierId: 'SUP-002',
      date: day(11),
      lines: [
        { productId: 'P078', qty: 24,  unitCostPence: 900  },
        { productId: 'P019', qty: 72,  unitCostPence: 400  },
        { productId: 'P020', qty: 48,  unitCostPence: 400  },
        { productId: 'P031', qty: 36,  unitCostPence: 800  },
      ],
      totalPence: 24*900 + 72*400 + 48*400 + 36*800,  // 98 400
      paidPence:  24*900 + 72*400 + 48*400 + 36*800,  // fully paid
      status: 'PAID',
    },
    {
      id: 'PO-006', ref: 'CHW/2026/0509', supplierId: 'SUP-003',
      date: day(13),
      lines: [
        { productId: 'P038', qty: 24,  unitCostPence: 2500 },
        { productId: 'P046', qty: 36,  unitCostPence: 1200 },
        { productId: 'P040', qty: 48,  unitCostPence: 900  },
        { productId: 'P045', qty: 36,  unitCostPence: 500  },
      ],
      totalPence: 24*2500 + 36*1200 + 48*900 + 36*500,  // 164 400
      paidPence:  0,
      status: 'UNPAID',
    },
  ];
}

// ── Expenses (hand-crafted) ───────────────────────────────────────────────────

export function buildExpenses(start: Date): DemoExpense[] {
  const day = (d: number) => new Date(start.getTime() + d * 86_400_000);
  return [
    { id:'EXP-001', date:day(0),  category:'Rent',           description:'Monthly shop rent',       amountPence:250_000, paymentMethod:'CASH' },
    { id:'EXP-002', date:day(2),  category:'Cleaning',       description:'Cleaning supplies',        amountPence:  8_000, paymentMethod:'CASH' },
    { id:'EXP-003', date:day(4),  category:'Electricity',    description:'Electricity bill',         amountPence: 40_000, paymentMethod:'CASH' },
    { id:'EXP-004', date:day(6),  category:'Transport',      description:'Delivery transport',       amountPence: 15_000, paymentMethod:'CASH' },
    { id:'EXP-005', date:day(7),  category:'Staff',          description:'Staff advance – Abena',    amountPence: 50_000, paymentMethod:'CASH' },
    { id:'EXP-006', date:day(9),  category:'Transport',      description:'Fuel & transport',         amountPence: 15_000, paymentMethod:'CASH' },
    { id:'EXP-007', date:day(10), category:'Maintenance',    description:'Freezer repair',           amountPence: 20_000, paymentMethod:'CASH' },
    { id:'EXP-008', date:day(12), category:'Cleaning',       description:'Cleaning supplies',        amountPence:  8_000, paymentMethod:'CASH' },
    { id:'EXP-009', date:day(13), category:'Miscellaneous',  description:'Miscellaneous',            amountPence: 12_000, paymentMethod:'CASH' },
  ];
}

// ── Customer credit receipts ──────────────────────────────────────────────────

export function buildCustomerReceipts(start: Date): DemoCustomerReceipt[] {
  const day = (d: number) => new Date(start.getTime() + d * 86_400_000);
  return [
    { id:'RCT-001', date:day(8),  customerId:'CUST-001', amountPence: 60_000, note:'Part payment – week 1 balance' },
    { id:'RCT-002', date:day(11), customerId:'CUST-002', amountPence: 80_000, note:'Payment via MoMo' },
    { id:'RCT-003', date:day(13), customerId:'CUST-003', amountPence: 40_000, note:'Cash settlement' },
  ];
}

// ── Sales generator ───────────────────────────────────────────────────────────

export function buildSalesInvoices(
  products: DemoProduct[],
  customers: DemoCustomer[],
  purchaseInvoices: DemoPurchaseInvoice[],
  start: Date,
): DemoSalesInvoice[] {
  const rand = makePrng(42);

  // Total available stock per product (opening + all purchases)
  const totalAvailable = new Map<string, number>(products.map(p => [p.id, p.openingQty]));
  for (const po of purchaseInvoices) {
    for (const l of po.lines) {
      totalAvailable.set(l.productId, (totalAvailable.get(l.productId) ?? 0) + l.qty);
    }
  }

  // Sales budget per product: 45-65% of total available
  const salesBudget = new Map<string, number>();
  for (const [id, stock] of totalAvailable) {
    salesBudget.set(id, Math.max(1, Math.floor(stock * (0.45 + rand() * 0.20))));
  }

  const invoices: DemoSalesInvoice[] = [];
  let invoiceNum = 1;

  for (let day = 0; day < 14; day++) {
    const dayDate = new Date(start.getTime() + day * 86_400_000);
    const dow = dayDate.getDay();
    const isWeekend = dow === 0 || dow === 6;
    const numInvoices = isWeekend
      ? 22 + Math.floor(rand() * 10)   // 22-31 on weekends
      : 15 + Math.floor(rand() * 10);  // 15-24 on weekdays

    for (let i = 0; i < numInvoices; i++) {
      const available = products.filter(p => (salesBudget.get(p.id) ?? 0) > 0);
      if (available.length < 2) break;

      const numLines = 2 + Math.floor(rand() * 4); // 2-5 lines
      const chosen = shuffleSample(available, numLines, rand);

      const lines: DemoSalesLine[] = [];
      for (const p of chosen) {
        const budget = salesBudget.get(p.id) ?? 0;
        if (budget <= 0) continue;
        const qty = Math.min(1 + Math.floor(rand() * 3), budget);
        salesBudget.set(p.id, budget - qty);
        lines.push({
          productId: p.id,
          qty,
          unitPricePence: p.sellingPricePence,
          costPricePence: p.costPricePence,
          vatRateBps: p.vatRateBps,
        });
      }
      if (lines.length === 0) continue;

      const subtotalPence = lines.reduce((s, l) => s + l.qty * l.unitPricePence, 0);

      // Payment split: 58% cash, 30% momo, 12% credit
      const r = rand();
      let paymentMethod: DemoSalesInvoice['paymentMethod'];
      let customerId: string | null = null;

      if (r < 0.58) {
        paymentMethod = 'CASH';
      } else if (r < 0.88) {
        paymentMethod = 'MOMO';
      } else {
        paymentMethod = 'CREDIT';
        customerId = customers[Math.floor(rand() * customers.length)].id;
      }

      // Random time between 7am and 9pm
      const hourMs = (7 + Math.floor(rand() * 14)) * 3_600_000;
      const minMs  = Math.floor(rand() * 60) * 60_000;
      const invoiceDate = new Date(dayDate.getTime() + hourMs + minMs);

      invoices.push({
        id: `INV-${String(invoiceNum).padStart(4, '0')}`,
        date: invoiceDate,
        lines,
        paymentMethod,
        customerId,
        status: paymentMethod === 'CREDIT' ? 'UNPAID' : 'PAID',
        subtotalPence,
        totalPaidPence: paymentMethod === 'CREDIT' ? 0 : subtotalPence,
      });
      invoiceNum++;
    }
  }

  return invoices;
}
