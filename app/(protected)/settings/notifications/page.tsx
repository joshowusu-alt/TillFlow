import PageHeader from '@/components/PageHeader';
import FormError from '@/components/FormError';
import SubmitButton from '@/components/SubmitButton';
import { requireBusiness } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { updateWhatsappSettingsAction } from '@/app/actions/notifications';
import { buildEodSummaryPayload } from '@/app/actions/notifications';

export const dynamic = 'force-dynamic';

export default async function NotificationsSettingsPage({
  searchParams,
}: {
  searchParams?: { error?: string; preview?: string };
}) {
  const { user, business } = await requireBusiness(['OWNER']);
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

  // Preview payload on demand
  let previewText = '';
  let previewLink = '';
  if (searchParams?.preview === '1') {
    const result = await buildEodSummaryPayload();
    previewText = result.text;
    previewLink = result.deepLink;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Configure daily WhatsApp summaries sent to the owner."
      />

      {/* Settings form */}
      <div className="card p-6">
        <h2 className="mb-4 text-base font-semibold">WhatsApp Daily Summary</h2>
        <FormError error={searchParams?.error} />
        <form action={updateWhatsappSettingsAction} className="grid gap-4 md:grid-cols-2">
          <div className="md:col-span-2 flex items-center gap-3">
            <input
              className="h-4 w-4"
              type="checkbox"
              name="whatsappEnabled"
              id="whatsappEnabled"
              defaultChecked={!!business.whatsappEnabled}
            />
            <label htmlFor="whatsappEnabled" className="text-sm font-medium">
              Enable WhatsApp EOD summary
            </label>
          </div>
          <div>
            <label className="label">Owner WhatsApp Phone</label>
            <input
              className="input"
              name="whatsappPhone"
              type="tel"
              placeholder="e.g. 233241234567"
              defaultValue={business.whatsappPhone ?? ''}
            />
            <p className="mt-1 text-xs text-black/40">
              Include country code, no + symbol. e.g. 233241234567 for Ghana.
            </p>
          </div>
          <div>
            <label className="label">Send Time (24h local)</label>
            <input
              className="input"
              name="whatsappScheduleTime"
              type="time"
              defaultValue={business.whatsappScheduleTime ?? '20:00'}
            />
          </div>
          <div>
            <label className="label">Branch Scope</label>
            <select className="input" name="whatsappBranchScope" defaultValue={business.whatsappBranchScope ?? 'ALL'}>
              <option value="ALL">All branches</option>
              <option value="MAIN">Main store only</option>
            </select>
          </div>
          <div className="md:col-span-2 flex gap-3">
            <SubmitButton>Save Settings</SubmitButton>
            <a href="?preview=1" className="btn-secondary">Preview Message</a>
          </div>
        </form>
        <div className="mt-4 rounded-lg bg-amber-50 border border-amber-200 p-4 text-sm text-amber-800">
          <strong>How it works:</strong> Set up a Vercel Cron job or call{' '}
          <code className="font-mono text-xs bg-amber-100 px-1 rounded">/api/cron/eod-summary</code>{' '}
          with your <code className="font-mono text-xs bg-amber-100 px-1 rounded">CRON_SECRET</code> at the scheduled time.
          The system generates the message and provides a WhatsApp deep link for quick sending.
        </div>
      </div>

      {/* Message preview */}
      {previewText && (
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold">Message Preview</h2>
          <pre className="whitespace-pre-wrap rounded-xl bg-emerald-50 border border-emerald-200 p-4 text-sm text-black/80 font-mono">
            {previewText}
          </pre>
          {previewLink && (
            <a
              href={previewLink}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-primary mt-4 inline-flex items-center gap-2"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
              </svg>
              Open in WhatsApp
            </a>
          )}
        </div>
      )}

      {/* Recent message logs */}
      {recentMessages.length > 0 && (
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold">Recent Messages Sent</h2>
          <div className="space-y-2 text-sm">
            {recentMessages.map((msg) => (
              <div key={msg.id} className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2">
                <div>
                  <span className="font-medium">{msg.messageType.replace(/_/g, ' ')}</span>
                  <span className="ml-2 text-xs text-black/40">to {msg.recipient}</span>
                </div>
                <div className="flex items-center gap-3">
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
        <div className="card p-6">
          <h2 className="mb-4 text-base font-semibold">Scheduler Run History</h2>
          <div className="space-y-2 text-sm">
            {recentJobs.map((job) => (
              <div key={job.id} className="flex items-center justify-between rounded-lg border border-black/5 bg-white px-3 py-2">
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
