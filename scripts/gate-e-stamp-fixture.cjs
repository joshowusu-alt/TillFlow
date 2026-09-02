/**
 * Gate E laboratory fixture. Isolated SQLite only.
 * Stamps established Home (onboardingCompletedAt) and one OPEN shift so
 * checkout-ready can be measured without a runtime sale/shift write.
 *
 * Never run against Production. Never creates sales, stock, payments or imports.
 */
const path = require('node:path');
const fs = require('node:fs');

const worktree = process.env.GATE_E_WORKTREE || process.cwd();
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl || !databaseUrl.startsWith('file:')) {
  throw new Error('gate-e-stamp-fixture requires a local file: DATABASE_URL');
}
if (/tillflow\.app/i.test(databaseUrl) || /postgres/i.test(databaseUrl)) {
  throw new Error('BLOCKED: fixture stamp refused non-SQLite or Production database');
}

const clientPath = path.join(worktree, 'node_modules', '@prisma', 'client');
if (!fs.existsSync(clientPath)) {
  throw new Error(`Prisma client missing in ${worktree}`);
}

const { PrismaClient } = require(clientPath);

async function main() {
  const prisma = new PrismaClient();
  try {
    const businesses = await prisma.business.updateMany({
      data: { onboardingCompletedAt: new Date() },
    });
    const user = await prisma.user.findFirst({ where: { email: 'owner@store.com' } });
    if (!user) throw new Error('Seed owner@store.com missing');
    const store = await prisma.store.findFirst({ where: { businessId: user.businessId } });
    if (!store) throw new Error('Seed store missing');
    const till = await prisma.till.findFirst({
      where: { storeId: store.id },
      orderBy: { name: 'asc' },
    });
    if (!till) throw new Error('Seed till missing');

    const existing = await prisma.shift.findFirst({
      where: { tillId: till.id, status: 'OPEN' },
    });
    let shift = existing;
    if (!existing) {
      shift = await prisma.shift.create({
        data: {
          tillId: till.id,
          userId: user.id,
          openingCashPence: 0,
          expectedCashPence: 0,
          status: 'OPEN',
          openKey: till.id,
        },
      });
    }

    const snapshot = {
      worktree,
      databaseUrl,
      businessesStamped: businesses.count,
      ownerId: user.id,
      tillId: till.id,
      shiftId: shift.id,
      salesInvoices: await prisma.salesInvoice.count(),
      products: await prisma.product.count(),
      shiftsOpen: await prisma.shift.count({ where: { status: 'OPEN' } }),
      purchaseInvoices: await prisma.purchaseInvoice.count(),
      stockMovements: await prisma.stockMovement.count(),
    };
    process.stdout.write(`${JSON.stringify(snapshot, null, 2)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
