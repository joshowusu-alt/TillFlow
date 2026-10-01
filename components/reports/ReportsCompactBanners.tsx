import Link from 'next/link';

/** Compact Reports banner action. The label stays small; the box is the tap target. */
const ACTION =
  'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center px-2 text-xs font-semibold underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

export function ReportsCompactSetupBanner({
  title,
  detail,
  cta,
}: {
  title: string;
  detail: string;
  cta: string;
}) {
  return (
    <div className="border-b border-blue-200/70 bg-blue-50 px-3" data-reports-banner="setup">
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0 text-xs leading-5 text-accent">
          <span className="font-semibold">{title}</span>
          <span className="text-accent/80"> · {detail}</span>
        </p>
        <Link href="/onboarding" className={`${ACTION} text-accent`}>
          {cta}
        </Link>
      </div>
    </div>
  );
}

export function ReportsCompactBillingBanner({
  message,
  actionLabel,
  href,
  tone,
}: {
  message: string;
  actionLabel: string;
  href: string;
  tone: 'rose' | 'amber' | 'blue';
}) {
  const toneClass = tone === 'rose'
    ? 'border-rose-200 bg-rose-50/90 text-rose-900'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50/90 text-amber-900'
      : 'border-blue-200 bg-blue-50/90 text-blue-900';
  return (
    <div data-reports-banner="trial" className={`border-b px-3 text-xs ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="min-w-0">{message}</p>
        <Link href={href} className={ACTION}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}
