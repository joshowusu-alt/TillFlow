export default function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-2">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="section-title text-control-ink">{title}</h2>
      <p className="max-w-3xl text-sm leading-6 text-black/62">{description}</p>
    </div>
  );
}