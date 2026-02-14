import { PrismaClient } from '@prisma/client';

import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  let business = await prisma.business.findFirst();
  if (!business) {
    business = await prisma.business.create({
      data: {
        name: 'Supermarket Demo',
        currency: 'GBP',
        vatEnabled: false,
        mode: 'SIMPLE'
      }
    });
  }

  let store = await prisma.store.findFirst({ where: { businessId: business.id } });
  if (!store) {
    store = await prisma.store.create({
      data: { businessId: business.id, name: 'Main Store', address: 'High Street' }
    });
  }

  const tills = await prisma.till.findMany({ where: { storeId: store.id } });
  if (tills.length === 0) {
    await prisma.till.createMany({
      data: [
        { storeId: store.id, name: 'Till 1' },
        { storeId: store.id, name: 'Till 2' }
      ]
    });
  }

  const ownerPassword = await bcrypt.hash('Pass1234!', 10);
  const cashierPassword = await bcrypt.hash('Pass1234!', 10);

  await prisma.user.upsert({
    where: { email: 'owner@store.com' },
    update: {},
    create: {
      businessId: business.id,
      name: 'Owner',
      email: 'owner@store.com',
      passwordHash: ownerPassword,
      role: 'OWNER'
    }
  });

  await prisma.user.upsert({
    where: { email: 'cashier@store.com' },
    update: {},
    create: {
      businessId: business.id,
      name: 'Cashier',
      email: 'cashier@store.com',
      passwordHash: cashierPassword,
      role: 'CASHIER'
    }
  });

  const unitPiece = await prisma.unit.findFirst({ where: { name: 'piece' } });
  const unitCarton = await prisma.unit.findFirst({ where: { name: 'carton' } });

  const piece =
    unitPiece ??
    (await prisma.unit.create({ data: { name: 'piece', pluralName: 'pieces', symbol: 'pc' } }));
  const carton =
    unitCarton ??
    (await prisma.unit.create({ data: { name: 'carton', pluralName: 'cartons', symbol: 'ctn' } }));

  const product = await prisma.product.upsert({
    where: { barcode: 'sample' },
    update: {},
    create: {
      businessId: business.id,
      sku: 'CARN-001',
      barcode: 'sample',
      name: 'Carnation Milk',
      sellingPriceBasePence: 150,
      defaultCostBasePence: 100,
      vatRateBps: 0,
      reorderPointBase: 24
    }
  });

  const baseUnit = await prisma.productUnit.findFirst({
    where: { productId: product.id, unitId: piece.id }
  });

  if (!baseUnit) {
    await prisma.productUnit.create({
      data: {
        productId: product.id,
        unitId: piece.id,
        isBaseUnit: true,
        conversionToBase: 1
      }
    });
  }

  const cartonUnit = await prisma.productUnit.findFirst({
    where: { productId: product.id, unitId: carton.id }
  });

  if (!cartonUnit) {
    await prisma.productUnit.create({
      data: {
        productId: product.id,
        unitId: carton.id,
        isBaseUnit: false,
        conversionToBase: 12
      }
    });
  }

  await prisma.inventoryBalance.upsert({
    where: { storeId_productId: { storeId: store.id, productId: product.id } },
    update: { qtyOnHandBase: 24, avgCostBasePence: product.defaultCostBasePence },
    create: {
      storeId: store.id,
      productId: product.id,
      qtyOnHandBase: 24,
      avgCostBasePence: product.defaultCostBasePence
    }
  });

  const accounts = [
    { code: '1000', name: 'Cash on Hand', type: 'ASSET' },
    { code: '1010', name: 'Bank', type: 'ASSET' },
    { code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
    { code: '1200', name: 'Inventory', type: 'ASSET' },
    { code: '1300', name: 'VAT Receivable', type: 'ASSET' },
    { code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
    { code: '2100', name: 'VAT Payable', type: 'LIABILITY' },
    { code: '3000', name: 'Retained Earnings', type: 'EQUITY' },
    { code: '4000', name: 'Sales Revenue', type: 'INCOME' },
    { code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
    { code: '6000', name: 'Operating Expenses', type: 'EXPENSE' },
    { code: '6100', name: 'Rent', type: 'EXPENSE' },
    { code: '6200', name: 'Utilities', type: 'EXPENSE' },
    { code: '6300', name: 'Salaries', type: 'EXPENSE' },
    { code: '6400', name: 'Repairs & Maintenance', type: 'EXPENSE' },
    { code: '6500', name: 'Fuel & Transport', type: 'EXPENSE' },
    { code: '6600', name: 'Marketing', type: 'EXPENSE' }
  ];

  for (const account of accounts) {
    await prisma.account.upsert({
      where: { businessId_code: { businessId: business.id, code: account.code } },
      update: { name: account.name, type: account.type as any },
      create: { businessId: business.id, ...account }
    });
  }

  await prisma.customer.upsert({
    where: { id: 'walk-in' },
    update: {},
    create: {
      id: 'walk-in',
      businessId: business.id,
      name: 'Walk-in Customer'
    }
  });

  await prisma.supplier.upsert({
    where: { id: 'default-supplier' },
    update: {},
    create: {
      id: 'default-supplier',
      businessId: business.id,
      name: 'Default Supplier'
    }
  });
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
