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
  'compact-chip': {
    frame: 'h-11 w-11 rounded-xl',
    imagePad: 'p-1.5',
    initials: 'text-[13px] tracking-[0.18em]',
  },
  'storefront-hero': {
    frame: 'h-20 w-24 rounded-2xl sm:h-24 sm:w-28',
    imagePad: 'p-2.5',
    initials: 'text-xl tracking-[0.16em] sm:text-2xl',
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
  const frameClasses =
    resolved.frameTone === 'brand'
      ? 'shadow-sm ring-1 ring-black/5'
      : resolved.frameTone === 'neutral'
        ? 'bg-white shadow-sm ring-1 ring-black/8'
        : 'bg-transparent';

  return (
    <div
      className={joinClasses(
        'flex shrink-0 items-center justify-center overflow-hidden',
        surfaceClasses.frame,
        frameClasses,
        className,
      )}
      style={
        resolved.frameTone === 'brand'
          ? { backgroundColor: resolved.primaryColor, color: resolved.foregroundColor }
          : undefined
      }
      aria-label={label ?? `${branding.businessName} brand mark`}
      title={resolved.reason ?? undefined}
    >
      {resolved.kind === 'image' && resolved.imageUrl ? (
        <div className={joinClasses('flex h-full w-full items-center justify-center', surfaceClasses.imagePad)}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={resolved.imageUrl}
            alt=""
            aria-hidden="true"
            className="h-full w-full object-contain"
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
