import Link from 'next/link';
import OfflineRetryButton from './OfflineRetryButton';

export const dynamic = 'force-static';

export const metadata = {
  title: "You're offline — TillFlow Shop",
  description: 'Reconnect to keep shopping.',
  robots: { index: false, follow: false },
};

export default function ShopOfflinePage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-6 py-16 text-center">
      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-white shadow-sm ring-1 ring-black/5">
        <svg className="h-8 w-8 text-black/40" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.348 14.652a3.75 3.75 0 010-5.304m5.304 0a3.75 3.75 0 010 5.304m-7.425 2.121a6.75 6.75 0 010-9.546m9.546 0a6.75 6.75 0 010 9.546M5.106 18.894c-3.808-3.807-3.808-9.98 0-13.788m13.788 0c3.808 3.807 3.808 9.98 0 13.788M3 3l18 18" />
        </svg>
      </div>
      <h1 className="mt-5 text-xl font-bold text-ink">You&apos;re offline</h1>
      <p className="mt-2 max-w-sm text-sm text-black/55">
        We can&apos;t reach the shop right now. Check your connection and try again — your cart is saved on this device.
      </p>
      <OfflineRetryButton />
      <Link href="/welcome" className="mt-4 text-xs font-semibold text-black/45 underline-offset-4 hover:underline">
        Return to TillFlow
      </Link>
    </div>
  );
}
