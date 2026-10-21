import { beforeEach, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
const mocks = vi.hoisted(() => ({ guard: vi.fn(), report: vi.fn() }));
vi.mock('@/lib/entitlements/live-report', () => ({ guardLiveReport: mocks.guard }));
vi.mock('@/lib/reports/supplier-sales', () => ({ getSupplierSalesReport: mocks.report }));
import { GET } from './route';
const request = () => new Request('https://example.test/reports/sales-by-supplier/export?from=2026-10-01&to=2026-10-20');
beforeEach(() => {
  vi.clearAllMocks();
  mocks.guard.mockResolvedValue({ ok: true, business: { id: 'business', currency: 'GHS', timezone: 'Africa/Accra' }, branch: { kind: 'stores', storeIds: ['store'] }, decision: { appliedRange: { fromLocalDate: '2026-10-01', toLocalDate: '2026-10-20' } } });
  mocks.report.mockResolvedValue({ totalQtyBase: 2, totalRevenuePence: 589000, unallocatedSalesDifferencePence: 0, rows: [{ supplierName: 'Bishop’s books', products: [{ productName: 'Faith, "Volume 1"', sku: 'B-1', qtyBase: 2, revenuePence: 589000, salesCount: 1, netRevenuePence: 589000, costPence: null, profitPence: null, marginPercent: null }] }] });
});
it('exports Excel-readable UTF-8 names and numeric Revenue without currency symbols', async () => {
  const response = await GET(request());
  expect(response.headers.get('Content-Type')).toBe('text/csv; charset=utf-8');
  const bytes = new Uint8Array(await response.arrayBuffer());
  expect(Array.from(bytes.slice(0, 3))).toEqual([239, 187, 191]);
  const book = XLSX.read(bytes, { type: 'array' });
  const rows = XLSX.utils.sheet_to_json<(string | number)[]>(book.Sheets[book.SheetNames[0]], { header: 1, defval: '' });
  expect(rows[0][2]).toBe('Currency: GHS');
  expect(rows[4]).toEqual(['Bishop’s books', 'Faith, "Volume 1"', 'B-1', 2, 5890, 1, 5890, 'Incomplete costs', '', '']);
  expect(rows.at(-1)?.[4]).toBe(5890);
  expect(mocks.report).toHaveBeenCalledWith('business', expect.objectContaining({ storeIds: ['store'] }));
});
it('does not read financial data when export access is denied', async () => {
  mocks.guard.mockResolvedValue({ ok: false, status: 403, body: { error: 'Access denied' }, headers: {} });
  expect((await GET(request())).status).toBe(403);
  expect(mocks.report).not.toHaveBeenCalled();
});
