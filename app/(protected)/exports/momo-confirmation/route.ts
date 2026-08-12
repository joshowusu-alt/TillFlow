import { NextResponse } from 'next/server';

import { requireExportUser, resolveExportDateRange } from '../_shared';
import {
  iterMomoConfirmationExportCsvChunks,
  defaultMomoConfirmationStatusFilter,
} from '@/lib/reports/momo-confirmation';
import { resolveMoneyReceivedAccess } from '@/lib/reports/money-received';
import { prisma } from '@/lib/prisma';
import { getBusinessStores } from '@/lib/services/stores';

export async function GET(request: Request) {
  const { user, response } = await requireExportUser(request);
  if (!user) return response as NextResponse;

  const { searchParams } = new URL(request.url);
  const dateRange = resolveExportDateRange(request, '30d');
  const storeIdParam = searchParams.get('storeId') ?? 'ALL';
  const requestedBusinessId = searchParams.get('businessId');
  const statusParam = searchParams.get('status');
  const saleStatusParam = searchParams.get('saleStatus');
  const cashierParam = searchParams.get('cashierUserId');

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
  const filters = {
    businessId: access.businessId,
    branchIds: access.branchIds,
    periodStart: dateRange.start,
    periodEndExclusive,
    status:
      statusParam === 'ALL'
        ? 'ALL'
        : statusParam?.trim() || defaultMomoConfirmationStatusFilter(),
    saleStatus: saleStatusParam === 'ALL' || !saleStatusParam ? 'ALL' : saleStatusParam,
    cashierUserId: cashierParam === 'ALL' || !cashierParam ? 'ALL' : cashierParam,
  };

  const filename = `momo-confirmation-${dateRange.start.toISOString().slice(0, 10)}-${dateRange.end
    .toISOString()
    .slice(0, 10)}.csv`;

  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      try {
        for await (const chunk of iterMomoConfirmationExportCsvChunks(prisma, filters, {
          pageSize: 500,
          currency: business.currency,
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
