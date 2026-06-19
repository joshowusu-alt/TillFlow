import React from 'react';

type LogoVariant = 'mark' | 'wordmark' | 'lockup';
type LogoTone = 'brand' | 'light';

type LogoProps = {
  variant?: LogoVariant;
  tone?: LogoTone;
  size?: number;
  className?: string;
  wordmarkClassName?: string;
  taglineClassName?: string;
  tagline?: string;
  alt?: string;
  ariaHidden?: boolean;
};

const ASSETS = {
  brand: {
    lockup: '/brand/tillflow-logo-blue.png',
    mark: '/brand/tillflow-symbol-blue.png',
  },
  light: {
    lockup: '/brand/tillflow-logo-white.png',
    mark: '/brand/tillflow-symbol-white.png',
  },
} as const;

const LOCKUP_RATIO = 1712 / 481;
const MARK_RATIO = 332 / 481;

export function Logo({
  variant = 'lockup',
  tone = 'brand',
  size = 36,
  className,
  wordmarkClassName,
  taglineClassName,
  tagline,
  alt = 'TillFlow',
  ariaHidden,
}: LogoProps) {
  const isMark = variant === 'mark';
  const src = isMark ? ASSETS[tone].mark : ASSETS[tone].lockup;
  const width = Math.round(size * (isMark ? MARK_RATIO : LOCKUP_RATIO));
  return (
    <span className={`inline-flex min-w-0 items-center ${className ?? ''}`}>
      <img
        src={src}
        width={width}
        height={size}
        className={`${isMark ? 'object-contain' : 'object-contain'} ${wordmarkClassName ?? ''}`}
        alt={ariaHidden ? '' : alt}
        aria-hidden={ariaHidden || undefined}
        draggable={false}
        decoding="async"
      />
      {tagline ? <Tagline className={taglineClassName}>{tagline}</Tagline> : null}
    </span>
  );
}

function Tagline({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`ml-3 block text-[11px] font-medium uppercase tracking-[0.24em] text-muted ${className ?? ''}`}>
      {children}
    </span>
  );
}
