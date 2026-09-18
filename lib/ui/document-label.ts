/**
 * Presentation helpers for W15 human-readable document numbers.
 *
 * Wrap `displayDocumentNumber` — never invent a parallel formatter, and never
 * replace primary keys in URLs, forms, or mutations.
 *
 * Agent 0 / Agents 1–4: import `formatRecordNumber` on supplier, expense,
 * purchase, stocktake, and shift surfaces that still show raw ids.
 */
import {
  displayDocumentNumber,
  type DocumentSequenceName,
} from '@/lib/reliability/walkthrough-contracts';

export type RecordNumberKind = DocumentSequenceName;

/** Tenant-facing number, or prefix + last 6 of id when the sequence is still null. */
export function formatRecordNumber(
  kind: RecordNumberKind,
  number: string | null | undefined,
  id: string,
): string {
  return displayDocumentNumber(kind, number, id);
}
