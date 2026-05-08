type Props = {
  tags: string[];
  /** Cap the number of chips shown on tight surfaces (list rows). The
   * remainder is summarised as "+N". */
  max?: number;
  className?: string;
};

/**
 * Compact, calm display of contact tags ("VIP", "Net 30", "Wholesale", etc.)
 * Used in the customer and supplier list rows and detail headers. Stays quiet
 * when the tag list is empty — never renders an empty container.
 */
export default function TagChips({ tags, max, className }: Props) {
  if (!tags || tags.length === 0) return null;
  const visible = typeof max === 'number' && tags.length > max ? tags.slice(0, max) : tags;
  const overflow = tags.length - visible.length;

  return (
    <div className={`flex flex-wrap items-center gap-1 ${className ?? ''}`}>
      {visible.map((tag) => (
        <span
          key={tag}
          className="inline-flex max-w-[10rem] items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-700"
          title={tag}
        >
          <span className="truncate">{tag}</span>
        </span>
      ))}
      {overflow > 0 ? (
        <span
          className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium text-slate-500"
          title={tags.slice(visible.length).join(', ')}
        >
          +{overflow}
        </span>
      ) : null}
    </div>
  );
}
