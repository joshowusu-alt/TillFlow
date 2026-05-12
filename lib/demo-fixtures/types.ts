export type PaymentMethod = 'CASH' | 'MOMO' | 'CREDIT' | 'CARD';
export type InvoiceStatus = 'PAID' | 'UNPAID' | 'PART_PAID';

export interface DemoCategory {
  id: string;
  name: string;
  colour: string;
  imagePath: string;
}

export interface DemoSupplier {
  id: string;
  name: string;
  phone: string;
  contact: string;
}

export interface DemoCustomer {
  id: string;
  name: string;
  phone: string;
  type: string;
}

export interface DemoProduct {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  categoryId: string;
  imagePath: string;
  costPricePence: number;
  sellingPricePence: number;
  openingQty: number;
  reorderPoint: number;
  vatRateBps: number;
  unit: string;
}

export interface DemoSalesLine {
  productId: string;
  qty: number;
  unitPricePence: number;
  costPricePence: number;
  vatRateBps: number;
}

export interface DemoSalesInvoice {
  id: string;
  date: Date;
  lines: DemoSalesLine[];
  paymentMethod: PaymentMethod;
  customerId: string | null;
  status: InvoiceStatus;
  subtotalPence: number;
  totalPaidPence: number;
}

export interface DemoPurchaseLine {
  productId: string;
  qty: number;
  unitCostPence: number;
}

export interface DemoPurchaseInvoice {
  id: string;
  date: Date;
  supplierId: string;
  lines: DemoPurchaseLine[];
  totalPence: number;
  paidPence: number;
  status: InvoiceStatus;
  ref: string;
}

export interface DemoExpense {
  id: string;
  date: Date;
  category: string;
  description: string;
  amountPence: number;
  paymentMethod: PaymentMethod;
}

export interface DemoCustomerReceipt {
  id: string;
  date: Date;
  customerId: string;
  amountPence: number;
  note: string;
}

export interface DemoInventoryBalance {
  productId: string;
  openingQty: number;
  purchasedQty: number;
  soldQty: number;
  endingQty: number;
}

export interface DemoTotals {
  totalRevenuePence: number;
  totalCOGSPence: number;
  grossProfitPence: number;
  grossMarginBps: number;
  totalPurchasesPence: number;
  purchasesPaidPence: number;
  purchasesOutstandingPence: number;
  totalExpensesPence: number;
  netProfitPence: number;
  openingCashPence: number;
  cashSalesPence: number;
  momoSalesPence: number;
  creditSalesPence: number;
  creditCollectedPence: number;
  endingCashPence: number;
  endingMomoPence: number;
  arBalancePence: number;
  apBalancePence: number;
  openingInventoryValuePence: number;
  endingInventoryValuePence: number;
}

export interface DemoSnapshot {
  businessName: string;
  currency: string;
  period: { start: Date; end: Date };
  categories: DemoCategory[];
  products: DemoProduct[];
  suppliers: DemoSupplier[];
  customers: DemoCustomer[];
  openingCashPence: number;
  salesInvoices: DemoSalesInvoice[];
  purchaseInvoices: DemoPurchaseInvoice[];
  expenses: DemoExpense[];
  customerReceipts: DemoCustomerReceipt[];
  inventoryBalances: Map<string, DemoInventoryBalance>;
  totals: DemoTotals;
}
