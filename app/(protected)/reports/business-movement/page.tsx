import BusinessMovementReportView from '@/components/reports/stage3b/BusinessMovementReportView';
import { notFound } from 'next/navigation';
import { reportScopeLabel } from '@/lib/reports/scope-labels';
import EmptyState from '@/components/EmptyState';
import { addCalendarDays } from '@/lib/entitlements/range';
import { openLiveReport } from '@/lib/entitlements/live-report';
import { formatBusinessLocalDateKey } from '@/lib/notifications/utils';
import { prisma } from '@/lib/prisma';
import { requireReportTimeZone } from '@/lib/reports/reporting-clock';
import { getBusinessStores } from '@/lib/services/stores';
import { resolveMoneyReceivedAccess } from '@/lib/reports/money-received';
import {
  STOCK_AVAILABILITY_READINESS,
  buildOwnerInsightSummary,
  buildOwnerSummaryStrip,
  computeBusinessMovementWithMoneyFromDb,
  containsForbiddenStockLanguage,
  ownerInsightCopy,
  ownerPeriodChrome,
  OWNER_STOCK_DATA_NOTE,
  resolveBusinessMovementPeriodInput,
  resolveEqualLengthPeriodPair,
  resolveLastFullCalendarMonthPair,
} from '@/lib/reports/business-movement';

export const dynamic = 'force-dynamic';

export default async function BusinessMovementReportPage({
  searchParams,
}: {
  searchParams?: {
    preset?: string;
    currentFrom?: string;
    currentTo?: string;
    storeId?: string;
    businessId?: string;
  };
}) {
  const opened = await openLiveReport({
    surfaceId: 'business_movement',
    search: searchParams,
    range: ({ timezone, now, canonicalPlan }) => {
      const custom =
        searchParams?.preset === 'equal_length_custom' &&
        Boolean(searchParams.currentFrom) &&
        Boolean(searchParams.currentTo);
      if (canonicalPlan === 'STARTER' && !custom && !searchParams?.preset) {
        const today = formatBusinessLocalDateKey(now, timezone);
        return { fromLocalDate: addCalendarDays(today, -29), toLocalDate: today, preset: 'CUSTOM' };
      }
      if (custom && searchParams?.currentFrom && searchParams.currentTo) {
        const pair = resolveEqualLengthPeriodPair({
          timeZone: timezone,
          currentFromKey: searchParams.currentFrom,
          currentToKey: searchParams.currentTo,
        });
        return { fromLocalDate: pair.comparisonFromKey, toLocalDate: pair.currentToKey, preset: 'CUSTOM' };
      }
      const pair = resolveLastFullCalendarMonthPair({ timeZone: timezone, asOf: now });
      return { fromLocalDate: pair.comparisonFromKey, toLocalDate: pair.currentToKey, preset: 'CUSTOM' };
    },
  });
  if (!opened.ok) return opened.denial;
  const { business, user } = opened;
  if (opened.branch.kind !== 'stores') notFound();
  if (!business) {
    return (
      <div className="card p-6">
        <EmptyState
          icon="chart"
          title="Setup required"
          subtitle="Complete your business setup to unlock Business Movement."
          cta={{ label: 'Complete Setup', href: '/onboarding' }}
        />
      </div>
    );
  }

  const { stores } = await getBusinessStores(business.id, searchParams?.storeId);
  const access = resolveMoneyReceivedAccess({
    actor: { role: user.role, businessId: user.businessId },
    requestedBusinessId: searchParams?.businessId,
    requestedStoreId: opened.branch.selected,
    authorisedStoreIds: stores.map((s) => s.id),
  });
  if (!access.ok) {
    return (
      <div className="card p-6">
        <EmptyState
          icon="chart"
          title="Access denied"
          subtitle={
            access.reason === 'BRANCH_NOT_AUTHORISED'
              ? 'That branch is not available for your business.'
              : access.reason === 'TENANT_MISMATCH'
                ? 'You cannot open another business from this account.'
                : 'You do not have access to Business Movement.'
          }
        />
      </div>
    );
  }

  const businessTz = await prisma.business.findUnique({
    where: { id: access.businessId },
    select: { timezone: true },
  });
  const timeZone = requireReportTimeZone(businessTz?.timezone);

  const starterDefault =
    business.canonicalPlan === 'STARTER' &&
    searchParams?.preset !== 'equal_length_custom' &&
    !searchParams?.preset;
  const periodInput = starterDefault
    ? {
        preset: 'equal_length_custom' as const,
        currentFromKey: addCalendarDays(formatBusinessLocalDateKey(new Date(), timeZone), -14),
        currentToKey: formatBusinessLocalDateKey(new Date(), timeZone),
      }
    : resolveBusinessMovementPeriodInput({
        preset: searchParams?.preset,
        currentFrom: searchParams?.currentFrom,
        currentTo: searchParams?.currentTo,
      });
  const selectedPreset =
    periodInput.preset === 'equal_length_custom'
      ? 'equal_length_custom'
      : 'last_full_calendar_month';
  const currentFromValue =
    periodInput.preset === 'equal_length_custom'
      ? periodInput.currentFromKey
      : (searchParams?.currentFrom ?? '');
  const currentToValue =
    periodInput.preset === 'equal_length_custom'
      ? periodInput.currentToKey
      : (searchParams?.currentTo ?? '');

  const result = await computeBusinessMovementWithMoneyFromDb(prisma, {
    businessId: access.businessId,
    currency: business.currency,
    timeZone,
    branchIds: opened.branch.storeIds,
    period: periodInput,
  });
  const summary = buildOwnerInsightSummary(result);
  const strip = buildOwnerSummaryStrip(result, summary.insights);
  const chrome = ownerPeriodChrome(result.scope.periods);
  const selectedStoreId = access.selectedStoreId;
  const p = result.scope.periods;

  const exportQs = new URLSearchParams({
    preset: selectedPreset,
    storeId: selectedStoreId,
  });
  if (selectedPreset === 'equal_length_custom') {
    exportQs.set('currentFrom', currentFromValue);
    exportQs.set('currentTo', currentToValue);
  }

  const moneyQs = new URLSearchParams({
    from: p.currentFromKey,
    to: p.currentToKey,
    storeId: selectedStoreId,
  });

  const insightBlob = summary.insights
    .map((i) => {
      const copy = ownerInsightCopy(i, chrome);
      return `${copy.fact} ${copy.evidence} ${copy.signal} ${copy.recommendedCheck}`;
    })
    .join(' ');
  if (
    STOCK_AVAILABILITY_READINESS === 'NOT_RELIABLE' &&
    containsForbiddenStockLanguage(`${insightBlob} ${strip.paragraph} ${OWNER_STOCK_DATA_NOTE}`)
  ) {
    throw new Error('Business Movement page refused stock-causation language');
  }

  const scopeLabel = reportScopeLabel(selectedStoreId, stores);

  return <BusinessMovementReportView result={result} scopeLabel={scopeLabel} readOnly={opened.readOnly}
    choices={opened.branch.choices} offerAll={opened.branch.offerAll} selectedStoreId={selectedStoreId}
    selectedPreset={selectedPreset} currentFromValue={currentFromValue} currentToValue={currentToValue}
    exportQuery={exportQs.toString()} moneyQuery={moneyQs.toString()} />;
}
