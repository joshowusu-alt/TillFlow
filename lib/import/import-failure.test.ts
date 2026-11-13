import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import { UserError } from '@/lib/action-utils';
import {
  IMPORT_STOCK_INCOMPLETE_MESSAGE,
  IMPORT_STOCK_TIMEOUT_MESSAGE,
  userFacingImportFailure,
} from '@/lib/import/import-failure';

describe('userFacingImportFailure', () => {
  it('turns a Prisma interactive-transaction timeout into a retry hint', () => {
    const error = new Error(
      'Invalid `prisma.$transaction()` invocation:\n\nTransaction API error: A query cannot be executed on an expired transaction. The timeout for this transaction was 5000 ms, however 5400 ms passed since the start of the transaction.',
    );
    const message = userFacingImportFailure(error);
    expect(message).toBe(IMPORT_STOCK_TIMEOUT_MESSAGE);
    expect(message).not.toMatch(/prisma|P\d{4}|5000/);
  });

  it('hides other database internals and keeps a plain validation message', () => {
    expect(userFacingImportFailure(new Error('Raw query failed. relation "InventoryBalance" does not exist'))).toBe(
      IMPORT_STOCK_INCOMPLETE_MESSAGE,
    );
    expect(userFacingImportFailure(new Error('Multiple products share the name THE CHRISTIAN. Supply the exact barcode or SKU.'))).toBe(
      'Multiple products share the name THE CHRISTIAN. Supply the exact barcode or SKU.',
    );
    expect(userFacingImportFailure(new UserError('A named supplier is required.'))).toBe(
      'A named supplier is required.',
    );
  });
});