/** Synthetic-only verification, with all datasource variables explicitly pinned. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { createPartialPurchaseReturn } from '../lib/services/partial-purchase-returns';
import { payableDocumentBalance } from '../lib/reports/payables-balance';
import { postJournalEntry, ACCOUNT_CODES } from '../lib/accounting';

async function main() {
  const url = process.env.POSTGRES_PRISMA_URL ?? '';
  const expectedHost = process.env.PARTIAL_RETURN_EXPECTED_HOST;
  if (url !== 'file:./partial-return-unit.db' && (!expectedHost || !expectedHost.startsWith('ep-crimson-lake-za8q4axv') || new URL(url).hostname !== expectedHost)) throw new Error('Explicit isolated target required');
  if (process.env.VERCEL_ENV !== 'preview') throw new Error('Preview environment required');
  const run = randomUUID();
  const b = await prisma.business.create({ data: { name: `Synthetic partial return ${run}`, isDemo: true } });
  const store = await prisma.store.create({ data: { businessId: b.id, name: 'Synthetic branch' } });
  const user = await prisma.user.create({ data: { businessId: b.id, name: 'Synthetic owner', email: `partial-${run}@example.invalid`, passwordHash: 'NO-LOGIN', role: 'OWNER' } });
  const supplier = await prisma.supplier.create({ data: { businessId: b.id, name: 'Synthetic supplier' } });
  const unit = await prisma.unit.create({ data: { name: `Synthetic unit ${run}`, pluralName: 'units' } });
  const scenarios: object[] = [];
  for (const paidPence of [0, 5000, 10000]) {
    const product = await prisma.product.create({ data: { businessId: b.id, name: `Synthetic book ${paidPence}`, sellingPriceBasePence: 1500, defaultCostBasePence: 1000 } });
    const invoice = await prisma.purchaseInvoice.create({ data: { businessId: b.id, storeId: store.id, supplierId: supplier.id, paymentStatus: paidPence === 10000 ? 'PAID' : paidPence > 0 ? 'PART_PAID' : 'UNPAID', subtotalPence: 10000, vatPence: 0, totalPence: 10000, lines: { create: { productId: product.id, unitId: unit.id, qtyInUnit: 10, conversionToBase: 1, qtyBase: 10, unitCostPence: 1000, lineSubtotalPence: 10000, lineVatPence: 0, lineTotalPence: 10000 } }, ...(paidPence ? { payments: { create: { amountPence: paidPence, method: 'TRANSFER' } } } : {}) }, include: { lines: true } });
    await prisma.inventoryBalance.create({ data: { storeId: store.id, productId: product.id, qtyOnHandBase: 10, avgCostBasePence: 1000, knownValuePence: 10000, unvaluedQtyBase: 0 } });
    await postJournalEntry({ businessId: b.id, referenceType: 'PURCHASE_INVOICE', referenceId: invoice.id, description: 'Synthetic receipt', lines: [{ accountCode: ACCOUNT_CODES.inventory, debitPence: 10000 }, { accountCode: ACCOUNT_CODES.ap, creditPence: 10000 }] });
    if (paidPence) await postJournalEntry({ businessId: b.id, referenceType: 'SUPPLIER_PAYMENT', referenceId: invoice.id, description: 'Synthetic prior payment', lines: [{ accountCode: ACCOUNT_CODES.ap, debitPence: paidPence }, { accountCode: ACCOUNT_CODES.bank, creditPence: paidPence }] });
    const input = { businessId: b.id, storeId: store.id, invoiceId: invoice.id, userId: user.id, requestKey: randomUUID(), reason: 'Synthetic partial return verification', kind: 'RETURN' as const, lines: [{ lineId: invoice.lines[0].id, qtyBase: 4 }] };
    const credit = await createPartialPurchaseReturn(input); assert.equal(credit.creditPence, 4000);
    const replay = await createPartialPurchaseReturn(input); assert.equal(replay.id, credit.id);
    const after = await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: invoice.id }, include: { payments: true, lines: true, returnCredits: true } });
    assert.equal(after.totalPence, 10000); assert.equal(after.lines[0].qtyBase, 10); assert.equal(after.returnCredits.length, 1);
    assert.equal(after.returnCreditPence, 4000); assert.equal(payableDocumentBalance(after).balancePence, 6000 - paidPence);
    assert.equal((await prisma.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId: store.id, productId: product.id } } })).qtyOnHandBase, 6);
    await assert.rejects(createPartialPurchaseReturn({ ...input, requestKey: randomUUID(), lines: [{ lineId: invoice.lines[0].id, qtyBase: 7 }] }));
    await assert.rejects(createPartialPurchaseReturn({ ...input, storeId: 'foreign-branch', requestKey: randomUUID() }));
    await assert.rejects(createPartialPurchaseReturn({ ...input, reason: 'Conflicting replay' }));
    const journal = await prisma.journalEntry.findFirstOrThrow({ where: { referenceType: 'PURCHASE_RETURN_CREDIT', referenceId: credit.id }, include: { lines: true } });
    assert.equal(journal.lines.reduce((sum,line) => sum + line.debitPence - line.creditPence, 0), 0);
    const repeat = await createPartialPurchaseReturn({ ...input, requestKey: randomUUID(), lines: [{ lineId: invoice.lines[0].id, qtyBase: 2 }] }); assert.equal(repeat.creditPence, 2000);
    const concurrentInput = { ...input, requestKey: randomUUID(), lines: [{ lineId: invoice.lines[0].id, qtyBase: 1 }] };
    // SQLite serialises locally; Postgres also exercises separate concurrent transactions.
    if (!url.startsWith('file:')) {
      const concurrent = await Promise.all([createPartialPurchaseReturn(concurrentInput), createPartialPurchaseReturn(concurrentInput)]);
      assert.equal(concurrent[0].id, concurrent[1].id);
      assert.equal(await prisma.stockMovement.count({ where: { referenceType: 'PURCHASE_RETURN_CREDIT', referenceId: concurrent[0].id } }), 1);
    }
    scenarios.push({ paidPence, originalUnchanged: true, stockAfterFirstReturn: 6, balanceAfterFirstReturn: 6000 - paidPence, replaySafe: true, repeatReturn: true, journalBalanced: true, excessAndForeignBranchBlocked: true });
  }
  console.log(JSON.stringify({ syntheticBusinessId: b.id, scenarios }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
