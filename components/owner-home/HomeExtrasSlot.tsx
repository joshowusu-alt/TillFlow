import Link from 'next/link';
import type { OwnerHomeExtrasData } from '@/lib/owner-home/extras';
import { HomeIcon } from '@/components/owner-home/home-chrome';
import OwnerHomeDemoActions from '@/components/owner-home/OwnerHomeDemoActions';
import {
  HomeExtrasUnavailable,
  HomeLastCloseUnavailable,
} from '@/components/owner-home/section-errors';

export async function HomeLastCloseSlot({
  extrasPromise,
}: {
  extrasPromise: Promise<OwnerHomeExtrasData>;
}) {
  let extras: OwnerHomeExtrasData;
  try {
    extras = await extrasPromise;
  } catch {
    return <HomeLastCloseUnavailable />;
  }
  const lastCloseText = extras.lastShiftClosedAt
    ? `Last close: ${new Date(extras.lastShiftClosedAt).toLocaleString('en-GB', {
        day: 'numeric',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })}`
    : 'No close recorded yet';

  return <p className="mt-0.5 text-[11px] text-blue-100/70">{lastCloseText}</p>;
}

export default async function HomeExtrasSlot({
  extrasPromise,
  saleCount,
}: {
  extrasPromise: Promise<OwnerHomeExtrasData>;
  saleCount: number;
}) {
  let extras: OwnerHomeExtrasData;
  try {
    extras = await extrasPromise;
  } catch {
    return <HomeExtrasUnavailable />;
  }
  const isNewAccount = saleCount < 10;

  return (
    <div className="space-y-3">
      <OwnerHomeDemoActions
        hasDemoData={extras.hasDemoData}
        hasSeedData={extras.hasSeedData}
        isNewAccount={isNewAccount}
      />

      {extras.lastReceiptId ? (
        <Link
          href={`/receipts/${extras.lastReceiptId}`}
          className="inline-flex min-h-11 w-full items-center gap-3 rounded-xl border border-black/[0.06] bg-white px-3.5 py-2.5 text-sm font-medium text-ink shadow-sm transition hover:border-black/10 hover:bg-black/[0.02] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-accentSoft text-accent" aria-hidden>
            <HomeIcon name="receipt" />
          </span>
          <span className="min-w-0 flex-1 text-left">
            <span className="block text-sm font-semibold text-ink">Last receipt</span>
            <span className="block text-xs font-normal text-muted">Reprint or review the latest sale</span>
          </span>
          <span aria-hidden className="text-accent">
            &rarr;
          </span>
        </Link>
      ) : null}
    </div>
  );
}
