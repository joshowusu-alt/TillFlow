import CountUp from '@/components/marketing/CountUp';
import { DEMO_BUSINESS, DEMO_STOCK_SUMMARY } from '@/lib/marketing/demo-metrics';
import { MarketingEyebrow } from '@/components/marketing/visuals/CommandCentrePreview';

const STOCK_ROWS = [
  { name: 'Royal Aroma Rice 5kg', stock: '42 packs', status: 'OK', tone: 'ok' as const },
  { name: 'Indomie Chicken Flavour Pack', stock: '6 packs', status: 'Low', tone: 'low' as const },
  { name: 'Cowbell Milk 400g', stock: '96 tins', status: 'OK', tone: 'ok' as const },
];

const SUPPLIER_ROWS = [
  { name: 'Fresh Foods Ltd', owed: 'GH₵640', due: 'Due today' },
  { name: 'Accra Wholesale', owed: 'GH₵420', due: 'In 3 days' },
];

export function StockSuppliersPreview({ className = '' }: { className?: string }) {
  return (
    <div className={`operational-page space-y-4 rounded-[1.25rem] border border-slate-200/80 bg-white p-4 shadow-card ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <MarketingEyebrow>Inventory</MarketingEyebrow>
          <h4 className="mt-2 text-base font-display font-bold text-ink">Products & stock</h4>
        </div>
        <span className="text-xs text-muted">{DEMO_BUSINESS.branch}</span>
      </div>

      <div className="operational-metric-grid operational-metric-grid--3 grid grid-cols-3 gap-2">
        {[
          { label: 'Total products', value: <CountUp value={DEMO_STOCK_SUMMARY.totalProducts} /> },
          { label: 'Low stock', value: <CountUp value={DEMO_STOCK_SUMMARY.lowStock} /> },
          { label: 'Out of stock', value: <CountUp value={DEMO_STOCK_SUMMARY.outOfStock} /> },
        ].map((metric) => (
          <div key={metric.label} className="rounded-xl border border-black/5 bg-white p-3 shadow-sm">
            <div className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">{metric.label}</div>
            <div className="mt-1 text-lg font-display font-bold tabular-nums text-ink">{metric.value}</div>
          </div>
        ))}
      </div>

      <div className="inline-flex rounded-xl border border-black/5 bg-surfaceMuted p-1">
        <span className="rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-ink shadow-sm">Products</span>
        <span className="px-3 py-1.5 text-xs font-medium text-black/45">Categories</span>
      </div>

      <div className="overflow-hidden rounded-xl border border-black/5">
        <div className="border-b border-black/5 bg-slate-50 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.18em] text-black/45">
          Stock levels
        </div>
        <div className="divide-y divide-black/5">
          {STOCK_ROWS.map((row) => (
            <div key={row.name} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <span className="min-w-0 truncate text-xs font-medium text-ink">{row.name}</span>
              <span className="text-xs text-black/50">{row.stock}</span>
              <span
                className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                  row.tone === 'low' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-700'
                }`}
              >
                {row.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
        <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-accent">Supplier payables</div>
        <div className="mt-2 space-y-2">
          {SUPPLIER_ROWS.map((row) => (
            <div key={row.name} className="flex items-center justify-between gap-2 text-xs">
              <span className="font-medium text-ink">{row.name}</span>
              <span className="font-semibold tabular-nums text-ink">{row.owed}</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold text-black/50">{row.due}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
