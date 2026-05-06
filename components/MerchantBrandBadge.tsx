'use client';

import { useState } from 'react';
import { resolveMerchantBrandPresentation, type MerchantBrandProfile, type MerchantBrandSurface } from '@/lib/merchant-branding';

type Props = {
  branding: MerchantBrandProfile;
  surface: MerchantBrandSurface;
  className?: string;
  label?: string;
};

const SURFACE_CLASSES: Record<
  MerchantBrandSurface,
  { frame: string; imagePad: string; initials: string }
> = {
  'admin-shell': {
    frame: 'h-10 w-10 rounded-xl',
    imagePad: 'p-1.5',
    initials: 'text-[13px] tracking-[0.18em]',
  },
  'admin-sidebar': {
    frame: 'h-8 w-8 rounded-lg',
    imagePad: 'p-1',
    initials: 'text-[11px] tracking-[0.18em]',
  },
  'compact-chip': {
    frame: 'h-11 w-11 rounded-xl',
    imagePad: 'p-1.5',
    initials: 'text-[13px] tracking-[0.18em]',
  },
  'desktop-nav': {
    frame: 'h-9 w-9 rounded-xl',
    imagePad: 'p-1.5',
    initials: 'text-[12px] tracking-[0.18em]',
  },
  'mobile-nav': {
    frame: 'h-9 w-9 rounded-xl',
    imagePad: 'p-1.5',
    initials: 'text-[12px] tracking-[0.18em]',
  },
  'storefront-hero': {
    frame: 'h-16 w-20 rounded-2xl sm:h-20 sm:w-24',
    imagePad: 'p-2 sm:p-2.5',
    initials: 'text-lg tracking-[0.16em] sm:text-xl',
  },
  'storefront-compact': {
    frame: 'h-12 w-12 rounded-xl',
    imagePad: 'p-1.5',
    initials: 'text-sm tracking-[0.16em]',
  },
  receipt: {
    frame: 'h-16 w-28 rounded-xl',
    imagePad: 'p-2',
    initials: 'text-lg tracking-[0.16em]',
  },
};

function joinClasses(...values: Array<string | undefined | false | null>) {
  return values.filter(Boolean).join(' ');
}

export default function MerchantBrandBadge({ branding, surface, className, label }: Props) {
  const resolved = resolveMerchantBrandPresentation(branding, surface);
  const surfaceClasses = SURFACE_CLASSES[surface];
  // If the image fails to load, flip to initials immediately — never show a broken-image box.
  const [imgFailed, setImgFailed] = useState(false);

  // If image failed, treat as 'initials' for frame tone computation
  const effectiveFrameTone = imgFailed ? 'brand' : resolved.frameTone;

  // Base frame class by tone
  const frameClasses =
    effectiveFrameTone === 'brand'
      ? 'shadow-sm ring-1 ring-black/5'
      : effectiveFrameTone === 'neutral'
        ? 'bg-white shadow-sm ring-1 ring-black/8'
        : effectiveFrameTone === 'soft'
          ? 'bg-slate-50 shadow-sm ring-1 ring-black/5'
          : effectiveFrameTone === 'outline'
            ? 'bg-white shadow-sm'
            : effectiveFrameTone === 'tinted'
              ? 'shadow-sm ring-1 ring-black/5'
              : 'bg-transparent'; // transparent

  // Inline style contribution by tone
  const frameStyle =
    effectiveFrameTone === 'brand'
      ? { backgroundColor: resolved.primaryColor, color: resolved.foregroundColor }
      : effectiveFrameTone === 'tinted'
        ? { backgroundColor: `${resolved.primaryColor}1a` }
        : effectiveFrameTone === 'outline'
          ? { boxShadow: `0 0 0 2px ${resolved.primaryColor}60` }
          : undefined;

  return (
    <div
      className={joinClasses(
        'flex shrink-0 items-center justify-center overflow-hidden',
        surfaceClasses.frame,
        frameClasses,
        className,
      )}
      style={frameStyle}
      aria-label={label ?? `${branding.businessName} brand mark`}
      title={resolved.reason}
    >
      {resolved.kind === 'image' && resolved.imageUrl && !imgFailed ? (
        <div className={joinClasses('flex h-full w-full items-center justify-center', surfaceClasses.imagePad)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolved.imageUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-contain"
            onError={() => setImgFailed(true)}
          />
        </div>
      ) : (
        <span className={joinClasses('font-black uppercase leading-none', surfaceClasses.initials)}>
          {resolved.initials}
        </span>
      )}
    </div>
  );
}
