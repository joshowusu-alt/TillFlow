import Link from 'next/link';
import type { GuideDoc } from '@/lib/vendor/guides/content';

export default function GuideView({ guide, backHref = '/command/guides' }: { guide: GuideDoc; backHref?: string }) {
  return (
    <article className="mx-auto max-w-2xl space-y-6 pb-10">
      <div>
        <Link href={backHref} className="text-sm font-medium text-control-accent hover:underline">
          ← Back
        </Link>
        <h1 className="mt-3 text-2xl font-display font-bold text-control-ink">{guide.title}</h1>
        <p className="mt-2 text-sm text-control-muted">{guide.subtitle}</p>
      </div>
      {guide.sections.map((section) => (
        <section key={section.title} className="card p-5">
          <h2 className="text-base font-semibold text-control-ink">{section.title}</h2>
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
