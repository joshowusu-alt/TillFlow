import Image from 'next/image';

type ProductScreenshotFrameProps = {
  src: string;
  alt: string;
  priority?: boolean;
  className?: string;
  imageClassName?: string;
  label?: string;
};

export default function ProductScreenshotFrame({
  src,
  alt,
  priority = false,
  className = '',
  imageClassName = 'object-top object-cover',
  label,
}: ProductScreenshotFrameProps) {
  return (
    <div
      className={`overflow-hidden rounded-2xl border border-black/8 bg-white shadow-lg shadow-black/10 ${className}`}
    >
      {label ? (
        <div className="border-b border-black/5 bg-slate-50 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-black/45">
          {label}
        </div>
      ) : null}
      <div className="relative aspect-[4/3] w-full bg-slate-100">
        <Image
          src={src}
          alt={alt}
          fill
          priority={priority}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className={imageClassName}
        />
      </div>
    </div>
  );
}
