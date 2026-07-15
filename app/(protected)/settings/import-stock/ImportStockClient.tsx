'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { formatMoney } from '@/lib/format';
import { downloadTemplateForMode, UNIT_HELPER_COPY } from '@/lib/import/stock-template';
import {
  parseStockFileDetailed,
  enrichRowsWithCatalog,
  type ParsedImportRow,
  type PaymentStatus,
} from '@/lib/import/parse-stock-file';
import { downloadErrorReport, issuesToReportRows } from '@/lib/import/error-report';
import type { DuplicateAction } from '@/lib/import/import-validation';
import {
  IMPORT_MODES,
  importModeExplanation,
  importModeLabel,
  type ImportMode,
  type OpeningStockFunding,
  type PurchasePaymentAccount,
} from '@/lib/import/import-mode';
import { getImportCatalogContext } from '@/app/actions/import-catalog';
import type { ImportStockResult } from '@/app/actions/import-stock';
import ResetPurchaseDataButton from '@/components/ResetPurchaseDataButton';

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
  /** Payment status (toggled per row) — purchases mode only */
  resolvedPaymentStatus: PaymentStatus;
  openingFunding: OpeningStockFunding;
  paymentAccount: PurchasePaymentAccount;
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
    openingFunding: 'EQUITY',
    paymentAccount: 'CASH',
  };
}

function rowStatus(row: PreviewRow): RowStatus {
  if (row.errors.length > 0) return 'error';
  if (!row.resolvedBaseUnitId) return 'warning';
  if (row.packUnitName && !row.resolvedPackUnitId) return 'warning';
  if (row.packUnitName && row.resolvedPackSize <= 1) return 'warning';
  if (
    row.warnings.some((w) => w.includes('lower than cost')) &&
    !row.confirmBelowCost
  ) {
    return 'warning';
  }
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

function FundingPill({
  funding,
  onChange,
}: {
  funding: OpeningStockFunding;
  onChange: (f: OpeningStockFunding) => void;
}) {
  return (
    <button
      type="button"
      onClick={() =>
        onChange(funding === 'EQUITY' ? 'SUPPLIER_CREDIT' : 'EQUITY')
      }
      className={`inline-flex items-center rounded-full px-3 py-0.5 text-xs font-semibold transition-colors ${
        funding === 'EQUITY'
          ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
          : 'bg-amber-100 text-amber-700 hover:bg-amber-200'
      }`}
    >
      {funding === 'EQUITY' ? 'Opening equity' : 'Supplier credit'}
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

function ImportSteps({ steps, activeIndex }: { steps: readonly string[]; activeIndex: number }) {
  return (
    <ol className="flex flex-wrap gap-2 text-[11px] text-black/50">
      {steps.map((label, index) => (
        <li
          key={label}
          className={`rounded-full px-2.5 py-1 ${
            index === activeIndex
              ? 'bg-accentSoft text-accent font-semibold'
              : index < activeIndex
              ? 'bg-emerald-50 text-emerald-800'
              : 'bg-black/5'
          }`}
        >
          {index + 1}. {label}
        </li>
      ))}
    </ol>
  );
}

function DuplicateActionSelect({
  value,
  kind,
  onChange,
}: {
  value: DuplicateAction;
  kind: ParsedImportRow['duplicateKind'];
  onChange: (v: DuplicateAction) => void;
}) {
  if (kind === 'none') return null;
  return (
    <select
      className="input py-0.5 text-xs max-w-[140px]"
      value={value}
      onChange={(e) => onChange(e.target.value as DuplicateAction)}
    >
      <option value="skip">Skip</option>
      <option value="update">Update existing</option>
      {kind !== 'barcode' ? <option value="create">Create anyway</option> : null}
    </select>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ImportStockClient({
  units,
  currency,
  initialMode = null,
}: {
  units: UnitOption[];
  currency: string;
  initialMode?: ImportMode | null;
}) {
  const [stage, setStage] = useState<'upload' | 'preview' | 'result'>('upload');
  const [importMode, setImportMode] = useState<ImportMode | null>(initialMode);
  const [legacyPaymentStatusColumn, setLegacyPaymentStatusColumn] = useState(false);
  const [clientImportKey] = useState(() => `imp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);
  const [parseError, setParseError] = useState<string | null>(null);
  const [previewRows, setPreviewRows] = useState<PreviewRow[]>([]);
  const [result, setResult] = useState<ImportStockResult | null>(null);
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'error' | 'warning' | 'ready'>('all');
  const [fileName, setFileName] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const STEPS = ['Choose purpose', 'Download template', 'Upload file', 'Review', 'Done'] as const;
  const stepIndex = !importMode ? 0 : stage === 'upload' ? 2 : stage === 'preview' ? 3 : 4;

  // ── File handling ────────────────────────────────────────────────────────

  const handleFile = useCallback(
    async (file: File) => {
      if (!importMode) {
        setParseError('Choose an import purpose before uploading a file.');
        return;
      }
      setParseError(null);
      setFileName(file.name);
      try {
        const detailed = await parseStockFileDetailed(file);
        if (!detailed.rows.length) {
          setParseError('The file had no product rows. Check the file and try again.');
          return;
        }
        setLegacyPaymentStatusColumn(detailed.hasPaymentStatusColumn);
        setCatalogLoading(true);
        const catalogRes = await getImportCatalogContext();
        const enriched =
          catalogRes.success
            ? enrichRowsWithCatalog(detailed.rows, catalogRes.data)
            : detailed.rows;
        setPreviewRows(enriched.map((r) => autoResolve(r, units)));
        setStatusFilter('all');
        setStage('preview');
      } catch (e: unknown) {
        setParseError(e instanceof Error ? e.message : 'Could not read the file.');
      } finally {
        setCatalogLoading(false);
      }
    },
    [units, importMode]
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

  const handleConfirm = async () => {
    if (isImporting) return;
    if (!importMode) {
      setConfirmError('Choose an import purpose first.');
      return;
    }
    setConfirmError(null);
    setIsImporting(true);
    const confirmedRows = previewRows
      .filter((r) => rowStatus(r) === 'ready')
      .map((r) => ({
        name: r.name,
        sku: r.sku,
        barcode: r.barcode,
        category: r.suggestedCategory || r.category,
        sellingPricePence: r.sellingPricePence,
        costPricePence: r.costPricePence,
        quantity: importMode === 'CATALOGUE' ? 0 : r.quantity,
        baseUnitId: r.resolvedBaseUnitId!,
        packUnitId: r.packUnitName ? r.resolvedPackUnitId : null,
        packSize: r.resolvedPackSize,
        qtyInUnitId: effectiveQtyInUnitId(r) ?? r.resolvedBaseUnitId!,
        paymentStatus: importMode === 'PURCHASES' ? r.resolvedPaymentStatus : undefined,
        duplicateAction: r.duplicateAction,
        supplierName: r.supplierName,
        reorderPointBase: r.reorderPoint,
        storefrontPublished: r.storefrontPublished,
        imageUrl: r.imageUrl,
        notes: r.notes,
        confirmBelowCost: r.confirmBelowCost,
        openingFunding: importMode === 'OPENING_STOCK' ? r.openingFunding : undefined,
        paymentAccount: importMode === 'PURCHASES' ? r.paymentAccount : undefined,
      }));

    const errorReport = issuesToReportRows(
      previewRows.map((r) => ({
        rowNumber: r.rowNumber,
        productName: r.name,
        errors: r.errors,
        warnings: r.warnings,
      }))
    );

    try {
      const httpRes = await fetch('/api/import-stock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: confirmedRows,
          meta: {
            importMode,
            legacyPaymentStatusColumn,
            clientImportKey,
            fileName: fileName ?? undefined,
            rowsParsed: previewRows.length,
            rowsErrors: previewRows.filter((r) => rowStatus(r) === 'error').length,
            rowsWarnings: previewRows.filter((r) => rowStatus(r) === 'warning').length,
            errorReportJson: errorReport.length ? JSON.stringify(errorReport) : undefined,
          },
        }),
      });
      if (!httpRes.ok && httpRes.status !== 200) {
        const text = await httpRes.text().catch(() => '');
        setConfirmError(`Import failed (HTTP ${httpRes.status})${text ? ': ' + text.slice(0, 200) : ''}. Please try again.`);
        return;
      }
      const res = await httpRes.json() as { success: boolean; data?: ImportStockResult; error?: string };
      if (!res) {
        setConfirmError('Request failed — no response received. Please try again.');
        return;
      }
      if (!res.success) {
        setConfirmError(res.error ?? 'Import failed. Please try again.');
        return;
      }
      setResult((res as { success: true; data: ImportStockResult }).data);
      setStage('result');
    } catch (e: unknown) {
      setConfirmError(
        e instanceof Error
          ? e.message
          : 'Import failed. Please try again or contact support.'
      );
    } finally {
      setIsImporting(false);
    }
  };

  // ────────────────────────────────────────────────────────────────────────
  // Stage 1 — Upload
  // ────────────────────────────────────────────────────────────────────────
  if (stage === 'upload') {
    return (
      <div className="space-y-4">
        <ImportSteps steps={STEPS} activeIndex={stepIndex} />
        <div className="card space-y-3 p-4 sm:p-6">
          <h3 className="font-semibold text-sm">What are you importing?</h3>
          <p className="text-xs text-black/55">
            Choose one purpose before downloading a template or uploading a file. TillFlow will not guess from spreadsheet columns.
          </p>
          <div className="grid gap-2 sm:grid-cols-3">
            {IMPORT_MODES.map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => setImportMode(mode)}
                className={`rounded-xl border px-3 py-3 text-left transition ${
                  importMode === mode
                    ? 'border-accent bg-accentSoft/40 shadow-sm'
                    : 'border-black/10 bg-white hover:border-accent/40'
                }`}
              >
                <div className="text-sm font-semibold text-ink">{importModeLabel(mode)}</div>
                <div className="mt-1 text-[11px] leading-snug text-black/55">{importModeExplanation(mode)}</div>
              </button>
            ))}
          </div>
          {!importMode ? (
            <p className="text-xs font-medium text-amber-800">Select a purpose to continue.</p>
          ) : null}
        </div>
        <p className="text-xs text-black/50 rounded-lg border border-black/10 bg-black/[0.02] px-3 py-2">
          For large imports (50+ products), we recommend using a laptop. You can still upload from your phone for smaller lists.
        </p>
        {/* Drop zone */}
        <div
          className={`card flex flex-col items-center justify-center gap-4 rounded-2xl border-2 border-dashed p-10 text-center transition-colors ${
            !importMode
              ? 'pointer-events-none opacity-50 border-black/10'
              : isDragging
                ? 'border-accent bg-accentSoft/30'
                : 'border-black/20'
          }`}
          onDragOver={(e) => { e.preventDefault(); if (importMode) setIsDragging(true); }}
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
          {/* sr-only keeps the input in the accessibility tree and avoids
              the iOS Safari bug where display:none inputs never open the
              file picker when clicked programmatically. Using a <label>
              triggers the picker natively with no JS — works on all browsers
              including mobile Safari, Chrome Android, and Samsung Internet. */}
          <input
            ref={fileInputRef}
            id="stock-file-input"
            data-testid="import-stock-file-input"
            type="file"
            accept=".csv,.xlsx,.xls,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            className="sr-only"
            onChange={onFileInput}
          />
          <label
            htmlFor="stock-file-input"
            className="btn-primary cursor-pointer"
          >
            Browse files
          </label>
          {parseError && (
            <p className="mt-1 text-sm font-medium text-red-600">{parseError}</p>
          )}
          {catalogLoading ? (
            <p className="text-sm text-black/50">Checking your existing products…</p>
          ) : null}
        </div>

        {/* Template download */}
        <div className="card space-y-4 p-4 sm:p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="font-semibold text-sm">Don't have a file yet?</h3>
              <p className="text-xs text-black/50 mt-0.5">
                Download our template, fill it in Excel or Google Sheets, then upload it here.
              </p>
            </div>
            <button
              type="button"
              className="btn-ghost border border-black/10 shrink-0 text-sm w-full sm:w-auto disabled:opacity-40"
              disabled={!importMode}
              onClick={() => importMode && downloadTemplateForMode(importMode)}
            >
              ↓ Download {importMode ? importModeLabel(importMode) : ''} template
            </button>
          </div>

          {/* Column glossary */}
          <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4 space-y-2 text-xs text-black/60">
            <p className="font-semibold text-black/70 mb-1">Column guide</p>
            <div className="grid grid-cols-1 gap-1 sm:grid-cols-2">
              {(
                importMode === 'CATALOGUE'
                  ? ([
                      ['name *', 'Product name (required)'],
                      ['sku / barcode', 'Optional codes'],
                      ['selling_price *', 'Selling price, e.g. 12.00'],
                      ['cost_price', 'Cost where known (optional)'],
                      ['base_unit *', 'Smallest unit you sell'],
                      ['category', 'Created automatically if new'],
                    ] as [string, string][])
                  : importMode === 'PURCHASES'
                    ? ([
                        ['name *', 'Product name (required)'],
                        ['selling_price *', 'Selling price'],
                        ['cost_price', 'Purchase cost per unit'],
                        ['quantity *', 'Qty you are buying now'],
                        ['supplier_name', 'Required for unpaid'],
                        ['payment_status', 'paid or unpaid'],
                        ['base_unit *', 'Smallest unit you sell'],
                      ] as [string, string][])
                    : ([
                        ['name *', 'Product name (required)'],
                        ['selling_price *', 'Selling price'],
                        ['cost_price', 'Leave blank if unknown — value stays incomplete'],
                        ['quantity *', 'Stock on hand at cut-over'],
                        ['supplier_name', 'Only if you will mark supplier credit'],
                        ['base_unit *', 'Smallest unit you sell'],
                        ['(no payment_status)', 'Opening stock never reduces cash'],
                      ] as [string, string][])
              ).map(([col, desc]) => (
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

            <div className="mt-3 rounded-lg border border-teal-200 bg-teal-50/80 px-3 py-3 text-xs text-teal-900 space-y-1.5">
              <p className="font-semibold">Unit types — keep it simple</p>
              <p>{UNIT_HELPER_COPY.piece}</p>
              <p>{UNIT_HELPER_COPY.pack}</p>
              <p>{UNIT_HELPER_COPY.carton}</p>
              <p>{UNIT_HELPER_COPY.strip}</p>
              <p>{UNIT_HELPER_COPY.openingStock}</p>
            </div>
          </div>
        </div>

        {/* Reset panel — visible inline so it's never below the fold */}
        <ResetPurchaseDataButton />
      </div>
    );
  }

  // ────────────────────────────────────────────────────────────────────────
  // Stage 3 — Result
  // ────────────────────────────────────────────────────────────────────────
  if (stage === 'result' && result) {
    const supplierLinkSummary = result.supplierLinkSummary;
    const supplierLinkTotal =
      supplierLinkSummary.linkedCount +
      supplierLinkSummary.alreadyLinkedCount +
      supplierLinkSummary.skippedDifferentSupplierCount;

    return (
      <div className="card p-8 space-y-6">
        <ImportSteps steps={STEPS} activeIndex={4} />
        <div className="flex items-center gap-4">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-emerald-100">
            <svg className="h-7 w-7 text-emerald-600" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold">Import complete!</h2>
            <p className="text-sm text-black/50">
              {result.importMode === 'CATALOGUE'
                ? 'Product catalogue updated — no stock or accounting entries were posted.'
                : result.importMode === 'PURCHASES'
                  ? 'Purchase import recorded.'
                  : 'Opening stock recorded against Opening Balance Equity (or supplier credit where confirmed).'}
            </p>
            {result.accountingEffectSummary?.length ? (
              <ul className="mt-2 list-disc pl-5 text-xs text-black/60 space-y-0.5">
                {result.accountingEffectSummary.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {[
            { label: 'Products imported', value: String(result.created) },
            { label: 'Products updated', value: String(result.updated) },
            {
              label: result.stockUpdated > 0 ? 'Stock added (existing)' : 'Skipped',
              value: String(result.skipped),
            },
            { label: 'Opening stock units', value: String(result.openingStockUnits) },
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

        {supplierLinkTotal > 0 && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="font-semibold">Supplier links updated</p>
                <div className="mt-1 space-y-0.5 text-emerald-800">
                  {supplierLinkSummary.linkedCount > 0 && (
                    <p>
                      {supplierLinkSummary.linkedCount} product{supplierLinkSummary.linkedCount === 1 ? ' was' : 's were'} linked to suppliers from your import.
                    </p>
                  )}
                  {supplierLinkSummary.alreadyLinkedCount > 0 && (
                    <p>
                      {supplierLinkSummary.alreadyLinkedCount} product{supplierLinkSummary.alreadyLinkedCount === 1 ? ' was' : 's were'} already linked to the same supplier.
                    </p>
                  )}
                  {supplierLinkSummary.skippedDifferentSupplierCount > 0 && (
                    <p>
                      {supplierLinkSummary.skippedDifferentSupplierCount} product{supplierLinkSummary.skippedDifferentSupplierCount === 1 ? ' was' : 's were'} already linked to another supplier and left unchanged.
                    </p>
                  )}
                </div>
                <p className="mt-2 text-xs text-emerald-800/80">
                  We do this to avoid changing supplier sales reports by mistake.
                </p>
              </div>
              {supplierLinkSummary.skippedProducts.length > 0 && (
                <a href="#import-supplier-link-review" className="text-sm font-semibold text-emerald-900 underline">
                  Review skipped products
                </a>
              )}
            </div>

            {supplierLinkSummary.supplierSummaries.length > 1 && (
              <div className="mt-4 grid gap-2 sm:grid-cols-2">
                {supplierLinkSummary.supplierSummaries.map((supplier) => (
                  <div key={supplier.supplierId} className="rounded-lg border border-emerald-200 bg-white/70 px-3 py-2">
                    <p className="font-medium text-emerald-950">{supplier.supplierName}</p>
                    <p className="mt-0.5 text-xs text-emerald-800">
                      {supplier.linkedCount} linked · {supplier.alreadyLinkedCount} already linked ·{' '}
                      {supplier.skippedDifferentSupplierCount} left unchanged
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {supplierLinkSummary.skippedProducts.length > 0 && (
          <div id="import-supplier-link-review" className="rounded-xl border border-black/10 bg-white p-4">
            <div>
              <h3 className="text-sm font-semibold text-black/80">Review skipped products</h3>
              <p className="mt-1 text-xs text-black/55">
                These products were already linked to another supplier, so TillFlow left them unchanged.
              </p>
            </div>
            <div className="mt-3 overflow-x-auto">
              <table className="table w-full border-separate border-spacing-y-1 text-sm">
                <thead>
                  <tr>
                    <th>Product</th>
                    <th>SKU</th>
                    <th>Current linked supplier</th>
                    <th>Purchase supplier</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {supplierLinkSummary.skippedProducts.map((product) => (
                    <tr key={`${product.productId}-${product.purchaseSupplierId}`} className="rounded-xl bg-white">
                      <td className="px-3 py-2 font-medium">{product.productName}</td>
                      <td className="px-3 py-2 text-black/55">{product.sku || '—'}</td>
                      <td className="px-3 py-2 text-black/70">{product.currentSupplierName}</td>
                      <td className="px-3 py-2 text-black/70">{product.purchaseSupplierName}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/products/${product.productId}`} className="text-sm font-semibold text-accent hover:underline">
                          Review product
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

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
            {result.skipped > result.skippedNames.length && (
              <p className="mt-1 text-xs text-black/40 italic">
                …and {result.skipped - result.skippedNames.length} more (list truncated)
              </p>
            )}
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

        {(result.suppliersCreated > 0 || result.categoriesCreated > 0) && (
          <p className="text-sm text-black/60">
            {result.suppliersCreated > 0
              ? `${result.suppliersCreated} new supplier${result.suppliersCreated === 1 ? '' : 's'} added. `
              : ''}
            {result.categoriesCreated > 0
              ? `${result.categoriesCreated} new categor${result.categoriesCreated === 1 ? 'y' : 'ies'} created.`
              : ''}
          </p>
        )}

        <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4">
          <p className="text-sm font-semibold text-ink">What to do next</p>
          <ul className="mt-2 space-y-1 text-sm text-black/65">
            <li>• Make your first sale at the till</li>
            <li>• Review low stock alerts under Reports</li>
            <li>• Add more products any time</li>
          </ul>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link href="/pos" className="btn-primary">
            Go to POS →
          </Link>
          <Link href="/products" className="btn-ghost border border-black/10">
            View products
          </Link>
          <Link href="/onboarding" className="btn-ghost border border-black/10">
            Setup progress
          </Link>
          <Link href="/reports/stock-movements" className="btn-ghost border border-black/10">
            Stock history
          </Link>
          <button
            type="button"
            className="btn-ghost border border-black/10 text-sm"
            onClick={() => { setStage('upload'); setPreviewRows([]); setResult(null); }}
          >
            Import another file
          </button>
        </div>

        {/* Offer reset in case the numbers look wrong */}
        <ResetPurchaseDataButton />
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

  const duplicateSummary = {
    existing: previewRows.filter((r) => r.duplicateKind !== 'none').length,
    skip: previewRows.filter((r) => r.duplicateAction === 'skip').length,
    update: previewRows.filter((r) => r.duplicateAction === 'update').length,
  };

  return (
    <div className="space-y-4">
      <ImportSteps steps={STEPS} activeIndex={3} />
      <div className="rounded-xl border border-accent/20 bg-accentSoft/30 px-4 py-3 text-sm text-ink space-y-1.5">
        <p className="font-semibold">Import purpose: {importMode ? importModeLabel(importMode) : 'Not set'}</p>
        {importMode === 'CATALOGUE' ? (
          <>
            <p className="text-xs text-black/60">Products only — quantities are ignored. No stock movement, journal, cash or supplier debt.</p>
            <p className="text-xs text-black/60">payment_status is ignored in catalogue mode. To record quantities, switch to Opening Stock.</p>
          </>
        ) : null}
        {importMode === 'OPENING_STOCK' ? (
          <>
            <p className="text-xs text-black/60">Current cash will not be reduced.</p>
            <p className="text-xs text-black/60">Supplier debt is created only where you mark supplier credit with a named supplier.</p>
            <p className="text-xs text-black/60">Remaining valued opening stock posts Dr Inventory / Cr Opening Balance Equity.</p>
            {legacyPaymentStatusColumn ? (
              <p className="text-xs font-medium text-amber-900">
                This file includes payment_status. For opening stock that column is ignored — Paid will not reduce cash, and Unpaid will not create supplier debt automatically.
              </p>
            ) : null}
          </>
        ) : null}
        {importMode === 'PURCHASES' ? (
          <p className="text-xs text-black/60">Genuine purchases only. Paid reduces the selected payment account; unpaid requires a supplier and creates AP.</p>
        ) : null}
        <p className="text-xs text-black/55">
          Ready {readyCount} · qty rows {previewRows.filter((r) => r.quantity > 0).length} · known cost{' '}
          {previewRows.filter((r) => r.quantity > 0 && r.costPricePence > 0).length} · missing cost{' '}
          {previewRows.filter((r) => r.quantity > 0 && r.costPricePence <= 0).length}
        </p>
      </div>
      {/* Header controls */}
      <div className="card p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
          {importMode === 'PURCHASES' ? (
            <div className="flex flex-wrap items-center gap-2">
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
          ) : importMode === 'OPENING_STOCK' ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-black/50">Mark all funding:</span>
              <button
                type="button"
                className="rounded-full bg-emerald-100 px-3 py-0.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-200"
                onClick={() =>
                  setPreviewRows((prev) => prev.map((r) => ({ ...r, openingFunding: 'EQUITY' })))
                }
              >
                Opening equity
              </button>
              <button
                type="button"
                className="rounded-full bg-amber-100 px-3 py-0.5 text-xs font-semibold text-amber-700 hover:bg-amber-200"
                onClick={() =>
                  setPreviewRows((prev) => prev.map((r) => ({ ...r, openingFunding: 'SUPPLIER_CREDIT' })))
                }
              >
                Supplier credit
              </button>
            </div>
          ) : null}
        </div>

        {errorCount > 0 && (
          <div className="mt-3 rounded-lg bg-red-50 border border-red-200 px-4 py-2.5 text-sm text-red-700">
            <strong>{errorCount} row{errorCount !== 1 ? 's have' : ' has'} problems that must be fixed.</strong>{' '}
            Download the fix list, update your file, and upload again.
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn-ghost border border-black/10 text-xs"
            onClick={() =>
              downloadErrorReport(
                issuesToReportRows(
                  previewRows.map((r) => ({
                    rowNumber: r.rowNumber,
                    productName: r.name,
                    errors: r.errors,
                    warnings: r.warnings,
                  }))
                ),
                'tillflow-import-fixes'
              )
            }
          >
            ↓ Download fix list
          </button>
          {duplicateSummary.existing > 0 ? (
            <span className="text-xs text-black/55">
              {duplicateSummary.existing} already in catalogue · {duplicateSummary.update} will update ·{' '}
              {duplicateSummary.skip} will skip
            </span>
          ) : null}
        </div>
      </div>

      {/* Table */}
      <div className="space-y-3 lg:hidden">
        {filteredRows.length === 0 && (
          <div className="rounded-2xl border border-dashed border-black/10 px-4 py-10 text-center text-sm text-black/40">
            {statusFilter === 'error' ? 'No errors — all fixed! 🎉' :
             statusFilter === 'warning' ? 'No warnings — all resolved! 🎉' :
             statusFilter === 'ready' ? 'No ready rows yet.' : 'No rows.'}
          </div>
        )}
        {filteredRows.map(({ row, originalIdx }) => {
          const status = rowStatus(row);
          const needsBaseUnit = !row.resolvedBaseUnitId;
          const needsPackUnit = !!row.packUnitName && !row.resolvedPackUnitId;
          const needsPackSize = !!row.packUnitName && row.resolvedPackSize <= 1;
          const lineTotal = row.costPricePence > 0 && row.quantity > 0
            ? (() => {
                const cf =
                  row.packUnitName &&
                  row.resolvedPackSize > 1 &&
                  row.qtyInName.toLowerCase() === row.packUnitName.toLowerCase()
                    ? row.resolvedPackSize
                    : 1;
                return moneyCell(Math.round(row.costPricePence * row.quantity * cf), currency);
              })()
            : null;

          return (
            <div
              key={row._id}
              className={`rounded-2xl border px-4 py-4 shadow-sm ${
                status === 'error'
                  ? 'border-red-200 bg-red-50'
                  : status === 'warning'
                  ? 'border-amber-200 bg-amber-50/60'
                  : 'border-black/5 bg-white'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="text-xs text-black/40">Row {originalIdx + 1}</div>
                  <div className="mt-1 font-medium text-ink">{row.name || <span className="text-red-500 italic">missing</span>}</div>
                  {row.sku && <div className="mt-1 text-xs text-black/40">{row.sku}</div>}
                </div>
                <StatusBadge status={status} errors={row.errors} warnings={row.warnings} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-black/40">Category</div>
                  <div className="mt-1 text-black/65">{row.category || '—'}</div>
                </div>
                {importMode === 'PURCHASES' ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Payment</div>
                    <div className="mt-1">
                      <PaymentPill
                        status={row.resolvedPaymentStatus}
                        onChange={(s) => updateRow(row._id, { resolvedPaymentStatus: s })}
                      />
                    </div>
                  </div>
                ) : importMode === 'OPENING_STOCK' ? (
                  <div>
                    <div className="text-xs uppercase tracking-[0.16em] text-black/40">Funding</div>
                    <div className="mt-1">
                      <FundingPill
                        funding={row.openingFunding}
                        onChange={(f) => updateRow(row._id, { openingFunding: f })}
                      />
                    </div>
                  </div>
                ) : null}
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-black/40">Sell</div>
                  <div className="mt-1">{row.sellingPricePence > 0 ? moneyCell(row.sellingPricePence, currency) : <span className="text-red-500 text-xs">missing</span>}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-black/40">Cost</div>
                  <div className="mt-1">{row.costPricePence > 0 ? moneyCell(row.costPricePence, currency) : <span className="text-red-500 text-xs">missing</span>}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-black/40">Qty</div>
                  <div className="mt-1">{row.quantity > 0 ? `${row.quantity} ${row.qtyInName}` : '0'}</div>
                </div>
                <div>
                  <div className="text-xs uppercase tracking-[0.16em] text-black/40">Line total</div>
                  <div className="mt-1">{lineTotal ?? <span className="text-black/30">—</span>}</div>
                </div>
                <div className="col-span-2">
                  <div className="text-xs uppercase tracking-[0.16em] text-black/40">Units</div>
                  <div className="mt-2 space-y-2">
                    {needsBaseUnit ? (
                      <div className="space-y-1">
                        <div className="text-xs font-medium text-amber-700">Base: "{row.baseUnitName}" unknown</div>
                        <UnitSelector
                          value={row.resolvedBaseUnitId}
                          unitName={row.baseUnitName}
                          units={units}
                          onChange={(v) => updateRow(row._id, { resolvedBaseUnitId: v })}
                        />
                      </div>
                    ) : needsPackUnit ? (
                      <div className="space-y-1">
                        <div className="text-xs text-black/70">{unitLabel(row, units)}</div>
                        <div className="text-xs font-medium text-amber-700">Pack: "{row.packUnitName}" unknown</div>
                        <UnitSelector
                          value={row.resolvedPackUnitId}
                          unitName={row.packUnitName}
                          units={units}
                          onChange={(v) => updateRow(row._id, { resolvedPackUnitId: v })}
                        />
                      </div>
                    ) : needsPackSize ? (
                      <div className="space-y-1">
                        <div className="text-xs text-black/70">
                          {displayUnitId(row.resolvedBaseUnitId, units)} / {displayUnitId(row.resolvedPackUnitId, units)}
                        </div>
                        <div className="flex items-center gap-1.5">
                          <span className="text-amber-700">×</span>
                          <input
                            type="number"
                            min={2}
                            className="input w-20 py-0.5 text-xs"
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
                      <span className="text-sm text-black/70">{unitLabel(row, units)}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="card hidden overflow-hidden p-0 md:block">
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
                {importMode === 'PURCHASES' ? (
                  <th className="px-3 py-2 text-left font-medium">Payment</th>
                ) : importMode === 'OPENING_STOCK' ? (
                  <th className="px-3 py-2 text-left font-medium">Funding</th>
                ) : null}
                <th className="px-3 py-2 text-right font-medium">Line Total</th>
                <th className="px-3 py-2 text-left font-medium">Duplicate</th>
                <th className="px-3 py-2 text-left font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-black/5">
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={11} className="px-4 py-10 text-center text-sm text-black/40">
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
                    {importMode === 'PURCHASES' ? (
                      <td className="px-3 py-2">
                        <PaymentPill
                          status={row.resolvedPaymentStatus}
                          onChange={(s) => updateRow(row._id, { resolvedPaymentStatus: s })}
                        />
                      </td>
                    ) : importMode === 'OPENING_STOCK' ? (
                      <td className="px-3 py-2">
                        <FundingPill
                          funding={row.openingFunding}
                          onChange={(f) => updateRow(row._id, { openingFunding: f })}
                        />
                      </td>
                    ) : null}
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
                      <DuplicateActionSelect
                        kind={row.duplicateKind}
                        value={row.duplicateAction}
                        onChange={(duplicateAction) => updateRow(row._id, { duplicateAction })}
                      />
                    </td>
                    <td className="px-3 py-2">
                      {row.warnings.some((w) => w.includes('lower than cost')) ? (
                        <label className="flex items-center gap-1 text-[10px] text-amber-800">
                          <input
                            type="checkbox"
                            checked={row.confirmBelowCost}
                            onChange={(e) =>
                              updateRow(row._id, { confirmBelowCost: e.target.checked })
                            }
                          />
                          Below cost OK
                        </label>
                      ) : null}
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
      <div className="card sticky bottom-4 p-4 shadow-lg">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-4">
            {importMode === 'PURCHASES' ? (
              <>
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
              </>
            ) : importMode === 'OPENING_STOCK' ? (
              <>
                <div>
                  <span className="text-black/50">Opening equity: </span>
                  <span className="font-semibold text-emerald-700">
                    {formatMoney(
                      calcValue(previewRows.filter((r) => r.openingFunding === 'EQUITY' && r.costPricePence > 0)),
                      currency
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-black/50">Supplier credit (if confirmed): </span>
                  <span className="font-semibold text-amber-700">
                    {formatMoney(
                      calcValue(
                        previewRows.filter((r) => r.openingFunding === 'SUPPLIER_CREDIT' && r.costPricePence > 0)
                      ),
                      currency
                    )}
                  </span>
                </div>
                <div>
                  <span className="text-black/50">Cash change: </span>
                  <span className="font-semibold">None</span>
                </div>
              </>
            ) : (
              <>
                <div>
                  <span className="text-black/50">Catalogue rows: </span>
                  <span className="font-semibold">{readyCount}</span>
                </div>
                <div>
                  <span className="text-black/50">Stock / journal: </span>
                  <span className="font-semibold">None</span>
                </div>
              </>
            )}
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            {confirmError && (
              <p className="text-xs text-red-600">{confirmError}</p>
            )}
            <div className="relative group">
              <button
                type="button"
                className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed sm:w-auto"
                disabled={!canConfirm || isImporting}
                onClick={handleConfirm}
              >
                {isImporting
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
        {importMode === 'PURCHASES' ? (
          <p className="mt-2 text-xs text-black/40">
            Paid a deposit on some stock? Import as Unpaid, then record the partial payment under{' '}
            <Link href="/purchases" className="underline">Purchases</Link>.
          </p>
        ) : importMode === 'CATALOGUE' ? (
          <p className="mt-2 text-xs text-black/40">
            Need quantities on hand? Use Opening Stock mode — catalogue import never posts stock or journals.
          </p>
        ) : (
          <p className="mt-2 text-xs text-black/40">
            Opening stock never reduces cash. Supplier debt is only created when you explicitly mark supplier credit.
          </p>
        )}
      </div>
    </div>
  );
}
