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

const MARK_IMG_W = 679;
const MARK_IMG_H = 465;
const MARK_RATIO = MARK_IMG_W / MARK_IMG_H;

// Display the full designer lockup at its natural proportions.
// The icon descender intentionally extends below the wordmark — that is the design.
const LOCKUP_IMG_W = 1712;
const LOCKUP_IMG_H = 481;
const LOCKUP_RATIO = LOCKUP_IMG_W / LOCKUP_IMG_H; // ≈ 3.559

export function Logo({
  variant = 'lockup',
  tone = 'brand',
  size = 36,
  className,
  wordmarkClassName: _wordmarkClassName,
  taglineClassName,
  tagline,
  alt = 'TillFlow',
  ariaHidden,
}: LogoProps) {
  const isMark = variant === 'mark';
  const src = isMark ? ASSETS[tone].mark : ASSETS[tone].lockup;

  if (isMark) {
    const width = Math.round(size * MARK_RATIO);
    return (
      <span className={`inline-flex min-w-0 items-center ${className ?? ''}`}>
        <img
          src={src}
          width={width}
          height={size}
          className="object-contain"
          alt={ariaHidden ? '' : alt}
          aria-hidden={ariaHidden || undefined}
          draggable={false}
          decoding="async"
        />
        {tagline ? <Tagline className={taglineClassName}>{tagline}</Tagline> : null}
      </span>
    );
  }

  // Lockup: render the full designer PNG at its natural proportions.
  const imgW = Math.round(size * LOCKUP_RATIO);

  return (
    <span className={`inline-flex min-w-0 items-center ${className ?? ''}`}>
      <img
        src={src}
        alt={ariaHidden ? '' : alt}
        aria-hidden={ariaHidden || undefined}
        draggable={false}
        decoding="async"
        width={imgW}
        height={size}
        className="object-contain"
        style={{ display: 'block', flexShrink: 0 }}
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
