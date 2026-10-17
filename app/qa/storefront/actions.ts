'use server';
import { randomUUID } from 'crypto';
import { redirect, notFound } from 'next/navigation';
import { isRedirectError } from 'next/dist/client/components/redirect';
import { prisma } from '@/lib/prisma';
import { storefrontPreviewOwner, QA_BUSINESS, QA_STORE } from '@/lib/services/storefront-preview-guard';
import { createOnlineCheckout } from '@/lib/services/online-orders';
import { commitOnlineOrderSale } from '@/lib/services/online-order-commit';
import { expireOnlineOrders } from '@/lib/services/online-order-expiry-runner';
import { updateOnlineOrderStatusAction } from '@/app/actions/online-storefront';
function verify(value: unknown, message: string): asserts value { if (!value) throw new Error(message); }
async function cancel(id: string) {
  const form = new FormData(); form.set('orderId', id); form.set('nextStatus', 'CANCELLED');
  try { await updateOnlineOrderStatusAction(form); }
  catch (error) { if (!isRedirectError(error)) throw error; }
}
export async function runStorefrontAcceptance(formData: FormData): Promise<void> {
  if (!await storefrontPreviewOwner()) notFound();
  const scenario = String(formData.get('scenario'));
  if (!['checkout_retry', 'posting_retry', 'cancel_posting', 'expiry_race'].includes(scenario)) throw new Error('Unknown acceptance test.');
  const runId = randomUUID();
  try {
    const product = await prisma.product.findFirstOrThrow({ where: { businessId: QA_BUSINESS, name: 'Preview Grocery 03', active: true },
      select: { id: true, productUnits: { where: { isBaseUnit: true }, select: { unitId: true }, take: 1 } } });
    verify(product.productUnits[0], 'Fixture base unit missing');
    const before = await prisma.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId: QA_STORE, productId: product.id } } });
    const input = { slug: 'storefront-preview-134', storeId: QA_STORE, checkoutKey: runId,
      customerName: `Fictional QA ${scenario}`, customerPhone: '0240000134',
      items: [{ productId: product.id, unitId: product.productUnits[0].unitId, qtyInUnit: 1 }] };
    const order = scenario === 'checkout_retry' ? await Promise.all([createOnlineCheckout(input), createOnlineCheckout(input)]).then(results => {
      verify(results[0].orderId === results[1].orderId, 'Retry created different orders'); return results[0];
    }) : await createOnlineCheckout(input);
    const orderId = order.orderId;
    const afterCheckout = await prisma.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId: QA_STORE, productId: product.id } } });
    verify(afterCheckout.qtyOnHandBase === before.qtyOnHandBase - 1, 'Checkout did not reserve exactly one unit');
    if (scenario === 'posting_retry' || scenario === 'cancel_posting') {
      await prisma.onlineOrder.update({ where: { id: orderId }, data: { status: 'PAID', paymentStatus: 'PAID', paidAt: new Date(), paymentConfirmedAt: new Date() } });
      if (scenario === 'posting_retry') {
        const invoices = await Promise.all([commitOnlineOrderSale(orderId), commitOnlineOrderSale(orderId)]);
        verify(invoices[0] && invoices[0] === invoices[1], 'Posting retry created different invoices');
      } else {
        const outcomes = await Promise.allSettled([cancel(orderId), commitOnlineOrderSale(orderId)]);
        let current = await prisma.onlineOrder.findUniqueOrThrow({ where: { id: orderId } });
        // If posting won between the cancellation read and claim, the safe stale
        // cancellation rejection is expected. Retry through the normal action.
        if (current.status !== 'CANCELLED') await cancel(orderId);
        current = await prisma.onlineOrder.findUniqueOrThrow({ where: { id: orderId } });
        verify(current.status === 'CANCELLED' && current.refundStatus === 'MANUAL_REFUND_NEEDED', 'Cancellation did not preserve the refund obligation');
        verify(outcomes.some(result => result.status === 'fulfilled'), 'Neither concurrent command completed');
      }
    }
    if (scenario === 'expiry_race') {
      await prisma.onlineOrder.update({ where: { id: orderId }, data: { status: 'PAYMENT_FAILED', paymentStatus: 'FAILED', createdAt: new Date(Date.now() - 7 * 86400000) } });
      await Promise.all([expireOnlineOrders(QA_BUSINESS, orderId), expireOnlineOrders(QA_BUSINESS, orderId)]);
      const expired = await prisma.onlineOrder.findUniqueOrThrow({ where: { id: orderId } });
      verify(expired.status === 'CANCELLED' && expired.paymentStatus === 'EXPIRED', 'Failed-payment reservation did not expire');
    }
    const current = await prisma.onlineOrder.findUniqueOrThrow({ where: { id: orderId }, include: { lines: true } });
    const stock = await prisma.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId: QA_STORE, productId: product.id } } });
    const invoices = await prisma.salesInvoice.count({ where: { businessId: QA_BUSINESS, externalRef: `WEB-${current.orderNumber}` } });
    verify(invoices <= 1, 'Duplicate invoice');
    verify(stock.qtyOnHandBase === before.qtyOnHandBase - (current.status === 'CANCELLED' ? 0 : 1), 'Stock was reserved or restored more than once');
    verify(before.knownValuePence != null && before.unvaluedQtyBase === 0, 'Fixture must have exact stock values');
    const capturedCost = current.lines.reduce((sum, line) => sum + (line.lineCostPence ?? 0), 0);
    verify(current.lines.every(line => line.lineCostPence != null && line.costBasis === 'INVENTORY_VALUE_V1'), 'Reservation cost was not captured');
    verify(stock.knownValuePence === before.knownValuePence - (current.status === 'CANCELLED' ? 0 : capturedCost) && stock.unvaluedQtyBase === 0, 'Exact inventory value was lost');
    const reservationMovements = await prisma.stockMovement.count({ where: { storeId: QA_STORE,
      referenceType: current.salesInvoiceId ? 'SALES_INVOICE' : 'ONLINE_ORDER', referenceId: current.salesInvoiceId ?? orderId,
      type: current.salesInvoiceId ? 'SALE' : 'ONLINE_ORDER_RESERVATION' } });
    verify(reservationMovements === 1, 'Reservation movement missing or duplicated');
    if (current.salesInvoiceId) {
      const invoice = await prisma.salesInvoice.findUniqueOrThrow({ where: { id: current.salesInvoiceId }, include: { lines: true } });
      verify(invoice.lines.reduce((sum, line) => sum + line.lineCostPence, 0) === capturedCost, 'Sale replaced the captured inventory cost');
    }
    const result = { passed: true, scenario, runId, orderId, reference: current.orderNumber,
      status: current.status, invoiceCount: invoices, stockBefore: before.qtyOnHandBase, stockAfter: stock.qtyOnHandBase, valueBefore: before.knownValuePence, valueAfter: stock.knownValuePence, capturedCost, reservationMovements };
    await prisma.storefrontEvent.create({ data: { businessId: QA_BUSINESS, storeSlug: 'storefront-preview-134',
      eventType: 'qa_acceptance', sessionId: runId, metadata: JSON.stringify(result) } });
  } catch (error) {
    console.error('[storefront-acceptance]', scenario, runId, error);
    await prisma.storefrontEvent.create({ data: { businessId: QA_BUSINESS, storeSlug: 'storefront-preview-134',
      eventType: 'qa_acceptance', sessionId: runId, metadata: JSON.stringify({ passed: false, scenario, runId, error: error instanceof Error ? error.message : 'Acceptance check failed' }) } });
  }
  redirect('/qa/storefront');
}
