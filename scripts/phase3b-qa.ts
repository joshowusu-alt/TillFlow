/**
 * Phase 3B QA Harness
 * Tests: schema models, EOD summary payload, CSV writers, demo mode isolation
 * Run with: npx tsx scripts/phase3b-qa.ts
 */

import { PrismaClient } from '@prisma/client';
import {
  buildSalesLedgerCsv,
  buildPurchasesLedgerCsv,
  buildVatReportCsv,
  buildDebtorsListingCsv,
  buildStockMovementsCsv,
} from '../lib/exports/csv-writers';

const prisma = new PrismaClient();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(`ASSERT FAILED: ${message}`);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrCreateRealBusiness() {
  const biz = await prisma.business.findFirst({ where: { isDemo: false } });
  if (!biz) throw new Error('No real business found. Run the seed first.');
  return biz;
}

async function cleanupTag(tag: string) {
  await prisma.scheduledJob.deleteMany({ where: { jobName: tag } });
  await prisma.messageLog.deleteMany({ where: { messageType: tag } });
  await prisma.business.deleteMany({ where: { name: `QA_DEMO_${tag}` } });
}

// ---------------------------------------------------------------------------
// Test groups
// ---------------------------------------------------------------------------

async function testNewSchemaModels(businessId: string, tag: string) {
  console.log('\n--- Schema: ScheduledJob & MessageLog ---');

  // Create ScheduledJob
  const job = await prisma.scheduledJob.create({
    data: {
      businessId,
      jobName: tag,
      status: 'SUCCESS',
      triggeredBy: 'QA_HARNESS',
      startedAt: new Date(),
      finishedAt: new Date(),
      durationMs: 42,
      resultJson: JSON.stringify({ ok: true }),
    },
  });
  assert(job.id, 'ScheduledJob should have an id');
  assert(job.status === 'SUCCESS', 'ScheduledJob status should be SUCCESS');
  console.log('  ✓ ScheduledJob created', job.id);

  // Create MessageLog
  const msg = await prisma.messageLog.create({
    data: {
      businessId,
      channel: 'WHATSAPP',
      recipient: '233241234567',
      messageType: tag,
      payload: 'Test QA message',
      status: 'SENT',
      deepLink: 'https://wa.me/233241234567?text=test',
      sentAt: new Date(),
    },
  });
  assert(msg.id, 'MessageLog should have an id');
  assert(msg.status === 'SENT', 'MessageLog status should be SENT');
  console.log('  ✓ MessageLog created', msg.id);

  // Read back
  const readJob = await prisma.scheduledJob.findUnique({ where: { id: job.id } });
  assert(readJob?.durationMs === 42, 'ScheduledJob durationMs should be 42');
  const readMsg = await prisma.messageLog.findUnique({ where: { id: msg.id } });
  assert(readMsg?.deepLink?.startsWith('https://wa.me'), 'MessageLog deepLink should be wa.me');
  console.log('  ✓ Read-back assertions passed');

  return { jobId: job.id, msgId: msg.id };
}

async function testWhatsappFields(businessId: string) {
  console.log('\n--- WhatsApp Business Fields ---');
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    select: { whatsappEnabled: true, whatsappPhone: true, whatsappScheduleTime: true, whatsappBranchScope: true, isDemo: true },
  });
  assert(business !== null, 'Business should exist');
  assert(typeof business!.whatsappEnabled === 'boolean', 'whatsappEnabled should be boolean');
  assert(business!.whatsappScheduleTime !== undefined, 'whatsappScheduleTime field should exist');
  assert(business!.whatsappBranchScope !== undefined, 'whatsappBranchScope field should exist');
  assert(typeof business!.isDemo === 'boolean', 'isDemo field should be boolean');
  console.log('  ✓ All Phase 3B Business fields present');
}

async function testDemoModeIsolation() {
  console.log('\n--- Demo Mode Isolation ---');

  // Create a fresh demo business
  const demoName = `QA_DEMO_${Date.now()}`;
  const demo = await prisma.business.create({
    data: { name: demoName, currency: 'GHS', isDemo: true },
  });
  assert(demo.isDemo === true, 'Demo business isDemo should be true');

  // Fetch with filter — only non-demo businesses
  const realBusinesses = await prisma.business.findMany({ where: { isDemo: false } });
  const demoInReal = realBusinesses.find((b) => b.id === demo.id);
  assert(!demoInReal, 'Demo business should NOT appear in non-demo query');
  console.log('  ✓ Demo business is isolated from real business queries');

  // Verify demo business found with isDemo filter
  const foundDemo = await prisma.business.findFirst({ where: { isDemo: true, name: demoName } });
  assert(foundDemo?.id === demo.id, 'Demo business should be findable with isDemo: true');
  console.log('  ✓ Demo business is findable with isDemo: true');

  // Cleanup
  await prisma.business.delete({ where: { id: demo.id } });
  console.log('  ✓ Demo cleanup OK');
}

async function testCsvWriters(businessId: string) {
  console.log('\n--- Export Pack: CSV Writers ---');

  const range = {
    from: new Date('2020-01-01'),
    to: new Date('2020-01-02'),
  };

  const [salesCsv, purchasesCsv, vatCsv, debtorsCsv, stockCsv] = await Promise.all([
    buildSalesLedgerCsv(businessId, range),
    buildPurchasesLedgerCsv(businessId, range),
    buildVatReportCsv(businessId, range),
    buildDebtorsListingCsv(businessId),
    buildStockMovementsCsv(businessId, range),
  ]);

  // All should return a non-empty string with at least a header row
  assert(salesCsv.includes('Ref,Date,Store'), 'Sales CSV should have header');
  assert(purchasesCsv.includes('Ref,Date,Store'), 'Purchases CSV should have header');
  assert(vatCsv.includes('Output Tax'), 'VAT CSV should have Output Tax row');
  assert(debtorsCsv.includes('Invoice,Date'), 'Debtors CSV should have header');
  assert(stockCsv.includes('Date,Store,Product'), 'Stock CSV should have header');
  console.log('  ✓ All 5 CSV writers return valid headers');

  // VAT CSV should always have 4 data rows (sections)
  const vatRows = vatCsv.trim().split('\n');
  assert(vatRows.length >= 4, `VAT CSV should have at least 4 rows, got ${vatRows.length}`);
  console.log('  ✓ VAT report has correct row structure');
}

async function testEodSummaryPayload(businessId: string) {
  console.log('\n--- EOD Summary Payload ---');

  // Enable WhatsApp on the business temporarily
  const original = await prisma.business.findUnique({
    where: { id: businessId },
    select: { whatsappEnabled: true, whatsappPhone: true },
  });

  await prisma.business.update({
    where: { id: businessId },
    data: { whatsappEnabled: true, whatsappPhone: '233241234567' },
  });

  // Import and call buildEodSummaryPayload
  const { buildEodSummaryPayload } = await import('../app/actions/notifications');
  const result = await buildEodSummaryPayload(businessId);

  assert(result.text.length > 0, 'EOD summary text should not be empty');
  assert(result.deepLink.startsWith('https://wa.me/'), 'EOD deepLink should be a wa.me URL');
  assert(result.recipient === '233241234567', 'EOD recipient should match whatsappPhone');
  console.log('  ✓ buildEodSummaryPayload returns text + wa.me deepLink');

  // Restore original values
  await prisma.business.update({
    where: { id: businessId },
    data: {
      whatsappEnabled: original?.whatsappEnabled ?? false,
      whatsappPhone: original?.whatsappPhone ?? null,
    },
  });
  console.log('  ✓ Business WhatsApp fields restored');
}

// ---------------------------------------------------------------------------
// Main runner
// ---------------------------------------------------------------------------

async function run() {
  const TAG = `QA_PHASE3B_${Date.now()}`;
  const report: Record<string, boolean> = {
    schemaModels: false,
    whatsappFields: false,
    demoIsolation: false,
    csvWriters: false,
    eodPayload: false,
  };

  let businessId: string;
  let createdIds: { jobId: string; msgId: string } | undefined;

  try {
    const biz = await getOrCreateRealBusiness();
    businessId = biz.id;
    console.log(`\nUsing business: ${biz.name} (${businessId})`);

    // 1. Schema models
    try {
      createdIds = await testNewSchemaModels(businessId, TAG);
      report.schemaModels = true;
    } catch (e) {
      console.error('  ✗ Schema models:', e);
    }

    // 2. WhatsApp fields
    try {
      await testWhatsappFields(businessId);
      report.whatsappFields = true;
    } catch (e) {
      console.error('  ✗ WhatsApp fields:', e);
    }

    // 3. Demo isolation
    try {
      await testDemoModeIsolation();
      report.demoIsolation = true;
    } catch (e) {
      console.error('  ✗ Demo isolation:', e);
    }

    // 4. CSV writers
    try {
      await testCsvWriters(businessId);
      report.csvWriters = true;
    } catch (e) {
      console.error('  ✗ CSV writers:', e);
    }

    // 5. EOD payload
    try {
      await testEodSummaryPayload(businessId);
      report.eodPayload = true;
    } catch (e) {
      console.error('  ✗ EOD payload:', e);
    }
  } finally {
    // Cleanup QA artifacts
    if (createdIds) {
      await prisma.scheduledJob.deleteMany({ where: { id: createdIds.jobId } }).catch(() => {});
      await prisma.messageLog.deleteMany({ where: { id: createdIds.msgId } }).catch(() => {});
    }
    await prisma.$disconnect();
  }

  // Summary
  console.log('\n============================================');
  console.log('Phase 3B QA Report');
  console.log('============================================');
  const passed = Object.entries(report).filter(([, v]) => v);
  const failed = Object.entries(report).filter(([, v]) => !v);
  for (const [k] of passed) console.log(`  PASS  ${k}`);
  for (const [k] of failed) console.log(`  FAIL  ${k}`);
  console.log(`\n${passed.length}/${Object.keys(report).length} tests passed`);

  if (failed.length > 0) {
    console.error('\n❌ Phase 3B QA FAILED');
    process.exit(1);
  }
  console.log('\n✅ Phase 3B QA PASSED');
}

run().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
