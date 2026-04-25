import Link from 'next/link';
import { ReactNode } from 'react';

type ControlPageHeaderChip = {
  label: string;
  href?: string;
  tone?: 'default' | 'muted' | 'dark';
};

type ControlPageHeaderStat = {
  label: string;
  value: string;
  hint: string;
};

export default function ControlPageHeader({
  eyebrow,
  title,
  description,
  chips,
  stats,
  aside,
}: {
  eyebrow: string;
  title: string;
  description: string;
  chips?: ControlPageHeaderChip[];
  stats?: ControlPageHeaderStat[];
  aside?: ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className={`panel p-4 sm:p-5 lg:p-6 ${aside ? '' : ''}`}>
        <div className={`grid gap-3 ${aside ? 'lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-start' : ''}`}>
          <div className="space-y-3">
            <div className="space-y-2">
              <div className="eyebrow">{eyebrow}</div>
              <h1 className="page-title font-[var(--font-display)] text-control-ink">{title}</h1>
              {/* Description is verbose context for first-time operators; it hides on mobile so repeat users get straight to the data. */}
              <p className="hidden max-w-3xl text-sm leading-6 text-black/60 sm:block sm:text-[0.95rem]">{description}</p>
            </div>

            {chips && chips.length > 0 ? (
              <div className="mobile-nav-strip -mx-1 flex gap-2 overflow-x-auto pb-1">
                {chips.map((chip) => {
                  const className = `control-chip ${
                    chip.tone === 'dark'
                      ? 'border-[#122126] bg-[#122126] text-white'
                      : chip.tone === 'muted'
                        ? 'control-chip-muted'
                        : ''
                  }`;

                  return chip.href ? (
                    <Link key={`${chip.label}-${chip.href}`} href={chip.href} className={className}>
                      {chip.label}
                    </Link>
                  ) : (
                    <span key={chip.label} className={className}>
                      {chip.label}
                    </span>
                  );
                })}
              </div>
            ) : null}
          </div>

          {aside ? <div className="control-page-hero-aside">{aside}</div> : null}
        </div>
      </div>

      {stats && stats.length > 0 ? (
        <div className="control-kpi-band sm:grid-cols-2 xl:grid-cols-4">
          {stats.map((stat) => (
            <div key={stat.label} className="control-kpi-compact">
              <div className="control-kpi-compact-label">{stat.label}</div>
              <div className="control-kpi-compact-value">{stat.value}</div>
              <p className="control-kpi-compact-hint">{stat.hint}</p>
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
