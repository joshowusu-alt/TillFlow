import { NextResponse } from 'next/server';

import { requireExportUser, resolveExportDateRange } from '../_shared';
import {
  computeMoneyReceivedBundle,
  iterMoneyReceivedExportCsvChunks,
  resolveMoneyReceivedAccess,
  type MoneyReceivedMetricId,
} from '@/lib/reports/money-received';
import { prisma } from '@/lib/prisma';
import { getBusinessStores } from '@/lib/services/stores';

const ALLOWED: MoneyReceivedMetricId[] = [
  'money_received',
  'money_received_cash',
  'money_received_momo',
  'money_received_card',
  'money_received_transfer',
  'money_received_other',
  'unverified_legacy_receipts',
  'refund_outflows',
];

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const { searchParams } = new URL(request.url);
  const dateRange = resolveExportDateRange(request, '7d');
  const storeIdParam = searchParams.get('storeId') ?? 'ALL';
  const requestedBusinessId = searchParams.get('businessId');
  const metricParam = (searchParams.get('metric') ?? 'money_received') as MoneyReceivedMetricId;
  const drillMetricId = ALLOWED.includes(metricParam) ? metricParam : 'money_received';

  const { stores } = await getBusinessStores(user.businessId, storeIdParam);
  const access = resolveMoneyReceivedAccess({
    actor: { role: user.role, businessId: user.businessId },
    requestedBusinessId,
    requestedStoreId: storeIdParam,
    authorisedStoreIds: stores.map((s) => s.id),
  });
  if (!access.ok) {
    return NextResponse.json(
      { error: 'Access denied', reason: access.reason, completeExport: false },
      { status: access.status },
    );
  }

  const business = await prisma.business.findUnique({
    where: { id: access.businessId },
    select: { id: true, currency: true, timezone: true, name: true },
  });
  if (!business) {
    return NextResponse.json({ error: 'Business not found', completeExport: false }, { status: 404 });
  }

  const periodEndExclusive = new Date(dateRange.end.getTime() + 1);

  const bundle = await computeMoneyReceivedBundle({
    businessId: access.businessId,
    currency: business.currency,
    timeZone: business.timezone,
    periodStart: dateRange.start,
    periodEndInclusive: periodEndExclusive,
    branchIds: access.branchIds,
    absoluteBounds: true,
  });

  if (bundle.quality.overall === 'QUERY_FAILED') {
    return NextResponse.json(
      {
        error: 'Money Received query failed',
        detail: bundle.results[0]?.dependencyReason,
        completeExport: false,
      },
      { status: 503 },
    );
  }

  const filename = `money-received-${dateRange.start.toISOString().slice(0, 10)}-${dateRange.end
    .toISOString()
    .slice(0, 10)}.csv`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of iterMoneyReceivedExportCsvChunks(prisma, bundle, {
          drillMetricId,
          pageSize: 500,
        })) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      } catch (err) {
        controller.error(err);
      }
    },
  });

  return new NextResponse(stream, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
      'X-Export-Completeness': 'COMPLETE_STREAM',
    },
  });
}
