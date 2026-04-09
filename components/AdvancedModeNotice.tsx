import Link from 'next/link';
import type { BusinessPlan } from '@/lib/features';

export default function AdvancedModeNotice({
  title = 'Growth plan required',
  description = 'This section is available on businesses provisioned for Growth or Pro.',
  featureName,
  minimumPlan,
}: {
  title?: string;
  description?: string;
  featureName?: string;
  minimumPlan?: BusinessPlan;
}) {
  const params = new URLSearchParams();
  if (featureName) params.set('feature', featureName);
  if (minimumPlan) params.set('requiredPlan', minimumPlan);
  const href = params.size > 0 ? `/settings/billing?${params.toString()}` : '/settings/billing';

  return (
    <div className="card p-6 space-y-3">
      <div className="text-lg font-display font-semibold">{title}</div>
      <p className="text-sm text-black/60">{description}</p>
      <Link href={href} className="btn-primary w-fit">
        Open billing and plans
      </Link>
    </div>
  );
}
