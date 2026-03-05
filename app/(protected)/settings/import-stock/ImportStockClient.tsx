'use client';

import { useState, useTransition, useRef, useCallback } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import { downloadTemplate } from '@/lib/import/stock-template';
import { parseStockFile, type ParsedImportRow, type PaymentStatus } from '@/lib/import/parse-stock-file';
import { importStockAction, type ImportStockResult } from '@/app/actions/import-stock';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type UnitOption = { id: string; name: string; pluralName: string };

type PreviewRow = ParsedImportRow & {
  /** Resolved base unit ID — actual DB id OR "new:Name" sentinel — null = unresolved */
  resolvedBaseUnitId: string | null;
  /** Resolved pack unit ID — null means either not set OR unresolved */
  resolvedPackUnitId: string | null;
  /** Pack size override (user may edit inline) */
  resolvedPackSize: number;
  /** Payment status (toggled per row) */
  resolvedPaymentStatus: PaymentStatus;
};

type RowStatus = 'error' | 'warning' | 'ready';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function findUnit(units: UnitOption[], name: string): string | null {
  if (!name) return null;
  return units.find((u) => u.name.toLowerCase() === name.toLowerCase())?.id ?? null;
}

function autoResolve(row: ParsedImportRow, units: UnitOption[]): PreviewRow {
  return {
    ...row,
    resolvedBaseUnitId: findUnit(units, row.baseUnitName),
    resolvedPackUnitId: row.packUnitName ? findUnit(units, row.packUnitName) : null,
    resolvedPackSize: row.packSize,
    resolvedPaymentStatus: row.paymentStatus,
  };
}

function rowStatus(row: PreviewRow): RowStatus {
  if (row.errors.length > 0) return 'error';
  if (!row.resolvedBaseUnitId) return 'warning';
  if (row.packUnitName && !row.resolvedPackUnitId) return 'warning';
  if (row.packUnitName && row.resolvedPackSize <= 1) return 'warning';
  return 'ready';
}

/** Determine the effective qty-in unit ID for a row at confirm time. */
function effectiveQtyInUnitId(row: PreviewRow): string | null {
  const qtyLower = row.qtyInName.toLowerCase();
  if (row.packUnitName && qtyLower === row.packUnitName.toLowerCase()) {
    return row.resolvedPackUnitId;
  }
  return row.resolvedBaseUnitId;
}

function displayUnitId(unitId: string | null, units: UnitOption[]): string {
  if (!unitId) return '—';
  if (unitId.startsWith('new:')) return unitId.slice(4);
  return units.find((u) => u.id === unitId)?.name ?? unitId;
}

function unitLabel(row: PreviewRow, units: UnitOption[]): string {
  const base = displayUnitId(row.resolvedBaseUnitId, units) || row.baseUnitName || '?';
  if (!row.packUnitName) return base;
  const pack = displayUnitId(row.resolvedPackUnitId, units) || row.packUnitName || '?';
  const size = row.resolvedPackSize > 1 ? row.resolvedPackSize : '?';
  return `${base} / ${pack} (×${size})`;
}

function moneyCell(pence: number, currency: string) {
  return formatMoney(pence, currency);
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status, errors, warnings }: { status: RowStatus; errors: string[]; warnings: string[] }) {
  if (status === 'error') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700" title={errors.join(' · ')}>
        ✕ Fix required
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700" title={warnings.join(' · ')}>
        ! Resolve below
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
      ✓ Ready
    </span>
  );
}

function PaymentPill({
  status,
  onChange,
}: {
  status: PaymentStatus;
  onChange: (s: PaymentStatus) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(status === 'PAID' ? 'UNPAID' : 'PAID')}
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
        status === 'PAID'
          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
      }`}
    >
      {status === 'PAID' ? 'Paid' : 'Unpaid'}
    </button>
  );
}

function UnitSelector({
  value,
  unitName,
  units,
  onChange,
}: {
  value: string | null;
  unitName: string;
  units: UnitOption[];
  onChange: (v: string) => void;
}) {
  return (
    <select
      className="input py-0.5 text-xs"
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
    >
      <option value="">— select unit —</option>
      {units.map((u) => (
        <option key={u.id} value={u.id}>
          {u.name}
        </option>
      ))}
      <option value={`new:${unitName}`}>➕ Create "{unitName}" as new unit</option>
    </select>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ImportStockClient({
  units,
  currency,
}: {
  units: UnitOption[];
  currency: string;
}) {
  const [stage, setStage] = useState<'upload' | 'preview' | 'result'>('upload');
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportStockResult | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [statusFilter, setStatusFilter] = useState<'all' | 'error' | 'warning' | 'ready'>('all');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── File handling ────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      setParseError(null);
      try {
        const parsed = await parseStockFile(file);
        if (!parsed.length) {
          setParseError('The file contained no data rows. Please check the file and try again.');
          return;
        }
        setPreviewRows(parsed.map((r) => autoResolve(r, units)));
        setStatusFilter('all');
        setStage('preview');
      } catch (e: unknown) {
        setParseError(e instanceof Error ? e.message : 'Could not parse the file.');
      }
    },
    [units]
  );

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = ''; // allow re-upload of same file
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  // ── Row mutation helpers ─────────────────────────────────────────────────

  const updateRow = (id: string, patch: Partial<PreviewRow>) =>
    setPreviewRows((prev) => prev.map((r) => (r._id === id ? { ...r, ...patch } : r)));

  const setAllPayment = (status: PaymentStatus) =>
    setPreviewRows((prev) => prev.map((r) => ({ ...r, resolvedPaymentStatus: status })));

  // ── Summary calculations ─────────────────────────────────────────────────

  const paidRows = previewRows.filter((r) => r.resolvedPaymentStatus === 'PAID');
  const unpaidRows = previewRows.filter((r) => r.resolvedPaymentStatus === 'UNPAID');

  const calcValue = (rows: PreviewRow[]) =>
    rows.reduce((sum, r) => {
      const conversionFactor =
        r.packUnitName &&
        r.resolvedPackSize > 1 &&
        r.qtyInName.toLowerCase() === r.packUnitName.toLowerCase()
          ? r.resolvedPackSize
          : 1;
      return sum + Math.round(r.costPricePence * r.quantity * conversionFactor);
    }, 0);

  const paidValuePence = calcValue(paidRows);
  const unpaidValuePence = calcValue(unpaidRows);

  const hasErrors = previewRows.some((r) => rowStatus(r) === 'error');
  const hasUnresolvedWarnings = previewRows.some((r) => rowStatus(r) === 'warning');
  const readyCount = previewRows.filter((r) => rowStatus(r) === 'ready').length;
  const canConfirm = !hasErrors && previewRows.length > 0 && readyCount > 0;

  // ── Confirm ──────────────────────────────────────────────────────────────

  const handleConfirm = () => {
    setConfirmError(null);
    const confirmedRows = previewRows
      .filter((r) => rowStatus(r) === 'ready')
      .map((r) => ({
        name: r.name,
        sku: r.sku,
        barcode: r.barcode,
        category: r.category,
        sellingPricePence: r.sellingPricePence,
        costPricePence: r.costPricePence,
        quantity: r.quantity,
        baseUnitId: r.resolvedBaseUnitId!,
        packUnitId: r.packUnitName ? r.resolvedPackUnitId : null,
        packSize: r.resolvedPackSize,
        qtyInUnitId: effectiveQtyInUnitId(r) ?? r.resolvedBaseUnitId!,
        paymentStatus: r.resolvedPaymentStatus,
      }));

    startTransition(async () => {
      const res = await importStockAction(confirmedRows);
      if (!res.success) {
        setConfirmError(res.error);
        return;
      }
      setResult((res as { success: true; data: ImportStockResult }).data);
      setStage('result');
    });
  };

  // ────────────────────────────────────────────────────────────────────────
  // Stage 1 — Upload
  // ────────────────────────────────────────────────────────────────────────
  if (stage === 'upload') {
    return (
      <div className="space-y-4">
        {/* Drop zone */}
        <div
          className={`card flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            isDragging ? 'border-accent bg-accentSoft/30' : 'border-black/20'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={onDrop}
        >
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-black/5">
            <svg className="h-7 w-7 text-black/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
          <div>
            <p className="font-semibold text-black/70">Drag & drop your file here</p>
            <p className="text-sm text-black/40">Supports .csv and .xlsx files (Excel / Google Sheets)</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            className="hidden"
            onChange={onFileInput}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => fileInputRef.current?.click()}
          >
            Browse files
          </button>
          {parseError && (
            <p className="mt-1 text-sm font-medium text-red-600">{parseError}</p>
          )}
        </div>

        {/* Template download */}
        <div className="card p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="font-semibold text-sm">Don't have a file yet?</h3>
              <p className="text-xs text-black/50 mt-0.5">
                Download our template, fill it in Excel or Google Sheets, then upload it here.
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost border border-black/10 shrink-0 text-sm"
              onClick={downloadTemplate}
            >
              ↓ Download Template
            </button>
          </div>

          {/* Column glossary */}
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4 space-y-2 text-xs text-black/60">
            <p className="font-semibold text-black/70 mb-1">Column guide</p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {([
                ['name *', 'Product name (required)'],
                ['sku', 'Stock-keeping unit code (optional)'],
                ['barcode', 'Barcode number (optional)'],
                ['category', 'Category name — created automatically if new'],
                ['selling_price *', 'Selling price, e.g. 12.00'],
                ['cost_price *', 'Cost you paid per unit, e.g. 9.50'],
                ['quantity', 'Opening stock count — blank or 0 means none on hand yet'],
                ['base_unit *', 'Smallest unit you sell — e.g. Tin, Piece, kg'],
                ['pack_unit', 'Container unit — e.g. Carton, Box (optional)'],
                ['pack_size', 'Base units per pack — e.g. 12 (required if pack_unit set)'],
                ['qty_in', 'Unit quantity is counted in — leave blank to use base_unit, or set to Carton/Box to enter pack counts'],
                ['payment_status', '"paid" or "unpaid" — blank defaults to unpaid'],
              ] as [string, string][]).map(([col, desc]) => (
                <div key={col} className="flex gap-1.5">
                  <code className="shrink-0 font-mono font-medium text-black/70">{col}</code>
                  <span>— {desc}</span>
                </div>
              ))}
            </div>

            {/* Cost / qty rule callout */}
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-900 space-y-1.5">
              <p className="font-semibold">cost_price and quantity are per base unit — unless you set qty_in</p>
              <p className="font-medium">Example: Milo sold in Tins (12 Tins per Carton)</p>
              <ul className="list-disc list-inside space-y-0.5 ml-1 text-amber-800">
                <li><code className="font-mono bg-amber-100 px-0.5 rounded">cost_price = 9.50</code> — cost of 1 Tin</li>
                <li><code className="font-mono bg-amber-100 px-0.5 rounded">quantity = 60</code> — Tins on hand; system records 60 × GH¢9.50 = GH¢570.00</li>
                <li>To enter by Carton instead: set <code className="font-mono bg-amber-100 px-0.5 rounded">qty_in = Carton</code> and <code className="font-mono bg-amber-100 px-0.5 rounded">quantity = 5</code> → 5 × 12 = 60 Tins</li>
              </ul>
            </div>

            <p className="mt-2 text-black/50 italic">
              Example: <code>Milo 500g, , 6001234567, Drinks, 12.00, 9.50, 60, Tin, Carton, 12, , unpaid</code>
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Stage 3 — Result
  // ────────────────────────────────────────────────────────────────────────
  if (stage === 'result' && result) {
    return (
      <div className="card p-8 space-y-6">
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold">Import complete!</h2>
            <p className="text-sm text-black/50">Your stock catalogue and opening balances have been recorded.</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Products created', value: String(result.created) },
            {
              label: result.stockUpdated > 0 ? 'Existing (stock recorded)' : 'Skipped (duplicates)',
              value: String(result.skipped),
            },
            {
              label: 'Paid stock',
              value: formatMoney(result.paidValuePence, currency),
              accent: false,
            },
            {
              label: 'Owed to suppliers',
              value: formatMoney(result.unpaidValuePence, currency),
              accent: true,
            },
          ].map(({ label, value, accent }) => (
            <div
              key={label}
              className={`rounded-xl border p-4 ${
                accent ? 'border-amber-200 bg-amber-50' : 'border-black/10 bg-white'
              }`}
            >
              <div className="text-xs text-black/50">{label}</div>
              <div className="text-lg font-bold mt-0.5">{value}</div>
            </div>
          ))}
        </div>

        {result.skipped > 0 && (
          <details className="rounded-xl border border-black/10 p-4 text-sm">
            <summary className="cursor-pointer font-medium text-black/70">
              {result.skipped} product{result.skipped !== 1 ? 's' : ''} already in catalogue
              {result.stockUpdated > 0 && (
                <span className="ml-2 text-emerald-700">
                  — opening stock recorded for {result.stockUpdated} of them
                  {result.stockUpdatedValuePence > 0 && ` (${formatMoney(result.stockUpdatedValuePence, currency)})`}
                </span>
              )}
            </summary>
            {result.stockUpdated > 0 ? (
              <p className="mt-2 text-xs text-black/50 mb-2">
                The products already existed so no duplicates were created. Their opening stock
                quantities and costs from the CSV have been recorded as purchase invoices and
                posted to the balance sheet. To update prices or other details, edit them
                individually under Products.
              </p>
            ) : (
              <p className="mt-2 text-xs text-black/50 mb-2">
                These products were not changed. To update them, edit them individually under Products.
              </p>
            )}
            <ul className="mt-1 list-disc list-inside space-y-1 text-black/60">
              {result.skippedNames.map((n) => (
                <li key={n}>{n}</li>
              ))}
            </ul>
          </details>
        )}

        {result.barcodesCleared > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <p className="font-semibold">
              {result.barcodesCleared} barcode{result.barcodesCleared !== 1 ? 's' : ''} cleared
            </p>
            <p className="mt-1 text-amber-800 text-xs">
              These barcodes were already assigned to other products, so they were removed from the
              imported rows to avoid conflicts. The products were still created — you can set their
              barcodes manually under Products.
            </p>
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          <Link href="/products" className="btn-primary">
            View Products →
          </Link>
          <Link href="/reports/balance-sheet" className="btn-ghost border border-black/10">
            View Balance Sheet
          </Link>
          <button
            type="button"
            className="btn-ghost border border-black/10 text-sm"
            onClick={() => { setStage('upload'); setPreviewRows([]); setResult(null); }}
          >
            Import another file
          </button>
        </div>
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Stage 2 — Preview
  // ────────────────────────────────────────────────────────────────────────
  const errorCount = previewRows.filter((r) => rowStatus(r) === 'error').length;
  const warningCount = previewRows.filter((r) => rowStatus(r) === 'warning').length;

  // Filtered rows preserve original file indices so row numbers stay meaningful.
  const filteredRows = previewRows
    .map((r, i) => ({ row: r, originalIdx: i }))
    .filter(({ row }) => statusFilter === 'all' || rowStatus(row) === statusFilter);

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="btn-ghost border border-black/10 text-sm"
              onClick={() => { setStage('upload'); setPreviewRows([]); }}
            >
              ← Re-upload
            </button>
            <span className="text-sm text-black/50">
              <span className="font-semibold text-black/70">{previewRows.length}</span> rows
            </span>
            {/* Live filter pills — counts update instantly as issues are resolved */}
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'all' ? 'bg-black/15 text-black/80' : 'bg-black/5 text-black/40 hover:bg-black/10'
                }`}
              >
                All
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'error' ? 'all' : 'error')}
                className={`rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'error' ? 'bg-red-200 text-red-800' : 'bg-red-100 text-red-600 hover:bg-red-200'
                }`}
              >
                ✕ Errors {errorCount}
              </button>
              {warningCount > 0 && (
                <button
                  type="button"
                  onClick={() => setStatusFilter(statusFilter === 'warning' ? 'all' : 'warning')}
                  className={`rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
                    statusFilter === 'warning' ? 'bg-amber-200 text-amber-800' : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
                  }`}
                >
                  ! Warnings {warningCount}
                </button>
              )}
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === 'ready' ? 'all' : 'ready')}
                className={`rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
                  statusFilter === 'ready' ? 'bg-emerald-200 text-emerald-800' : 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                }`}
              >
                ✓ Ready {readyCount}
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-black/50">Mark all:</span>
            <button
              type="button"
              className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200"
              onClick={() => setAllPayment('PAID')}
            >
              Paid
            </button>
            <button
              type="button"
              className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-200"
              onClick={() => setAllPayment('UNPAID')}
            >
              Unpaid
            </button>
          </div>
        </div>

        {errorCount > 0 && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
            <strong>{errorCount} row{errorCount !== 1 ? 's have' : ' has'} required fields missing.</strong>{' '}
            Fix the file and re-upload — these rows cannot be imported as-is.
          </div>
        )}
      </div>

      {/* Table */}
      <div className="card overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-b border-black/10 bg-black/[0.02] text-xs text-black/50">
              <tr>
                <th className="px-3 py-2 text-left font-medium w-8">#</th>
                <th className="px-3 py-2 text-left font-medium">Name</th>
                <th className="px-3 py-2 text-left font-medium hidden sm:table-cell">Category</th>
                <th className="px-3 py-2 text-right font-medium">Sell</th>
                <th className="px-3 py-2 text-right font-medium">Cost</th>
                <th className="px-3 py-2 text-right font-medium">Qty</th>
                <th className="px-3 py-2 text-left font-medium min-w-[160px]">Unit</th>
                <th className="px-3 py-2 text-left font-medium">Payment</th>
                <th className="px-3 py-2 text-right font-medium">Line Total</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-black/40">
                    {statusFilter === 'error' ? 'No errors — all fixed! 🎉' :
                     statusFilter === 'warning' ? 'No warnings — all resolved! 🎉' :
                     statusFilter === 'ready' ? 'No ready rows yet.' : 'No rows.'}
                  </td>
                </tr>
              )}
              {filteredRows.map(({ row, originalIdx }) => {
                const status = rowStatus(row);
                const needsBaseUnit = !row.resolvedBaseUnitId;
                const needsPackUnit = !!row.packUnitName && !row.resolvedPackUnitId;
                const needsPackSize = !!row.packUnitName && row.resolvedPackSize <= 1;

                return (
                  <tr
                    key={row._id}
                    className={`${
                      status === 'error'
                        ? 'bg-red-50'
                        : status === 'warning'
                        ? 'bg-amber-50/50'
                        : ''
                    }`}
                  >
                    <td className="px-3 py-2 text-black/40 text-xs">{originalIdx + 1}</td>
                    <td className="px-3 py-2 font-medium">
                      {row.name || <span className="text-red-500 italic">missing</span>}
                      {row.sku && <div className="text-xs text-black/40">{row.sku}</div>}
                    </td>
                    <td className="px-3 py-2 text-black/60 hidden sm:table-cell">
                      {row.category || <span className="text-black/30">—</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.sellingPricePence > 0
                        ? moneyCell(row.sellingPricePence, currency)
                        : <span className="text-red-500 text-xs">missing</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.costPricePence > 0 ? (
                        <>
                          {moneyCell(row.costPricePence, currency)}
                          <div className="text-xs text-black/40">/{row.baseUnitName || '…'}</div>
                        </>
                      ) : <span className="text-red-500 text-xs">missing</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.quantity > 0 ? (
                        <>
                          {row.quantity}
                          <div className="text-xs text-black/40">{row.qtyInName}</div>
                        </>
                      ) : <span className="text-black/30">0</span>}
                    </td>
                    <td className="px-3 py-2">
                      {/* Base unit */}
                      {needsBaseUnit ? (
                        <div className="space-y-1">
                          <div className="text-xs text-amber-700 font-medium">Base: "{row.baseUnitName}" unknown</div>
                          <UnitSelector
                            value={row.resolvedBaseUnitId}
                            unitName={row.baseUnitName}
                            units={units}
                            onChange={(v) => updateRow(row._id, { resolvedBaseUnitId: v })}
                          />
                        </div>
                      ) : (
                        <div className="text-xs">
                          {/* Pack unit resolution */}
                          {needsPackUnit ? (
                            <div className="space-y-1">
                              <div className="text-black/70">{unitLabel(row, units)}</div>
                              <div className="text-xs text-amber-700 font-medium">Pack: "{row.packUnitName}" unknown</div>
                              <UnitSelector
                                value={row.resolvedPackUnitId}
                                unitName={row.packUnitName}
                                units={units}
                                onChange={(v) => updateRow(row._id, { resolvedPackUnitId: v })}
                              />
                            </div>
                          ) : needsPackSize ? (
                            <div className="space-y-1">
                              <div className="text-black/70">
                                {displayUnitId(row.resolvedBaseUnitId, units)} /{' '}
                                {displayUnitId(row.resolvedPackUnitId, units)}
                              </div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-amber-700">×</span>
                                <input
                                  type="number"
                                  min={2}
                                  className="input w-16 py-0.5 text-xs"
                                  placeholder="size"
                                  value={row.resolvedPackSize > 0 ? row.resolvedPackSize : ''}
                                  onChange={(e) =>
                                    updateRow(row._id, {
                                      resolvedPackSize: parseInt(e.target.value, 10) || 0,
                                    })
                                  }
                                />
                                <span className="text-black/40">per pack</span>
                              </div>
                            </div>
                          ) : (
                            <span className="text-black/70">{unitLabel(row, units)}</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <PaymentPill
                        status={row.resolvedPaymentStatus}
                        onChange={(s) => updateRow(row._id, { resolvedPaymentStatus: s })}
                      />
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.costPricePence > 0 && row.quantity > 0 ? (() => {
                        const cf =
                          row.packUnitName &&
                          row.resolvedPackSize > 1 &&
                          row.qtyInName.toLowerCase() === row.packUnitName.toLowerCase()
                            ? row.resolvedPackSize
                            : 1;
                        return moneyCell(Math.round(row.costPricePence * row.quantity * cf), currency);
                      })() : <span className="text-black/30">—</span>}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={status} errors={row.errors} warnings={row.warnings} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sticky summary + confirm */}
      <div className="card p-4 sticky bottom-4 shadow-lg">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex flex-wrap gap-4 text-sm">
            <div>
              <span className="text-black/50">Paid stock: </span>
              <span className="font-semibold text-emerald-700">{formatMoney(paidValuePence, currency)}</span>
            </div>
            <div>
              <span className="text-black/50">Owed to suppliers: </span>
              <span className="font-semibold text-amber-700">{formatMoney(unpaidValuePence, currency)}</span>
            </div>
            <div>
              <span className="text-black/50">Total: </span>
              <span className="font-semibold">{formatMoney(paidValuePence + unpaidValuePence, currency)}</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            {confirmError && (
              <p className="text-xs text-red-600">{confirmError}</p>
            )}
            <div className="relative group">
              <button
                type="button"
                className="btn-primary disabled:opacity-50 disabled:cursor-not-allowed"
                disabled={!canConfirm || isPending}
                onClick={handleConfirm}
              >
                {isPending
                  ? 'Importing…'
                  : hasUnresolvedWarnings
                    ? `Confirm Import (${readyCount} ready, ${previewRows.filter((r) => rowStatus(r) === 'warning').length} skipped)`
                    : `Confirm Import (${readyCount} products)`}
              </button>
              {!canConfirm && (
                <div className="absolute bottom-full mb-1.5 right-0 hidden group-hover:block w-56 rounded-lg bg-black/80 px-3 py-2 text-xs text-white shadow-lg">
                  {hasErrors
                    ? 'Fix all red errors first (re-upload the corrected file).'
                    : 'No ready rows to import.'}
                </div>
              )}
              {canConfirm && hasUnresolvedWarnings && (
                <div className="absolute bottom-full mb-1.5 right-0 hidden group-hover:block w-64 rounded-lg bg-black/80 px-3 py-2 text-xs text-white shadow-lg">
                  Rows with amber warnings will be skipped — you can add their units/pack sizes later via the product edit screen.
                </div>
              )}
            </div>
          </div>
        </div>
        <p className="mt-2 text-xs text-black/40">
          Paid a deposit on some stock? Import as Unpaid, then record the partial payment under{' '}
          <Link href="/purchases" className="underline">Purchases</Link>.
        </p>
      </div>
    </div>
  );
}
