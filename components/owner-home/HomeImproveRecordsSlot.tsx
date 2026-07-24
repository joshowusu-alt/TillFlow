import Link from 'next/link';
import type { ImproveRecordsResult } from '@/lib/improve-records';
import { HomeImproveRecordsUnavailable } from '@/components/owner-home/section-errors';

export default async function HomeImproveRecordsSlot({
  improvePromise,
}: {
  improvePromise: Promise<ImproveRecordsResult>;
}) {
  let improveRecords: ImproveRecordsResult;
  try {
    improveRecords = await improvePromise;
  } catch (error) {
    console.error('[home.iyr] failed to load improve-your-records data', error);
    return <HomeImproveRecordsUnavailable />;
  }

  return (
    <section aria-labelledby="improve-your-records-heading" className="rounded-2xl border border-black/8 bg-white p-4 sm:p-5">
      <h2 id="improve-your-records-heading" className="text-sm font-bold text-ink">
        Improve your records
      </h2>
      <p className="mt-1 text-xs leading-5 text-muted">
        Optional improvements that make your records and reports more reliable.
      </p>
      {improveRecords.primary ? (
        <div className="mt-3 space-y-2">
          <Link
            href={improveRecords.primary.href}
            className="block rounded-xl border border-accent/25 bg-accentSoft/40 px-3.5 py-3 hover:border-accent/50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-accent">Top improvement</p>
            <p className="mt-1 text-sm font-semibold text-ink">{improveRecords.primary.title}</p>
            <p className="mt-0.5 text-xs leading-5 text-muted">{improveRecords.primary.explanation}</p>
            <span className="mt-2 inline-block text-xs font-semibold text-accent">
              {improveRecords.primary.actionLabel} →
            </span>
          </Link>
          {improveRecords.secondary.length > 0 ? (
            <ul className="space-y-1">
              {improveRecords.secondary.map((item) => (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className="flex min-h-11 flex-col gap-1 rounded-lg px-2.5 py-2.5 hover:bg-black/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent lg:flex-row lg:items-start lg:justify-between lg:gap-3"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug text-ink">{item.title}</p>
                      <p className="mt-0.5 text-[11px] leading-4 text-muted">{item.explanation}</p>
                    </div>
                    <span className="mt-0.5 break-words text-xs font-semibold leading-5 text-accent lg:mt-0 lg:shrink-0 lg:pt-0.5 lg:text-right lg:whitespace-nowrap">
                      {item.actionLabel} →
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-5 text-muted">
          {improveRecords.allClearMessage ??
            'Your key records are in good shape. TillFlow will surface the next useful improvement when needed.'}
        </p>
      )}
    </section>
  );
}
