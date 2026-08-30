import { createHash } from 'crypto';
import { hashCanonicalParts } from '@/lib/services/money-idempotency';

export const IMPORT_CHUNK_OPERATIONS = [
  'opening-equity',
  'opening-credit',
  'purchase-paid',
  'purchase-unpaid',
] as const;

export type ImportChunkOperation = (typeof IMPORT_CHUNK_OPERATIONS)[number];

const MAX_KEY_LENGTH = 128;

function sanitizeKeyPart(raw: string): string {
  const cleaned = (raw ?? '').trim().replace(/[\u0000-\u001f]/g, '');
  return cleaned || 'none';
}

/**
 * Deterministic MoneyIdempotency key for one import chunk.
 * Format: IMPORT:{businessId}:{importRunId}:{mode}:{op}:{supplierKey}:{chunkIndex}
 * If the assembled key exceeds 128 chars (normalizeMoneyIdempotencyKey max),
 * the tail after businessId is hashed so the key stays in bounds while still
 * embedding businessId.
 */
export function buildImportChunkKey(input: {
  businessId: string;
  importRunId: string;
  mode: string;
  operation: ImportChunkOperation;
  supplierKey: string;
  chunkIndex: number;
}): string {
  const businessId = sanitizeKeyPart(input.businessId);
  const importRunId = sanitizeKeyPart(input.importRunId);
  const mode = sanitizeKeyPart(input.mode);
  const supplierKey = sanitizeKeyPart(input.supplierKey);
  const chunkIndex = String(input.chunkIndex);

  const prefix = `IMPORT:${businessId}:`;
  const tail = `${importRunId}:${mode}:${input.operation}:${supplierKey}:${chunkIndex}`;
  const full = `${prefix}${tail}`;
  if (full.length <= MAX_KEY_LENGTH) {
    return full;
  }

  const hashedTail = createHash('sha256').update(tail, 'utf8').digest('hex');
  const hashed = `${prefix}${hashedTail}`;
  return hashed.length <= MAX_KEY_LENGTH ? hashed : hashed.slice(0, MAX_KEY_LENGTH);
}

/** Payload hash for an import chunk. Covers lines, amounts, method, and store. */
export function buildImportChunkPayloadHash(parts: {
  businessId: string;
  storeId: string;
  importRunId: string;
  mode: string;
  operation: ImportChunkOperation | string;
  supplierKey: string;
  chunkIndex: number;
  lines: Array<{ productId: string; unitId: string; qtyInUnit: number; unitCostPence?: number | null }>;
  amountPence: number;
  method?: string | null;
}): string {
  const lineCanon = parts.lines
    .map((l) => `${l.productId}:${l.unitId}:${l.qtyInUnit}:${l.unitCostPence ?? ''}`)
    .join('|');
  return hashCanonicalParts([
    parts.businessId,
    'IMPORT_CHUNK',
    parts.storeId,
    parts.importRunId,
    parts.mode,
    parts.operation,
    parts.supplierKey,
    String(parts.chunkIndex),
    lineCanon,
    String(parts.amountPence),
    parts.method ?? '',
  ]);
}
