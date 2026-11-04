'use client';

import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import SettingsSection from '@/components/SettingsSection';
import PageHeader from '@/components/PageHeader';
import { exportDatabaseAction, importDatabaseAction, resetAllDataAction, type BackupData } from '@/app/actions/backup';

export default function BackupClient() {
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [previewData, setPreviewData] = useState<BackupData | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const selection = useRef(0);
    const [reading, setReading] = useState(false);
    const [ready, setReady] = useState(false);
    useEffect(() => setReady(true), []);
    const busy = exporting || importing || resetting || reading || !ready;

    const handleExport = async () => {
        setExporting(true);
        setMessage(null);

        try {
            const result = await exportDatabaseAction();

            if (result.success) {
                // Create and download the JSON file
                const blob = new Blob([JSON.stringify(result.data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                const date = new Date().toISOString().split('T')[0];
                a.href = url;
                a.download = `backup-${date}.json`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);

                setMessage({ type: 'success', text: 'Backup exported successfully!' });
            } else {
                setMessage({ type: 'error', text: result.error });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Export failed' });
        } finally {
            setExporting(false);
        }
    };

    const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
        const token = ++selection.current;
        const file = event.target.files?.[0];
        setPreviewData(null);
        setMessage(null);
        if (!file) return;
        setReading(true);
        const reader = new FileReader();
        reader.onload = () => {
            if (token !== selection.current) return;
            try {
                const data = JSON.parse(String(reader.result));
                if (!data || typeof data !== 'object' || data.version !== '1.4' ||
                    typeof data.business?.name !== 'string' || !data.business.name.trim() ||
                    typeof data.exportedAt !== 'string' || !Number.isFinite(Date.parse(data.exportedAt)) ||
                    ['products', 'customers', 'salesInvoices', 'purchaseInvoices'].some(key => !Array.isArray(data[key]))) {
                    throw new Error('Choose a version 1.4 TillFlow backup with a valid business, export date and record lists.');
                }
                setPreviewData(data as BackupData);
            } catch (error) {
                setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Could not read this backup.' });
                if (fileInputRef.current) fileInputRef.current.value = '';
            } finally {
                setReading(false);
            }
        };
        reader.onerror = () => {
            if (token !== selection.current) return;
            setReading(false);
            setMessage({ type: 'error', text: 'Could not read this file. Choose it again.' });
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!previewData) return;

        const confirmed = window.confirm(
            'WARNING: This will replace supported trading records with this snapshot. Businesses with unsupported operational history require assisted recovery. Export current data first. Continue?'
        );
        if (!confirmed) return;

        setImporting(true);
        setMessage(null);

        try {
            const result = await importDatabaseAction(previewData);

            if (result.success) {
                setMessage({ type: 'success', text: result.data.message });
                setPreviewData(null);
                if (fileInputRef.current) {
                    fileInputRef.current.value = '';
                }
            } else {
                setMessage({ type: 'error', text: result.error });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Import failed' });
        } finally {
            setImporting(false);
        }
    };

    const cancelImport = () => {
        ++selection.current;
        setReading(false);
        setPreviewData(null);
        setMessage(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    const handleReset = async () => {
        const first = window.confirm(
            'This will permanently delete ALL products, sales, purchases, inventory, expenses, customers, and suppliers. Your business settings and user accounts will be kept.\n\nContinue?'
        );
        if (!first) return;

        const second = window.prompt(
            'Type RESET to confirm you want to wipe all data. This cannot be undone.'
        );
        if (second !== 'RESET') {
            setMessage({ type: 'error', text: 'Reset cancelled — you must type RESET to confirm.' });
            return;
        }

        setResetting(true);
        setMessage(null);

        try {
            const result = await resetAllDataAction();
            if (result.success) {
                setMessage({ type: 'success', text: result.data.message });
            } else {
                setMessage({ type: 'error', text: result.error });
            }
        } catch (error) {
            setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Reset failed' });
        } finally {
            setResetting(false);
        }
    };

    return (
        <div className="space-y-6">
            <PageHeader
                title="Backup & Restore"
                subtitle="Recovery tools for exporting, restoring, and safely resetting business data."
            />

            <nav aria-label="Backup sections" className="flex flex-wrap gap-2">
                <a href="#export-backup" className="btn-secondary text-xs">Export backup</a>
                <a href="#restore-backup" className="btn-secondary text-xs">Restore backup</a>
                <a href="#reset-data" className="btn-secondary text-xs">Reset data</a>
            </nav>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/70 p-4">
                <h2 className="text-sm font-semibold text-blue-900">Export before making recovery changes</h2>
                <p className="mt-1 text-sm text-blue-800">Check sync activity and data diagnostics first. Use a restore only when a supported trading snapshot is needed.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                    <Link href="/settings/system-health" className="btn-secondary text-xs">
                        Open System Health
                    </Link>
                    <Link href="/offline/sales" className="btn-secondary text-xs">
                        View Pending Offline Sales
                    </Link>
                    <Link href="/settings/data-repair" className="btn-secondary text-xs">
                        Advanced Recovery Tools
                    </Link>
                </div>
            </div>

            {message && (
                <div
                    role={message.type === 'error' ? 'alert' : 'status'}
                    className={`break-words rounded-xl p-4 ${message.type === 'success'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-rose-50 text-rose-800'
                        }`}
                >
                    {message.text}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Export Section */}
                <div id="export-backup" className="card min-w-0 scroll-mt-6 p-4 sm:p-6">
                    <h2 className="text-lg font-display font-semibold">Export Backup</h2>
                    <p className="mt-2 text-sm text-black/60">
                        Export the active business’s supported trading records. This is not a full database backup. Businesses with online orders, stocktakes or other operational history may need assisted recovery.
                    </p>
                    <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                        <strong>Note:</strong> Passwords are omitted. The restoring owner keeps their current sign-in; other users need password resets after a restore.
                    </div>
                    <div className="mt-3 rounded-xl border border-black/5 bg-black/[0.02] p-3 text-sm text-black/60">
                        Includes business settings, catalog, inventory, sales, purchases, accounting data, tills, and shifts for the active business.
                    </div>
                    <button
                        onClick={handleExport}
                        disabled={busy}
                        className="btn-primary mt-4 w-full sm:w-auto"
                    >
                        {exporting ? (
                            <>
                                <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                                </svg>
                                Exporting...
                            </>
                        ) : (
                            <>
                                <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                                </svg>
                                Download Backup
                            </>
                        )}
                    </button>
                </div>

                {/* Import Section */}
                <div id="restore-backup" className="card min-w-0 scroll-mt-6 p-4 sm:p-6">
                    <h2 className="text-lg font-display font-semibold">Restore Backup</h2>
                    <p className="mt-2 text-sm text-black/60">
                        Restore supported trading records from a previously exported snapshot. Full recovery of other operational history requires operator assistance.
                    </p>
                    <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                        <strong>Warning:</strong> Restoring replaces current supported trading records. Export current data first. Unsupported history is refused rather than deleted.
                    </div>

                    {!previewData ? (
                        <div className="mt-4">
                            <label className="label" htmlFor="backup-file">Choose a TillFlow backup (.json)</label>
                            <p id="backup-file-help" className="mb-3 text-xs text-black/50">Selecting a file only shows a preview. Nothing is restored until you confirm.</p>
                            <input
                                id="backup-file"
                                aria-describedby="backup-file-help"
                                disabled={busy}
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileSelect}
                                className="block w-full text-sm text-black/60 file:mr-4 file:rounded-xl file:border-0 file:bg-black/5 file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-black/10"
                            />
                            {reading && <p role="status" className="mt-2 text-sm">Reading backup…</p>}
                        </div>
                    ) : (
                        <div className="mt-4 space-y-4">
                            <div className="rounded-xl border border-black/10 bg-black/5 p-4">
                                <h3 className="font-semibold">Backup Preview</h3>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm text-black/60">
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.16em] text-black/40">Exported</div>
                                        <div className="mt-1">{new Date(previewData.exportedAt).toLocaleString()}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.16em] text-black/40">Business</div>
                                        <div className="mt-1 break-words">{previewData.business.name}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.16em] text-black/40">Products</div>
                                        <div className="mt-1">{previewData.products?.length ?? 0}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.16em] text-black/40">Customers</div>
                                        <div className="mt-1">{previewData.customers?.length ?? 0}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.16em] text-black/40">Sales</div>
                                        <div className="mt-1">{previewData.salesInvoices?.length ?? 0}</div>
                                    </div>
                                    <div>
                                        <div className="text-xs uppercase tracking-[0.16em] text-black/40">Purchases</div>
                                        <div className="mt-1">{previewData.purchaseInvoices?.length ?? 0}</div>
                                    </div>
                                </div>
                                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                                    Confirm that the export date, business name, and record counts look correct before restoring.
                                </div>
                            </div>
                            <div className="flex flex-col gap-2 sm:flex-row">
                                <button
                                    onClick={handleImport}
                                    disabled={busy}
                                    className="btn bg-rose-600 text-white hover:bg-rose-700 w-full sm:w-auto"
                                >
                                    {importing ? 'Restoring...' : 'Restore Backup'}
                                </button>
                                <button
                                    onClick={cancelImport}
                                    disabled={busy}
                                    className="btn-ghost w-full sm:w-auto"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Reset Section */}
            <SettingsSection id="reset-data" title="Reset business data" description="Permanent removal of trading records. Export a backup first." badge="Destructive action">
                <p className="mt-2 text-sm text-black/60">
                    Delete all products, inventory, sales, purchases, expenses, customers, and suppliers.
                    Your business settings, user accounts, and tills are kept so you can start entering real data immediately.
                </p>
                <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                    <strong>Warning:</strong> This action is permanent and cannot be undone. We recommend exporting a backup first.
                </div>
                <button
                    onClick={handleReset}
                    disabled={busy}
                    className="btn mt-4 bg-rose-600 text-white hover:bg-rose-700 w-full sm:w-auto"
                >
                    {resetting ? (
                        <>
                            <svg className="mr-2 h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Resetting...
                        </>
                    ) : (
                        <>
                            <svg className="mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                            Reset All Data
                        </>
                    )}
                </button>
            </SettingsSection>

            {/* Best Practices */}
            <div className="card p-4 sm:p-6">
                <h2 className="text-lg font-display font-semibold">Backup Best Practices</h2>
                <ul className="mt-4 space-y-2 text-sm text-black/60">
                    <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Export backups regularly (at least weekly)
                    </li>
                    <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Store backup files in multiple locations (cloud storage, external drive)
                    </li>
                    <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Test restores in a separate test environment before relying on a backup
                    </li>
                    <li className="flex items-start gap-2">
                        <svg className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                        Keep backup files secure – they contain sensitive business data
                    </li>
                </ul>
            </div>
        </div>
    );
}
