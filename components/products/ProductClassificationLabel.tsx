export default function ProductClassificationLabel({ category, group }: {
  category: { name: string } | null;
  group: { name: string; division: { name: string } } | null;
}) {
  return <div className="min-w-0 break-words [overflow-wrap:anywhere]">
    <span className="block text-sm font-semibold text-ink">{group?.name ?? category?.name ?? 'Uncategorised'}</span>
    {group && category ? <span className="mt-0.5 block text-xs font-normal text-ink/65">{category.name} → {group.division.name}</span>
      : category ? <span className="mt-0.5 block text-xs font-normal text-ink/65">Category only</span> : null}
  </div>;
}
