/** Synthetic end-to-end service verification. Never targets production or shared preview. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma';
import { createPartialPurchaseReturn } from '../lib/services/partial-purchase-returns';
import { settleSupplierCredit } from '../lib/services/supplier-credit-settlements';
import { payableDocumentBalance } from '../lib/reports/payables-balance';
import { postJournalEntry, ACCOUNT_CODES } from '../lib/accounting';
import { readCashflowStatement } from '../lib/reports/cashflow-statement';
import { getSupplierAccountSummary } from '../lib/services/supplier-account-summary';
import { expectedCashPenceFromEntries } from '../lib/reports/expected-cash';
import { getBalanceSheet, getIncomeStatement } from '../lib/reports/financials';
import { recordSupplierPayment } from '../lib/services/payments';
import { buildVatReportCsv } from '../lib/exports/csv-writers';

async function main() {
  const url = process.env.POSTGRES_PRISMA_URL ?? '';
  const host = process.env.PARTIAL_RETURN_EXPECTED_HOST;
  if (url !== 'file:./partial-return-unit.db' && (!host || !host.startsWith('ep-crimson-lake-za8q4axv') || new URL(url).hostname !== host)) throw new Error('Explicit isolated target required');
  if (process.env.VERCEL_ENV !== 'preview') throw new Error('Preview environment required');
  const run = randomUUID();
  const business = await prisma.business.create({ data: { name: `Settlement QA ${run}`, isDemo: true, vatEnabled: true } });
  const store = await prisma.store.create({ data: { businessId: business.id, name: 'QA branch' } });
  const user = await prisma.user.create({ data: { businessId: business.id, name: 'QA owner', email: `${run}@example.invalid`, passwordHash: 'NO-LOGIN', role: 'OWNER' } });
  const supplier = await prisma.supplier.create({ data: { businessId: business.id, name: 'QA supplier' } });
  const unit = await prisma.unit.create({ data: { name: run, pluralName: 'units' } });
  const product = await prisma.product.create({ data: { businessId: business.id, name: 'VAT test book', sellingPriceBasePence: 1500, defaultCostBasePence: 1000 } });
  const source = await prisma.purchaseInvoice.create({ data: { businessId: business.id, storeId: store.id, supplierId: supplier.id, paymentStatus: 'PAID', subtotalPence: 10000, vatPence: 2000, totalPence: 12000, payments: { create: { businessId: business.id, amountPence: 12000, method: 'TRANSFER' } }, lines: { create: { productId: product.id, unitId: unit.id, qtyInUnit: 10, conversionToBase: 1, qtyBase: 10, unitCostPence: 1000, lineSubtotalPence: 10000, lineVatPence: 2000, lineTotalPence: 12000 } } }, include: { lines: true, payments: true } });
  const target = await prisma.purchaseInvoice.create({ data: { businessId: business.id, storeId: store.id, supplierId: supplier.id, paymentStatus: 'UNPAID', subtotalPence: 5000, vatPence: 0, totalPence: 5000 } });
  await prisma.inventoryBalance.create({ data: { storeId: store.id, productId: product.id, qtyOnHandBase: 10, avgCostBasePence: 1000, knownValuePence: 10000, unvaluedQtyBase: 0 } });
  const targetProduct = await prisma.product.create({ data: { businessId: business.id, name: 'QA second receipt', sellingPriceBasePence: 1500, defaultCostBasePence: 1000 } });
  await prisma.purchaseInvoiceLine.create({ data: { purchaseInvoiceId: target.id, productId: targetProduct.id, unitId: unit.id, qtyInUnit: 5, conversionToBase: 1, qtyBase: 5, unitCostPence: 1000, lineSubtotalPence: 5000, lineVatPence: 0, lineTotalPence: 5000 } });
  await prisma.inventoryBalance.create({ data: { storeId: store.id, productId: targetProduct.id, qtyOnHandBase: 5, avgCostBasePence: 1000, knownValuePence: 5000, unvaluedQtyBase: 0 } });
  await prisma.stockMovement.createMany({ data: [{ storeId: store.id, productId: product.id, qtyBase: 10, valuePence: 10000, costBasis: 'INVENTORY_VALUE_V1', type: 'PURCHASE', referenceType: 'PURCHASE_INVOICE', referenceId: source.id }, { storeId: store.id, productId: targetProduct.id, qtyBase: 5, valuePence: 5000, costBasis: 'INVENTORY_VALUE_V1', type: 'PURCHASE', referenceType: 'PURCHASE_INVOICE', referenceId: target.id }] });
  await postJournalEntry({ businessId: business.id, referenceType: 'PURCHASE_INVOICE', referenceId: source.id, description: 'QA source receipt', lines: [{ accountCode: ACCOUNT_CODES.inventory, debitPence: 10000 }, { accountCode: ACCOUNT_CODES.vatReceivable, debitPence: 2000 }, { accountCode: ACCOUNT_CODES.ap, creditPence: 12000 }] });
  await postJournalEntry({ businessId: business.id, referenceType: 'SUPPLIER_PAYMENT', referenceId: source.id, description: 'QA source payment', lines: [{ accountCode: ACCOUNT_CODES.ap, debitPence: 12000 }, { accountCode: ACCOUNT_CODES.bank, creditPence: 12000 }] });
  // Target represented as a second receipt; use a separate product to keep the returned product's stock assertion exact.
  await postJournalEntry({ businessId: business.id, referenceType: 'PURCHASE_INVOICE', referenceId: target.id, description: 'QA target receipt', lines: [{ accountCode: ACCOUNT_CODES.inventory, debitPence: 5000 }, { accountCode: ACCOUNT_CODES.ap, creditPence: 5000 }] });
  const base = { businessId: business.id, storeId: store.id, userId: user.id, sourceInvoiceId: source.id };
  // Source invoices belong to an earlier reporting period than the credit.
  await prisma.purchaseInvoice.updateMany({ where: { businessId: business.id }, data: { createdAt: new Date('2020-06-01Z') } });
  const invoicePeriod = { from: new Date('2020-01-01Z'), to: new Date('2021-01-01Z') };
  const creditPeriod = { from: invoicePeriod.to, to: new Date('2100-01-01Z') };
  const invoiceVatBefore = await buildVatReportCsv(business.id, invoicePeriod);
  assert.ok(invoiceVatBefore.includes('Input Tax (Purchases),2,150.00,20.00'));
  await createPartialPurchaseReturn({ businessId: business.id, storeId: store.id, userId: user.id, invoiceId: source.id, requestKey: randomUUID(), reason: 'QA VAT-bearing partial return', kind: 'RETURN', lines: [{ lineId: source.lines[0].id, qtyBase: 4 }] });
  const reload = () => prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: source.id }, include: { payments: true, lines: true } });
  assert.equal(payableDocumentBalance(await reload()).balancePence, -4800);
  const creditVatBeforeSettlement = await buildVatReportCsv(business.id, creditPeriod);
  assert.ok(creditVatBeforeSettlement.includes('Input Tax Reversals (Purchase Credits),1,-40.00,-8.00'));
  assert.ok(creditVatBeforeSettlement.includes('Net VAT Payable,,,"8.00"'));
  assert.equal(await buildVatReportCsv(business.id, invoicePeriod), invoiceVatBefore);
  const inventoryBefore = await prisma.inventoryBalance.findUniqueOrThrow({ where: { storeId_productId: { storeId: store.id, productId: product.id } } });
  const offsetInput = { ...base, kind: 'OFFSET' as const, targetInvoiceId: target.id, amountPence: 1000, reference: 'QA supplier agreed offset', requestKey: randomUUID() };
  const offset = await settleSupplierCredit(offsetInput);
  assert.equal((await settleSupplierCredit(offsetInput)).id, offset.id);
  assert.equal(payableDocumentBalance(await reload()).balancePence, -3800);
  assert.equal(payableDocumentBalance(await prisma.purchaseInvoice.findUniqueOrThrow({ where: { id: target.id }, include: { payments: true } })).balancePence, 4000);
  assert.equal(await prisma.journalEntry.count({ where: { businessId: business.id, referenceId: offset.id } }), 0);
  assert.equal(await buildVatReportCsv(business.id, creditPeriod), creditVatBeforeSettlement);
  const bank = await settleSupplierCredit({ ...base, kind: 'REFUND_BANK', amountPence: 2000, reference: 'QA bank receipt', requestKey: randomUUID() });
  assert.equal(await buildVatReportCsv(business.id, creditPeriod), creditVatBeforeSettlement);
  await assert.rejects(settleSupplierCredit({ ...base, kind: 'REFUND_BANK', amountPence: 2000, reference: 'QA over settlement', requestKey: randomUUID() }));
  await assert.rejects(settleSupplierCredit({ ...base, kind: 'REFUND_CASH', amountPence: 100, reference: 'QA no till', requestKey: randomUUID() }));
  await assert.rejects(settleSupplierCredit({ ...offsetInput, amountPence: 1 }));
  await assert.rejects(settleSupplierCredit({ ...base, storeId: 'foreign', kind: 'REFUND_BANK', amountPence: 1, reference: 'foreign', requestKey: randomUUID() }));
  const foreignSupplier = await prisma.supplier.create({ data: { businessId: business.id, name: 'Other supplier' } });
  const foreignInvoice = await prisma.purchaseInvoice.create({ data: { businessId: business.id, storeId: store.id, supplierId: foreignSupplier.id, paymentStatus: 'UNPAID', subtotalPence: 5000, vatPence: 0, totalPence: 5000 } });
  await assert.rejects(settleSupplierCredit({ ...offsetInput, targetInvoiceId: foreignInvoice.id, requestKey: randomUUID() }));
  // Remove the unused foreign fixture from financial assertions by treating it as a closed zero-impact document.
  await prisma.purchaseInvoice.update({ where: { id: foreignInvoice.id }, data: { paymentStatus: 'VOID' } });
  await prisma.purchaseInvoice.update({ where: { id: foreignInvoice.id }, data: { createdAt: new Date('2020-06-01Z') } });
  const till = await prisma.till.create({ data: { storeId: store.id, name: 'QA receiving till' } });
  const shift = await prisma.shift.create({ data: { tillId: till.id, userId: user.id, status: 'OPEN' } });
  const cashInput = { ...base, kind: 'REFUND_CASH' as const, tillId: till.id, amountPence: 1800, reference: 'QA cash received', requestKey: randomUUID() };
  const cash = await settleSupplierCredit(cashInput);
  assert.equal((await settleSupplierCredit(cashInput)).id, cash.id);
  assert.equal(await buildVatReportCsv(business.id, creditPeriod), creditVatBeforeSettlement);
  // The half-open posting window includes a credit at the start and excludes it at the end.
  const posted = await prisma.journalEntry.findFirstOrThrow({ where: { businessId: business.id, referenceType: 'PURCHASE_RETURN_CREDIT' } });
  assert.ok((await buildVatReportCsv(business.id, { from: posted.entryDate, to: creditPeriod.to })).includes('Purchase Credits),1,-40.00,-8.00'));
  assert.ok(!(await buildVatReportCsv(business.id, { from: creditPeriod.from, to: posted.entryDate })).includes('Purchase Credits)'));
  // Another business cannot leak into the report.
  assert.ok(!(await buildVatReportCsv(`absent-${run}`, creditPeriod)).includes('Purchase Credits)'));
  const laterSettlementPeriod = { from: new Date('2090-01-01Z'), to: new Date('2091-01-01Z') };
  await prisma.supplierCreditSettlement.updateMany({ where: { businessId: business.id }, data: { createdAt: laterSettlementPeriod.from } });
  await prisma.journalEntry.updateMany({ where: { businessId: business.id, referenceType: 'SUPPLIER_CREDIT_REFUND' }, data: { entryDate: laterSettlementPeriod.from } });
  const laterVat = await buildVatReportCsv(business.id, laterSettlementPeriod);
  assert.ok(laterVat.includes('Net VAT Payable,,,"0.00"'));
  assert.ok(!laterVat.includes('Purchase Credits)'));
  assert.equal(await buildVatReportCsv(business.id, { from: creditPeriod.from, to: laterSettlementPeriod.from }), creditVatBeforeSettlement.replace('2100-01-01', '2090-01-01'));
  console.log(JSON.stringify({ check: 'VAT_CREDIT_EXPORT_VERIFIED', checks: ['earlier invoice period unchanged', 'posted credit period reversal', 'offset VAT unchanged', 'bank refund VAT unchanged', 'cash refund VAT unchanged', 'later settlement period zero VAT', 'half-open posting boundaries', 'business isolation'] }));
  assert.equal(payableDocumentBalance(await reload()).balancePence, 0);
  await assert.rejects(settleSupplierCredit({ ...cashInput, requestKey: randomUUID(), amountPence: 1 }));
  assert.equal((await prisma.shift.findUniqueOrThrow({ where: { id: shift.id } })).expectedCashPence, 1800);
  const drawer = await prisma.cashDrawerEntry.findMany({ where: { shiftId: shift.id } });
  assert.equal(drawer.length, 1); assert.equal(expectedCashPenceFromEntries(drawer), 1800);
  const after = await reload(); assert.deepEqual(after.payments, source.payments); assert.equal(after.lines[0].qtyBase, 10); assert.equal(after.totalPence, 12000);
  const inventoryAfter = await prisma.inventoryBalance.findUniqueOrThrow({ where: { id: inventoryBefore.id } });
  assert.deepEqual(inventoryAfter, inventoryBefore);
  assert.equal(inventoryAfter.qtyOnHandBase, 6); assert.equal(inventoryAfter.knownValuePence, 6000);
  const entries = await prisma.journalEntry.findMany({ where: { businessId: business.id }, include: { lines: { include: { account: true } } } });
  const balances = new Map<string, number>();
  for (const entry of entries) { assert.equal(entry.lines.reduce((sum,l) => sum+l.debitPence-l.creditPence,0),0); for (const line of entry.lines) balances.set(line.account.code, (balances.get(line.account.code) ?? 0)+line.debitPence-line.creditPence); }
  assert.equal(balances.get('1300'), 1200); assert.equal(balances.get('2000'), -4000); assert.equal(balances.get('1010'), -10000); assert.equal(balances.get('1000'), 1800);
  const stockValue = await prisma.inventoryBalance.aggregate({ where: { storeId: store.id }, _sum: { knownValuePence: true } });
  assert.equal(stockValue._sum.knownValuePence, balances.get('1200'));
  const account = await getSupplierAccountSummary(business.id, supplier.id); assert.equal(account.account.outstandingPence, 4000);
  const cashflow = await readCashflowStatement(prisma, business.id, new Date('2020-01-01'), new Date('2100-01-01'));
  assert.equal(cashflow.operatingDifferencePence, 0); assert.equal(cashflow.movementDifferencePence, 0); assert.equal(cashflow.netCashFromOps, -8200); assert.equal(cashflow.netProfit, 0);
  const sheet = await getBalanceSheet(business.id, new Date('2100-01-01'));
  assert.equal(sheet.reconciliation.equationDifferencePence, 0);
  assert.equal(sheet.reconciliation.profitDifferencePence, 0);
  assert.equal(sheet.liabilities.find(row => row.accountCode === '2000')?.balancePence, 4000);
  const income = await getIncomeStatement(business.id, new Date('2020-01-01'), new Date('2100-01-01'));
  assert.equal(income.netProfit, 0);
  assert.equal(await prisma.supplierCreditSettlement.count({ where: { businessId: business.id } }), 3);
  assert.equal(await prisma.journalEntry.count({ where: { referenceType: 'SUPPLIER_CREDIT_REFUND', referenceId: { in: [bank.id, cash.id] } } }), 2);
  // Independent requests competing for the same final credit must never both consume it.
  await createPartialPurchaseReturn({ businessId: business.id, storeId: store.id, userId: user.id, invoiceId: source.id, requestKey: randomUUID(), reason: 'QA concurrent final credit', kind: 'SHORT_DELIVERY_CREDIT', lines: [{ lineId: source.lines[0].id, qtyBase: 1 }] });
  if (!url.startsWith('file:')) {
    const attempts = await Promise.allSettled([0,1].map(() => settleSupplierCredit({ ...base, kind: 'REFUND_BANK', amountPence: 1200, reference: 'QA competing refund', requestKey: randomUUID() })));
    assert.equal(attempts.filter(result => result.status === 'fulfilled').length, 1);
    assert.equal(payableDocumentBalance(await reload()).balancePence, 0);
  }
  const paymentOptions = { recordedByUserId: user.id, actorRole: 'OWNER', actorName: user.name, idempotencyKey: randomUUID() };
  await assert.rejects(recordSupplierPayment(business.id, target.id, [{ method: 'TRANSFER', amountPence: 4001 }], paymentOptions));
  const paidTarget = await recordSupplierPayment(business.id, target.id, [{ method: 'TRANSFER', amountPence: 4000 }], { ...paymentOptions, idempotencyKey: randomUUID() });
  assert.equal(paidTarget.invoice?.paymentStatus, 'PAID');
  assert.equal(payableDocumentBalance(paidTarget.invoice!).balancePence, 0);
  console.log(JSON.stringify({ check: 'SUPPLIER_SETTLEMENT_VERIFIED', businessId: business.id, checks: ['VAT credit', 'stock unchanged on settlement', 'supplier subledger = AP', 'bank refund', 'cash refund and drawer', 'offset no money', 'later payment respects offset', 'original payments immutable', 'duplicate replay', 'over-settlement blocked', 'foreign branch and supplier blocked', 'cashflow direct = indirect', 'balance sheet equation', 'income statement unchanged', ...(url.startsWith('file:') ? [] : ['concurrent competing refund'])] }));
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
