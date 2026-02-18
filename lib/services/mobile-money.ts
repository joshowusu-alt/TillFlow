import { randomUUID } from 'crypto';
import { prisma } from '@/lib/prisma';
import { getMobileMoneyProvider, resolveBusinessProvider } from '@/lib/payments/providers';
import type {
  CheckStatusResult,
  CollectionNetwork,
  CollectionStatus,
  InitiateCollectionResult,
  ReconcileInput,
} from '@/lib/payments/providers/types';

const TERMINAL_STATUSES = new Set<CollectionStatus>(['CONFIRMED', 'FAILED', 'TIMEOUT']);

function isTerminalStatus(status: string): status is CollectionStatus {
  return TERMINAL_STATUSES.has(status as CollectionStatus);
}

function normalizeNetwork(value: string | null | undefined): CollectionNetwork {
  const normalized = (value ?? '').trim().toUpperCase();
  if (normalized === 'MTN' || normalized === 'TELECEL' || normalized === 'AIRTELTIGO') {
    return normalized;
  }
  return 'UNKNOWN';
}

export function normalizeGhanaMsisdn(value: string): string {
  const digits = value.replace(/[^\d+]/g, '');
  if (!digits) return '';
  if (digits.startsWith('+233') && digits.length === 13) return digits.slice(1);
  if (digits.startsWith('233') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `233${digits.slice(1)}`;
  if (digits.startsWith('+')) return digits.slice(1);
  return digits;
}

function stringifyPayload(payload: unknown): string | null {
  if (payload === null || payload === undefined) return null;
  try {
    return JSON.stringify(payload);
  } catch {
    return null;
  }
}

function buildProviderRecord(
  collection: {
    id: string;
    provider: string;
    network: string;
    payerMsisdn: string;
    amountPence: number;
    currency: string;
    idempotencyKey: string;
    providerRequestId: string | null;
    providerTransactionId: string | null;
    providerReference: string | null;
    status: string;
    salesInvoiceId: string | null;
    lastCheckedAt?: Date | null;
  }
) {
  return {
    id: collection.id,
    provider: collection.provider,
    network: collection.network,
    payerMsisdn: collection.payerMsisdn,
    amountPence: collection.amountPence,
    currency: collection.currency,
    idempotencyKey: collection.idempotencyKey,
    providerRequestId: collection.providerRequestId,
    providerTransactionId: collection.providerTransactionId,
    providerReference: collection.providerReference,
    status: collection.status,
    salesInvoiceId: collection.salesInvoiceId,
    lastCheckedAt: collection.lastCheckedAt ?? null,
  };
}

async function applyProviderStatusUpdate(
  collection: {
    id: string;
    status: string;
    providerRequestId: string | null;
    providerTransactionId: string | null;
    providerReference: string | null;
    salesInvoiceId: string | null;
  },
  result: InitiateCollectionResult | CheckStatusResult,
  observedAt: Date,
  notes: string
) {
  const nextStatus = result.status;

  const updateData: {
    status: string;
    providerStatus?: string | null;
    failureReason?: string | null;
    lastCheckedAt: Date;
    confirmedAt?: Date | null;
    providerRequestId?: string | null;
    providerTransactionId?: string | null;
    providerReference?: string | null;
  } = {
    status: nextStatus,
    providerStatus: result.providerStatus ?? null,
    failureReason:
      nextStatus === 'FAILED' || nextStatus === 'TIMEOUT' ? result.failureReason ?? null : null,
    lastCheckedAt: observedAt,
  };

  const providerRequestId =
    'providerRequestId' in result ? result.providerRequestId ?? null : null;

  if (!collection.providerRequestId && providerRequestId) {
    updateData.providerRequestId = providerRequestId;
  }
  if (result.providerTransactionId) {
    updateData.providerTransactionId = result.providerTransactionId;
  }
  if (result.providerReference) {
    updateData.providerReference = result.providerReference;
  }
  if (nextStatus === 'CONFIRMED' && collection.status !== 'CONFIRMED') {
    updateData.confirmedAt = observedAt;
  }
  if (nextStatus !== 'CONFIRMED' && collection.status === 'CONFIRMED') {
    // Keep previous confirmation timestamp immutable once confirmed.
    delete updateData.confirmedAt;
  }

  return prisma.$transaction(async (tx) => {
    const updated = await tx.mobileMoneyCollection.update({
      where: { id: collection.id },
      data: updateData,
    });

    await tx.mobileMoneyStatusLog.create({
      data: {
        collectionId: collection.id,
        status: nextStatus,
        providerStatus: result.providerStatus ?? null,
        notes,
        payloadJson: stringifyPayload(result.rawPayload),
        observedAt,
      },
    });

    if (collection.salesInvoiceId) {
      const nextReference =
        result.providerTransactionId ?? result.providerReference ?? undefined;
      await tx.salesPayment.updateMany({
        where: { collectionId: collection.id },
        data: {
          status: nextStatus,
          ...(nextReference ? { reference: nextReference } : {}),
        },
      });
    }

    return updated;
  });
}

export type InitiateMobileMoneyCollectionInput = {
  businessId: string;
  storeId: string;
  initiatedByUserId?: string | null;
  salesInvoiceId?: string | null;
  amountPence: number;
  currency?: string;
  payerMsisdn: string;
  network: CollectionNetwork;
  idempotencyKey?: string;
  provider?: string;
  payerMessage?: string;
  payeeNote?: string;
  metadata?: Record<string, unknown>;
};

export async function initiateMobileMoneyCollection(input: InitiateMobileMoneyCollectionInput) {
  if (input.amountPence <= 0) {
    throw new Error('Mobile money amount must be greater than 0.');
  }

  const [business, store] = await Promise.all([
    prisma.business.findUnique({
      where: { id: input.businessId },
      select: { id: true, currency: true, momoProvider: true },
    }),
    prisma.store.findFirst({
      where: { id: input.storeId, businessId: input.businessId },
      select: { id: true },
    }),
  ]);

  if (!business) throw new Error('Business not found.');
  if (!store) throw new Error('Store not found.');

  if (input.salesInvoiceId) {
    const invoice = await prisma.salesInvoice.findFirst({
      where: { id: input.salesInvoiceId, businessId: input.businessId, storeId: input.storeId },
      select: { id: true },
    });
    if (!invoice) {
      throw new Error('Sale not found for this mobile money request.');
    }
  }

  const normalizedMsisdn = normalizeGhanaMsisdn(input.payerMsisdn);
  if (!normalizedMsisdn || normalizedMsisdn.length < 10) {
    throw new Error('Enter a valid payer mobile number.');
  }

  const idempotencyKey = (input.idempotencyKey?.trim() || randomUUID()).slice(0, 64);
  const existing = await prisma.mobileMoneyCollection.findUnique({
    where: { idempotencyKey },
  });
  if (existing) {
    if (existing.businessId !== input.businessId) {
      throw new Error('Idempotency key collision across businesses.');
    }
    return existing;
  }

  const provider = resolveBusinessProvider(input.provider ?? business.momoProvider);
  const observedAt = new Date();

  const collection = await prisma.mobileMoneyCollection.create({
    data: {
      businessId: input.businessId,
      storeId: input.storeId,
      salesInvoiceId: input.salesInvoiceId ?? null,
      initiatedByUserId: input.initiatedByUserId ?? null,
      provider: provider.key,
      network: normalizeNetwork(input.network),
      payerMsisdn: normalizedMsisdn,
      amountPence: input.amountPence,
      currency: (input.currency ?? business.currency ?? 'GHS').toUpperCase(),
      idempotencyKey,
      status: 'PENDING',
      providerStatus: 'INITIATED',
      initiatedAt: observedAt,
      lastCheckedAt: observedAt,
      metadataJson: stringifyPayload(input.metadata ?? null),
    },
  });

  await prisma.mobileMoneyStatusLog.create({
    data: {
      collectionId: collection.id,
      status: 'PENDING',
      providerStatus: 'INITIATED',
      notes: 'Collection initiated from checkout',
      observedAt,
    },
  });

  let result: InitiateCollectionResult;
  try {
    result = await provider.initiateCollection({
      businessId: input.businessId,
      collectionId: collection.id,
      externalId: `MM-${collection.id}`,
      idempotencyKey,
      amountPence: collection.amountPence,
      currency: collection.currency,
      payerMsisdn: collection.payerMsisdn,
      network: normalizeNetwork(collection.network),
      payerMessage: input.payerMessage,
      payeeNote: input.payeeNote,
    });
  } catch (error) {
    result = {
      status: 'FAILED',
      providerStatus: 'ERROR',
      failureReason: error instanceof Error ? error.message : 'Provider call failed.',
      rawPayload: null,
    };
  }

  return applyProviderStatusUpdate(collection, result, new Date(), 'Provider initiate response');
}

export async function checkMobileMoneyCollectionStatus(input: {
  businessId: string;
  collectionId: string;
  force?: boolean;
}) {
  const collection = await prisma.mobileMoneyCollection.findFirst({
    where: { id: input.collectionId, businessId: input.businessId },
    select: {
      id: true,
      businessId: true,
      storeId: true,
      provider: true,
      network: true,
      payerMsisdn: true,
      amountPence: true,
      currency: true,
      idempotencyKey: true,
      providerRequestId: true,
      providerTransactionId: true,
      providerReference: true,
      status: true,
      salesInvoiceId: true,
      initiatedByUserId: true,
      failureReason: true,
      confirmedAt: true,
      initiatedAt: true,
      lastCheckedAt: true,
      createdAt: true,
      updatedAt: true,
      metadataJson: true,
      providerStatus: true,
    },
  });

  if (!collection) throw new Error('Mobile money collection not found.');
  if (!input.force && isTerminalStatus(collection.status)) {
    return collection;
  }

  const provider = getMobileMoneyProvider(collection.provider);
  let result: CheckStatusResult;
  try {
    result = await provider.checkStatus({
      businessId: input.businessId,
      collection: buildProviderRecord(collection),
    });
  } catch (error) {
    result = {
      status: 'FAILED',
      providerStatus: 'ERROR',
      failureReason: error instanceof Error ? error.message : 'Provider status check failed.',
      rawPayload: null,
    };
  }

  return applyProviderStatusUpdate(collection, result, new Date(), 'Status polled from provider');
}

export async function handleMobileMoneyWebhook(input: {
  providerKey: string;
  body: unknown;
  headers: Record<string, string>;
}) {
  const provider = getMobileMoneyProvider(input.providerKey);
  const events = await provider.handleWebhook({ body: input.body, headers: input.headers });

  let updatedCount = 0;
  let ignoredCount = 0;

  for (const event of events) {
    const orFilters: Array<Record<string, string>> = [];
    if (event.providerRequestId) {
      orFilters.push({ providerRequestId: event.providerRequestId });
    }
    if (event.providerTransactionId) {
      orFilters.push({ providerTransactionId: event.providerTransactionId });
    }
    if (event.providerReference) {
      orFilters.push({ providerReference: event.providerReference });
    }
    if (event.externalId) {
      orFilters.push({ providerReference: event.externalId });
    }

    if (orFilters.length === 0) {
      ignoredCount += 1;
      continue;
    }

    const collection = await prisma.mobileMoneyCollection.findFirst({
      where: {
        provider: input.providerKey,
        OR: orFilters,
      },
      select: {
        id: true,
        status: true,
        providerRequestId: true,
        providerTransactionId: true,
        providerReference: true,
        salesInvoiceId: true,
      },
    });

    if (!collection) {
      ignoredCount += 1;
      continue;
    }

    await applyProviderStatusUpdate(
      collection,
      {
        status: event.status,
        providerStatus: event.providerStatus,
        providerTransactionId: event.providerTransactionId ?? null,
        providerReference: event.providerReference ?? event.externalId ?? null,
        failureReason: event.failureReason ?? null,
        rawPayload: event.rawPayload,
      },
      new Date(),
      'Webhook callback'
    );
    updatedCount += 1;
  }

  return {
    received: events.length,
    updated: updatedCount,
    ignored: ignoredCount,
  };
}

export async function reconcileMobileMoneyCollections(input: {
  businessId: string;
  statuses?: CollectionStatus[];
  limit?: number;
}) {
  const statuses = input.statuses?.length ? input.statuses : ['PENDING'];
  const collections = await prisma.mobileMoneyCollection.findMany({
    where: {
      businessId: input.businessId,
      status: { in: statuses },
    },
    orderBy: { initiatedAt: 'asc' },
    take: input.limit ?? 100,
    select: {
      id: true,
      provider: true,
      network: true,
      payerMsisdn: true,
      amountPence: true,
      currency: true,
      idempotencyKey: true,
      providerRequestId: true,
      providerTransactionId: true,
      providerReference: true,
      status: true,
      salesInvoiceId: true,
      lastCheckedAt: true,
    },
  });

  const byProvider = new Map<string, typeof collections>();
  for (const collection of collections) {
    const providerCollections = byProvider.get(collection.provider) ?? [];
    providerCollections.push(collection);
    byProvider.set(collection.provider, providerCollections);
  }

  const updates: Array<{ collectionId: string; status: string; providerStatus: string }> = [];

  for (const [providerKey, providerCollections] of byProvider.entries()) {
    const provider = getMobileMoneyProvider(providerKey);
    const reconcileInput: ReconcileInput = {
      businessId: input.businessId,
      collections: providerCollections.map((collection) => buildProviderRecord(collection)),
    };
    const results = await provider.reconcile(reconcileInput);

    for (const result of results) {
      const collection = providerCollections.find((item) => item.id === result.collectionId);
      if (!collection) continue;

      await applyProviderStatusUpdate(
        collection,
        {
          status: result.status,
          providerStatus: result.providerStatus,
          failureReason: result.failureReason ?? null,
          rawPayload: result,
        },
        new Date(),
        'Reconciled from admin screen'
      );
      updates.push({
        collectionId: collection.id,
        status: result.status,
        providerStatus: result.providerStatus,
      });
    }
  }

  return updates;
}

export async function reinitiateMobileMoneyCollection(input: {
  businessId: string;
  collectionId: string;
  initiatedByUserId?: string | null;
  idempotencyKey?: string;
}) {
  const collection = await prisma.mobileMoneyCollection.findFirst({
    where: { id: input.collectionId, businessId: input.businessId },
  });
  if (!collection) throw new Error('Collection not found.');
  if (!['FAILED', 'TIMEOUT'].includes(collection.status)) {
    throw new Error('Collection can only be re-initiated after failure or timeout.');
  }

  return initiateMobileMoneyCollection({
    businessId: collection.businessId,
    storeId: collection.storeId,
    initiatedByUserId: input.initiatedByUserId ?? collection.initiatedByUserId,
    salesInvoiceId: collection.salesInvoiceId,
    amountPence: collection.amountPence,
    currency: collection.currency,
    payerMsisdn: collection.payerMsisdn,
    network: normalizeNetwork(collection.network),
    idempotencyKey: input.idempotencyKey,
    provider: collection.provider,
    metadata: {
      retryOfCollectionId: collection.id,
    },
  });
}
