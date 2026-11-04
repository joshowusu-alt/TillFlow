import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import BackupClient from '@/app/(protected)/settings/backup/BackupClient';
import RepairPaymentStatusButton from './RepairPaymentStatusButton';
const actions = vi.hoisted(() => ({ repair: vi.fn(), restore: vi.fn() }));
vi.mock('@/app/actions/backup', () => ({ exportDatabaseAction: vi.fn(), importDatabaseAction: actions.restore, resetAllDataAction: vi.fn() }));
vi.mock('@/app/actions/repair', () => ({ repairPaymentStatusDriftAction: actions.repair }));
vi.mock('@/components/PageHeader', () => ({ default: ({ title }: { title: string }) => <h1>{title}</h1> }));
const snapshot = { version: '1.4', business: { name: 'Test business' }, exportedAt: '2026-11-04T12:00:00Z', products: [], customers: [], salesInvoices: [], purchaseInvoices: [] };
const upload = (data: unknown) => fireEvent.change(screen.getByLabelText('Choose a TillFlow backup (.json)'), { target: { files: [new File([JSON.stringify(data)], 'backup.json', { type: 'application/json' })] } });
describe('backup file selection', () => {
  it('previews without restoring, cancels, and rejects a malformed replacement without retaining the earlier snapshot', async () => {
    render(<BackupClient />);
    upload(snapshot);
    await screen.findByText('Test business');
    expect(actions.restore).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    upload({ ...snapshot, exportedAt: 'bad date' });
    await screen.findByRole('alert');
    expect(screen.queryByText('Test business')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Restore Backup' })).not.toBeInTheDocument();
    upload(snapshot);
    await screen.findByText('Test business');
  });
  it('keeps reset controls behind an explicit expandable section', () => {
    render(<BackupClient />);
    expect(screen.queryByRole('button', { name: 'Reset All Data' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Reset business data/ }));
    expect(screen.getByRole('button', { name: 'Reset All Data' })).toBeEnabled();
  });
});
describe('repair progress', () => {
  it('keeps the action disabled until its asynchronous request finishes', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    let finish!: (value: unknown) => void;
    actions.repair.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    render(<RepairPaymentStatusButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Repair payment statuses' }));
    expect(screen.getByRole('button', { name: 'Repairing…' })).toBeDisabled();
    expect(actions.repair).toHaveBeenCalledTimes(1);
    finish({ success: true, data: { updatedSales: 2, updatedPurchases: 0, skippedReview: 1 } });
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Updated 2 invoice statuses. 1 left for manual review.'));
    expect(screen.getByRole('button', { name: 'Repair payment statuses' })).toBeEnabled();
  });
});
