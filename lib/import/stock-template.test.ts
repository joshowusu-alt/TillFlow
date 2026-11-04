import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { strFromU8, unzipSync } from 'fflate';
import { buildExcelTemplate, buildTemplateCsv, templateExamples } from './stock-template';
import { IMPORT_MODES, templateHeadersForMode } from './import-mode';
import { parseStockFileDetailed } from './parse-stock-file';

describe('downloadable import templates', () => {
  it.each(IMPORT_MODES)('%s Excel keeps examples out of imports and preserves codes and classification', async mode => {
    const bytes = buildExcelTemplate(mode);
    const workbook = XLSX.read(bytes, { type: 'array', cellStyles: true });
    expect(workbook.SheetNames).toEqual(['Import', 'Instructions', 'Examples']);
    const original = await parseStockFileDetailed({ name: 'template.xlsx', arrayBuffer: async () => bytes.slice().buffer } as File, mode);
    expect(original.rows).toEqual([]);
    const headers = [...templateHeadersForMode(mode)];
    const examples = templateExamples(mode);
    XLSX.utils.sheet_add_aoa(workbook.Sheets.Import, examples, { origin: 'A2' });
    const filled = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
    const parsed = await parseStockFileDetailed({ name: 'filled.xlsx', arrayBuffer: async () => filled } as File, mode);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows.map(row => row.errors)).toEqual([[], [], [], []]);
    expect(parsed.rows[0]).toMatchObject({ category: '', division: '', group: '' });
    expect(parsed.rows[1].category).toBeTruthy();
    expect(parsed.rows[1].division).toBe('');
    expect(parsed.rows[2].division).toBe('Pantry');
    expect(parsed.rows[2].group).toBe('');
    expect(parsed.rows[3]).toMatchObject({ category: 'Drinks', division: 'Water', group: 'Bottled water', barcode: '0012345678905' });
    const barcodeColumn = headers.indexOf('barcode');
    expect(workbook.Sheets.Examples[XLSX.utils.encode_cell({ r: 4, c: barcodeColumn })]).toMatchObject({ t: 's', v: '0012345678905', z: '@' });
    const zip = unzipSync(bytes);
    const xml = strFromU8(zip['xl/worksheets/sheet1.xml']);
    expect(xml).toContain('state="frozen"');
    expect(xml).toContain('autoFilter');
    expect(workbook.Sheets.Import['!cols']?.[barcodeColumn].wch).toBeGreaterThan(18);
    for (const name of ['xl/styles.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml']) {
      expect(new DOMParser().parseFromString(strFromU8(zip[name]), 'application/xml').querySelector('parsererror')).toBeNull();
    }
  });
  it.each(IMPORT_MODES)('%s CSV starts with clean headers and uses Excel-friendly UTF-8', async mode => {
    const csv = buildTemplateCsv(mode);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv.slice(1)).toBe(templateHeadersForMode(mode).join(',') + '\r\n');
    const rows = templateExamples(mode).map(row => row.map(value => JSON.stringify(String(value))).join(',')).join('\r\n');
    const parsed = await parseStockFileDetailed({ name: 'filled.csv', text: async () => csv + rows } as File, mode);
    expect(parsed.rows).toHaveLength(4);
    expect(parsed.rows.map(row => row.errors)).toEqual([[], [], [], []]);
    expect(parsed.rows[3].barcode).toBe('0012345678905');
  });
});
