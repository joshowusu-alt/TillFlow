import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import GuideView from '@/components/guides/GuideView';
import { GUIDES, getGuide } from '@/lib/vendor/guides/content';
import { requireControlStaff } from '@/lib/control-auth';

export const dynamic = 'force-dynamic';

export default async function CommandGuidesPage() {
  await requireControlStaff();
  const agentGuide = getGuide('agent');
  const merchantGuides = GUIDES.filter((g) => g.audience !== 'agent');

  return (
    <div className="space-y-8">
      <ControlPageHeader
        eyebrow="Commercial rollout"
        title="Guides & talking points"
        description="Agent demo script plus links merchants can use in TillFlow."
      />

      {agentGuide ? (
        <div className="rounded-2xl border border-control-line bg-white p-2">
          <GuideView guide={agentGuide} backHref="/command/guides" />
        </div>
      ) : null}

      <section>
        <h2 className="text-sm font-display font-bold text-control-ink">Merchant guides (share links)</h2>
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {merchantGuides.map((g) => (
            <li key={g.slug} className="card p-3 text-sm">
              <p className="font-semibold">{g.title}</p>
              <p className="mt-1 text-xs text-control-muted">{g.subtitle}</p>
              <p className="mt-2 text-xs text-control-accent">TillFlow: /help/{g.slug}</p>
            </li>
          ))}
        </ul>
        <p className="mt-3 text-xs text-control-muted">
          Merchants open these inside TillFlow after login — not on the public site.
        </p>
      </section>

      <div className="flex flex-wrap gap-3 text-sm">
        <Link href="/command/templates" className="font-semibold text-control-accent hover:underline">
          WhatsApp templates →
        </Link>
        <Link href="/demo" className="font-semibold text-control-accent hover:underline" target="_blank">
          Public demo →
        </Link>
      </div>
    </div>
  );
}
