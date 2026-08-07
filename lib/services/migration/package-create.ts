/**
 * Slice 2A — create Phase 1 migration package in DRAFT.
 */

import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';
import {
  MIGRATION_CONTRACT_VERSION,
  parseAsOfDate,
  parseReportingCurrency,
} from '@/lib/migration/contract';
import { computePackageExpiresAt } from '@/lib/migration/limits';
import {
  normaliseSourceBusinessKey,
  normaliseSourceSystemKey,
} from '@/lib/migration/source-system-key';
import { MigrationContractError } from '@/lib/migration/errors';
import { MigrationServiceError } from '@/lib/services/migration/errors';
import {
  assertMigrationActor,
  writeMigrationAudit,
  type ActorContext,
  type DbClient,
} from '@/lib/services/migration/preapproval';

function newPackageId(): string {
  return `c${randomBytes(12).toString('hex')}`;
}

function asServiceContractError(error: unknown): never {
  if (error instanceof MigrationContractError) {
    throw new MigrationServiceError('CONTRACT', error.message);
  }
  throw error;
}

export type CreateMigrationPackageInput = {
  clientPackageKey?: string | null;
  sourceSystemKey: string;
  sourceBusinessKey: string;
  reportingCurrency: string;
  packageAsOfDate: string;
  /** Ignored if supplied — status is always DRAFT. */
  status?: string;
  businessId?: string;
  createdByUserId?: string;
};

export type CreateMigrationPackageResult = {
  id: string;
  businessId: string;
  status: string;
  version: number;
  clientPackageKey: string | null;
  lineageRootId: string;
  expiresAt: Date;
  createdAt: Date;
  replayed: boolean;
};

type ImmutableCreateFields = {
  contractVersion: string;
  sourceSystemKey: string;
  sourceBusinessKey: string;
  reportingCurrency: string;
  packageAsOfDate: string;
};

function normaliseCreateFields(input: CreateMigrationPackageInput): ImmutableCreateFields {
  try {
    return {
      contractVersion: MIGRATION_CONTRACT_VERSION,
      sourceSystemKey: normaliseSourceSystemKey(input.sourceSystemKey),
      sourceBusinessKey: normaliseSourceBusinessKey(input.sourceBusinessKey),
      reportingCurrency: parseReportingCurrency(input.reportingCurrency),
      packageAsOfDate: parseAsOfDate(input.packageAsOfDate),
    };
  } catch (error) {
    asServiceContractError(error);
  }
}

function sameImmutable(
  existing: ImmutableCreateFields,
  next: ImmutableCreateFields,
): boolean {
  return (
    existing.contractVersion === next.contractVersion &&
    existing.sourceSystemKey === next.sourceSystemKey &&
    existing.sourceBusinessKey === next.sourceBusinessKey &&
    existing.reportingCurrency === next.reportingCurrency &&
    existing.packageAsOfDate === next.packageAsOfDate
  );
}

function clientKey(raw: string | null | undefined): string | null {
  if (raw == null) return null;
  const trimmed = String(raw).trim();
  if (!trimmed) return null;
  if (trimmed.length > 128) {
    throw new MigrationServiceError(
      'CONTRACT',
      'clientPackageKey must be at most 128 characters.',
    );
  }
  return trimmed;
}

export async function createMigrationPackage(
  actorInput: {
    userId: string;
    userName?: string | null;
    userRole: string;
    businessId: string;
  },
  input: CreateMigrationPackageInput,
  db: DbClient = prisma,
): Promise<CreateMigrationPackageResult> {
  const actor: ActorContext = {
    ...assertMigrationActor(actorInput),
    userName: actorInput.userName?.trim() || actorInput.userId,
  };

  // Ignore any client-supplied tenant/actor/status overrides.
  const fields = normaliseCreateFields(input);
  const key = clientKey(input.clientPackageKey);

  if (key) {
    const existing = await db.migrationPackage.findFirst({
      where: { businessId: actor.businessId, clientPackageKey: key },
    });
    if (existing) {
      const existingFields: ImmutableCreateFields = {
        contractVersion: existing.contractVersion,
        sourceSystemKey: existing.sourceSystemKey,
        sourceBusinessKey: existing.sourceBusinessKey,
        reportingCurrency: existing.reportingCurrency,
        packageAsOfDate: existing.packageAsOfDate,
      };
      if (!sameImmutable(existingFields, fields)) {
        throw new MigrationServiceError(
          'CONFLICT',
          'clientPackageKey already exists with different package identity.',
          409,
        );
      }
      return {
        id: existing.id,
        businessId: existing.businessId,
        status: existing.status,
        version: existing.version,
        clientPackageKey: existing.clientPackageKey,
        lineageRootId: existing.lineageRootId,
        expiresAt: existing.expiresAt,
        createdAt: existing.createdAt,
        replayed: true,
      };
    }
  }

  try {
    return await db.$transaction(async (tx) => {
      const createdAt = new Date();
      const expiresAt = computePackageExpiresAt(createdAt);
      const id = newPackageId();
      const created = await tx.migrationPackage.create({
        data: {
          id,
          businessId: actor.businessId,
          contractVersion: fields.contractVersion,
          sourceSystemKey: fields.sourceSystemKey,
          sourceBusinessKey: fields.sourceBusinessKey,
          reportingCurrency: fields.reportingCurrency,
          packageAsOfDate: fields.packageAsOfDate,
          status: 'DRAFT',
          reconciliationStatus: 'NOT_STARTED',
          clientPackageKey: key,
          expiresAt,
          createdAt,
          createdByUserId: actor.userId,
          lineageRootId: id,
        },
      });

      await writeMigrationAudit(tx, {
        businessId: actor.businessId,
        userId: actor.userId,
        userName: actor.userName,
        userRole: actor.userRole,
        action: 'MIGRATION_PACKAGE_CREATE',
        entityId: created.id,
        details: {
          clientPackageKey: key,
          sourceSystemKey: fields.sourceSystemKey,
          sourceBusinessKey: fields.sourceBusinessKey,
          reportingCurrency: fields.reportingCurrency,
          packageAsOfDate: fields.packageAsOfDate,
          expiresAt: expiresAt.toISOString(),
        },
      });

      return {
        id: created.id,
        businessId: created.businessId,
        status: created.status,
        version: created.version,
        clientPackageKey: created.clientPackageKey,
        lineageRootId: created.lineageRootId,
        expiresAt: created.expiresAt,
        createdAt: created.createdAt,
        replayed: false,
      };
    });
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code === 'P2002' &&
      key
    ) {
      const existing = await db.migrationPackage.findFirst({
        where: { businessId: actor.businessId, clientPackageKey: key },
      });
      if (existing) {
        const existingFields: ImmutableCreateFields = {
          contractVersion: existing.contractVersion,
          sourceSystemKey: existing.sourceSystemKey,
          sourceBusinessKey: existing.sourceBusinessKey,
          reportingCurrency: existing.reportingCurrency,
          packageAsOfDate: existing.packageAsOfDate,
        };
        if (!sameImmutable(existingFields, fields)) {
          throw new MigrationServiceError(
            'CONFLICT',
            'clientPackageKey already exists with different package identity.',
            409,
          );
        }
        return {
          id: existing.id,
          businessId: existing.businessId,
          status: existing.status,
          version: existing.version,
          clientPackageKey: existing.clientPackageKey,
          lineageRootId: existing.lineageRootId,
          expiresAt: existing.expiresAt,
          createdAt: existing.createdAt,
          replayed: true,
        };
      }
    }
    if (error instanceof MigrationServiceError) throw error;
    throw error;
  }
}
