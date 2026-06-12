import PageHeader from '@/components/PageHeader';
import Badge from '@/components/Badge';
import EmptyState from '@/components/EmptyState';
import Pagination from '@/components/Pagination';
import PlanFeatureBadge from '@/components/PlanFeatureBadge';
import { requireDailySummaryAccess } from '@/lib/notifications/daily-summary-access';
import AdvancedModeNotice from '@/components/AdvancedModeNotice';
import { getFeatures } from '@/lib/features';
import {
  maskOwnerPhone,
  resolveMerchantDeliveryChannel,
  resolveMerchantFriendlyStatus,
} from '@/lib/notifications/merchant-delivery-log';
import { getMerchantDailySummaryStatus } from '@/lib/notifications/merchant-summary-status';
import { OWNER_DAILY_SUMMARY_EVENT_TYPE } from '@/lib/notifications/owner-daily-summary-sms';
import { prisma } from '@/lib/prisma';
import MessageLogActions from './MessageLogActions';
import NotificationsSettingsForm from './NotificationsSettingsForm';

export const dynamic = 'force-dynamic';

const DELIVERY_LOGS_PER_PAGE = 20;

type DeliveryLogEntry = {
  id: string;
  sentAt: Date;
  channel: ReturnType<typeof resolveMerchantDeliveryChannel>;
  friendlyStatus: ReturnType<typeof resolveMerchantFriendlyStatus>;
  recipient: string;
  deepLink: string | null;
  messageLogId: string | null;
  rawStatus: string;
  providerStatus: string | null;
  deliveredAt: string | null;
};

export default async function NotificationsSettingsPage({
  searchParams,
}: {
  searchParams?: { error?: string; page?: string };
}) {
  const { business } = await requireDailySummaryAccess(['OWNER']);
  if (!business) return <div className="card p-6">Owners only.</div>;

  const features = getFeatures(
    (business as any).plan ?? (business.mode as any),
    (business as any).storeMode as any,
  );
  if (!features.advancedOps) {
    return (
      <AdvancedModeNotice
        title="Notifications is available on Growth and Pro"
        description="Daily Owner Summary and notification controls are unlocked on businesses provisioned for Growth or Pro."
        featureName="Notifications"
        minimumPlan="GROWTH"
      />
    );
  }

  const businessTimezone = (business as any).timezone as string | null | undefined;
  const summaryStatus = getMerchantDailySummaryStatus({
    summaryEnabled: Boolean(business.whatsappEnabled),
    ownerPhone: business.whatsappPhone,
  });

  const requestedPage = Number(searchParams?.page ?? '1');
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? Math.floor(requestedPage) : 1;

  const pendingReviewWhere = {
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

  const [pendingReviewCount, pendingReviewMessages, smsLogs, whatsappLogs] = await Promise.all([
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
        provider: true,
        providerStatus: true,
        deliveredAt: true,
      },
    } as any) as unknown as Promise<
      Array<{
        id: string;
        recipient: string;
        status: string;
        sentAt: Date;
        deepLink: string | null;
        provider: string | null;
        providerStatus: string | null;
        deliveredAt: Date | null;
      }>
    >,
    prisma.messageOutbox.findMany({
      where: {
        businessId: business.id,
        eventType: OWNER_DAILY_SUMMARY_EVENT_TYPE,
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        recipient: true,
        status: true,
        createdAt: true,
        sentAt: true,
      },
    }),
    prisma.messageLog.findMany({
      where: {
        businessId: business.id,
        channel: 'WHATSAPP',
        messageType: 'EOD_SUMMARY',
      },
      orderBy: { sentAt: 'desc' },
      take: 100,
      select: {
        id: true,
        recipient: true,
        status: true,
        sentAt: true,
        deepLink: true,
        provider: true,
        providerStatus: true,
        deliveredAt: true,
      },
    } as any) as unknown as Promise<
      Array<{
        id: string;
        recipient: string;
        status: string;
        sentAt: Date;
        deepLink: string | null;
        provider: string | null;
        providerStatus: string | null;
        deliveredAt: Date | null;
      }>
    >,
  ]);

  const mergedLogs: DeliveryLogEntry[] = [
    ...smsLogs.map((entry) => {
      const friendlyStatus = resolveMerchantFriendlyStatus({
        status: entry.status,
        channel: 'SMS',
      });
      return {
        id: `sms:${entry.id}`,
        sentAt: entry.sentAt ?? entry.createdAt,
        channel: 'SMS' as const,
        friendlyStatus,
        recipient: entry.recipient,
        deepLink: null,
        messageLogId: null,
        rawStatus: entry.status,
        providerStatus: null,
        deliveredAt: entry.sentAt?.toISOString() ?? null,
      };
    }),
    ...whatsappLogs.map((entry) => ({
      id: `wa:${entry.id}`,
      sentAt: entry.sentAt,
      channel: resolveMerchantDeliveryChannel({
        channel: 'WHATSAPP',
        provider: entry.provider,
        deepLink: entry.deepLink,
      }),
      friendlyStatus: resolveMerchantFriendlyStatus({
        status: entry.status,
        providerStatus: entry.providerStatus,
        channel: 'WHATSAPP',
        deepLink: entry.deepLink,
      }),
      recipient: entry.recipient,
      deepLink: entry.deepLink,
      messageLogId: entry.id,
      rawStatus: entry.status,
      providerStatus: entry.providerStatus,
      deliveredAt: entry.deliveredAt?.toISOString() ?? null,
    })),
  ].sort((left, right) => right.sentAt.getTime() - left.sentAt.getTime());

  const totalLogs = mergedLogs.length;
  const totalPages = Math.max(1, Math.ceil(totalLogs / DELIVERY_LOGS_PER_PAGE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const recentLogs = mergedLogs.slice(
    (safeCurrentPage - 1) * DELIVERY_LOGS_PER_PAGE,
    safeCurrentPage * DELIVERY_LOGS_PER_PAGE,
  );

  const statusToneClass = (tone: 'success' | 'pending' | 'neutral' | 'warn') => {
    if (tone === 'success') return 'border-emerald-200 bg-emerald-50 text-emerald-800';
    if (tone === 'pending') return 'border-amber-200 bg-amber-50 text-amber-900';
    if (tone === 'warn') return 'border-amber-200 bg-amber-50 text-amber-900';
    return 'border-black/5 bg-black/[0.02] text-black/70';
  };

  return (
    <div className="space-y-6 pb-24">
      <PageHeader
        title="Notifications"
        subtitle="Send the owner a daily business summary by SMS, with WhatsApp preview and manual follow-up available."
        actions={<PlanFeatureBadge plan="GROWTH" />}
      />

      <div className="card p-4 sm:p-6">
        <h2 className="text-base font-semibold">Delivery status</h2>
        <p className="mt-1 text-sm text-black/55">
          SMS is the scheduled delivery channel. WhatsApp preview and manual follow-up stay available when you need them.
        </p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className={`rounded-xl border px-4 py-3 text-sm ${statusToneClass(summaryStatus.smsTone)}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">SMS</div>
            <p className="mt-2 font-medium">{summaryStatus.smsLine}</p>
          </div>
          <div className={`rounded-xl border px-4 py-3 text-sm ${statusToneClass(summaryStatus.whatsappTone)}`}>
            <div className="text-xs font-semibold uppercase tracking-[0.14em] opacity-70">WhatsApp</div>
            <p className="mt-2 font-medium">{summaryStatus.whatsappLine}</p>
          </div>
        </div>
        {summaryStatus.helperLine ? (
          <p className="mt-4 text-sm text-black/55">{summaryStatus.helperLine}</p>
        ) : null}
        {pendingReviewCount > 0 ? (
          <p className="mt-3 text-sm text-amber-800">
            Some summaries may need manual follow-up before sending.
          </p>
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
        summaryStatus={summaryStatus}
      />

      {pendingReviewCount > 0 ? (
        <div className="card p-4 sm:p-6">
          <div>
            <h2 className="text-base font-semibold">Needs follow-up</h2>
            <p className="mt-1 text-sm text-black/55">
              These summaries still need manual follow-up or confirmation in WhatsApp.
            </p>
          </div>

          <div className="mt-4 space-y-3">
            {pendingReviewMessages.map((message) => {
              const friendlyStatus = resolveMerchantFriendlyStatus({
                status: message.status,
                providerStatus: message.providerStatus,
                deepLink: message.deepLink,
              });
              return (
                <div
                  key={message.id}
                  className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={friendlyStatus.tone}>{friendlyStatus.label}</Badge>
                      <span className="text-sm font-medium text-black/80">{maskOwnerPhone(message.recipient)}</span>
                    </div>
                    <div className="mt-1 text-xs text-black/50">{new Date(message.sentAt).toLocaleString()}</div>
                  </div>

                  <MessageLogActions
                    messageLogId={message.id}
                    status={message.status}
                    providerStatus={message.providerStatus}
                    deepLink={message.deepLink}
                    deliveredAt={message.deliveredAt?.toISOString() ?? null}
                  />
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {recentLogs.length > 0 ? (
        <div className="card p-4 sm:p-6">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 className="text-base font-semibold">Recent delivery history</h2>
              <p className="mt-1 text-sm text-black/55">
                Showing {recentLogs.length} of {totalLogs} recent summaries.
              </p>
            </div>
          </div>
          <div className="space-y-3 text-sm">
            {recentLogs.map((entry) => (
              <div
                key={entry.id}
                className="flex flex-col gap-4 rounded-xl border border-black/5 bg-white px-4 py-4 lg:flex-row lg:items-start lg:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{entry.channel}</Badge>
                    <Badge tone={entry.friendlyStatus.tone}>{entry.friendlyStatus.label}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-black/45">
                    <span>{new Date(entry.sentAt).toLocaleString()}</span>
                    <span>{maskOwnerPhone(entry.recipient)}</span>
                  </div>
                </div>

                <div className="flex flex-col items-start gap-2 lg:items-end">
                  {entry.deepLink ? (
                    <a
                      href={entry.deepLink}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-medium text-emerald-600 hover:underline"
                    >
                      Open in WhatsApp
                    </a>
                  ) : null}
                  {entry.messageLogId ? (
                    <MessageLogActions
                      messageLogId={entry.messageLogId}
                      status={entry.rawStatus}
                      providerStatus={entry.providerStatus}
                      deepLink={entry.deepLink}
                      deliveredAt={entry.deliveredAt}
                    />
                  ) : null}
                </div>
              </div>
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination
              currentPage={safeCurrentPage}
              totalPages={totalPages}
              basePath="/settings/notifications"
              searchParams={{ error: searchParams?.error }}
            />
          ) : null}
        </div>
      ) : (
        <EmptyState
          icon="alert"
          title="No delivery history yet"
          subtitle="When TillFlow sends scheduled SMS summaries or you preview or test a summary, recent activity will appear here."
        />
      )}
    </div>
  );
}
