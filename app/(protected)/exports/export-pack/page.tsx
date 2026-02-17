import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export default async function ExportPackPage() {
  await requireBusiness(['MANAGER', 'OWNER']);

  const today = new Date();
  const thirtyDaysAgo = new Date(today.getTime() - 30 * 86400000);
  const defaultFrom = thirtyDaysAgo.toISOString().slice(0, 10);
  const defaultTo = today.toISOString().slice(0, 10);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Export Pack"
        subtitle="Download a ZIP archive containing all key reports for the selected period."
      />

      <div className="card p-6 max-w-lg">
        <h2 className="mb-4 text-base font-semibold">Select Date Range</h2>
        <form
          method="get"
          action="/api/exports/pack"
          className="space-y-4"
          target="_blank"
        >
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">From</label>
              <input className="input" type="date" name="from" defaultValue={defaultFrom} required />
            </div>
            <div>
              <label className="label">To</label>
              <input className="input" type="date" name="to" defaultValue={defaultTo} required />
            </div>
          </div>
          <button
            type="submit"
            className="btn-primary flex items-center gap-2"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M7 10l5 5m0 0l5-5m-5 5V4" />
            </svg>
            Download ZIP
          </button>
        </form>

        <div className="mt-6 rounded-xl bg-black/5 p-4 text-sm text-black/60">
          <p className="mb-2 font-medium text-black/70">The ZIP contains:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Sales Ledger CSV (all invoices in period)</li>
            <li>Purchases Ledger CSV (supplier invoices in period)</li>
            <li>VAT Report CSV (output tax, input tax, net payable)</li>
            <li>Debtors Listing (all outstanding balances, any period)</li>
            <li>Stock Movements CSV (adjustments in period)</li>
          </ul>
        </div>
      </div>

      <div className="card p-6 max-w-lg">
        <h2 className="mb-2 text-base font-semibold">Individual Exports</h2>
        <p className="text-sm text-black/50 mb-4">
          Need just one report? Use the quick links below.
        </p>
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: 'Sales CSV', href: '/exports/sales' },
            { label: 'Sales PDF', href: '/exports/sales-pdf' },
            { label: 'Purchases CSV', href: '/exports/purchases' },
            { label: 'Purchases PDF', href: '/exports/purchases-pdf' },
            { label: 'Inventory CSV', href: '/exports/inventory' },
            { label: 'Debtors CSV', href: '/exports/debtors' },
            { label: 'Debtors PDF', href: '/exports/debtors-pdf' },
            { label: 'Stock Movements', href: '/exports/inventory-movements' },
          ].map((link) => (
            <a
              key={link.href}
              href={link.href}
              target="_blank"
              rel="noopener noreferrer"
              className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-medium text-black/70 hover:bg-black/5 text-center"
            >
              {link.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}
