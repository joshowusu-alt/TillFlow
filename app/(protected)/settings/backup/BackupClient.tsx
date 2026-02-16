'use client';

import { useState, useRef } from 'react';
import PageHeader from '@/components/PageHeader';
import { exportDatabaseAction, importDatabaseAction, resetAllDataAction, type BackupData } from '@/app/actions/backup';

export default function BackupClient() {
    const [exporting, setExporting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [resetting, setResetting] = useState(false);
    const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
    const [previewData, setPreviewData] = useState<BackupData | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

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
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = JSON.parse(e.target?.result as string) as BackupData;

                // Basic validation
                if (!data.version || !data.business || !data.exportedAt) {
                    setMessage({ type: 'error', text: 'Invalid backup file format' });
                    return;
                }

                setPreviewData(data);
                setMessage(null);
            } catch {
                setMessage({ type: 'error', text: 'Failed to parse backup file' });
            }
        };
        reader.readAsText(file);
    };

    const handleImport = async () => {
        if (!previewData) return;

        const confirmed = window.confirm(
            'WARNING: This will replace ALL current data with the backup. This action cannot be undone. Continue?'
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
                title="Data Backup"
                subtitle="Export and restore your business data."
            />

            {message && (
                <div
                    className={`rounded-xl p-4 ${message.type === 'success'
                            ? 'bg-emerald-50 text-emerald-800'
                            : 'bg-rose-50 text-rose-800'
                        }`}
                >
                    {message.text}
                </div>
            )}

            <div className="grid gap-6 lg:grid-cols-2">
                {/* Export Section */}
                <div className="card p-6">
                    <h2 className="text-lg font-display font-semibold">Export Backup</h2>
                    <p className="mt-2 text-sm text-black/60">
                        Download a complete backup of your database as a JSON file. Store this file safely for disaster recovery.
                    </p>
                    <div className="mt-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                        <strong>Note:</strong> Passwords are not included in backups for security. Users will need to reset their passwords after a restore.
                    </div>
                    <button
                        onClick={handleExport}
                        disabled={exporting}
                        className="btn-primary mt-4"
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
                <div className="card p-6">
                    <h2 className="text-lg font-display font-semibold">Restore Backup</h2>
                    <p className="mt-2 text-sm text-black/60">
                        Restore your database from a previously exported backup file.
                    </p>
                    <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                        <strong>Warning:</strong> Restoring will replace ALL current data. Make sure to export a backup first.
                    </div>

                    {!previewData ? (
                        <div className="mt-4">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".json"
                                onChange={handleFileSelect}
                                className="block w-full text-sm text-black/60 file:mr-4 file:rounded-xl file:border-0 file:bg-black/5 file:px-4 file:py-2 file:text-sm file:font-semibold hover:file:bg-black/10"
                            />
                        </div>
                    ) : (
                        <div className="mt-4 space-y-4">
                            <div className="rounded-xl border border-black/10 bg-black/5 p-4">
                                <h3 className="font-semibold">Backup Preview</h3>
                                <div className="mt-2 space-y-1 text-sm text-black/60">
                                    <div>Exported: {new Date(previewData.exportedAt).toLocaleString()}</div>
                                    <div>Business: {previewData.business.name}</div>
                                    <div>Products: {previewData.products?.length ?? 0}</div>
                                    <div>Customers: {previewData.customers?.length ?? 0}</div>
                                    <div>Sales: {previewData.salesInvoices?.length ?? 0}</div>
                                    <div>Purchases: {previewData.purchaseInvoices?.length ?? 0}</div>
                                </div>
                            </div>
                            <div className="flex gap-2">
                                <button
                                    onClick={handleImport}
                                    disabled={importing}
                                    className="btn bg-rose-600 text-white hover:bg-rose-700"
                                >
                                    {importing ? 'Restoring...' : 'Restore Backup'}
                                </button>
                                <button
                                    onClick={cancelImport}
                                    disabled={importing}
                                    className="btn-ghost"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Reset Section */}
            <div className="card border-2 border-rose-200 p-6">
                <h2 className="text-lg font-display font-semibold text-rose-700">Start Fresh</h2>
                <p className="mt-2 text-sm text-black/60">
                    Delete all products, inventory, sales, purchases, expenses, customers, and suppliers.
                    Your business settings, user accounts, and tills are kept so you can start entering real data immediately.
                </p>
                <div className="mt-4 rounded-xl bg-rose-50 p-3 text-sm text-rose-800">
                    <strong>Warning:</strong> This action is permanent and cannot be undone. We recommend exporting a backup first.
                </div>
                <button
                    onClick={handleReset}
                    disabled={resetting}
                    className="btn mt-4 bg-rose-600 text-white hover:bg-rose-700"
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
            </div>

            {/* Best Practices */}
            <div className="card p-6">
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
                        Test restoring from backup periodically to ensure files are valid
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
