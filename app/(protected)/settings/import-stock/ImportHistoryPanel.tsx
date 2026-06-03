import type { ProductImportHistoryItem } from '@/app/actions/import-catalog';

export default function ImportHistoryPanel({ imports }: { imports: ProductImportHistoryItem[] }) {
  if (imports.length === 0) {
    return (
      <div className="card p-4 text-sm text-black/50">
        No imports recorded yet. Your first upload will appear here.
      </div>
    );
  }

  return (
    <div className="card overflow-hidden p-0">
      <div className="border-b border-black/10 px-4 py-3">
        <h3 className="font-semibold text-sm">Recent imports</h3>
        <p className="text-xs text-black/50 mt-0.5">Last {imports.length} uploads for this business</p>
      </div>
      <ul className="divide-y divide-black/5">
        {imports.map((item) => (
          <li key={item.id} className="px-4 py-3 text-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium text-ink">{item.fileName ?? 'Stock import'}</p>
                <p className="text-xs text-black/50">
                  {new Date(item.createdAt).toLocaleString()} · {item.status}
                </p>
              </div>
              <div className="text-xs text-black/60 text-right">
                <p>{item.rowsImported} imported · {item.rowsUpdated} updated</p>
                <p>{item.rowsSkipped} skipped · {item.rowsParsed} rows in file</p>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
