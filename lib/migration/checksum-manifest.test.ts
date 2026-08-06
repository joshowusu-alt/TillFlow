/** @vitest-environment node */
import { describe, expect, it } from 'vitest';
import { sha256Hex, isSha256Hex } from '@/lib/migration/checksum';
import {
  buildCanonicalManifest,
  manifestChecksum,
  serializeCanonicalManifest,
} from '@/lib/migration/manifest';
import {
  assertApprovalEvidenceIntact,
  nextStatusAfterMaterialChange,
  buildApprovalSnapshot,
} from '@/lib/migration/approval';
import { MigrationPolicyError } from '@/lib/migration/errors';

const baseFiles = [
  { entityType: 'SUPPLIERS' as const, checksum: sha256Hex('suppliers-a') },
  { entityType: 'PRODUCTS' as const, checksum: sha256Hex('products-a') },
  { entityType: 'OPENING_STOCK' as const, checksum: sha256Hex('stock-a') },
];

const baseMappings = [
  { sourceBranchKey: 'HQ', targetStoreId: 'store_1' },
  { sourceBranchKey: 'BRANCH-2', targetStoreId: 'store_2' },
];

function baseManifestInput(overrides: Partial<Parameters<typeof manifestChecksum>[0]> = {}) {
  return {
    contractVersion: '1',
    sourceSystemKey: 'legacy-pos',
    sourceBusinessKey: 'biz-001',
    reportingCurrency: 'GHS',
    packageAsOfDate: '2026-09-01',
    files: baseFiles,
    branchMappings: baseMappings,
    ...overrides,
  };
}

describe('migration checksums', () => {
  it('checksums exact bytes and changes when a byte changes', () => {
    const a = sha256Hex(Buffer.from('name,price\nA,1'));
    const b = sha256Hex(Buffer.from('name,price\nA,1'));
    const c = sha256Hex(Buffer.from('name,price\nA,2'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(isSha256Hex(a)).toBe(true);
  });

  it('produces a deterministic manifest checksum independent of mapping input order', () => {
    const ordered = manifestChecksum(baseManifestInput());
    const shuffled = manifestChecksum(
      baseManifestInput({
        branchMappings: [...baseMappings].reverse(),
        files: [...baseFiles].reverse(),
      }),
    );
    expect(ordered).toBe(shuffled);
    expect(isSha256Hex(ordered)).toBe(true);
  });

  it('changes manifest checksum when a material mapping changes', () => {
    const a = manifestChecksum(baseManifestInput());
    const b = manifestChecksum(
      baseManifestInput({
        branchMappings: [
          { sourceBranchKey: 'HQ', targetStoreId: 'store_1' },
          { sourceBranchKey: 'BRANCH-2', targetStoreId: 'store_OTHER' },
        ],
      }),
    );
    expect(a).not.toBe(b);
  });

  it('serialises with fixed key order (not ordinary object insertion order)', () => {
    const manifest = buildCanonicalManifest(baseManifestInput());
    const json = serializeCanonicalManifest(manifest);
    expect(json.startsWith('{"contractVersion":')).toBe(true);
    expect(json.indexOf('"files"')).toBeLessThan(json.indexOf('"branchMappings"'));
  });

  it('invalidates approval evidence when a file checksum changes', () => {
    const snap = buildApprovalSnapshot(baseManifestInput());
    expect(() =>
      assertApprovalEvidenceIntact({
        evidence: {
          status: 'APPROVED',
          approvedManifestChecksum: snap.manifestChecksum,
          approvedAt: new Date(),
          files: baseFiles.map((f) => ({
            entityType: f.entityType,
            uploadChecksum: f.checksum,
            approvedChecksum: f.checksum,
          })),
        },
        currentManifestChecksum: snap.manifestChecksum,
      }),
    ).not.toThrow();

    const tamperedUpload = sha256Hex('products-TAMPERED');
    expect(() =>
      assertApprovalEvidenceIntact({
        evidence: {
          status: 'APPROVED',
          approvedManifestChecksum: snap.manifestChecksum,
          approvedAt: new Date(),
          files: baseFiles.map((f) =>
            f.entityType === 'PRODUCTS'
              ? {
                  entityType: f.entityType,
                  uploadChecksum: tamperedUpload,
                  approvedChecksum: f.checksum,
                }
              : {
                  entityType: f.entityType,
                  uploadChecksum: f.checksum,
                  approvedChecksum: f.checksum,
                },
          ),
        },
        currentManifestChecksum: snap.manifestChecksum,
      }),
    ).toThrow(MigrationPolicyError);

    const next = nextStatusAfterMaterialChange({
      status: 'APPROVED',
      previousManifestChecksum: snap.manifestChecksum,
      nextManifestChecksum: manifestChecksum(
        baseManifestInput({
          files: baseFiles.map((f) =>
            f.entityType === 'PRODUCTS' ? { ...f, checksum: tamperedUpload } : f,
          ),
        }),
      ),
    });
    expect(next).toBe('APPROVAL_INVALIDATED');
  });
});
