import { describe, expect, it } from 'vitest';
import { importClassificationErrors, importOptionalProductUpdates, matchImportProduct } from './import-reliability';
import { enrichRowsWithCatalog, parseStockFileDetailed } from './parse-stock-file';
import * as XLSX from 'xlsx';

const csv = (contents: string) => ({ name: 'products.csv', text: async () => contents } as File);
const parse = (headers: string, cells: string, mode?: 'PURCHASES') => parseStockFileDetailed(csv(`name,selling_price,base_unit,${headers}\nBook,50,Piece,${cells}`), mode);

describe('import reliability', () => {
  it('preserves omitted optional fields but applies explicit false and zero', async () => {
    const { rows } = await parse('quantity', '4');
    expect(rows[0]).toMatchObject({ costPriceProvided: false, storefrontPublishedProvided: false, reorderPointProvided: false });
    expect(importOptionalProductUpdates({ costPricePence: 0, costPriceProvided: false })).toEqual({});
    expect(importOptionalProductUpdates({ costPricePence: 0, costPriceProvided: true, storefrontPublished: false, reorderPointBase: 0 })).toEqual({ defaultCostBasePence: 0, storefrontPublished: false, reorderPointBase: 0 });
  });

  it.each([['quantity', '12abc'], ['quantity', '1.5'], ['cost_price', '4abc'], ['selling_price', 'Infinity'], ['pack_size', '2.5'], ['reorder_point', '-3'], ['storefront_published', 'maybe']])('rejects malformed %s cells', async (header, value) => {
    const headers = header === 'selling_price' ? 'name,selling_price,base_unit' : `name,selling_price,base_unit,${header}`;
    const cells = header === 'selling_price' ? `Book,${value},Piece` : `Book,50,Piece,${value}`;
    const result = await parseStockFileDetailed(csv(`${headers}\n${cells}`));
    expect(result.rows[0].errors.length).toBeGreaterThan(0);
  });

  it('validates purchase payment text only for purchases', async () => {
    expect((await parse('payment_status', 'perhaps', 'PURCHASES')).rows[0].errors).toContain('payment_status is required: enter paid or unpaid.');
    expect((await parse('payment_status', 'perhaps')).rows[0].errors).toEqual([]);
    expect((await parse('payment_status', '', 'PURCHASES')).rows[0].errors.length).toBeGreaterThan(0);
  });

  it('reads quoted multiline CSV and preserves physical row numbers', async () => {
    const result = await parseStockFileDetailed(csv('\uFEFFname,selling_price,base_unit,notes\n\nBook,50,Piece,"A, B\nC ""quoted"""\nPen,2,Piece,plain'));
    expect(result.rows[0]).toMatchObject({ rowNumber: 3, notes: 'A, B\nC "quoted"' });
    expect(result.rows[1].rowNumber).toBe(5);
    await expect(parse('notes', '"broken')).rejects.toThrow('Unclosed quoted');
  });

  it('rejects duplicate aliases and missing required headers', async () => {
    await expect(parse('sale_price', '10')).rejects.toThrow('Duplicate column');
    await expect(parseStockFileDetailed(csv('name,base_unit\nBook,Piece'))).rejects.toThrow('selling_price');
  });

  it('reads an Excel data sheet after instructions', async () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['How to import']]), 'Instructions');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['name','selling_price','base_unit','barcode'],['Book','50','Piece','001234']]), 'Products');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const result = await parseStockFileDetailed({ name: 'products.xlsx', arrayBuffer: async () => buffer } as File);
    expect(result.rows[0]).toMatchObject({ name: 'Book', barcode: '001234', errors: [] });
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['more']]), 'Another');
    await expect(parseStockFileDetailed({ name: 'products.xlsx', arrayBuffer: async () => XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) } as File)).rejects.toThrow('multiple data sheets');
  });
});

describe('optional classification', () => {
  it.each([{ category: '' }, { category: 'Books' }, { category: 'Books', division: 'Bibles' }, { category: 'Books', division: 'Bibles', group: 'Study' }])('allows %j', row => {
    expect(importClassificationErrors(row)).toEqual([]);
  });
  it('requires parents only when deeper levels are used', () => {
    expect(importClassificationErrors({ category: '', division: 'Bibles' })).toHaveLength(1);
    expect(importClassificationErrors({ category: 'Books', group: 'Study' })).toHaveLength(1);
    expect(importClassificationErrors({ category: 'x'.repeat(101) })).toHaveLength(1);
  });
});

describe('consistent product matching', () => {
  const products = [{ id: 'a', name: 'Book', sku: 'A', barcode: '001', barcodes: [{ code: 'alias' }] }, { id: 'b', name: 'Book', sku: 'B', barcode: '002' }];
  it('resolves shared titles by barcode, alternate barcode or SKU', () => {
    expect(matchImportProduct({ name: 'Book', sku: '', barcode: '002' }, products)).toBe('b');
    expect(matchImportProduct({ name: 'Renamed book', sku: '', barcode: 'alias' }, products)).toBe('a');
    expect(matchImportProduct({ name: 'Book', sku: 'a', barcode: '' }, products)).toBe('a');
    expect(() => matchImportProduct({ name: 'Book', sku: '', barcode: '' }, products)).toThrow('Multiple products');
    expect(() => matchImportProduct({ name: 'Book', sku: 'A', barcode: '002' }, products)).toThrow('different products');
  });
  it('uses the same exact match in preview', async () => {
    const parsed = await parse('barcode', '002');
    const rows = enrichRowsWithCatalog(parsed.rows, { products, productNames: ['Book'], skus: ['A','B'], barcodes: ['001','002'] });
    expect(rows[0]).toMatchObject({ duplicateAction: 'update', errors: [] });
  });

  it('treats a barcode or SKU that is not in the catalogue as a new product', () => {
    const products = [
      { id: 'a', name: 'PAINTING CANVAS', sku: 'OLD', barcode: '6615116820189', barcodes: [{ code: 'alias' }] },
      { id: 'b', name: 'Notebook', sku: null, barcode: null, barcodes: [] },
    ];
    expect(matchImportProduct({ name: 'PAINTING CANVAS', sku: '', barcode: '6615116820189' }, products)).toBe('a');
    expect(matchImportProduct({ name: 'Renamed', sku: '', barcode: 'alias' }, products)).toBe('a');
    expect(matchImportProduct({ name: 'PAINTING CANVAS', sku: '', barcode: '6615116820196' }, products)).toBeNull();
    expect(matchImportProduct({ name: 'PAINTING CANVAS', sku: '', barcode: '6615116820257' }, products)).toBeNull();
    expect(matchImportProduct({ name: 'PAINTING CANVAS', sku: 'NEW', barcode: '' }, products)).toBeNull();
    expect(matchImportProduct({ name: 'PAINTING CANVAS', sku: '', barcode: '' }, products)).toBe('a');
    expect(matchImportProduct({ name: 'Notebook', sku: '', barcode: '' }, products)).toBe('b');
    expect(() => matchImportProduct({ name: 'PAINTING CANVAS', sku: 'OLD', barcode: '6615116820196' }, products)).toThrow('different products');
  });

  it('keeps a clear error when a name-only row matches several products', () => {
    const products = [
      { id: 'a', name: 'PAINTING CANVAS', sku: '', barcode: '6615116820189' },
      { id: 'b', name: 'PAINTING CANVAS', sku: '', barcode: '6615116820196' },
    ];
    expect(() => matchImportProduct({ name: 'PAINTING CANVAS', sku: '', barcode: '' }, products)).toThrow('Multiple products share the name PAINTING CANVAS');
    expect(matchImportProduct({ name: 'PAINTING CANVAS', sku: '', barcode: '6615116820196' }, products)).toBe('b');
  });

  it('imports same titles with different barcodes and still skips a repeated name-only row', async () => {
    const file = csv([
      'name,selling_price,base_unit,barcode,sku',
      'PAINTING CANVAS,24,Piece,6615116820189,',
      'PAINTING CANVAS,40,Piece,6615116820196,',
      'PAINTING CANVAS,48,Piece,6615116820257,',
      'PAINTING CANVAS,30,Piece,,NEW-SKU',
      'Zip Binder,10,Piece,,',
      'Zip Binder,10,Piece,,',
      'Widget,10,Piece,,',
      'Widget,12,Piece,999,',
    ].join('\n'));
    const parsed = await parseStockFileDetailed(file);
    const rows = enrichRowsWithCatalog(parsed.rows, {
      products: [{ id: 'canvas', name: 'PAINTING CANVAS', sku: 'OLD', barcode: '6615116820189', barcodes: [] }],
      productNames: ['PAINTING CANVAS'],
      barcodes: ['6615116820189'],
      skus: ['OLD'],
    });
    expect(rows.map((row) => ({
      barcode: row.barcode,
      sku: row.sku,
      duplicateAction: row.duplicateAction,
      duplicateKind: row.duplicateKind,
    }))).toEqual([
      { barcode: '6615116820189', sku: '', duplicateAction: 'update', duplicateKind: 'barcode' },
      { barcode: '6615116820196', sku: '', duplicateAction: 'create', duplicateKind: 'none' },
      { barcode: '6615116820257', sku: '', duplicateAction: 'create', duplicateKind: 'none' },
      { barcode: '', sku: 'NEW-SKU', duplicateAction: 'create', duplicateKind: 'none' },
      { barcode: '', sku: '', duplicateAction: 'create', duplicateKind: 'none' },
      { barcode: '', sku: '', duplicateAction: 'skip', duplicateKind: 'name_exact' },
      { barcode: '', sku: '', duplicateAction: 'create', duplicateKind: 'none' },
      { barcode: '999', sku: '', duplicateAction: 'create', duplicateKind: 'none' },
    ]);
    expect(rows[1].errors).toEqual([]);
    expect(rows[1].warnings.join(' ')).not.toMatch(/appears again|already exists|similar/);
    expect(rows[2].warnings.join(' ')).not.toMatch(/appears again|already exists/);
    expect(rows[5].warnings.join(' ')).toContain('appears again');
    expect(rows[6].errors.join(' ')).toContain('Multiple products share the name Widget');
    expect(rows[7].errors).toEqual([]);
    const actions = {
      existing: rows.filter((row) => row.duplicateKind !== 'none').length,
      update: rows.filter((row) => row.duplicateAction === 'update').length,
      create: rows.filter((row) => row.duplicateAction === 'create').length,
      skip: rows.filter((row) => row.duplicateAction === 'skip').length,
    };
    expect(actions).toEqual({ existing: 2, update: 1, create: 6, skip: 1 });
  });
});
