export type DemoOnlineOrderStatus =
  | 'AWAITING_PAYMENT'
  | 'PAYMENT_CONFIRMED'
  | 'PREPARING'
  | 'READY'
  | 'COLLECTED';

export type DemoOnlineOrder = {
  id: string;
  placedAt: string;
  customerName: string;
  phone: string;
  status: DemoOnlineOrderStatus;
  statusLabel: string;
  paymentRef: string | null;
  itemSummary: string;
  totalPence: number;
  note: string;
};

/** Pickup-state illustrations reuse ledger invoices; they do not add receipts or sales. */
export function getDemoOnlineOrders(snapshot: import('./types').DemoSnapshot): DemoOnlineOrder[] {
  const paid = snapshot.salesInvoices.filter(i => i.paymentMethod === 'MOMO').slice(-3);
  const unpaid = snapshot.salesInvoices.find(i => i.paymentMethod === 'CREDIT');
  const invoices = unpaid ? [unpaid, ...paid] : paid;
  return invoices.map((invoice, index) => ({
    id: `WEB-${invoice.id}`,
    placedAt: invoice.date.toISOString(),
    customerName: snapshot.customers.find(c => c.id === invoice.customerId)?.name ?? `Sample buyer ${index + 1}`,
    phone: '0200-000-000',
    status: invoice.paymentMethod === 'CREDIT' ? 'AWAITING_PAYMENT' : index === invoices.length - 1 ? 'COLLECTED' : 'PREPARING',
    statusLabel: invoice.paymentMethod === 'CREDIT' ? 'Awaiting payment (illustration)' : index === invoices.length - 1 ? 'Collected (illustration)' : 'Preparing (illustration)',
    paymentRef: invoice.paymentMethod === 'CREDIT' ? null : `MOMO-${invoice.id}`,
    itemSummary: invoice.lines.map(line => `${snapshot.products.find(p => p.id === line.productId)?.name} × ${line.qty}`).join(', '),
    totalPence: invoice.subtotalPence,
    note: `Ledger invoice ${invoice.id}. Pickup status is illustrative; no additional sale or collection is recorded.`,
  }));
}
