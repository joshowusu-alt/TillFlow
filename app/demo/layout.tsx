export const metadata = {
  title: 'Demo – Supermarket POS',
  robots: { index: false, follow: false },
};

export default function DemoLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      {/* Persistent demo banner */}
      <div className="sticky top-0 z-50 flex items-center justify-between bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-900 shadow">
        <span>
          🧪 DEMO MODE — This is a sandboxed demo with sample data. No real transactions are processed.
        </span>
        <a
          href="/register"
          className="ml-4 shrink-0 rounded-full bg-amber-900 px-3 py-1 text-xs text-amber-50 hover:bg-amber-800"
        >
          Get Started Free →
        </a>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
