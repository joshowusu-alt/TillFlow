import Link from 'next/link';
import { buildDemoLedger } from '@/lib/demo-fixtures';
import { ADOM_RETAIL_DEMO_NAME, ADOM_RETAIL_DEMO_SLUG, DEMO_AGENT_TALKING_POINTS, DEMO_PERIOD_DAYS } from '@/lib/demo-sandbox/constants';
import { formatMoney } from '@/lib/format';

const STEPS = [
  { href: '/demo/dashboard', label: 'View demo dashboard', desc: 'Revenue, profit, cash and alerts' },
  { href: '/demo/try-sale', label: 'Try a sample sale', desc: 'Practice checkout without saving data' },
  { href: '/demo/inventory', label: 'View stock', desc: '100+ Ghana-friendly products' },
  { href: '/demo/reports', label: 'See sample reports', desc: 'Sales, margins and low stock' },
  { href: '/demo/store', label: 'Open demo online store', desc: 'Categories, cart and MoMo checkout' },
  { href: '/demo/orders', label: 'Sample online orders', desc: 'Awaiting payment through collected' },
] as const;

export default function DemoHubPage() {
  const snapshot = buildDemoLedger();
  const kpis = snapshot.totals;

  return (
    <div className="space-y-10">
      <div className="rounded-3xl border border-black/8 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-semibold uppercase tracking-widest text-accent">Sample business</p>
        <h1 className="mt-2 text-3xl font-bold font-display text-ink sm:text-4xl">{ADOM_RETAIL_DEMO_NAME}</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-muted">
          Explore how TillFlow tracks sales, stock, payments, suppliers, debtors and reports — using{' '}
          <strong className="text-ink">{DEMO_PERIOD_DAYS} days of sample trading history</strong>. No real client
          data is shown here.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-muted">Sample revenue ({DEMO_PERIOD_DAYS}d)</p>
            <p className="text-lg font-bold text-ink">{formatMoney(kpis.totalRevenuePence, 'GHS')}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-muted">Products in catalogue</p>
            <p className="text-lg font-bold text-ink">{snapshot.products.length}</p>
          </div>
          <div className="rounded-xl bg-slate-50 px-4 py-3">
            <p className="text-xs text-muted">Sample sales count</p>
            <p className="text-lg font-bold text-ink">{snapshot.salesInvoices.length}</p>
          </div>
        </div>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/demo/try-sale" className="btn-primary">
            Try a sample sale
          </Link>
          <Link href="/demo/dashboard" className="btn-secondary">
            View demo dashboard
          </Link>
          <Link href="/register" className="text-sm font-semibold text-accent hover:underline self-center">
            Start your real business →
          </Link>
        </div>
      </div>

      <section>
        <h2 className="text-lg font-bold text-ink">Explore the demo</h2>
        <p className="mt-1 text-sm text-muted">Follow the path agents use — no technical setup required.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {STEPS.map((step, i) => (
            <Link
              key={step.href}
              href={step.href}
              className="group rounded-2xl border border-black/8 bg-white p-4 shadow-sm transition hover:border-accent/25 hover:shadow-md"
            >
              <span className="text-xs font-bold text-accent">Step {i + 1}</span>
              <p className="mt-1 font-semibold text-ink group-hover:text-accent">{step.label}</p>
              <p className="mt-0.5 text-sm text-muted">{step.desc}</p>
            </Link>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-accent/15 bg-accentSoft/40 p-5">
        <h2 className="text-sm font-bold text-ink">For sales conversations</h2>
        <p className="mt-2 text-sm text-muted">
          Say: &ldquo;This is sample business data. Your own TillFlow account will show your actual sales, stock,
          payments, suppliers, debtors and reports.&rdquo;
        </p>
        <ul className="mt-4 space-y-2 text-sm text-ink">
          {DEMO_AGENT_TALKING_POINTS.map((point) => (
            <li key={point} className="flex gap-2">
              <span className="text-accent">•</span>
              {point}
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-2xl border border-black/8 bg-white p-5 text-sm text-muted">
        <p>
          Live storefront preview:{' '}
          <Link href={`/shop/${ADOM_RETAIL_DEMO_SLUG}`} className="font-semibold text-accent hover:underline">
            /shop/{ADOM_RETAIL_DEMO_SLUG}
          </Link>
          . This is sample business data — your own TillFlow account will show your real sales, stock, payments and
          reports.
        </p>
      </section>
    </div>
  );
}
