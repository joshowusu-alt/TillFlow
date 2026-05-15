import { redirect } from 'next/navigation';
import Link from 'next/link';
import ControlPageHeader from '@/components/control-page-header';
import SectionHeading from '@/components/section-heading';
import { requireControlStaff } from '@/lib/control-auth';
import { listRecentErrors } from '@/lib/error-monitor';

export const dynamic = 'force-dynamic';

function relativeTime(date: Date): string {
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return 'just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return `${Math.floor(diffHr / 24)}d ago`;
}

const CONTEXT_LABELS: Record<string, string> = {
  'updateControlSubscriptionAction': 'Subscription write',
  'recordControlPaymentAction': 'Payment write',
  'payment:sms_enqueue_failed': 'SMS enqueue',
  'login:bad_password': 'Login — bad password',
  'login:bad_shared_key': 'Login — bad key',
  'login:inactive_account': 'Login — inactive account',
  'login:unexpected_error': 'Login — unexpected',
  'digest:missing_secret': 'Digest — missing secret',
  'digest:unauthorized': 'Digest — unauthorized',
};

export default async function ErrorsPage() {
  const staff = await requireControlStaff();

  if (staff.role !== 'CONTROL_ADMIN') {
    redirect('/?error=Only Control admins can view the error log.');
  }

  const errors = await listRecentErrors(100);

  return (
    <div className="space-y-4 lg:space-y-5">
      <ControlPageHeader
        eyebrow="System health"
        title="Error log"
        description={errors.length === 0 ? 'No errors recorded. All critical operations are running cleanly.' : `Showing the ${errors.length} most recent system errors. Click any business link to investigate the account.`}
      />

      {errors.length === 0 ? (
        <div className="rounded-2xl border border-control-teal/20 bg-control-teal/5 px-6 py-8 text-center text-sm text-control-ink/60">
          No system errors recorded. All critical operations are running cleanly.
        </div>
      ) : (
        <div className="space-y-3">
          <SectionHeading eyebrow="Errors" title="Recent errors" description="System errors from payment writes, subscription updates, SMS enqueue, and login failures." />
          <div className="overflow-hidden rounded-2xl border border-black/8 bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-black/6 bg-control-cloud text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-control-ink/55">
                  <th className="px-4 py-3">When</th>
                  <th className="px-4 py-3">Context</th>
                  <th className="px-4 py-3">Message</th>
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Business</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black/5">
                {errors.map((entry) => (
                  <tr key={entry.id} className="hover:bg-control-cloud/50">
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-[11px] text-control-ink/50">
                      {relativeTime(entry.createdAt)}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <span className="inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-2.5 py-0.5 text-[11px] font-medium text-rose-700">
                        {CONTEXT_LABELS[entry.context] ?? entry.context}
                      </span>
                    </td>
                    <td className="max-w-[340px] px-4 py-3 text-control-ink/80">
                      <span className="block truncate">{entry.message}</span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-control-ink/60">{entry.staffEmail}</td>
                    <td className="whitespace-nowrap px-4 py-3">
                      {entry.businessId ? (
                        <Link
                          href={`/businesses/${entry.businessId}`}
                          className="text-control-teal underline-offset-2 hover:underline"
                        >
                          View
                        </Link>
                      ) : (
                        <span className="text-control-ink/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
