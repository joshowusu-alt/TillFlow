import Link from 'next/link';
import ControlDigestView from '@/components/digest/ControlDigestView';
import ControlPageHeader from '@/components/control-page-header';
import { requireControlStaff } from '@/lib/control-auth';
import { getControlDigestData } from '@/lib/control-digest/service';

export const dynamic = 'force-dynamic';

export default async function CommandDigestPage() {
  await requireControlStaff();
  const data = await getControlDigestData();

  return (
    <div className="space-y-6">
      <ControlPageHeader
        eyebrow="Daily operating rhythm"
        title="Control digest"
        description="What Tish Group should do today — trials, setup, support, referrals, and weekly rollout progress. Same rules as Scale Cockpit."
      />

      <p className="text-sm">
        <Link href="/command/scale" className="font-semibold text-control-accent hover:underline">
          Scale Cockpit
        </Link>
        {' · '}
        <Link href="/command/support" className="font-semibold text-control-accent hover:underline">
          Support
        </Link>
        {' · '}
        <Link href="/command/referrals" className="font-semibold text-control-accent hover:underline">
          Referrals
        </Link>
      </p>

      <ControlDigestView data={data} />
    </div>
  );
}
