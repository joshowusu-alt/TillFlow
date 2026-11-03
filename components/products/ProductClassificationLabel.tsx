export default function ProductClassificationLabel({ category, group, division }: {
  division?: { name: string } | null;
  category: { name: string } | null;
  group: { name: string; division: { name: string } } | null;
}) {
  return <div className="min-w-0 break-words [overflow-wrap:anywhere]">
    <span className="block text-sm font-semibold text-ink">{group?.name ?? division?.name ?? category?.name ?? 'Uncategorised'}</span>
    {group && category ? <span className="mt-0.5 block text-xs font-normal text-ink/65">{category.name} → {group.division.name}</span>
      : division && category ? <span className="mt-0.5 block text-xs font-normal text-ink/65">{category.name}</span> : category ? <span className="mt-0.5 block text-xs font-normal text-ink/65">Category only</span> : null}
  </div>;
}
