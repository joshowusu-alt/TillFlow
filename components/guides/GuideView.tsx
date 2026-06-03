import Link from 'next/link';
import type { GuideDoc } from '@/lib/guides/content';

export default function GuideView({ guide, backHref = '/help' }: { guide: GuideDoc; backHref?: string }) {
  return (
    <article className="mx-auto max-w-2xl space-y-6 pb-10">
      <div>
        <Link href={backHref} className="text-sm font-medium text-accent hover:underline">
          ← All guides
        </Link>
        <h1 className="mt-3 text-2xl font-bold font-display text-ink">{guide.title}</h1>
        <p className="mt-2 text-sm text-muted">{guide.subtitle}</p>
      </div>
      {guide.sections.map((section) => (
        <section key={section.title} className="card p-5">
          <h2 className="text-base font-semibold text-ink">{section.title}</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-ink/90">
            {section.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>
      ))}
    </article>
  );
}
