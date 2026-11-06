import type { GuideDoc } from '@/lib/vendor/guides/content';

export default function GuideView({ guide }: { guide: GuideDoc }) {
  return (
    <article className="mx-auto max-w-2xl space-y-6 pb-10">
      <div>
        <h2 className="mt-3 text-2xl font-display font-bold text-control-ink">{guide.title}</h2>
        <p className="mt-2 text-sm text-control-muted">{guide.subtitle}</p>
      </div>
      {guide.sections.map((section) => (
        <section key={section.title} className="card p-5">
          <h3 className="text-base font-semibold text-control-ink">{section.title}</h3>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-control-ink/90">
            {section.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}
