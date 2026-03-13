import PageHeader from '@/components/PageHeader';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import NotificationsSettingsForm from './NotificationsSettingsForm';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage({
  searchParams,
}: {
  searchParams?: { error?: string };
}) {
  const { business } = await requireBusiness(['OWNER']);
  if (!business) return <div className="card p-6">Owners only.</div>;

  // Last 5 message logs
  const recentMessages = await prisma.messageLog.findMany({
    where: { businessId: business.id, channel: 'WHATSAPP' },
    orderBy: { sentAt: 'desc' },
    take: 5,
    select: { id: true, messageType: true, recipient: true, status: true, sentAt: true, deepLink: true },
  });

  // Last 5 scheduler runs
  const recentJobs = await prisma.scheduledJob.findMany({
    where: { businessId: business.id, jobName: 'EOD_WHATSAPP_SUMMARY' },
    orderBy: { startedAt: 'desc' },
    take: 5,
    select: { id: true, status: true, startedAt: true, durationMs: true, triggeredBy: true, errorMessage: true },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Configure daily WhatsApp summaries sent to the owner."
      />

      <NotificationsSettingsForm
        error={searchParams?.error}
        business={{
          whatsappEnabled: business.whatsappEnabled,
          whatsappPhone: business.whatsappPhone,
          whatsappScheduleTime: business.whatsappScheduleTime,
          whatsappBranchScope: business.whatsappBranchScope
        }}
      />

      {/* Recent message logs */}
      {recentMessages.length > 0 && (
        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-semibold">Recent Messages Sent</h2>
          <div className="space-y-2 text-sm">
            {recentMessages.map((msg) => (
              <div key={msg.id} className="flex flex-col gap-2 rounded-lg border border-black/5 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-medium">{msg.messageType.replace(/_/g, ' ')}</span>
                  <span className="ml-2 text-xs text-black/40">to {msg.recipient}</span>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <span className={`text-xs rounded-full px-2 py-0.5 ${msg.status === 'SENT' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                    {msg.status}
                  </span>
                  <span className="text-xs text-black/40">{new Date(msg.sentAt).toLocaleString()}</span>
                  {msg.deepLink && (
                    <a href={msg.deepLink} target="_blank" rel="noopener noreferrer" className="text-xs text-emerald-600 hover:underline">
                      Open
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent job runs */}
      {recentJobs.length > 0 && (
        <div className="card p-4 sm:p-6">
          <h2 className="mb-4 text-base font-semibold">Scheduler Run History</h2>
          <div className="space-y-2 text-sm">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex flex-col gap-2 rounded-lg border border-black/5 bg-white px-3 py-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className={`text-xs rounded-full px-2 py-0.5 mr-2 ${
                    job.status === 'SUCCESS' ? 'bg-emerald-100 text-emerald-700' :
                    job.status === 'ERROR' ? 'bg-rose-100 text-rose-700' :
                    job.status === 'SKIPPED' ? 'bg-gray-100 text-gray-600' :
                    'bg-amber-100 text-amber-700'
                  }`}>
                    {job.status}
                  </span>
                  <span className="text-black/60">{job.triggeredBy}</span>
                  {job.errorMessage && <span className="ml-2 text-xs text-rose-600">{job.errorMessage}</span>}
                </div>
                <div className="text-xs text-black/40">
                  {new Date(job.startedAt).toLocaleString()}
                  {job.durationMs != null && <span className="ml-2">({job.durationMs}ms)</span>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
