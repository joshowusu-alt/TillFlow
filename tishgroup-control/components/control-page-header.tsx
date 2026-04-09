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
    <section className="panel p-5 sm:p-6 lg:p-8">
      <div className={`grid gap-6 ${aside ? 'xl:grid-cols-[1.35fr_0.65fr]' : ''}`}>
        <div className="space-y-5">
          <div className="space-y-3">
            <div className="eyebrow">{eyebrow}</div>
            <h1 className="page-title font-[var(--font-display)] text-control-ink">{title}</h1>
            <p className="hidden max-w-3xl text-base leading-8 text-black/64 sm:block">{description}</p>
          </div>

          {chips && chips.length > 0 ? (
            <div className="mobile-nav-strip -mx-1 hidden gap-2 overflow-x-auto pb-1 sm:flex">
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

          {stats && stats.length > 0 ? (
            <div className="hidden gap-3 sm:grid sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="control-page-summary-card">
                  <div className="eyebrow">{stat.label}</div>
                  <div className="mt-2 text-2xl font-semibold tracking-tight text-control-ink">{stat.value}</div>
                  <p className="mt-2 text-sm leading-6 text-black/60">{stat.hint}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {aside ? <div className="hidden control-page-hero-aside xl:block">{aside}</div> : null}
      </div>
    </section>
  );
}