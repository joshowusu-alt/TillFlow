/** Fictional data only. Refuses production before constructing a Prisma client. */
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');
const bcrypt = require('bcryptjs');
const fs = require('node:fs');
const path = require('node:path');
async function createPilotFixture(prisma, run = `pilot-${Date.now()}`) {
    const password = 'Fictional-Pilot-2026!';
    const hash = await bcrypt.hash(password, 10);
    const now = new Date(), end = new Date(Date.now() + 30 * 86400000);
    const business = await prisma.business.create({ data: {
      name: `FICTIONAL — Mallam Gbawe Mini-Mart ${run}`, currency: 'GHS', timezone: 'Africa/Accra',
      plan: 'PRO', selectedPlan: 'PRO', mode: 'ADVANCED', storeMode: 'MULTI_STORE', planStatus: 'ACTIVE',
      subscriptionStatus: 'ACTIVE', firstPaymentAt: now, lastPaymentAt: now, currentPeriodStartedAt: now,
      currentPeriodEndsAt: end, nextBillingDate: end, nextPaymentDueAt: end, billingAmount: 69900,
      vatEnabled: false, momoEnabled: true, requireOpenTillForSales: true,
    } });
    const users = {};
    for (const [key, role] of [['owner','OWNER'], ['manager','MANAGER'], ['cashier1','CASHIER'], ['cashier2','CASHIER']]) {
      users[key] = await prisma.user.create({ data: { businessId: business.id, name: `Fictional ${key}`, email: `${key}-${run}@example.invalid`, passwordHash: hash, role } });
    }
    const stores = [];
    for (const name of ['Mallam','Gbawe']) {
      const store = await prisma.store.create({ data: { businessId: business.id, name: `Fictional ${name}` } });
      const till = await prisma.till.create({ data: { storeId: store.id, name: `${name} Counter`, active: true } });
      const cashier = stores.length === 0 ? users.cashier1 : users.cashier2;
      const shift = await prisma.shift.create({ data: { tillId: till.id, userId: cashier.id, status: 'OPEN', openKey: till.id, openingCashPence: 20000, expectedCashPence: 20000 } });
      await prisma.cashDrawerEntry.create({ data: { businessId: business.id, storeId: store.id, tillId: till.id, shiftId: shift.id, createdByUserId: cashier.id, cashierUserId: cashier.id, entryType: 'OPEN_FLOAT', amountPence: 20000, beforeExpectedCashPence: 0, afterExpectedCashPence: 20000 } });
      stores.push({ ...store, tillId: till.id, shiftId: shift.id });
    }
    const category = await prisma.category.create({ data: { businessId: business.id, name: 'Fictional groceries' } });
    const unit = await prisma.unit.create({ data: { name: `Pilot piece ${run}`, pluralName: 'pieces', symbol: 'pc' } });
    const products = [];
    for (const [index, name] of ['Fictional Rice 5kg','Fictional Soap','Fictional Milk'].entries()) {
      const product = await prisma.product.create({ data: { businessId: business.id, categoryId: category.id, name, barcode: `PILOT${run}${index}`, sellingPriceBasePence: 5000, defaultCostBasePence: 1000,
        productUnits: { create: { unitId: unit.id, isBaseUnit: true, conversionToBase: 1 } } } });
      for (const store of stores) {
        await prisma.inventoryBalance.create({ data: { storeId: store.id, productId: product.id, qtyOnHandBase: 100, avgCostBasePence: 1000, knownValuePence: 100000, unvaluedQtyBase: 0 } });
        await prisma.stockMovement.create({ data: { storeId: store.id, productId: product.id, qtyBase: 100, unitCostBasePence: 1000, valuePence: 100000, costBasis: 'INVENTORY_VALUE_V1', type: 'OPENING', userId: users.owner.id } });
      }
      products.push(product);
    }
    const customer = await prisma.customer.create({ data: { businessId: business.id, name: 'Fictional Ama Buyer', creditLimitPence: 100000 } });
    const supplier = await prisma.supplier.create({ data: { businessId: business.id, name: 'Fictional Accra Wholesale' } });
    const accounts = {};
    for (const [code, name, type] of [['1000','Cash','ASSET'],['1010','Bank','ASSET'],['1100','Receivables','ASSET'],['1200','Inventory','ASSET'],['1300','VAT receivable','ASSET'],['2000','Payables','LIABILITY'],['2100','VAT payable','LIABILITY'],['2200','Refunds payable','LIABILITY'],['3000','Opening equity','EQUITY'],['3200','Opening stock equity','EQUITY'],['4000','Sales','INCOME'],['4100','Inventory gain','INCOME'],['5000','COGS','EXPENSE'],['5100','Inventory loss','EXPENSE'],['6000','Expenses','EXPENSE']]) {
      accounts[code] = await prisma.account.create({ data: { businessId: business.id, code, name, type } });
    }
    await prisma.journalEntry.create({ data: { businessId: business.id, description: 'Fictional opening balances', lines: { create: [
      { accountId: accounts['1000'].id, debitPence: 40000, creditPence: 0 },
      { accountId: accounts['1200'].id, debitPence: 600000, creditPence: 0 },
      { accountId: accounts['3000'].id, debitPence: 0, creditPence: 640000 },
    ] } } });
    const manifest = { run, businessId: business.id, password, users, stores, products, customer, supplier, unitId: unit.id };
    return manifest;
}
async function main() {
  if (!process.env.TILLFLOW_TEST_DATABASE_URL) throw new Error('Explicit isolated test URL required');
  const { prisma } = await openGuardedPrismaClient({ url: process.env.TILLFLOW_TEST_DATABASE_URL });
  try {
    const manifest = await createPilotFixture(prisma);
    const output = path.resolve(process.env.PILOT_FIXTURE_PATH || 'tmp/pilot-acceptance.json');
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, JSON.stringify(manifest), { mode: 0o600 });
    console.log(JSON.stringify({ fixtureCreated: true, fictional: true, stores: 2, users: 4, products: 3, manifest: output }));
  } finally { await prisma.$disconnect(); }
}
module.exports = { createPilotFixture };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
