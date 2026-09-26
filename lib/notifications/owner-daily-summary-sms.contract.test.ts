import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/prisma', () => ({ prisma: {} }));

import {
  OWNER_SMS_SEPTET_LIMIT,
  buildOwnerDailySummarySms,
  formatOwnerDailySummarySms,
  gsm7SeptetCount,
  type OwnerDailySmsInput,
} from '@/lib/notifications/owner-daily-summary-sms';

const SOURCE = readFileSync(path.join(process.cwd(), 'lib/notifications/owner-daily-summary-sms.ts'), 'utf8');

function input(overrides: Partial<OwnerDailySmsInput> = {}): OwnerDailySmsInput {
  return {
    asOfLocal: '2026-09-23 21:54',
    timeZone: 'Africa/Accra',
    salesPence: 150000,
    transactionCount: 4,
    receivedPence: 120000,
    overdueCustomerPence: 80000,
    overdueSupplierPence: 45000,
    openExpectedCashPence: 20000,
    closedVariancePence: -500,
    expensesPaidPence: 3000,
    marginState: 'READY',
    grossProfitPence: 40000,
    methodSplit: { cashPence: 70000, momoPence: 40000, cardPence: 10000, transferPence: 0 },
    actions: ['2 low-stock', '1 voids'],
    ...overrides,
  };
}

function metrics(overrides: Record<string, unknown> = {}) {
  return {
    dateLabel: '23 Sep 2026',
    scopeLabel: 'All branches',
    totalSalesPence: 150000,
    grossProfitPence: 40000,
    transactionCount: 4,
    cashPence: 70000,
    momoPence: 40000,
    cardPence: 10000,
    transferPence: 0,
    outstandingArPence: 80000,
    lowStockCount: 2,
    voidCount: 1,
    returnCount: 0,
    closedVariancePence: -500 as number | null,
    marginState: 'READY' as const,
    overdueCustomerPence: 80000,
    overdueSupplierPence: 45000,
    openExpectedCashPence: 20000 as number | null,
    expensesPaidPence: 3000,
    asOfLocal: '2026-09-23 21:54',
    timeZone: 'Africa/Accra',
    ...overrides,
  };
}

describe('owner daily summary SMS formatter', () => {
  it('counts GSM-7 basic as one septet and extension characters as two', () => {
    expect(gsm7SeptetCount('A')).toBe(1);
    expect(gsm7SeptetCount('^')).toBe(2);
    expect(gsm7SeptetCount('{')).toBe(2);
    expect(gsm7SeptetCount('\\')).toBe(2);
    expect(gsm7SeptetCount('€')).toBe(2);
    expect(gsm7SeptetCount('₵')).toBeNull();
  });

  it('sends a protected core inside 306 septets with GHS and the freshness sentence', () => {
    const result = formatOwnerDailySummarySms(input());
    expect(result.send).toBe(true);
    if (!result.send) return;
    expect(result.septets).toBeLessThanOrEqual(OWNER_SMS_SEPTET_LIMIT);
    expect(result.septets).toBe(gsm7SeptetCount(result.body));
    expect(result.body).toContain('Based on data received by TillFlow as of 2026-09-23 21:54 Africa/Accra.');
    expect(result.body).toContain('Sales GHS 1500.00 (4 transactions)');
    expect(result.body).toContain('Confirmed money received GHS 1200.00');
    expect(result.body).toContain('Overdue customers GHS 800.00');
    expect(result.body).toContain('Overdue suppliers GHS 450.00');
    expect(result.body).toContain('Open expected cash GHS 200.00');
    expect(result.body).toContain('Closed variance GHS -5.00');
    expect(result.body).toContain('Expenses paid GHS 30.00');
    expect(result.body).toContain('GHS');
    expect(result.body).not.toContain('GH₵');
    expect(result.body.toLowerCase()).not.toContain('whatsapp');
    expect(result.body).not.toMatch(/expected cash.*variance|variance.*expected cash/i);
  });

  it('rejects a non-GSM-7 character instead of falling forward to UCS-2', () => {
    const result = formatOwnerDailySummarySms(input({ actions: ['Review ₵ till'] }));
    expect(result).toEqual({ send: false, reason: 'NON_GSM7' });
  });

  it('omits a GP amount when costs are incomplete and includes GP when ready', () => {
    const slim = { methodSplit: null, actions: [] as string[] };
    const incomplete = formatOwnerDailySummarySms(input({
      ...slim,
      marginState: 'INCOMPLETE_COSTS',
      grossProfitPence: 40000,
    }));
    expect(incomplete.send).toBe(true);
    if (incomplete.send) {
      expect(incomplete.body).not.toMatch(/Gross profit|GP GHS/);
      expect(incomplete.body).toContain('Costs incomplete');
    }

    const ready = formatOwnerDailySummarySms(input(slim));
    expect(ready.send).toBe(true);
    if (ready.send) expect(ready.body).toContain('Gross profit GHS 400.00');
  });

  it('keeps open expected cash and closed variance on separate lines', () => {
    const result = formatOwnerDailySummarySms(input());
    expect(result.send).toBe(true);
    if (!result.send) return;
    const lines = result.body.split('\n');
    expect(lines.some((line) => line.startsWith('Open expected cash '))).toBe(true);
    expect(lines.some((line) => line.startsWith('Closed variance '))).toBe(true);
    expect(lines.some((line) => /open/i.test(line) && /variance/i.test(line))).toBe(false);
  });

  it('omits open expected cash when no open shift exists', () => {
    const result = formatOwnerDailySummarySms(input({ openExpectedCashPence: null }));
    expect(result.send).toBe(true);
    if (!result.send) return;
    expect(result.body).not.toContain('Open expected cash');
    expect(result.body).toContain('Closed variance');
  });

  it('drops in the frozen order and never produces a third segment', () => {
    const seen = {
      methods: false,
      methodsDroppedGpKept: false,
      gpDropped: false,
      oneAction: false,
      actionCount: false,
      abbreviated: false,
      openCashOmitted: false,
    };

    const amounts = {
      salesPence: 1500,
      receivedPence: 1200,
      overdueCustomerPence: 800,
      overdueSupplierPence: 400,
      expensesPaidPence: 300,
      grossProfitPence: 400,
      methodSplit: { cashPence: 700, momoPence: 400, cardPence: 100, transferPence: 0 },
    };

    for (let tzLen = 8; tzLen <= 140; tzLen += 1) {
      for (let pad = -1; pad <= 120; pad += 1) {
        const actions = pad < 0 ? [] : [
          `Check shelf ${'a'.repeat(pad)}`,
          `Count till ${'b'.repeat(pad)}`,
          `Call supplier ${'c'.repeat(pad)}`,
        ];
        const result = formatOwnerDailySummarySms(input({
          ...amounts,
          timeZone: `A${'a'.repeat(tzLen)}`,
          openExpectedCashPence: null,
          closedVariancePence: null,
          actions,
        }));
        if (!result.send) continue;
        expect(result.septets).toBeLessThanOrEqual(306);
        expect(result.body).toMatch(/Sales GHS/);
        expect(result.body).toMatch(/Confirmed money received GHS|Received GHS/);
        expect(result.body).toMatch(/Overdue customers GHS|Cust overdue GHS/);
        expect(result.body).toMatch(/Overdue suppliers GHS|Sup overdue GHS/);
        expect(result.body).toMatch(/Based on data received by TillFlow|Data received by TillFlow/);
        const hasMethods = result.body.includes('MoMo');
        const hasGp = /Gross profit GHS|GP GHS/.test(result.body);
        const hasThree = result.body.includes('Check shelf') && result.body.includes('Count till') && result.body.includes('Call supplier');
        const hasOne = result.body.includes('Check shelf') && !result.body.includes('Count till');
        const hasCount = result.body.includes('actions need review');
        const abbreviated = result.body.includes('As of 2026-09-23 21:54');
        if (hasMethods && hasGp) seen.methods = true;
        if (!hasMethods && hasGp && hasThree) seen.methodsDroppedGpKept = true;
        if (!hasMethods && !hasGp && hasThree) seen.gpDropped = true;
        if (!hasGp && hasOne && !hasCount) seen.oneAction = true;
        if (hasCount && !abbreviated) seen.actionCount = true;
        if (abbreviated && hasCount) seen.abbreviated = true;
      }
    }

    for (let tzLen = 8; tzLen <= 180; tzLen += 1) {
      for (let pad = -1; pad <= 40; pad += 1) {
        const actions = pad < 0 ? [] : [
          `Check shelf ${'a'.repeat(pad)}`,
          `Count till ${'b'.repeat(pad)}`,
          `Call supplier ${'c'.repeat(pad)}`,
        ];
        const result = formatOwnerDailySummarySms(input({
          ...amounts,
          timeZone: `A${'a'.repeat(tzLen)}`,
          openExpectedCashPence: 200,
          closedVariancePence: -500,
          actions,
        }));
        if (!result.send) continue;
        expect(result.septets).toBeLessThanOrEqual(306);
        const abbreviated = result.body.includes('As of 2026-09-23 21:54');
        const hasOpen = /Open expected cash|Open cash/.test(result.body);
        const hasClosed = /Closed variance|Closed var/.test(result.body);
        const hasCount = result.body.includes('actions need review');
        if (abbreviated && hasOpen && hasClosed && hasCount) seen.abbreviated = true;
        if (abbreviated && !hasOpen && hasClosed) seen.openCashOmitted = true;
        expect(result.body).not.toMatch(/Open expected cash .*Closed|Closed variance .*Open expected/);
      }
    }

    expect(seen).toEqual({
      methods: true,
      methodsDroppedGpKept: true,
      gpDropped: true,
      oneAction: true,
      actionCount: true,
      abbreviated: true,
      openCashOmitted: true,
    });
  });

  it('does not send when the protected core cannot fit', () => {
    const result = formatOwnerDailySummarySms(input({
      timeZone: 'A'.repeat(400),
      actions: [],
      methodSplit: null,
      openExpectedCashPence: null,
      closedVariancePence: null,
      marginState: 'INCOMPLETE_COSTS',
      grossProfitPence: null,
    }));
    expect(result).toEqual({ send: false, reason: 'CORE_TOO_LONG' });
  });

  it('limits priority actions to three', () => {
    const result = formatOwnerDailySummarySms(input({
      actions: ['one', 'two', 'three', 'four'],
    }));
    expect(result.send).toBe(true);
    if (!result.send) return;
    expect(result.body).toContain('one');
    expect(result.body).toContain('three');
    expect(result.body).not.toContain('four');
  });

  it('maps incomplete margin to no GP amount on the send path', () => {
    const result = buildOwnerDailySummarySms(metrics({
      marginState: 'INCOMPLETE_COSTS',
      grossProfitPence: 0,
    }));
    expect(result.send).toBe(true);
    if (!result.send) return;
    expect(result.body).not.toMatch(/Gross profit GHS|GP GHS/);
    expect(result.septets).toBeLessThanOrEqual(306);
  });

  it('enqueue uses the formatter and does not write an outbox row when send is refused', () => {
    expect(SOURCE).toContain('const formatted = buildOwnerDailySummarySms(metrics)');
    expect(SOURCE).toContain('if (!formatted.send)');
    expect(SOURCE).not.toContain('Gross profit ${money(');
    expect(SOURCE).not.toContain("channel: 'WHATSAPP'");
    const enqueue = SOURCE.slice(SOURCE.indexOf('export async function enqueueOwnerDailySummarySms'));
    expect(enqueue).toContain('formatted.body');
    const formatter = SOURCE.slice(SOURCE.indexOf('function renderOwnerSms'), SOURCE.indexOf('function resolveOwnerRecipient'));
    expect(formatter.toLowerCase()).not.toContain('whatsapp');
  });
});
