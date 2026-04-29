import { createHash, randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
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

  let user = await prisma.user.findFirst({
    where: { businessId, email: userEmail },
    select: { id: true },
  });
  if (!user) {
    const placeholderHash = createHash('sha256')
      .update(`online-system:${businessId}:${randomBytes(16).toString('hex')}`)
      .digest('hex');
    user = await prisma.user.create({
      data: {
        businessId,
        name: ONLINE_USER_NAME,
        email: userEmail,
        passwordHash: `disabled:${placeholderHash}`,
        role: 'OWNER',
        active: false,
      },
      select: { id: true },
    });
  }

  let till = await prisma.till.findFirst({
    where: { storeId, name: ONLINE_TILL_NAME },
    select: { id: true },
  });
  if (!till) {
    till = await prisma.till.create({
      data: { storeId, name: ONLINE_TILL_NAME, active: true },
      select: { id: true },
    });
  }

  return { cashierUserId: user.id, tillId: till.id };
}

/**
 * Idempotently commits a paid online order to the canonical SalesInvoice path:
 * decrements inventory, posts the journal entry, and links the MoMo collection
 * to the sale. Safe to call multiple times — a unique constraint on
 * `OnlineOrder.salesInvoiceId` prevents duplicates.
 */
export async function commitOnlineOrderSale(orderId: string): Promise<string | null> {
  const order = await prisma.onlineOrder.findUnique({
    where: { id: orderId },
    include: { lines: true },
  });

  if (!order) return null;
  if (order.salesInvoiceId) return order.salesInvoiceId;
  if (order.paymentStatus !== 'PAID') return null;

  const { tillId, cashierUserId } = await ensureOnlineSalesInfra(order.businessId, order.storeId);

  try {
    const invoice = await createSale({
      businessId: order.businessId,
      storeId: order.storeId,
      tillId,
      cashierUserId,
      paymentStatus: 'PAID',
      // Manual reference orders won't have a paymentCollectionId — createSale
      // accepts that case by recording the MoMo payment as PENDING_MANUAL.
      payments: [{ method: 'MOBILE_MONEY', amountPence: order.totalPence }],
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

    // Stock ran out between checkout and payment confirmation. The customer's
    // MoMo has already been collected, so flag the order for manual refund and
    // let the merchant follow up through the online-orders dashboard.
    const message = error instanceof Error ? error.message : '';
    if (/insufficient on hand/i.test(message)) {
      await prisma.onlineOrder.update({
        where: { id: orderId },
        data: { refundStatus: 'MANUAL_REFUND_NEEDED' },
      });
      console.error('[online-order-commit] Stock unavailable after payment for order', orderId);
      return null;
    }
    throw error;
  }
}
