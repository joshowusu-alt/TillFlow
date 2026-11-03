import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { parseStockFileDetailed } from './parse-stock-file';
import { buildBrandedExcel } from '@/lib/exports/branded-export';

describe('patched SheetJS real import/export compatibility', () => {
  it('preserves Ghana mini-mart stock, decimals and barcode text in a real workbook', async () => {
    const book = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([
      ['name', 'barcode', 'selling_price', 'cost_price', 'quantity', 'base_unit', 'payment_status'],
      ['Fictional Milo 400g', '0012345678901', '25.50', '20.25', '12', 'piece', 'paid'],
    ]), 'Opening stock');
    const bytes: ArrayBuffer = XLSX.write(book, { type: 'array', bookType: 'xlsx' });
    const parsed = await parseStockFileDetailed({ name: 'fictional-stock.xlsx', arrayBuffer: async () => bytes } as File);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]).toMatchObject({ name: 'Fictional Milo 400g', barcode: '0012345678901', quantity: 12, sellingPricePence: 2550, costPricePence: 2025 });
    expect(parsed.hasPaymentStatusColumn).toBe(true);
  });

  it('produces a readable branded financial export with exact amounts', () => {
    const bytes = buildBrandedExcel({
      businessName: 'FICTIONAL — Mallam Mini-Mart', reportTitle: 'Cash reconciliation',
      dateRange: { from: new Date('2026-10-24T00:00:00Z'), to: new Date('2026-10-24T23:59:59Z') },
      currency: 'GHS', columns: [{ header: 'Movement', key: 'movement' }, { header: 'GHS', key: 'amount' }],
      rows: [{ movement: 'Expected physical cash', amount: 600 }],
    });
    const book = XLSX.read(bytes, { type: 'buffer' });
    const rows = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets[book.SheetNames[0]], { header: 1 });
    expect(rows).toContainEqual(['Expected physical cash', 600]);
    expect(rows.some(row => row[0] === 'Powered by TillFlow')).toBe(true);
  });
});
