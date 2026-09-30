import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import FinancialAmount from '@/components/reports/FinancialAmount';
import { isReportsStage3aAllowed } from '@/lib/reviews/reports-stage3a-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Reports money layout review',
  robots: { index: false, follow: false },
};

const FIXTURES = [
  { id: 'zero', label: 'Zero', pence: 0 },
  { id: 'medium', label: 'Medium', pence: 150_000 },
  { id: 'large', label: 'Large', pence: 1_234_567_890 },
  { id: 'negative-large', label: 'Negative large', pence: -1_234_567_890 },
] as const;

export default function ReportsMoneyLayoutReviewPage() {
  if (!isReportsStage3aAllowed()) notFound();
  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6">
      <p className="text-sm text-muted">Review-only money layout fixtures · GHS</p>
      <div className="mx-auto mt-4 max-w-md space-y-6" data-money-layout-review>
        {FIXTURES.map((fixture) => (
          <section
            key={fixture.id}
            data-money-layout-frame
            data-money-fixture={fixture.id}
            className="min-w-0 overflow-x-hidden rounded-2xl border border-slate-200 bg-white p-4"
            style={{ width: '100%' }}
          >
            <h2 className="text-sm font-semibold text-ink">{fixture.label}</h2>
            <div className="mt-2 min-w-0" data-money-layout-target>
              <FinancialAmount pence={fixture.pence} currency="GHS" variant="hero" data-testid={`amount-${fixture.id}`} />
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
