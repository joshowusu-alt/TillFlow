'use client';

import { useState } from 'react';
import {
  MIGRATION_CONTRACT_VERSION,
  MIGRATION_TEMPLATE_KINDS,
  type CatalogueRow,
  type MigrationTemplateKind,
  type OpeningStockRow,
  type SupplierRow,
} from '@/lib/migration/types';
import { MIGRATION_DEFAULT_CHUNK_SIZE } from '@/lib/migration/limits';
import { parseMigrationCsv, chunkArray } from '@/lib/migration/parse';
import { emptyValidationState, validateRawRow } from '@/lib/migration/validate';
import { reconcileValidRows } from '@/lib/migration/reconcile';
import {
  approveMigrationBatchAction,
  createMigrationBatchAction,
  finalizeMigrationImportAction,
  finalizeMigrationValidationAction,
  getMigrationTemplateCsvAction,
  importMigrationChunkAction,
  runMigrationReconciliationAction,
  validateMigrationChunkAction,
} from '@/app/actions/migration';

type LogLine = { tone: 'info' | 'ok' | 'err'; text: string };

export function MigrationClient() {
  const [templateKind, setTemplateKind] = useState<MigrationTemplateKind>('CATALOGUE');
  const [sourceSystemKey, setSourceSystemKey] = useState('legacy-export');
  const [sourceSystemLabel, setSourceSystemLabel] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileChecksum, setFileChecksum] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [reconciliationStatus, setReconciliationStatus] = useState<string | null>(null);
  const [exceptionCount, setExceptionCount] = useState(0);
  const [readyRows, setReadyRows] = useState<
    Array<CatalogueRow | SupplierRow | OpeningStockRow>
  >([]);

  function push(tone: LogLine['tone'], text: string) {
    setLogs((prev) => [...prev, { tone, text }]);
  }

  async function downloadTemplate() {
    const res = await getMigrationTemplateCsvAction({ templateKind });
    if (!res.success) {
      push('err', res.error);
      return;
    }
    const blob = new Blob([res.data.csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.data.fileName;
    a.click();
    URL.revokeObjectURL(url);
    push('ok', `Downloaded ${res.data.fileName}`);
  }

  async function onFile(file: File | null) {
    if (!file) return;
    setBusy(true);
    setLogs([]);
    setBatchId(null);
    setStatus(null);
    setReconciliationStatus(null);
    setExceptionCount(0);
    setReadyRows([]);
    setFileChecksum(null);
    setFileName(file.name);
    try {
      const text = await file.text();
      const parsed = parseMigrationCsv(text, templateKind);
      if (parsed.missingRequiredHeaders.length) {
        push('err', `Missing headers: ${parsed.missingRequiredHeaders.join(', ')}`);
        return;
      }
      if (parsed.unsupportedHeaders.length) {
        push('info', `Unsupported / extra columns ignored: ${parsed.unsupportedHeaders.join(', ')}`);
      }
      if (!parsed.rows.length) {
        push('err', 'No data rows found.');
        return;
      }

      const state = emptyValidationState();
      const localValid: Array<CatalogueRow | SupplierRow | OpeningStockRow> = [];
      let localErrors = 0;
      for (const row of parsed.rows) {
        const result = validateRawRow(templateKind, row.rowNumber, row.raw, state);
        if (result.ok && result.row) localValid.push(result.row);
        else localErrors += 1;
      }
      push(
        'info',
        `Parsed ${parsed.rows.length} rows · locally valid ${localValid.length} · errors ${localErrors}`,
      );

      const chunks = chunkArray(parsed.rows, MIGRATION_DEFAULT_CHUNK_SIZE);
      const clientBatchKey = `mig-${templateKind}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const created = await createMigrationBatchAction({
        templateKind,
        clientBatchKey,
        sourceSystemKey,
        sourceSystemLabel: sourceSystemLabel.trim() || undefined,
        fileName: file.name,
        fileContent: text,
        chunksTotal: chunks.length,
        chunkSize: MIGRATION_DEFAULT_CHUNK_SIZE,
        expectedRows: parsed.rows.length,
      });
      if (!created.success) {
        push('err', created.error);
        return;
      }
      setBatchId(created.data.batchId);
      setStatus(created.data.status);
      setFileChecksum(created.data.fileChecksum);
      push(
        'ok',
        `Batch ${created.data.batchId} · checksum ${created.data.fileChecksum.slice(0, 12)}… · source ${sourceSystemKey}`,
      );

      let serverExceptions = 0;
      const serverValid: Array<CatalogueRow | SupplierRow | OpeningStockRow> = [];
      for (let i = 0; i < chunks.length; i++) {
        const res = await validateMigrationChunkAction({
          batchId: created.data.batchId,
          chunkIndex: i,
          fileChecksum: created.data.fileChecksum,
          rows: chunks[i],
        });
        if (!res.success) {
          push('err', res.error);
          return;
        }
        const data = res.data as {
          duplicate?: boolean;
          rowsValid?: number;
          rowsInvalid?: number;
          exceptions?: unknown[];
          validRows?: Array<CatalogueRow | SupplierRow | OpeningStockRow>;
        };
        if (data.duplicate) {
          push('info', `Validate chunk ${i} already received (idempotent).`);
          continue;
        }
        serverExceptions += data.exceptions?.length ?? 0;
        if (data.validRows?.length) serverValid.push(...data.validRows);
        push(
          'info',
          `Validated chunk ${i + 1}/${chunks.length}: valid ${data.rowsValid ?? 0}, invalid ${data.rowsInvalid ?? 0}`,
        );
      }

      const finalised = await finalizeMigrationValidationAction({
        batchId: created.data.batchId,
        fileChecksum: created.data.fileChecksum,
      });
      if (!finalised.success) {
        push('err', finalised.error);
        return;
      }
      setStatus(finalised.data.status);
      setExceptionCount(serverExceptions);
      setReadyRows(serverValid);
      push('ok', `Validation finished → ${finalised.data.status}`);
      if (finalised.data.status === 'VALIDATION_FAILED') {
        push('err', 'No valid rows — fix the file and upload again with a new batch.');
      }
    } catch (e) {
      push('err', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function approveAndImport() {
    if (!batchId || !fileChecksum || !readyRows.length) return;
    setBusy(true);
    try {
      const approved = await approveMigrationBatchAction({ batchId, fileChecksum });
      if (!approved.success) {
        push('err', approved.error);
        return;
      }
      setStatus(approved.data.status);
      push('ok', 'Batch approved for this checksum');

      const chunks = chunkArray(readyRows, MIGRATION_DEFAULT_CHUNK_SIZE);
      for (let i = 0; i < chunks.length; i++) {
        const res = await importMigrationChunkAction({
          batchId,
          chunkIndex: i,
          fileChecksum,
          rows: chunks[i],
        });
        if (!res.success) {
          push('err', res.error);
          return;
        }
        const data = res.data as {
          duplicate?: boolean;
          imported?: number;
          skipped?: number;
          failed?: number;
        };
        if (data.duplicate) {
          push('info', `Import chunk ${i} already applied (idempotent).`);
          continue;
        }
        push(
          'info',
          `Imported chunk ${i + 1}/${chunks.length}: +${data.imported ?? 0} · skip ${data.skipped ?? 0} · fail ${data.failed ?? 0}`,
        );
      }

      const done = await finalizeMigrationImportAction({ batchId, fileChecksum });
      if (!done.success) {
        push('err', done.error);
        return;
      }
      setStatus(done.data.status);
      setReconciliationStatus(done.data.reconciliationStatus);
      push(
        'ok',
        `Import finished → ${done.data.status}. Reconciliation is ${done.data.reconciliationStatus} (not assumed matched).`,
      );

      const expected = reconcileValidRows(templateKind, readyRows);
      const recon = await runMigrationReconciliationAction({ batchId, expected });
      if (!recon.success) {
        push('err', recon.error);
        return;
      }
      setReconciliationStatus(recon.data.reconciliationStatus);
      push(
        recon.data.reconciliationStatus === 'MATCHED' ? 'ok' : 'err',
        `Control totals → ${recon.data.reconciliationStatus}`,
      );
    } catch (e) {
      push('err', e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-black/10 bg-white p-4 space-y-3">
        <p className="text-sm text-black/70">
          TillFlow migration contract <strong>v{MIGRATION_CONTRACT_VERSION}</strong>. Transform any
          source export into these templates before upload. Import completion is not the same as
          successful reconciliation. This path does not create sales, cash, MoMo, customers or
          supplier payables.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-sm space-y-1">
            <span className="font-medium">Template</span>
            <select
              className="w-full rounded-lg border border-black/15 px-3 py-2"
              value={templateKind}
              disabled={busy}
              onChange={(e) => setTemplateKind(e.target.value as MigrationTemplateKind)}
            >
              {MIGRATION_TEMPLATE_KINDS.map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm space-y-1">
            <span className="font-medium">Source system key (required)</span>
            <input
              className="w-full rounded-lg border border-black/15 px-3 py-2"
              placeholder="legacy-export"
              value={sourceSystemKey}
              disabled={busy}
              onChange={(e) => setSourceSystemKey(e.target.value)}
            />
          </label>
          <label className="text-sm space-y-1 sm:col-span-2">
            <span className="font-medium">Source label (optional display only)</span>
            <input
              className="w-full rounded-lg border border-black/15 px-3 py-2"
              placeholder="e.g. transformed export Sep 2026"
              value={sourceSystemLabel}
              disabled={busy}
              onChange={(e) => setSourceSystemLabel(e.target.value)}
            />
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn-secondary text-sm" disabled={busy} onClick={downloadTemplate}>
            Download template
          </button>
          <label className="btn-primary text-sm cursor-pointer">
            {busy ? 'Working…' : 'Upload CSV'}
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={busy}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
            />
          </label>
          {status === 'READY_FOR_APPROVAL' && (
            <button
              type="button"
              className="btn-primary text-sm"
              disabled={busy || !readyRows.length}
              onClick={approveAndImport}
            >
              Approve & import valid rows
            </button>
          )}
        </div>
        {(batchId || fileName || status) && (
          <p className="text-xs text-black/60">
            {fileName ? `File: ${fileName}` : null}
            {batchId ? ` · Batch: ${batchId}` : null}
            {status ? ` · Import: ${status}` : null}
            {reconciliationStatus ? ` · Reconciliation: ${reconciliationStatus}` : null}
            {exceptionCount ? ` · Exceptions logged: ${exceptionCount}` : null}
          </p>
        )}
      </div>

      <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4 space-y-1 max-h-80 overflow-auto">
        {logs.length === 0 ? (
          <p className="text-sm text-black/50">Progress will appear here.</p>
        ) : (
          logs.map((l, i) => (
            <p
              key={i}
              className={
                l.tone === 'err'
                  ? 'text-sm text-red-700'
                  : l.tone === 'ok'
                    ? 'text-sm text-emerald-700'
                    : 'text-sm text-black/70'
              }
            >
              {l.text}
            </p>
          ))
        )}
      </div>
    </div>
  );
}
