import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import type { Role } from '@/lib/auth';
import { isUnverifiedLegacyStatus } from '@/lib/reports/money-received/compute';
import { CONFIRMED_PAYMENT_STATUS } from '@/lib/reports/money-received/types';
import { MOMO_CONFIRMATION_STATUS } from '@/lib/reports/momo-confirmation/types';

const CONFIRM_ROLES: readonly Role[] = ['OWNER', 'MANAGER'];
const BLOCKED_PARENT_SALE_STATUSES = new Set(['RETURNED', 'VOID']);
const MOBILE_MONEY_METHOD = 'MOBILE_MONEY';
const PROVIDER_CONFIRMED_COLLECTION = 'CONFIRMED';

export const MOMO_CONFIRM_ERROR = {
  FORBIDDEN: 'You do not have permission to confirm Mobile Money payments.',
  NOT_FOUND: 'Payment not found.',
  TENANT: 'That payment belongs to another business.',
  BRANCH: 'You cannot confirm a payment for a branch you do not have access to.',
  METHOD: 'Only Mobile Money payments can be confirmed here.',
  STATUS: 'This payment can no longer be confirmed.',
  PARENT_RETURNED_VOID: 'This sale was returned or voided. Do not confirm this payment.',
  PROVIDER_CONFIRMED: 'This payment is linked to a provider-confirmed collection and cannot be confirmed manually.',
  REFERENCE_REQUIRED: 'Enter the MoMo transaction id or statement reference you checked.',
  NOTE_REQUIRED: 'Enter a note explaining how you confirmed this payment arrived.',
} as const;

export class MomoConfirmError extends UserError {
  readonly code: keyof typeof MOMO_CONFIRM_ERROR;
  constructor(code: keyof typeof MOMO_CONFIRM_ERROR, message = MOMO_CONFIRM_ERROR[code]) {
    super(message);
    this.code = code;
    this.name = 'MomoConfirmError';
  }
}

export type ConfirmMomoPaymentActor = {
  userId: string;
  userName: string | null;
  userRole: string;
  businessId: string;
};

export type ConfirmMomoPaymentInput = {
  paymentId: string;
  reference: string;
  note: string;
  actor: ConfirmMomoPaymentActor;
  authorisedStoreIds: string[];
  ipAddress?: string | null;
};

export type ConfirmMomoPaymentResult = {
  paymentId: string;
  status: typeof CONFIRMED_PAYMENT_STATUS;
  alreadyConfirmed: boolean;
  receivedAt: Date;
  salesInvoiceId: string;
  reference: string | null;
};

const paymentSelect = {
  id: true,
  status: true,
  method: true,
  amountPence: true,
  receivedAt: true,
  reference: true,
  receiptOrigin: true,
  collectionId: true,
  branchId: true,
  network: true,
  provider: true,
  salesInvoiceId: true,
  salesInvoice: {
    select: {
      id: true,
      businessId: true,
      storeId: true,
      paymentStatus: true,
      transactionNumber: true,
    },
  },
  collection: {
    select: {
      id: true,
      status: true,
    },
  },
} as const;

function normalizeEvidence(value: string, maxLen: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

export function isManualMomoConfirmableStatus(status: string | null | undefined): boolean {
  if (status === MOMO_CONFIRMATION_STATUS) return true;
  return isUnverifiedLegacyStatus(status ?? null);
}

function assertCanConfirm(actorRole: string) {
  if (!CONFIRM_ROLES.includes(actorRole as Role)) {
    throw new MomoConfirmError('FORBIDDEN');
  }
}

function assertEvidence(reference: string, note: string): { reference: string; note: string } {
  const trimmedRef = normalizeEvidence(reference, 128);
  const trimmedNote = normalizeEvidence(note, 500);
  if (trimmedRef.length < 2) {
    throw new MomoConfirmError('REFERENCE_REQUIRED');
  }
  if (trimmedNote.length < 3) {
    throw new MomoConfirmError('NOTE_REQUIRED');
  }
  return { reference: trimmedRef, note: trimmedNote };
}

function toJson(value: unknown): string {
  return JSON.stringify(value);
}

/**
 * Confirm a stuck manual MoMo payment (PENDING_MANUAL / unclassified).
 * Reporting-gate only: status → CONFIRMED, optional empty-reference fill, transactional AuditLog.
 * Does not change receivedAt, receiptOrigin, invoice status, GL, or cash drawer.
 */
export async function confirmMomoPayment(
  input: ConfirmMomoPaymentInput,
): Promise<ConfirmMomoPaymentResult> {
  assertCanConfirm(input.actor.userRole);

  const paymentId = input.paymentId?.trim();
  if (!paymentId) {
    throw new MomoConfirmError('NOT_FOUND');
  }

  const evidence = assertEvidence(input.reference, input.note);

  return prisma.$transaction(async (tx) => {
    const payment = await tx.salesPayment.findUnique({
      where: { id: paymentId },
      select: paymentSelect,
    });

    if (!payment) {
      throw new MomoConfirmError('NOT_FOUND');
    }

    if (payment.salesInvoice.businessId !== input.actor.businessId) {
      throw new MomoConfirmError('TENANT');
    }

    if (!input.authorisedStoreIds.includes(payment.salesInvoice.storeId)) {
      throw new MomoConfirmError('BRANCH');
    }

    if (payment.method !== MOBILE_MONEY_METHOD) {
      throw new MomoConfirmError('METHOD');
    }

    if (payment.status === CONFIRMED_PAYMENT_STATUS) {
      return {
        paymentId: payment.id,
        status: CONFIRMED_PAYMENT_STATUS,
        alreadyConfirmed: true,
        receivedAt: payment.receivedAt,
        salesInvoiceId: payment.salesInvoiceId,
        reference: payment.reference,
      };
    }

    if (!isManualMomoConfirmableStatus(payment.status)) {
      throw new MomoConfirmError('STATUS');
    }

    if (BLOCKED_PARENT_SALE_STATUSES.has(payment.salesInvoice.paymentStatus)) {
      throw new MomoConfirmError('PARENT_RETURNED_VOID');
    }

    if (payment.collection?.status === PROVIDER_CONFIRMED_COLLECTION) {
      throw new MomoConfirmError('PROVIDER_CONFIRMED');
    }

    const shouldFillReference = !payment.reference?.trim();
    const nextReference = shouldFillReference ? evidence.reference : payment.reference;
    const confirmedAt = new Date();

    const updated = await tx.salesPayment.updateMany({
      where: { id: payment.id, status: payment.status },
      data: {
        status: CONFIRMED_PAYMENT_STATUS,
        ...(shouldFillReference ? { reference: evidence.reference } : {}),
      },
    });

    if (updated.count === 0) {
      const raced = await tx.salesPayment.findUnique({
        where: { id: payment.id },
        select: { status: true, receivedAt: true, reference: true, salesInvoiceId: true },
      });
      if (raced?.status === CONFIRMED_PAYMENT_STATUS) {
        return {
          paymentId: payment.id,
          status: CONFIRMED_PAYMENT_STATUS,
          alreadyConfirmed: true,
          receivedAt: raced.receivedAt,
          salesInvoiceId: raced.salesInvoiceId,
          reference: raced.reference,
        };
      }
      throw new MomoConfirmError('STATUS');
    }

    await tx.auditLog.create({
      data: {
        businessId: input.actor.businessId,
        userId: input.actor.userId,
        userName: input.actor.userName ?? 'Unknown',
        userRole: input.actor.userRole,
        action: 'MOMO_PAYMENT_CONFIRM',
        actionType: 'PAYMENT',
        entity: 'SalesPayment',
        entityType: 'SALES_PAYMENT',
        entityId: payment.id,
        beforeState: toJson({
          status: payment.status,
          reference: payment.reference,
          receivedAt: payment.receivedAt.toISOString(),
        }),
        afterState: toJson({
          status: CONFIRMED_PAYMENT_STATUS,
          reference: nextReference,
          receivedAt: payment.receivedAt.toISOString(),
        }),
        reason: evidence.note,
        details: toJson({
          paymentId: payment.id,
          salesInvoiceId: payment.salesInvoiceId,
          transactionNumber: payment.salesInvoice.transactionNumber,
          amountPence: payment.amountPence,
          method: payment.method,
          providerReference: evidence.reference,
          note: evidence.note,
          confirmedByUserId: input.actor.userId,
          confirmedByName: input.actor.userName,
          confirmedByRole: input.actor.userRole,
          confirmedAt: confirmedAt.toISOString(),
          originalReceivedAt: payment.receivedAt.toISOString(),
          saleStatus: payment.salesInvoice.paymentStatus,
          receiptOrigin: payment.receiptOrigin,
          collectionId: payment.collectionId,
        }),
        branchId: payment.branchId ?? payment.salesInvoice.storeId,
        ipAddress: input.ipAddress ?? null,
      },
    });

    return {
      paymentId: payment.id,
      status: CONFIRMED_PAYMENT_STATUS,
      alreadyConfirmed: false,
      receivedAt: payment.receivedAt,
      salesInvoiceId: payment.salesInvoiceId,
      reference: nextReference,
    };
  });
}
