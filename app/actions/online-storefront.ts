'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { audit } from '@/lib/audit';
import { formAction, withBusinessContext } from '@/lib/action-utils';
import { getFeatures } from '@/lib/features';
import { formOptionalString, formString } from '@/lib/form-helpers';
import { prisma } from '@/lib/prisma';
import { normalizeStorefrontSlug } from '@/lib/services/online-orders';
import { createSalesReturn } from '@/lib/services/returns';

async function requireOnlineStorefrontAccess(businessId: string) {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      id: true,
      name: true,
      mode: true,
      plan: true,
      storeMode: true,
      addonOnlineStorefront: true,
      storefrontSlug: true,
    },
  });

  if (!business) {
    throw new Error('Business not found.');
  }

  const features = getFeatures(
    (business.plan ?? business.mode) as any,
    business.storeMode as any,
    { onlineStorefront: business.addonOnlineStorefront },
  );
  if (!features.onlineStorefront) {
    throw new Error('Online storefront requires Pro or the Growth online-store add-on.');
  }

  return business;
}

export async function updateStorefrontSettingsAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const business = await requireOnlineStorefrontAccess(businessId);
    const storefrontEnabled = formData.get('storefrontEnabled') === 'on';
    const storefrontHeadline = formOptionalString(formData, 'storefrontHeadline');
    const storefrontDescription = formOptionalString(formData, 'storefrontDescription');
    const storefrontPickupInstructions = formOptionalString(formData, 'storefrontPickupInstructions');
    const rawSlug = formOptionalString(formData, 'storefrontSlug') || business.storefrontSlug || business.name;
    const storefrontSlug = normalizeStorefrontSlug(rawSlug);

    if (storefrontEnabled && storefrontSlug.length < 3) {
      throw new Error('Storefront slug must contain at least 3 letters or numbers.');
    }

    if (storefrontEnabled) {
      const existing = await prisma.business.findFirst({
        where: {
          storefrontSlug,
          NOT: { id: businessId },
        },
        select: { id: true },
      });
      if (existing) {
        throw new Error('That storefront link is already in use by another business.');
      }
    }

    await prisma.business.update({
      where: { id: businessId },
      data: {
        storefrontEnabled,
        storefrontSlug: storefrontEnabled ? storefrontSlug : business.storefrontSlug ?? storefrontSlug,
        storefrontHeadline: storefrontHeadline?.trim() ? storefrontHeadline.trim() : null,
        storefrontDescription: storefrontDescription?.trim() ? storefrontDescription.trim() : null,
        storefrontPickupInstructions: storefrontPickupInstructions?.trim()
          ? storefrontPickupInstructions.trim()
          : null,
      },
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'Business',
      entityId: businessId,
      details: {
        source: 'online-storefront-settings',
        storefrontEnabled,
        storefrontSlug,
      },
    }).catch((error) => console.error('[audit]', error));

    revalidatePath('/settings/online-store');
    if (storefrontSlug) {
      revalidatePath(`/shop/${storefrontSlug}`);
    }
    redirect('/settings/online-store?saved=1');
  }, '/settings/online-store');
}

export async function toggleStorefrontProductAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const business = await requireOnlineStorefrontAccess(businessId);
    const productId = formString(formData, 'productId');
    const publish = formString(formData, 'publish') === '1';

    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
      select: { id: true, name: true },
    });
    if (!product) {
      throw new Error('Product not found.');
    }

    await prisma.product.update({
      where: { id: productId },
      data: {
        storefrontPublished: publish,
      },
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_UPDATE',
      entity: 'Product',
      entityId: product.id,
      details: {
        source: 'online-storefront-toggle',
        storefrontPublished: publish,
      },
    }).catch((error) => console.error('[audit]', error));

    revalidatePath('/settings/online-store');
    if (business.storefrontSlug) {
      revalidatePath(`/shop/${business.storefrontSlug}`);
    }
    redirect('/settings/online-store');
  }, '/settings/online-store');
}

export async function updateOnlineOrderStatusAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const business = await requireOnlineStorefrontAccess(businessId);
    const orderId = formString(formData, 'orderId');
    const nextStatus = formString(formData, 'nextStatus');

    const order = await prisma.onlineOrder.findFirst({
      where: { id: orderId, businessId },
      select: {
        id: true,
        status: true,
        paymentStatus: true,
        publicToken: true,
        salesInvoiceId: true,
        totalPence: true,
        refundStatus: true,
      },
    });
    if (!order) {
      throw new Error('Online order not found.');
    }

    const data: {
      status: string;
      fulfillmentStatus: string;
      fulfilledAt?: Date | null;
      refundStatus?: string | null;
      refundedAt?: Date | null;
    } = {
      status: order.status,
      fulfillmentStatus: 'PENDING',
    };

    switch (nextStatus) {
      case 'PROCESSING':
        if (order.paymentStatus !== 'PAID') {
          throw new Error('Only paid orders can move into processing.');
        }
        data.status = 'PROCESSING';
        data.fulfillmentStatus = 'PROCESSING';
        data.fulfilledAt = null;
        break;
      case 'READY_FOR_PICKUP':
        if (order.paymentStatus !== 'PAID') {
          throw new Error('Only paid orders can be marked ready for pickup.');
        }
        data.status = 'READY_FOR_PICKUP';
        data.fulfillmentStatus = 'READY';
        data.fulfilledAt = null;
        break;
      case 'COMPLETED':
        if (order.paymentStatus !== 'PAID') {
          throw new Error('Only paid orders can be completed.');
        }
        data.status = 'COMPLETED';
        data.fulfillmentStatus = 'COMPLETED';
        data.fulfilledAt = new Date();
        break;
      case 'CANCELLED': {
        // For paid orders that already have a SalesInvoice, reverse the sale
        // (restoring inventory + posting the corrective journal entry) and flag
        // the customer's MoMo refund for manual follow-up.
        if (order.paymentStatus === 'PAID' && order.salesInvoiceId && !order.refundStatus) {
          await createSalesReturn({
            businessId,
            salesInvoiceId: order.salesInvoiceId,
            userId: user.id,
            type: 'RETURN',
            reasonCode: 'CUSTOMER_CANCELLED',
            refundMethod: 'MOBILE_MONEY',
            refundAmountPence: order.totalPence,
            reason: 'Online order cancelled by merchant',
            managerApprovedByUserId: user.id,
            managerApprovalMode: 'INLINE',
          });
        }
        data.status = 'CANCELLED';
        data.fulfillmentStatus = 'CANCELLED';
        data.fulfilledAt = null;
        if (order.paymentStatus === 'PAID' && !order.refundStatus) {
          data.refundStatus = 'MANUAL_REFUND_NEEDED';
          data.refundedAt = new Date();
        }
        break;
      }
      default:
        throw new Error('Unsupported online order status change.');
    }

    await prisma.onlineOrder.update({
      where: { id: order.id },
      data,
    });

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'SETTINGS_UPDATE',
      entity: 'OnlineOrder',
      entityId: order.id,
      details: {
        source: 'online-order-status',
        nextStatus: data.status,
      },
    }).catch((error) => console.error('[audit]', error));

    revalidatePath('/online-orders');
    if (business.storefrontSlug) {
      revalidatePath(`/shop/${business.storefrontSlug}/orders/${order.id}`);
    }
    redirect('/online-orders');
  }, '/online-orders');
}
