/**
 * Branded export utilities for generating Excel, PDF (HTML), and CSV responses.
 * Provides consistent TillFlow branding across all export formats.
 */

import * as XLSX from 'xlsx';
import { NextResponse } from 'next/server';

// ── Types ────────────────────────────────────────────────────────────────────

export type ExportOptions = {
  businessName: string;
  reportTitle: string;
  dateRange?: { from: Date; to: Date };
  currency?: string;
  columns: { header: string; key: string; width?: number }[];
  rows: Record<string, string | number | null | undefined>[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function escapeHtml(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return '';
  return String(v)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function buildCsvRow(values: Array<string | number | null | undefined>) {
  return values.map((value) => escapeCsv(value)).join(',');
}

// ── 1. buildBrandedExcel ─────────────────────────────────────────────────────

export function buildBrandedExcel(options: ExportOptions): Buffer {
  const { businessName, reportTitle, dateRange, columns, rows } = options;
  const colCount = columns.length;

  // Build array-of-arrays for the sheet
  const aoa: (string | number | null | undefined)[][] = [];

  // Row 1: Business name
  aoa.push([businessName, ...Array(colCount - 1).fill(null)]);
  // Row 2: Report title
  aoa.push([reportTitle, ...Array(colCount - 1).fill(null)]);
  // Row 3: Date range (or empty)
  if (dateRange) {
    aoa.push([
      `Period: ${fmtDate(dateRange.from)} to ${fmtDate(dateRange.to)}`,
      ...Array(colCount - 1).fill(null),
    ]);
  } else {
    aoa.push(Array(colCount).fill(null));
  }
  // Row 4: Empty spacer
  aoa.push(Array(colCount).fill(null));
  // Row 5: Column headers
  aoa.push(columns.map((c) => c.header));
  // Data rows
  for (const row of rows) {
    aoa.push(columns.map((c) => row[c.key] ?? null));
  }
  // Spacer + branding footer
  aoa.push(Array(colCount).fill(null));
  aoa.push(['Powered by TillFlow', ...Array(colCount - 1).fill(null)]);

  const ws = XLSX.utils.aoa_to_sheet(aoa);

  // Column widths
  ws['!cols'] = columns.map((c) => ({
    wch: c.width ?? Math.max(c.header.length + 4, 12),
  }));

  // Merges: rows 1–3 and footer row span all columns
  const mergeRange = (r: number) => ({
    s: { r, c: 0 },
    e: { r, c: colCount - 1 },
  });

  ws['!merges'] = [
    mergeRange(0), // business name
    mergeRange(1), // report title
    mergeRange(2), // date range
    mergeRange(aoa.length - 1), // footer
  ];

  // Sheet name (Excel limit: 31 chars, no special chars)
  const sheetName = reportTitle
    .replace(/[\\/*?:\[\]]/g, '')
    .slice(0, 31);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);

  const buf: Uint8Array = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  return Buffer.from(buf);
}

// ── 2. buildBrandedPdf (HTML) ────────────────────────────────────────────────

export function buildBrandedPdf(options: ExportOptions): string {
  const { businessName, reportTitle, dateRange, currency, columns, rows } =
    options;

  const dateRangeText = dateRange
    ? `${fmtDate(dateRange.from)} — ${fmtDate(dateRange.to)}`
    : '';
  const currencyLabel = currency ? ` (${currency})` : '';
  const generatedOn = fmtDate(new Date());
  const rowCount = rows.length;

  const headerRow = columns
    .map((c) => `<th>${escapeHtml(c.header)}</th>`)
    .join('');

  const dataRows = rows
    .map(
      (row, i) =>
        `<tr class="${i % 2 === 1 ? 'alt' : ''}">${columns
          .map((c) => `<td>${escapeHtml(row[c.key])}</td>`)
          .join('')}</tr>`,
    )
    .join('\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(reportTitle)} — ${escapeHtml(businessName)}</title>
  <style>
    *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
    :root{
      --brand:#2563EB;--brand-dark:#1E3A8A;--brand-light:#EFF6FF;
      --ink:#111827;--muted:#6B7280;--border:#E5E7EB;--surface:#F9FAFB;
    }
    body{
      font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif;
      background:linear-gradient(180deg,#f8fbff 0%,#ffffff 30%);color:var(--ink);min-height:100vh;
    }

    /* ── Hero header ──────────────────── */
    .hero{
      background:linear-gradient(135deg,var(--brand-dark) 0%,var(--brand) 100%);
      color:#fff;padding:2.1rem 2.5rem 1.6rem;position:relative;overflow:hidden;
      border-bottom-left-radius:28px;border-bottom-right-radius:28px;
      box-shadow:0 24px 50px rgba(30,58,138,.18);
    }
    .hero::after{
      content:'';position:absolute;inset:auto -8% -38% auto;width:280px;height:280px;
      background:radial-gradient(circle,rgba(255,255,255,.28),transparent 62%);
      pointer-events:none;
    }
    .eyebrow{
      display:inline-flex;align-items:center;gap:.45rem;padding:.35rem .7rem;
      border:1px solid rgba(255,255,255,.2);border-radius:999px;
      background:rgba(255,255,255,.12);font-size:.72rem;font-weight:700;
      letter-spacing:.08em;text-transform:uppercase;
    }
    .hero h1{font-size:1.6rem;font-weight:800;letter-spacing:-0.02em}
    .hero .subtitle{font-size:1.1rem;font-weight:600;opacity:.9;margin-top:0.25rem}
    .hero .meta{font-size:0.8rem;opacity:.78;margin-top:0.75rem;display:flex;flex-wrap:wrap;gap:.75rem}
    .hero .meta span{
      display:inline-flex;align-items:center;padding:.35rem .65rem;border-radius:999px;
      background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.16);
    }

    .summary-strip{
      max-width:1100px;margin:-1.25rem auto 0;padding:0 2.5rem;position:relative;z-index:1;
    }
    .summary-grid{
      display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.9rem;
    }
    .summary-card{
      background:rgba(255,255,255,.95);border:1px solid rgba(37,99,235,.12);
      border-radius:18px;padding:1rem 1.1rem;box-shadow:0 14px 28px rgba(15,23,42,.07);
    }
    .summary-card .label{font-size:.7rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:700}
    .summary-card .value{margin-top:.35rem;font-size:1rem;font-weight:800;color:var(--brand-dark)}

    /* ── Content ──────────────────────── */
    .content{max-width:1100px;margin:0 auto;padding:1.8rem 2.5rem 2rem}
    .content-shell{
      border:1px solid rgba(17,24,39,.06);border-radius:24px;background:#fff;
      box-shadow:0 18px 34px rgba(15,23,42,.06);overflow:hidden;
    }
    .content-header{
      display:flex;align-items:flex-end;justify-content:space-between;gap:1rem;
      padding:1.15rem 1.25rem;border-bottom:1px solid var(--border);background:linear-gradient(180deg,#fff,#f8fbff);
    }
    .content-header h2{font-size:1rem;font-weight:800;color:var(--brand-dark)}
    .content-header p{font-size:.82rem;color:var(--muted);margin-top:.2rem}
    .report-badge{
      display:inline-flex;align-items:center;gap:.45rem;padding:.45rem .75rem;
      border-radius:999px;background:var(--brand-light);color:var(--brand-dark);
      font-size:.78rem;font-weight:700;
    }

    /* ── Table ─────────────────────────── */
    table{width:100%;border-collapse:collapse;font-size:0.85rem}
    th{
      background:var(--brand);color:#fff;font-weight:700;text-align:left;
      padding:0.6rem 0.75rem;white-space:nowrap;
    }
    td{padding:0.5rem 0.75rem;border-bottom:1px solid var(--border)}
    tr.alt td{background:var(--surface)}
    tbody tr:hover td{background:#EFF6FF}

    /* ── Footer ────────────────────────── */
    .footer{
      text-align:center;padding:1.5rem 1rem;font-size:0.75rem;color:var(--muted);
      border-top:1px solid var(--border);margin-top:2rem;
    }

    /* ── Print button ──────────────────── */
    .toolbar{
      display:flex;justify-content:flex-end;padding:0.75rem 2.5rem;
      background:var(--brand-dark);
    }
    .print-btn{
      background:#fff;color:var(--brand-dark);font-size:0.8rem;font-weight:600;
      border:none;border-radius:6px;padding:0.4rem 1rem;cursor:pointer;
    }
    .print-btn:hover{background:var(--brand-light)}

    /* ── Print styles ──────────────────── */
    @media print{
      .toolbar{display:none!important}
      body{background:#fff}
      .summary-strip{margin-top:.75rem}
      .summary-card,.content-shell{box-shadow:none}
      .hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      tr.alt td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }
    @media (max-width: 840px){
      .summary-strip,.content{padding-left:1rem;padding-right:1rem}
      .summary-grid{grid-template-columns:1fr}
      .content-header{flex-direction:column;align-items:flex-start}
    }
    @page{size:A4 landscape;margin:10mm}
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="print-btn" onclick="window.print()">&#128438; Save as PDF</button>
  </div>

  <div class="hero">
    <div class="eyebrow">TillFlow export</div>
    <h1>${escapeHtml(businessName)}</h1>
    <div class="subtitle">${escapeHtml(reportTitle)}</div>
    <div class="meta">
      ${dateRangeText ? `<span>&#128197; ${escapeHtml(dateRangeText)}</span>` : ''}
      ${currencyLabel ? `<span>&#128178; Currency: ${escapeHtml(currencyLabel)}</span>` : ''}
      <span>&#128336; Generated: ${generatedOn}</span>
    </div>
  </div>

  <div class="summary-strip">
    <div class="summary-grid">
      <div class="summary-card">
        <div class="label">Rows exported</div>
        <div class="value">${escapeHtml(rowCount)}</div>
      </div>
      <div class="summary-card">
        <div class="label">Data range</div>
        <div class="value">${escapeHtml(dateRangeText || 'Full export')}</div>
      </div>
      <div class="summary-card">
        <div class="label">Format</div>
        <div class="value">Print-ready PDF view</div>
      </div>
    </div>
  </div>

  <div class="content">
    <div class="content-shell">
      <div class="content-header">
        <div>
          <h2>${escapeHtml(reportTitle)}</h2>
          <p>Prepared for retail operations review, sharing, and archive.</p>
        </div>
        <div class="report-badge">Powered by TillFlow</div>
      </div>
      <table>
        <thead><tr>${headerRow}</tr></thead>
        <tbody>
          ${dataRows}
        </tbody>
      </table>
    </div>
  </div>

  <div class="footer">Powered by <strong>TillFlow</strong></div>
</body>
</html>`;
}

export function buildBrandedCsv(options: ExportOptions, csvBody: string): string {
  const { businessName, reportTitle, dateRange, currency, columns } = options;
  const colCount = Math.max(columns.length, 1);
  const emptyPadding = Array.from({ length: Math.max(colCount - 1, 0) }, () => '');

  const headerRows = [
    buildCsvRow([businessName, ...emptyPadding]),
    buildCsvRow([reportTitle, ...emptyPadding]),
    buildCsvRow([
      dateRange
        ? `Period: ${fmtDate(dateRange.from)} to ${fmtDate(dateRange.to)}`
        : 'Period: Full export',
      ...emptyPadding,
    ]),
    buildCsvRow([
      currency ? `Currency: ${currency}` : 'Currency: Not specified',
      ...emptyPadding,
    ]),
    buildCsvRow([`Generated: ${fmtDate(new Date())}`, ...emptyPadding]),
    '',
  ];

  const footerRows = ['', buildCsvRow(['Powered by TillFlow', ...emptyPadding])];
  return `${headerRows.join('\n')}${csvBody ? `${csvBody}\n` : ''}${footerRows.join('\n')}`;
}

// ── 3. detectExportFormat ────────────────────────────────────────────────────

const VALID_FORMATS = new Set(['csv', 'xlsx', 'pdf'] as const);
type ExportFormat = 'csv' | 'xlsx' | 'pdf';

export function detectExportFormat(request: Request): ExportFormat {
  const { searchParams } = new URL(request.url);
  const raw = searchParams.get('format')?.toLowerCase();
  if (raw && VALID_FORMATS.has(raw as ExportFormat)) {
    return raw as ExportFormat;
  }
  return 'csv';
}

// ── 4. respondWithExport ─────────────────────────────────────────────────────

export function respondWithExport(params: {
  format: 'csv' | 'xlsx' | 'pdf';
  csv: string;
  filename: string;
  exportOptions: ExportOptions;
}): NextResponse {
  const { format, csv, filename, exportOptions } = params;
  const safeName = filename.replace(/[^a-zA-Z0-9_\-]/g, '_');

  switch (format) {
    case 'xlsx': {
      const buf = buildBrandedExcel(exportOptions);
      return new NextResponse(new Uint8Array(buf), {
        headers: {
          'Content-Type':
            'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition': `attachment; filename="${safeName}.xlsx"`,
        },
      });
    }

    case 'pdf': {
      const html = buildBrandedPdf(exportOptions);
      return new NextResponse(html, {
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Disposition': `inline; filename="${safeName}.html"`,
        },
      });
    }

    case 'csv':
    default: {
      const brandedCsv = buildBrandedCsv(exportOptions, csv);
      return new NextResponse(`\uFEFF${brandedCsv}`, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeName}.csv"`,
        },
      });
    }
  }
}
