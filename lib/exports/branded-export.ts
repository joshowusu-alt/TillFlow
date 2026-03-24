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
      background:#fff;color:var(--ink);min-height:100vh;
    }

    /* ── Hero header ──────────────────── */
    .hero{
      background:linear-gradient(135deg,var(--brand-dark) 0%,var(--brand) 100%);
      color:#fff;padding:2rem 2.5rem 1.5rem;
    }
    .hero h1{font-size:1.6rem;font-weight:800;letter-spacing:-0.02em}
    .hero .subtitle{font-size:1.1rem;font-weight:600;opacity:.9;margin-top:0.25rem}
    .hero .meta{font-size:0.8rem;opacity:.7;margin-top:0.5rem;display:flex;gap:1.5rem}

    /* ── Content ──────────────────────── */
    .content{max-width:1100px;margin:0 auto;padding:1.5rem 2.5rem 2rem}

    /* ── Table ─────────────────────────── */
    table{width:100%;border-collapse:collapse;font-size:0.85rem;margin-top:1rem}
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
      .hero{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      th{-webkit-print-color-adjust:exact;print-color-adjust:exact}
      tr.alt td{-webkit-print-color-adjust:exact;print-color-adjust:exact}
    }
    @page{size:A4 landscape;margin:10mm}
  </style>
</head>
<body>
  <div class="toolbar">
    <button class="print-btn" onclick="window.print()">&#128438; Save as PDF</button>
  </div>

  <div class="hero">
    <h1>${escapeHtml(businessName)}</h1>
    <div class="subtitle">${escapeHtml(reportTitle)}</div>
    <div class="meta">
      ${dateRangeText ? `<span>&#128197; ${escapeHtml(dateRangeText)}</span>` : ''}
      ${currencyLabel ? `<span>Currency: ${escapeHtml(currencyLabel)}</span>` : ''}
      <span>Generated: ${fmtDate(new Date())}</span>
    </div>
  </div>

  <div class="content">
    <table>
      <thead><tr>${headerRow}</tr></thead>
      <tbody>
        ${dataRows}
      </tbody>
    </table>
  </div>

  <div class="footer">Powered by <strong>TillFlow</strong></div>
</body>
</html>`;
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
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${safeName}.csv"`,
        },
      });
    }
  }
}
