export type ErrorReportRow = {
  rowNumber: number;
  productName: string;
  field: string;
  message: string;
  suggestedFix: string;
};

function escapeCsv(value: string) {
  return /[",\n\r]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

export function buildErrorReportCsv(rows: ErrorReportRow[]): string {
  const header = ['row', 'product', 'field', 'issue', 'suggested_fix'];
  const lines = [
    header.join(','),
    ...rows.map((r) =>
      [
        String(r.rowNumber),
        escapeCsv(r.productName),
        escapeCsv(r.field),
        escapeCsv(r.message),
        escapeCsv(r.suggestedFix),
      ].join(',')
    ),
  ];
  return lines.join('\r\n');
}

export function downloadErrorReport(rows: ErrorReportRow[], fileStem = 'tillflow-import-fixes') {
  const csv = buildErrorReportCsv(rows);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${fileStem}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function issuesToReportRows(
  items: Array<{
    rowNumber: number;
    productName: string;
    errors: string[];
    warnings: string[];
  }>
): ErrorReportRow[] {
  const out: ErrorReportRow[] = [];
  for (const item of items) {
    for (const message of item.errors) {
      out.push({
        rowNumber: item.rowNumber,
        productName: item.productName || '(no name)',
        field: 'row',
        message,
        suggestedFix: suggestFix(message),
      });
    }
    for (const message of item.warnings) {
      out.push({
        rowNumber: item.rowNumber,
        productName: item.productName || '(no name)',
        field: 'review',
        message,
        suggestedFix: suggestFix(message),
      });
    }
  }
  return out;
}

function suggestFix(message: string): string {
  if (message.includes('Product name')) return 'Add a product name in the name column.';
  if (message.includes('Selling price')) return 'Enter selling price as a number, e.g. 12.50';
  if (message.includes('Cost price')) return 'Enter cost per base unit, e.g. 9.50';
  if (message.includes('Unit type')) return 'Set base_unit to Piece, Bottle, Tin, Strip, kg, etc.';
  if (message.includes('Barcode')) return 'Use a unique barcode or leave blank.';
  if (message.includes('Stock count unit')) return 'Set qty_in to match base_unit or pack_unit, or leave blank.';
  if (message.includes('lower than cost')) return 'Raise selling price or confirm below-cost sale in preview.';
  return 'Fix the cell and upload again.';
}
