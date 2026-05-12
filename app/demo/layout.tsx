import DemoNavTabs from './_components/DemoNavTabs';

export const metadata = {
  title: 'Demo – Kwame & Family Supermarket | TillFlow',
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-slate-50">
      {/* Demo banner */}
      <div className="sticky top-0 z-50 flex items-center justify-between bg-accent px-4 py-2.5 text-sm font-semibold text-white shadow">
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center rounded-full bg-white/20 px-2.5 py-0.5 text-xs font-bold uppercase tracking-widest">
            Demo
          </span>
          <span className="hidden font-medium sm:block">
            Kwame &amp; Family Supermarket — Demo supermarket data
          </span>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/register"
            className="inline-flex min-h-9 items-center rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-accent hover:bg-blue-50 transition-colors"
          >
            Start your real business →
          </a>
        </div>
      </div>

      {/* Tab navigation */}
      <div className="sticky top-[46px] z-40 border-b border-black/10 bg-slate-100">
        <div className="mx-auto max-w-7xl">
          <DemoNavTabs />
        </div>
      </div>

      {/* Page content */}
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
