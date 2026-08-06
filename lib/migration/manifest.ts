/**
 * Canonical package manifest serialisation and checksum.
 *
 * Ordinary object property order is NOT used. Files and branch mappings are
 * sorted deterministically before serialisation.
 */

import { sha256Hex } from '@/lib/migration/checksum';
import { MigrationContractError } from '@/lib/migration/errors';
import {
  MIGRATION_ENTITY_TYPES,
  type CanonicalBranchMapping,
  type CanonicalFileIdentity,
  type CanonicalPackageManifest,
  type MigrationEntityType,
} from '@/lib/migration/types';

const ENTITY_ORDER = new Map<MigrationEntityType, number>(
  MIGRATION_ENTITY_TYPES.map((t, i) => [t, i]),
);

function assertNonEmpty(value: string, field: string): string {
  const v = value.trim();
  if (!v) throw new MigrationContractError(`${field} is required for the package manifest.`);
  return v;
}

function sortFiles(files: CanonicalFileIdentity[]): CanonicalFileIdentity[] {
  return [...files].sort((a, b) => {
    const ao = ENTITY_ORDER.get(a.entityType) ?? 99;
    const bo = ENTITY_ORDER.get(b.entityType) ?? 99;
    if (ao !== bo) return ao - bo;
    return a.checksum.localeCompare(b.checksum);
  });
}

function sortMappings(mappings: CanonicalBranchMapping[]): CanonicalBranchMapping[] {
  return [...mappings].sort((a, b) => {
    const k = a.sourceBranchKey.localeCompare(b.sourceBranchKey);
    if (k !== 0) return k;
    return a.targetStoreId.localeCompare(b.targetStoreId);
  });
}

/**
 * Build a canonical manifest. Callers must supply already-normalised keys and
 * lowercase hex checksums. Filenames are intentionally excluded.
 */
export function buildCanonicalManifest(input: {
  contractVersion: string;
  sourceSystemKey: string;
  sourceBusinessKey: string;
  reportingCurrency: string;
  packageAsOfDate: string;
  files: CanonicalFileIdentity[];
  branchMappings: CanonicalBranchMapping[];
}): CanonicalPackageManifest {
  const files = sortFiles(
    input.files.map((f) => ({
      entityType: f.entityType,
      checksum: assertNonEmpty(f.checksum, 'file checksum').toLowerCase(),
    })),
  );
  const branchMappings = sortMappings(
    input.branchMappings.map((m) => ({
      sourceBranchKey: assertNonEmpty(m.sourceBranchKey, 'sourceBranchKey'),
      targetStoreId: assertNonEmpty(m.targetStoreId, 'targetStoreId'),
    })),
  );

  return {
    contractVersion: assertNonEmpty(input.contractVersion, 'contractVersion'),
    sourceSystemKey: assertNonEmpty(input.sourceSystemKey, 'sourceSystemKey'),
    sourceBusinessKey: assertNonEmpty(input.sourceBusinessKey, 'sourceBusinessKey'),
    reportingCurrency: assertNonEmpty(input.reportingCurrency, 'reportingCurrency').toUpperCase(),
    packageAsOfDate: assertNonEmpty(input.packageAsOfDate, 'packageAsOfDate'),
    files,
    branchMappings,
  };
}

/**
 * Deterministic JSON serialisation:
 * - fixed top-level key order
 * - files ordered by entity type then checksum
 * - branch mappings ordered by sourceBranchKey then targetStoreId
 * - no whitespace variance
 */
export function serializeCanonicalManifest(manifest: CanonicalPackageManifest): string {
  const files = sortFiles(manifest.files).map((f) => ({
    entityType: f.entityType,
    checksum: f.checksum.toLowerCase(),
  }));
  const branchMappings = sortMappings(manifest.branchMappings).map((m) => ({
    sourceBranchKey: m.sourceBranchKey,
    targetStoreId: m.targetStoreId,
  }));

  // Explicit array construction — never Object.keys iteration order.
  const payload = [
    ['contractVersion', manifest.contractVersion],
    ['sourceSystemKey', manifest.sourceSystemKey],
    ['sourceBusinessKey', manifest.sourceBusinessKey],
    ['reportingCurrency', manifest.reportingCurrency.toUpperCase()],
    ['packageAsOfDate', manifest.packageAsOfDate],
    ['files', files],
    ['branchMappings', branchMappings],
  ] as const;

  return JSON.stringify(Object.fromEntries(payload));
}

export function manifestChecksum(input: Parameters<typeof buildCanonicalManifest>[0]): string {
  const manifest = buildCanonicalManifest(input);
  return sha256Hex(serializeCanonicalManifest(manifest));
}

/** True when two manifests produce the same checksum. */
export function manifestsEqual(
  a: Parameters<typeof buildCanonicalManifest>[0],
  b: Parameters<typeof buildCanonicalManifest>[0],
): boolean {
  return manifestChecksum(a) === manifestChecksum(b);
}
