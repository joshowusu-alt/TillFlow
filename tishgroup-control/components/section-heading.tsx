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
    <div className="space-y-1.5">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="section-title text-control-ink">{title}</h2>
      <p className="max-w-3xl text-sm leading-5 text-black/58">{description}</p>
    </div>
  );
}
