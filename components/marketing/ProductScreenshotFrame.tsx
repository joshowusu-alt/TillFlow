import Image from 'next/image';

type ProductScreenshotFrameProps = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  label?: string;
  /** contain shows the full screenshot without edge clipping */
  fit?: 'contain' | 'cover';
  aspectRatio?: '4/3' | '16/10' | '16/11' | '16/12';
};

const aspectClasses = {
  '4/3': 'aspect-[4/3]',
  '16/10': 'aspect-[16/10]',
  '16/11': 'aspect-[16/11]',
  '16/12': 'aspect-[16/12]',
} as const;

export default function ProductScreenshotFrame({
  src,
  alt,
  priority = false,
  className = '',
  imageClassName = '',
  label,
  fit = 'contain',
  aspectRatio = '16/11',
}: ProductScreenshotFrameProps) {
  const fitClass = fit === 'contain' ? 'object-contain object-top p-2 sm:p-3' : 'object-cover object-top';

  return (
    <div
      className={`overflow-hidden rounded-2xl border border-black/8 bg-white shadow-lg shadow-black/10 ${className}`}
    >
      {label ? (
        <div className="border-b border-black/5 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">
          {label}
        </div>
      ) : null}
      <div className={`relative w-full bg-slate-50 ${aspectClasses[aspectRatio]}`}>
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 50vw"
          className={`${fitClass} ${imageClassName}`}
        />
      </div>
    </div>
  );
}
