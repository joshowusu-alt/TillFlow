import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import { parseStoredStorefrontPaymentConfig } from '@/lib/storefront-payments';
import { createSale } from './sales';

const ONLINE_USER_NAME = 'TillFlow Online';
const ONLINE_TILL_NAME = 'Online Pickup';

function buildSystemUserEmail(businessId: string) {
  return `online-system+${businessId}@tillflow.system`;
}

/**
 * Lazily ensures the per-business system cashier and per-store "Online Pickup"
 * till exist, so online orders can flow through the standard SalesInvoice path.
 * The cashier user is created with `active: false` so it cannot be logged into.
 */
export async function ensureOnlineSalesInfra(businessId: string, storeId: string) {
  const userEmail = buildSystemUserEmail(businessId);

  const placeholderHash = createHash('sha256').update(randomBytes(16)).digest('hex');
  const user = await prisma.user.upsert({
    where: { email: userEmail }, update: {},
    create: { businessId, name: ONLINE_USER_NAME, email: userEmail,
      passwordHash: `disabled:${placeholderHash}`, role: 'OWNER', active: false },
    select: { id: true },
  });
  const existingTill = await prisma.till.findFirst({
    where: { storeId, name: ONLINE_TILL_NAME }, orderBy: { createdAt: 'asc' }, select: { id: true },
  });
  const till = existingTill ?? await prisma.till.upsert({
    where: { id: `online-${createHash('sha256').update(storeId).digest('hex').slice(0, 32)}` }, update: {},
    create: { id: `online-${createHash('sha256').update(storeId).digest('hex').slice(0, 32)}`,
      storeId, name: ONLINE_TILL_NAME, active: true }, select: { id: true },
  });

  return { cashierUserId: user.id, tillId: till.id };
}

/**
 * Idempotently commits a paid online order to the canonical SalesInvoice path:
 * consumes the existing inventory reservation, posts the journal entry and links the receipt
 * to the sale. Safe to call multiple times — a unique constraint on
 * `OnlineOrder.salesInvoiceId` prevents duplicates.
 */
export async function commitOnlineOrderSale(orderId: string): Promise<string | null> {
  const order = await prisma.onlineOrder.findUnique({
    where: { id: orderId },
    include: { lines: { orderBy: { id: 'asc' } }, business: { select: { storefrontPaymentMode: true } } },
  });

  if (!order) return null;
  if (order.salesInvoiceId) return order.salesInvoiceId;
  if (order.paymentStatus !== 'PAID' || order.status === 'CANCELLED') return null;

  const { tillId, cashierUserId } = await ensureOnlineSalesInfra(order.businessId, order.storeId);

  try {
    const invoice = await createSale({
      businessId: order.businessId,
      storeId: order.storeId,
      tillId,
      cashierUserId,
      skipInventoryMovements: true,
      onlineOrderId: order.id,
      saleSource: 'ONLINE_ORDER',
      paymentStatus: 'PAID',
      // Manual receipts have already been verified by a manager on this order.
      payments: [{ method: !order.paymentCollectionId && (parseStoredStorefrontPaymentConfig(order.paymentConfigJson)?.mode ?? order.business.storefrontPaymentMode) === 'BANK_TRANSFER' ? 'TRANSFER' : 'MOBILE_MONEY', amountPence: order.totalPence }],
      momoCollectionId: order.paymentCollectionId ?? null,
      bypassOpenTillRequirement: true,
      externalRef: `WEB-${order.orderNumber}`,
      lines: order.lines.map((line) => ({
        productId: line.productId,
        unitId: line.unitId,
        qtyInUnit: line.qtyInUnit,
      })),
    });

    await prisma.onlineOrder.update({
      where: { id: order.id },
      data: { salesInvoiceId: invoice.id },
    });

    return invoice.id;
  } catch (error) {
    // A concurrent webhook may have already committed this order. If the
    // unique externalRef or salesInvoiceId guard fired, treat as success.
    const refreshed = await prisma.onlineOrder.findUnique({
      where: { id: orderId },
      select: { salesInvoiceId: true },
    });
    if (refreshed?.salesInvoiceId) return refreshed.salesInvoiceId;

    throw error;
  }
}
