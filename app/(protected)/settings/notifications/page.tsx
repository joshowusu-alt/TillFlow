import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import StatCard from '@/components/StatCard';
import { requireBusiness } from '@/lib/auth';
import { getMetaWhatsAppDiagnostics } from '@/lib/notifications/providers/meta-whatsapp';
import { prisma } from '@/lib/prisma';
import MessageLogActions from './MessageLogActions';
import NotificationsSettingsForm from './NotificationsSettingsForm';

export const dynamic = 'force-dynamic';

const MESSAGE_LOGS_PER_PAGE = 20;

function maskPhone(phone: string) {
  const digits = phone.replace(/\D/g, '');
  if (!digits) return phone;
  if (digits.length <= 4) return `+${digits}`;
  return `+${digits.slice(0, 3)}****${digits.slice(-4)}`;
}

function getMessageBadgeTone(status: string, providerStatus: string | null) {
  if (status === 'DELIVERED' || status === 'READ') return 'success' as const;
  if (status === 'FAILED') return 'danger' as const;
  if (status === 'REVIEW_REQUIRED' || providerStatus?.toUpperCase().includes('REVIEW')) return 'warn' as const;
  if (status === 'ACCEPTED' || status === 'PENDING') return 'pending' as const;
  return 'neutral' as const;
}

function formatLabel(value: string | null | undefined) {
  return (value ?? 'Unknown').replace(/_/g, ' ');
}

function formatProviderLabel(provider: string | null | undefined) {
  if (provider === 'WHATSAPP_DEEPLINK') return 'DEEP LINK';
  return formatLabel(provider);
}

export default async function NotificationsSettingsPage({
  searchParams,
}: {
  searchParams?: { error?: string; page?: string };
}) {
  const { business } = await requireBusiness(['OWNER']);
  if (!business) return <div className="card p-6">Owners only.</div>;
  const diagnostics = getMetaWhatsAppDiagnostics();
  const businessTimezone = (business as any).timezone as string | null | undefined;
  const requestedPage = Number(searchParams?.page ?? '1');
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

  const messageLogWhere: any = { businessId: business.id, channel: 'WHATSAPP' };
  const pendingReviewWhere: any = {
    businessId: business.id,
    channel: 'WHATSAPP',
    OR: [
      { status: 'FAILED' },
      { status: 'REVIEW_REQUIRED' },
      { provider: 'WHATSAPP_DEEPLINK' },
      { providerStatus: 'MANUAL_REVIEW_REQUIRED' },
      { providerStatus: 'FALLBACK_MANUAL_REVIEW' },
    ],
  };

  const [totalMessageLogs, pendingReviewCount, pendingReviewMessages, recentJobs] = await Promise.all([
    prisma.messageLog.count({ where: messageLogWhere }),
    prisma.messageLog.count({ where: pendingReviewWhere }),
    prisma.messageLog.findMany({
      where: pendingReviewWhere,
      orderBy: { sentAt: 'desc' },
      take: 3,
      select: {
        id: true,
        recipient: true,
        status: true,
        sentAt: true,
        deepLink: true,
        providerStatus: true,
        deliveredAt: true,
      },
    } as any) as unknown as Promise<Array<{
      id: string;
      recipient: string;
      status: string;
      sentAt: Date;
      deepLink: string | null;
      providerStatus: string | null;
      deliveredAt: Date | null;
    }>>,
    prisma.scheduledJob.findMany({
      where: { businessId: business.id, jobName: 'EOD_WHATSAPP_SUMMARY' },
      orderBy: { startedAt: 'desc' },
      take: 5,
      select: { id: true, status: true, startedAt: true, durationMs: true, triggeredBy: true, errorMessage: true },
    }),
  ]);
  const totalPages = Math.max(1, Math.ceil(totalMessageLogs / MESSAGE_LOGS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const recentMessages = (await prisma.messageLog.findMany({
    where: messageLogWhere,
    orderBy: { sentAt: 'desc' },
    skip: (safeCurrentPage - 1) * MESSAGE_LOGS_PER_PAGE,
    take: MESSAGE_LOGS_PER_PAGE,
    select: {
      id: true,
      messageType: true,
      recipient: true,
      status: true,
      sentAt: true,
      deepLink: true,
      provider: true,
      providerStatus: true,
      providerMessageId: true,
      errorMessage: true,
      deliveredAt: true,
    },
  } as any) as unknown) as Array<{
    id: string;
    messageType: string;
    recipient: string;
    status: string;
    sentAt: Date;
    deepLink: string | null;
    provider: string;
    providerStatus: string | null;
    providerMessageId: string | null;
    errorMessage: string | null;
    deliveredAt: Date | null;
  }>;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        subtitle="Automate the daily owner summary via Meta when configured, with honest fallback logging when manual review is needed."
      />

      <div className="card p-4 sm:p-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold">Delivery Diagnostics</h2>
            <p className="mt-1 text-sm text-black/55">
              See whether this pilot is in automated Meta mode or manual-review fallback mode before the next EOD run fires.
            </p>
          </div>
          <span className={`rounded-full px-3 py-1 text-xs font-semibold ${
            diagnostics.deliveryMode === 'AUTOMATED_META'
              ? 'bg-emerald-100 text-emerald-700'
              : 'bg-amber-100 text-amber-700'
          }`}>
            {diagnostics.deliveryMode === 'AUTOMATED_META' ? 'Meta automated mode' : 'Manual review fallback'}
          </span>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          {[
            {
              label: 'Meta credentials',
              value: diagnostics.metaConfigured ? 'Configured' : 'Missing',
              ok: diagnostics.metaConfigured,
            },
            {
              label: 'Webhook delivery updates',
              value: diagnostics.webhookConfigured ? 'Ready' : 'Missing verify token/app secret',
              ok: diagnostics.webhookConfigured,
            },
            {
              label: 'Template mode',
              value: diagnostics.templateConfigured ? 'Configured' : 'Freeform text fallback',
              ok: diagnostics.templateConfigured,
            },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-black/5 bg-black/[0.02] px-4 py-3">
              <div className="text-xs uppercase tracking-[0.16em] text-black/40">{item.label}</div>
              <div className={`mt-2 text-sm font-semibold ${item.ok ? 'text-emerald-700' : 'text-amber-700'}`}>
                {item.value}
              </div>
              {item.label === 'Meta credentials' && diagnostics.metaMockMode ? (
                <div className="mt-1 text-xs text-black/45">Mock mode is enabled for safe local testing.</div>
              ) : null}
            </div>
          ))}
        </div>

        {diagnostics.issues.length > 0 ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
            <div className="font-semibold">Needs attention before fully unattended delivery</div>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-800">
              {diagnostics.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      <NotificationsSettingsForm
        error={searchParams?.error}
        business={{
          whatsappEnabled: business.whatsappEnabled,
          whatsappPhone: business.whatsappPhone,
          whatsappScheduleTime: business.whatsappScheduleTime,
          whatsappBranchScope: business.whatsappBranchScope,
          timezone: businessTimezone,
        }}
      />

      {pendingReviewCount > 0 ? (
        <div className="card p-4 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-base font-semibold">Pending Reviews</h2>
              <p className="mt-1 text-sm text-black/55">
                These WhatsApp summaries still need manual follow-up or confirmation.
              </p>
            </div>
            <div className="grid gap-3 sm:min-w-[15rem] sm:grid-cols-1">
              <StatCard
                label="Needs attention"
                value={String(pendingReviewCount)}
                tone="warn"
                helper="Retry failed sends or confirm deep-link deliveries below."
              />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {pendingReviewMessages.map((message) => (
              <div
                key={message.id}
                className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone={getMessageBadgeTone(message.status, message.providerStatus)}>
                      {formatLabel(message.status)}
                    </Badge>
                    <span className="text-sm font-medium text-black/80">{maskPhone(message.recipient)}</span>
                  </div>
                  <div className="mt-1 text-xs text-black/50">
                    {new Date(message.sentAt).toLocaleString()}
                    {message.providerStatus ? ` · ${formatLabel(message.providerStatus)}` : ''}
                  </div>
                </div>

                <MessageLogActions
                  messageLogId={message.id}
                  status={message.status}
                  providerStatus={message.providerStatus}
                  deepLink={message.deepLink}
                  deliveredAt={message.deliveredAt?.toISOString() ?? null}
                />
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {/* Recent message logs */}
      {recentMessages.length > 0 ? (
        <div className="card p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Recent WhatsApp Delivery Logs</h2>
              <p className="mt-1 text-sm text-black/55">
                Showing {recentMessages.length} of {totalMessageLogs} delivery attempts.
              </p>
            </div>
            <Badge tone="info">20 per page</Badge>
          </div>
          <div className="space-y-3 text-sm">
            {recentMessages.map((msg) => (
              <div
                key={msg.id}
                className="flex flex-col gap-4 rounded-xl border border-black/5 bg-white px-4 py-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{formatLabel(msg.messageType)}</span>
                     <Badge tone={getMessageBadgeTone(msg.status, msg.providerStatus)}>
                       {formatLabel(msg.status)}
                     </Badge>
                    <Badge tone="neutral">{formatProviderLabel(msg.provider)}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black/45">
                    <span>{new Date(msg.sentAt).toLocaleString()}</span>
                    <span>Recipient: {maskPhone(msg.recipient)}</span>
                    {msg.providerStatus ? <span>Provider status: {formatLabel(msg.providerStatus)}</span> : null}
                    {msg.providerMessageId ? <span>ID: {msg.providerMessageId}</span> : null}
                  </div>
                  {msg.deliveredAt ? (
                    <div className="mt-1 text-xs text-emerald-700">
                      Confirmed {new Date(msg.deliveredAt).toLocaleString()}
                    </div>
                  ) : null}
                  {msg.errorMessage ? (
                    <div className="mt-1 text-xs text-rose-600">{msg.errorMessage}</div>
                  ) : null}
                </div>

                <div className="flex flex-col items-start gap-2 lg:items-end">
                  {msg.deepLink ? (
                    <a
                      href={msg.deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-emerald-600 hover:underline"
                    >
                      Open in WhatsApp
                    </a>
                  ) : null}
                  <MessageLogActions
                    messageLogId={msg.id}
                    status={msg.status}
                    providerStatus={msg.providerStatus}
                    deepLink={msg.deepLink}
                    deliveredAt={msg.deliveredAt?.toISOString() ?? null}
                  />
                </div>
              </div>
            ))}
          </div>
          <Pagination
            currentPage={safeCurrentPage}
            totalPages={totalPages}
            basePath="/settings/notifications"
            searchParams={{ error: searchParams?.error }}
          />
        </div>
      ) : (
        <EmptyState
          icon="alert"
          title="No WhatsApp delivery logs yet"
          subtitle="When TillFlow sends or previews owner summaries, the latest delivery history will appear here for follow-up."
        />
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
                    job.status === 'ERROR' || job.status === 'FAILED' ? 'bg-rose-100 text-rose-700' :
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
