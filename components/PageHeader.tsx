import React from 'react';
import Link from 'next/link';

type PageHeaderProps = {
  title: string;
  /** Short descriptive sentence shown below title */
  subtitle?: string;
  /** Description paragraph (longer context) */
  description?: string;
  /** Slot for primary + secondary CTA buttons (or any React node) */
  actions?: React.ReactNode;
  /** Convenience: single primary CTA button label+href  */
  primaryCta?: { label: string; href: string };
  /** Convenience: single secondary CTA button label+href */
  secondaryCta?: { label: string; href: string };
};

export default function PageHeader({
  title,
  subtitle,
  description,
  actions,
  primaryCta,
  secondaryCta,
}: PageHeaderProps) {
  const hasActions = actions || primaryCta || secondaryCta;
  return (
    <div className="flex flex-col gap-4 rounded-[1.5rem] border border-slate-200/80 bg-white/80 px-4 py-4 shadow-card backdrop-blur-xl sm:rounded-[1.75rem] sm:px-5 sm:py-5 md:flex-row md:items-start md:justify-between md:px-6 md:py-6">
      <div className="min-w-0">
        <div className="mb-2 inline-flex items-center rounded-full border border-blue-100 bg-blue-50/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-accent">
          Executive view
        </div>
        <h1 className="text-[1.7rem] font-display font-bold leading-tight text-ink sm:text-2xl md:text-[2rem]">{title}</h1>
        {subtitle ? <p className="mt-1.5 text-sm font-medium text-slate-600">{subtitle}</p> : null}
        {description ? <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted md:text-[15px]">{description}</p> : null}
      </div>
      {hasActions ? (
        <div className="flex w-full flex-col items-stretch gap-2 sm:flex-row sm:flex-wrap sm:items-center md:w-auto md:max-w-[45%] md:justify-end">
          {secondaryCta ? (
            <Link href={secondaryCta.href} className="btn-secondary justify-center text-sm sm:w-auto">
              {secondaryCta.label}
            </Link>
          ) : null}
          {primaryCta ? (
            <Link href={primaryCta.href} className="btn-primary justify-center text-sm sm:w-auto">
              {primaryCta.label}
            </Link>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
