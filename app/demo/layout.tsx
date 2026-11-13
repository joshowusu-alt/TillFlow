import '@/app/commercial-public.css';
import { buildDemoLedger } from '@/lib/demo-fixtures';
import DemoJourneys from '@/components/marketing/DemoJourneys';
import DemoNavTabs from './_components/DemoNavTabs';
import BookDemoActions from '@/components/marketing/BookDemoActions';
import { buildTillflowPublicMetadata } from '@/lib/marketing/site';
import { ADOM_RETAIL_DEMO_NAME, DEMO_PERIOD_DAYS } from '@/lib/demo-sandbox/constants';

export const dynamic = 'force-dynamic';

export const metadata = buildTillflowPublicMetadata({
  title: `Explore ${ADOM_RETAIL_DEMO_NAME} | TillFlow`,
  description:
    'Explore sample business data — sales, stock, payments, debtors, suppliers and reports. No signup required.',
  canonicalPath: '/demo',
  noIndex: true,
});

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  const { period } = buildDemoLedger();
  const date = (d: Date) => d.toLocaleDateString('en-GH', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Africa/Accra' });
  return (
    <div className="commercial-public min-h-screen bg-slate-50">
      {/* Demo banner — safe-area aware */}
      <div
        className="relative z-50 flex items-center justify-between bg-accent px-4 text-sm font-semibold text-white shadow"
        style={{ paddingTop: 'max(14px, env(safe-area-inset-top, 0px))', paddingBottom: '10px' }}
      >
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest">
            Demo
          </span>
          <span className="hidden font-medium sm:block">
            {ADOM_RETAIL_DEMO_NAME} — {DEMO_PERIOD_DAYS}-day sample business data
          </span>
          <span className="font-medium sm:hidden">Sample business data</span>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2">
          <BookDemoActions layout="compact" />
          <a
            href="/register"
            className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-accent transition-colors hover:bg-blue-50"
          >
            Start your real business →
          </a>
        </div>
      </div>

      {/* Tab navigation — offsets below the banner */}
      <div
        className="sticky z-40 border-b border-black/8 bg-white shadow-sm"
        style={{ top: 0 }}
      >
        <div className="mx-auto max-w-7xl">
          <DemoNavTabs />
        </div>
      </div>

      <p data-testid="demo-period" className="mx-auto max-w-7xl px-4 pt-4 text-xs leading-5 text-slate-600">Fictional data · {DEMO_PERIOD_DAYS} days · {date(period.start)} – {date(period.end)} · Ghana time</p>
      {/* Page content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
        <div className="mt-8"><DemoJourneys /></div>
      </main>
    </div>
  );
}
