import Link from 'next/link';
import { GUIDES } from '@/lib/guides/content';

export default function HelpGuidesPage() {
  const merchantGuides = GUIDES.filter((g) => g.audience !== 'agent');

  return (
    <div className="mx-auto max-w-2xl space-y-6 pb-10">
      <div>
        <h1 className="text-2xl font-bold font-display text-ink">Help & guides</h1>
        <p className="mt-1 text-sm text-muted">Short steps for owners, cashiers and setup — plain language.</p>
      </div>
      <ul className="space-y-3">
        {merchantGuides.map((guide) => (
          <li key={guide.slug}>
            <Link
              href={`/help/${guide.slug}`}
              className="card block p-4 transition hover:border-accent/30 hover:shadow-md"
            >
              <p className="font-semibold text-ink">{guide.title}</p>
              <p className="mt-1 text-sm text-muted">{guide.subtitle}</p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
