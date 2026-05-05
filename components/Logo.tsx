import React from 'react';

type LogoVariant = 'mark' | 'wordmark' | 'lockup';

type LogoProps = {
  variant?: LogoVariant;
  size?: number;
  className?: string;
  wordmarkClassName?: string;
  taglineClassName?: string;
  tagline?: string;
  alt?: string;
  ariaHidden?: boolean;
};

export function Logo({
  variant = 'lockup',
  size = 36,
  className,
  wordmarkClassName,
  taglineClassName,
  tagline,
  alt = 'TillFlow',
  ariaHidden,
}: LogoProps) {
  if (variant === 'mark') {
    return <LogoMark size={size} className={className} alt={alt} ariaHidden={ariaHidden} />;
  }

  if (variant === 'wordmark') {
    return (
      <span className={className}>
        <Wordmark className={wordmarkClassName} />
        {tagline ? <Tagline className={taglineClassName}>{tagline}</Tagline> : null}
      </span>
    );
  }

  return (
    <span className={`flex min-w-0 items-center gap-3 ${className ?? ''}`}>
      <LogoMark size={size} alt={alt} ariaHidden />
      <span className="min-w-0">
        <Wordmark className={wordmarkClassName} />
        {tagline ? <Tagline className={taglineClassName}>{tagline}</Tagline> : null}
      </span>
    </span>
  );
}

function Wordmark({ className }: { className?: string }) {
  return (
    <span className={`font-display font-bold leading-none ${className ?? ''}`}>
      <span className="text-accent">Till</span>
      <span className="text-gray-800">Flow</span>
    </span>
  );
}

function Tagline({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <span className={`block text-[11px] font-medium uppercase tracking-[0.24em] text-muted ${className ?? ''}`}>
      {children}
    </span>
  );
}

function LogoMark({
  size,
  className,
  alt,
  ariaHidden,
}: {
  size: number;
  className?: string;
  alt?: string;
  ariaHidden?: boolean;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1024 1024"
      xmlns="http://www.w3.org/2000/svg"
      role={ariaHidden ? undefined : 'img'}
      aria-label={ariaHidden ? undefined : alt}
      aria-hidden={ariaHidden}
      className={className}
    >
      <defs>
        <linearGradient id="tf-bg" x1="0" y1="0" x2="1024" y2="1024" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1a368c" />
          <stop offset="52%" stopColor="#0e1f6a" />
          <stop offset="100%" stopColor="#080e44" />
        </linearGradient>
        <radialGradient id="tf-sheen" cx="34%" cy="27%" r="54%">
          <stop offset="0%" stopColor="#7ab4ff" stopOpacity="0.18" />
          <stop offset="100%" stopColor="#7ab4ff" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="tf-ring" x1="512" y1="807" x2="512" y2="217" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22d3ee" />
          <stop offset="55%" stopColor="#06b6d4" />
          <stop offset="100%" stopColor="#10b981" />
        </linearGradient>
        <clipPath id="tf-tile">
          <rect width="1024" height="1024" rx="226" ry="226" />
        </clipPath>
      </defs>
      <g clipPath="url(#tf-tile)">
        <rect width="1024" height="1024" fill="url(#tf-bg)" />
        <rect width="1024" height="1024" fill="url(#tf-sheen)" />
        <line x1="84" y1="464" x2="222" y2="464" stroke="white" strokeWidth="3.4" strokeLinecap="round" opacity="0.26" />
        <line x1="62" y1="511" x2="236" y2="511" stroke="white" strokeWidth="3.4" strokeLinecap="round" opacity="0.34" />
        <line x1="84" y1="558" x2="222" y2="558" stroke="white" strokeWidth="3.4" strokeLinecap="round" opacity="0.26" />
        <path
          d="M 701.6 738.0 A 295 295 0 1 1 767.5 364.5"
          fill="none"
          stroke="url(#tf-ring)"
          strokeWidth="44"
          strokeLinecap="round"
          opacity="0.18"
        />
        <path
          d="M 701.6 738.0 A 295 295 0 1 1 767.5 364.5"
          fill="none"
          stroke="url(#tf-ring)"
          strokeWidth="22"
          strokeLinecap="round"
        />
        <rect x="367" y="392" width="142" height="34" fill="white" rx="2" />
        <rect x="421" y="392" width="34" height="240" fill="white" rx="2" />
        <rect x="531" y="392" width="34" height="240" fill="white" rx="2" />
        <rect x="531" y="392" width="138" height="34" fill="white" rx="2" />
        <rect x="531" y="488" width="105" height="30" fill="white" rx="2" />
        <rect width="1024" height="1024" rx="226" fill="none" stroke="white" strokeWidth="2.5" opacity="0.07" />
      </g>
    </svg>
  );
}
