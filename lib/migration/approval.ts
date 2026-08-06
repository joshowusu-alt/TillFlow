/**
 * Approval integrity and invalidation rules (pure).
 *
 * Any material file, metadata, or mapping change after approval invalidates
 * approval. P0 defines the rules; upload/import endpoints are not implemented.
 */

import { MigrationPolicyError } from '@/lib/migration/errors';
import {
  assertCanInvalidateApproval,
  assertPackageTransition,
  isExpiryEligibleStatus,
} from '@/lib/migration/lifecycle';
import { manifestChecksum } from '@/lib/migration/manifest';
import type { CanonicalPackageManifest, MigrationPackageStatus } from '@/lib/migration/types';

export type ApprovalEvidence = {
  status: MigrationPackageStatus;
  approvedManifestChecksum: string | null;
  approvedAt: Date | null;
  files: Array<{
    entityType: string;
    uploadChecksum: string;
    approvedChecksum: string | null;
  }>;
};

export function assertApprovalEvidenceIntact(input: {
  evidence: ApprovalEvidence;
  currentManifestChecksum: string;
}): void {
  const { evidence } = input;
  if (evidence.status !== 'APPROVED' && evidence.status !== 'IMPORTING') {
    throw new MigrationPolicyError(
      `Package status ${evidence.status} is not approved for import.`,
      'NOT_APPROVED',
    );
  }
  if (!evidence.approvedManifestChecksum) {
    throw new MigrationPolicyError('Approved manifest checksum is missing.', 'MISSING_APPROVED_MANIFEST');
  }
  if (evidence.approvedManifestChecksum !== input.currentManifestChecksum) {
    throw new MigrationPolicyError(
      'Package content no longer matches the approved manifest checksum.',
      'APPROVED_MANIFEST_MISMATCH',
    );
  }
  for (const f of evidence.files) {
    if (!f.approvedChecksum) {
      throw new MigrationPolicyError(
        `Approved checksum missing for ${f.entityType}.`,
        'MISSING_APPROVED_FILE_CHECKSUM',
      );
    }
    if (f.approvedChecksum !== f.uploadChecksum) {
      throw new MigrationPolicyError(
        `File ${f.entityType} changed after approval.`,
        'APPROVED_FILE_TAMPERED',
      );
    }
  }
}

/**
 * Decide whether a candidate change requires approval invalidation.
 * Returns the next status when invalidation is required.
 */
export function nextStatusAfterMaterialChange(input: {
  status: MigrationPackageStatus;
  previousManifestChecksum: string | null;
  nextManifestChecksum: string;
}): MigrationPackageStatus | null {
  if (input.status !== 'APPROVED') return null;
  if (
    input.previousManifestChecksum &&
    input.previousManifestChecksum === input.nextManifestChecksum
  ) {
    return null;
  }
  assertCanInvalidateApproval(input.status);
  return 'APPROVAL_INVALIDATED';
}

export function buildApprovalSnapshot(manifestInput: Parameters<typeof manifestChecksum>[0]): {
  manifestChecksum: string;
  fileApprovedChecksums: Array<{ entityType: string; checksum: string }>;
} {
  return {
    manifestChecksum: manifestChecksum(manifestInput),
    fileApprovedChecksums: [...manifestInput.files]
      .sort((a, b) => a.entityType.localeCompare(b.entityType))
      .map((f) => ({ entityType: f.entityType, checksum: f.checksum })),
  };
}

export function assertCanApprovePackage(input: {
  status: MigrationPackageStatus;
  manifest: CanonicalPackageManifest;
  expiresAt: Date;
  now?: Date;
}): void {
  assertPackageTransition(input.status, 'APPROVED');
  const now = input.now ?? new Date();
  if (isExpiryEligibleStatus(input.status) && now.getTime() >= input.expiresAt.getTime()) {
    throw new MigrationPolicyError('Package has expired and cannot be approved.', 'PACKAGE_EXPIRED');
  }
  if (input.manifest.files.length !== 3) {
    throw new MigrationPolicyError('Approval requires exactly three Phase 1 files.', 'INCOMPLETE_PACKAGE');
  }
  if (input.manifest.branchMappings.length === 0) {
    throw new MigrationPolicyError(
      'Approval requires at least one resolved branch mapping.',
      'UNRESOLVED_BRANCH_MAPPING',
    );
  }
}
