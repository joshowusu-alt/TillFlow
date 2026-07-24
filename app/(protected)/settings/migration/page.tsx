import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { MIGRATION_CONTRACT_VERSION } from '@/lib/migration/types';
import { MigrationClient } from './MigrationClient';
import { listMigrationBatches } from '@/lib/migration/batch-service';

export const dynamic = 'force-dynamic';

export default async function MigrationSettingsPage() {
  const user = await requireRole(['OWNER', 'MANAGER']).catch(() => null);
  if (!user) redirect('/login');

  const history = await listMigrationBatches(user.businessId, 10).catch(() => []);

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4 pb-24">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Business migration</h1>
          <p className="mt-1 text-sm text-black/60">
            Controlled catalogue and opening-stock migration using TillFlow templates (contract v
            {MIGRATION_CONTRACT_VERSION}).
          </p>
        </div>
        <Link href="/settings/import-stock" className="btn-secondary text-xs">
          Classic import
        </Link>
      </div>

      <MigrationClient />

      <section className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-black/50">Recent batches</h2>
        {history.length === 0 ? (
          <p className="text-sm text-black/50">No migration batches yet.</p>
        ) : (
          <ul className="divide-y divide-black/10 rounded-xl border border-black/10 bg-white">
            {history.map((b) => (
              <li key={b.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                <div>
                  <div className="font-medium">
                    {b.templateKind} · import {b.status} · recon {b.reconciliationStatus}
                  </div>
                  <div className="text-xs text-black/50">
                    {b.fileName || 'untitled'} · {b.sourceSystemKey} · valid {b.rowsValid}/
                    {b.rowsParsed} · imported {b.rowsImported}
                    {b.sourceSystemLabel ? ` · ${b.sourceSystemLabel}` : ''}
                  </div>
                </div>
                <div className="text-xs text-black/40">{b.createdAt.toISOString().slice(0, 10)}</div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
