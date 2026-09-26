import { NextRequest, NextResponse } from 'next/server';
import { getUser } from '@/lib/auth';
import {
  buildSalesLedgerCsv,
  buildPurchasesLedgerCsv,
  buildVatReportCsv,
  buildDebtorsListingCsv,
  buildStockMovementsCsv,
} from '@/lib/exports/csv-writers';
import { prisma } from '@/lib/prisma';
import { strToU8, zipSync } from 'fflate';
import { businessDayWindow, localDateInstant, requireReportTimeZone } from '@/lib/reports/reporting-clock';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const user = await getUser();
  if (!user || !['MANAGER', 'OWNER'].includes(user.role)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  }

  const sp = request.nextUrl.searchParams;
  const fromStr = sp.get('from');
  const toStr = sp.get('to');

  const businessClock = await prisma.business.findUnique({
    where: { id: user.businessId },
    select: { timezone: true, currency: true },
  });
  const zone = requireReportTimeZone(businessClock?.timezone);
  const today = businessDayWindow(new Date(), zone);
  const from = localDateInstant(fromStr, 'start', zone)
    ?? new Date(today.startInclusive.getTime() - 30 * 86_400_000);
  const to = localDateInstant(toStr, 'endExclusive', zone) ?? today.endExclusive;
  const range = { from, to };

  const businessId = user.businessId;
  const currency = businessClock?.currency ?? 'GHS';

  const withCurrency = (csv: string) => `Currency,${currency}\n${csv}`;

  // Generate all CSVs in parallel
  const [salesCsv, purchasesCsv, vatCsv, debtorsCsv, stockCsv] = await Promise.all([
    buildSalesLedgerCsv(businessId, range),
    buildPurchasesLedgerCsv(businessId, range),
    buildVatReportCsv(businessId, range),
    buildDebtorsListingCsv(businessId),
    buildStockMovementsCsv(businessId, range),
  ]);

  const label = `${from.toISOString().slice(0, 10)}_to_${to.toISOString().slice(0, 10)}`;

  // Zip all CSVs using fflate
  const zip = zipSync({
    [`sales_ledger_${label}.csv`]: strToU8(withCurrency(salesCsv)),
    [`purchases_ledger_${label}.csv`]: strToU8(withCurrency(purchasesCsv)),
    [`vat_report_${label}.csv`]: strToU8(withCurrency(vatCsv)),
    [`debtors_listing.csv`]: strToU8(withCurrency(debtorsCsv)),
    [`stock_movements_${label}.csv`]: strToU8(withCurrency(stockCsv)),
  });

  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="export_pack_${label}.zip"`,
      'Cache-Control': 'no-store',
    },
  });
}
