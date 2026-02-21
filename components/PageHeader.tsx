import React from 'react';

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
    <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
      <div>
        <h1 className="text-2xl font-display font-bold text-ink leading-tight">{title}</h1>
        {subtitle ? <p className="mt-1 text-sm text-muted">{subtitle}</p> : null}
        {description ? <p className="mt-1.5 max-w-2xl text-sm text-muted leading-relaxed">{description}</p> : null}
      </div>
      {hasActions ? (
        <div className="flex flex-wrap items-center gap-2 flex-shrink-0">
          {secondaryCta ? (
            <a href={secondaryCta.href} className="btn-secondary text-sm">
              {secondaryCta.label}
            </a>
          ) : null}
          {primaryCta ? (
            <a href={primaryCta.href} className="btn-primary text-sm">
              {primaryCta.label}
            </a>
          ) : null}
          {actions}
        </div>
      ) : null}
    </div>
  );
}
