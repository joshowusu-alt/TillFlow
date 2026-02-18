'use server';

import { randomUUID } from 'crypto';
import {
  checkMobileMoneyCollectionStatus,
  initiateMobileMoneyCollection,
  reconcileMobileMoneyCollections,
  reinitiateMobileMoneyCollection,
} from '@/lib/services/mobile-money';
import { withBusinessContext, safeAction, formAction, ok, type ActionResult } from '@/lib/action-utils';
import type { CollectionNetwork } from '@/lib/payments/providers/types';
import { revalidatePath } from 'next/cache';
import { formString } from '@/lib/form-helpers';
import { audit } from '@/lib/audit';

export type InitiateMomoPayload = {
  storeId: string;
  amountPence: number;
  payerMsisdn: string;
  network: CollectionNetwork;
  idempotencyKey?: string;
};

export async function initiateMomoCollectionAction(
  payload: InitiateMomoPayload
): Promise<
  ActionResult<{
    collectionId: string;
    status: string;
    providerStatus: string | null;
    providerRequestId: string | null;
    providerTransactionId: string | null;
    providerReference: string | null;
    failureReason: string | null;
  }>
> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();
    const collection = await initiateMobileMoneyCollection({
      businessId,
      storeId: payload.storeId,
      initiatedByUserId: user.id,
      amountPence: payload.amountPence,
      payerMsisdn: payload.payerMsisdn,
      network: payload.network,
      idempotencyKey: payload.idempotencyKey ?? randomUUID(),
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'MOMO_COLLECTION_INITIATE',
      entity: 'MobileMoneyCollection',
      entityId: collection.id,
      details: {
        amountPence: collection.amountPence,
        network: collection.network,
        status: collection.status,
      },
    });

    return ok({
      collectionId: collection.id,
      status: collection.status,
      providerStatus: collection.providerStatus ?? null,
      providerRequestId: collection.providerRequestId ?? null,
      providerTransactionId: collection.providerTransactionId ?? null,
      providerReference: collection.providerReference ?? null,
      failureReason: collection.failureReason ?? null,
    });
  });
}

export async function checkMomoCollectionStatusAction(
  collectionId: string
): Promise<
  ActionResult<{
    collectionId: string;
    status: string;
    providerStatus: string | null;
    providerTransactionId: string | null;
    providerReference: string | null;
    failureReason: string | null;
  }>
> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext();
    const collection = await checkMobileMoneyCollectionStatus({
      businessId,
      collectionId,
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'MOMO_COLLECTION_STATUS',
      entity: 'MobileMoneyCollection',
      entityId: collection.id,
      details: {
        status: collection.status,
        providerStatus: collection.providerStatus,
      },
    });

    return ok({
      collectionId: collection.id,
      status: collection.status,
      providerStatus: collection.providerStatus ?? null,
      providerTransactionId: collection.providerTransactionId ?? null,
      providerReference: collection.providerReference ?? null,
      failureReason: collection.failureReason ?? null,
    });
  });
}

export async function recheckMomoCollectionAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const collectionId = formString(formData, 'collectionId');
    await checkMobileMoneyCollectionStatus({ businessId, collectionId, force: true });
    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'MOMO_COLLECTION_STATUS',
      entity: 'MobileMoneyCollection',
      entityId: collectionId,
      details: { source: 'reconciliation-screen' },
    });
    revalidatePath('/payments/reconciliation');
    return ok();
  }, '/payments/reconciliation');
}

export async function reinitiateMomoCollectionAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const collectionId = formString(formData, 'collectionId');
    const next = await reinitiateMobileMoneyCollection({
      businessId,
      collectionId,
      initiatedByUserId: user.id,
    });
    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'MOMO_COLLECTION_REINITIATE',
      entity: 'MobileMoneyCollection',
      entityId: next.id,
      details: { retryOfCollectionId: collectionId, status: next.status },
    });
    revalidatePath('/payments/reconciliation');
    return ok();
  }, '/payments/reconciliation');
}

export async function reconcilePendingMomoCollectionsAction(_formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const updates = await reconcileMobileMoneyCollections({ businessId, statuses: ['PENDING'] });
    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'MOMO_COLLECTION_RECONCILE',
      entity: 'MobileMoneyCollection',
      details: { updatedCount: updates.length },
    });
    revalidatePath('/payments/reconciliation');
    return ok();
  }, '/payments/reconciliation');
}
