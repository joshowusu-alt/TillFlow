import type { ReactNode } from 'react';

type DataCardProps = {
  children: ReactNode;
  className?: string;
};

type DataCardHeaderProps = {
  title: ReactNode;
  subtitle?: ReactNode;
  aside?: ReactNode;
};

type DataCardFieldProps = {
  label: string;
  value: ReactNode;
  className?: string;
  valueClassName?: string;
};

type DataCardActionsProps = {
  children: ReactNode;
  className?: string;
};

export function DataCard({ children, className = '' }: DataCardProps) {
  return (
    <div className={`rounded-2xl border border-black/5 bg-white px-4 py-4 shadow-sm ${className}`}>
      {children}
    </div>
  );
}

export function DataCardHeader({ title, subtitle, aside }: DataCardHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <div className="font-semibold text-ink">{title}</div>
        {subtitle ? <div className="mt-1 text-sm text-black/60">{subtitle}</div> : null}
      </div>
      {aside ? <div className="flex-shrink-0">{aside}</div> : null}
    </div>
  );
}

export function DataCardField({ label, value, className = '', valueClassName = '' }: DataCardFieldProps) {
  return (
    <div className={className}>
      <div className="text-xs uppercase tracking-[0.16em] text-black/40">{label}</div>
      <div className={`mt-1 ${valueClassName}`}>{value}</div>
    </div>
  );
}

export function DataCardActions({ children, className = '' }: DataCardActionsProps) {
  return <div className={`mt-4 flex flex-wrap gap-2 ${className}`}>{children}</div>;
}
