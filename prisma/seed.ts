import { PrismaClient } from '@prisma/client';

import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

/* ------------------------------------------------------------------ */
/*  Helper: idempotent unit lookup / create                           */
/* ------------------------------------------------------------------ */
async function ensureUnit(name: string, pluralName: string, symbol: string) {
  const existing = await prisma.unit.findFirst({ where: { name } });
  if (existing) return existing;
  return prisma.unit.create({ data: { name, pluralName, symbol } });
}

/* ------------------------------------------------------------------ */
/*  Helper: idempotent product + units + inventory                    */
/* ------------------------------------------------------------------ */
interface ProductSeed {
  sku: string;
  barcode: string;
  name: string;
  sellingPriceBasePence: number;
  defaultCostBasePence: number;
  reorderPointBase: number;
  vatRateBps?: number;
  promoBuyQty?: number;
  promoGetQty?: number;
  categoryId?: string;
  units: { unitId: string; isBaseUnit: boolean; conversionToBase: number }[];
  stockQty: number;
}

async function seedProduct(businessId: string, storeId: string, p: ProductSeed) {
  // Try to find existing product by barcode or by name
  let product = await prisma.product.findFirst({
    where: { OR: [{ barcode: p.barcode }, { businessId, name: p.name }] },
  });

  if (product) {
    // Update categoryId on existing product
    product = await prisma.product.update({
      where: { id: product.id },
      data: { categoryId: p.categoryId ?? null },
    });
  } else {
    product = await prisma.product.create({
      data: {
        businessId,
        sku: p.sku,
        barcode: p.barcode,
        name: p.name,
        sellingPriceBasePence: p.sellingPriceBasePence,
        defaultCostBasePence: p.defaultCostBasePence,
        vatRateBps: p.vatRateBps ?? 0,
        reorderPointBase: p.reorderPointBase,
        promoBuyQty: p.promoBuyQty ?? 0,
        promoGetQty: p.promoGetQty ?? 0,
        categoryId: p.categoryId ?? null,
      },
    });
  }

  for (const u of p.units) {
    const existing = await prisma.productUnit.findFirst({
      where: { productId: product.id, unitId: u.unitId },
    });
    if (!existing) {
      await prisma.productUnit.create({
        data: { productId: product.id, unitId: u.unitId, isBaseUnit: u.isBaseUnit, conversionToBase: u.conversionToBase },
      });
    }
  }

  await prisma.inventoryBalance.upsert({
    where: { storeId_productId: { storeId, productId: product.id } },
    update: { qtyOnHandBase: p.stockQty, avgCostBasePence: p.defaultCostBasePence },
    create: { storeId, productId: product.id, qtyOnHandBase: p.stockQty, avgCostBasePence: p.defaultCostBasePence },
  });

  return product;
}

/* ------------------------------------------------------------------ */
/*  Main seed                                                         */
/* ------------------------------------------------------------------ */
async function main() {
  /* ---------- Business ---------- */
  let business = await prisma.business.findFirst();
  if (!business) {
    business = await prisma.business.create({
      data: { name: 'Supermarket Demo', currency: 'GBP', vatEnabled: false, mode: 'SIMPLE', openingCapitalPence: 2000000 },
    });
  }

  /* ---------- Store & Tills ---------- */
  let store = await prisma.store.findFirst({ where: { businessId: business.id } });
  if (!store) {
    store = await prisma.store.create({
      data: { businessId: business.id, name: 'Main Store', address: 'High Street' },
    });
  }

  const tills = await prisma.till.findMany({ where: { storeId: store.id } });
  if (tills.length === 0) {
    await prisma.till.createMany({
      data: [
        { storeId: store.id, name: 'Till 1' },
        { storeId: store.id, name: 'Till 2' },
      ],
    });
  }

  /* ---------- Users ---------- */
  const ownerPassword = await bcrypt.hash('Pass1234!', 10);
  const cashierPassword = await bcrypt.hash('Pass1234!', 10);
  const ownerPinHash = await bcrypt.hash('1234', 10);

  await prisma.user.upsert({
    where: { email: 'owner@store.com' },
    update: { approvalPinHash: ownerPinHash, passwordHash: ownerPassword },
    create: {
      businessId: business.id,
      name: 'Owner',
      email: 'owner@store.com',
      passwordHash: ownerPassword,
      approvalPinHash: ownerPinHash,
      role: 'OWNER'
    },
  });

  await prisma.user.upsert({
    where: { email: 'cashier@store.com' },
    update: {},
    create: { businessId: business.id, name: 'Cashier', email: 'cashier@store.com', passwordHash: cashierPassword, role: 'CASHIER' },
  });

  /* ---------- Units ---------- */
  const piece   = await ensureUnit('piece', 'pieces', 'pc');
  const carton  = await ensureUnit('carton', 'cartons', 'ctn');
  const bottle  = await ensureUnit('bottle', 'bottles', 'btl');
  const pack    = await ensureUnit('pack', 'packs', 'pk');
  const bag     = await ensureUnit('bag', 'bags', 'bag');
  const box     = await ensureUnit('box', 'boxes', 'bx');
  const sachet  = await ensureUnit('sachet', 'sachets', 'sct');
  const tin     = await ensureUnit('tin', 'tins', 'tin');
  const crate   = await ensureUnit('crate', 'crates', 'crt');

  /* ---------- Categories ---------- */
  const categoryDefs = [
    { name: 'Beverages',    colour: '#2563EB', sortOrder: 1 },
    { name: 'Dairy',        colour: '#7C3AED', sortOrder: 2 },
    { name: 'Canned Goods', colour: '#DC2626', sortOrder: 3 },
    { name: 'Staples',      colour: '#D97706', sortOrder: 4 },
    { name: 'Snacks',       colour: '#059669', sortOrder: 5 },
    { name: 'Toiletries',   colour: '#EC4899', sortOrder: 6 },
    { name: 'Household',    colour: '#6366F1', sortOrder: 7 },
  ];

  const categoryMap = new Map<string, string>();
  for (const c of categoryDefs) {
    const existing = await prisma.category.findFirst({
      where: { businessId: business.id, name: c.name },
    });
    if (existing) {
      categoryMap.set(c.name, existing.id);
    } else {
      const created = await prisma.category.create({
        data: { businessId: business.id, name: c.name, colour: c.colour, sortOrder: c.sortOrder },
      });
      categoryMap.set(c.name, created.id);
    }
  }

  const cat = (name: string) => categoryMap.get(name);

  /* ---------- Products (21 realistic supermarket items) ---------- */
  const products: ProductSeed[] = [
    {
      sku: 'CARN-001', barcode: '5000312123456', name: 'Carnation Milk',
      sellingPriceBasePence: 150, defaultCostBasePence: 100, reorderPointBase: 24, stockQty: 48,
      categoryId: cat('Dairy'),
      units: [
        { unitId: piece.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 48 },
      ],
    },
    {
      sku: 'COCA-001', barcode: '5449000000996', name: 'Coca-Cola 500ml',
      sellingPriceBasePence: 120, defaultCostBasePence: 80, reorderPointBase: 24, stockQty: 72,
      categoryId: cat('Beverages'),
      units: [
        { unitId: bottle.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: crate.id, isBaseUnit: false, conversionToBase: 24 },
      ],
    },
    {
      sku: 'FANTA-001', barcode: '5449000011527', name: 'Fanta Orange 500ml',
      sellingPriceBasePence: 120, defaultCostBasePence: 80, reorderPointBase: 24, stockQty: 48,
      categoryId: cat('Beverages'),
      units: [
        { unitId: bottle.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: crate.id, isBaseUnit: false, conversionToBase: 24 },
      ],
    },
    {
      sku: 'WATER-001', barcode: '6001234567890', name: 'Bel-Aqua Water 1.5L',
      sellingPriceBasePence: 100, defaultCostBasePence: 60, reorderPointBase: 30, stockQty: 60,
      categoryId: cat('Beverages'),
      units: [
        { unitId: bottle.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: pack.id, isBaseUnit: false, conversionToBase: 6 },
      ],
    },
    {
      sku: 'MILO-001', barcode: '7613036000345', name: 'Milo 400g',
      sellingPriceBasePence: 550, defaultCostBasePence: 400, reorderPointBase: 12, stockQty: 24,
      categoryId: cat('Beverages'),
      units: [
        { unitId: tin.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 12 },
      ],
    },
    {
      sku: 'PEAK-001', barcode: '5060096123456', name: 'Peak Milk Tin',
      sellingPriceBasePence: 200, defaultCostBasePence: 140, reorderPointBase: 24, stockQty: 48,
      categoryId: cat('Dairy'),
      units: [
        { unitId: tin.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 48 },
      ],
    },
    {
      sku: 'SUGAR-001', barcode: '6001234567891', name: 'Sugar 1kg',
      sellingPriceBasePence: 150, defaultCostBasePence: 100, reorderPointBase: 20, stockQty: 40,
      categoryId: cat('Staples'),
      units: [
        { unitId: bag.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: box.id, isBaseUnit: false, conversionToBase: 10 },
      ],
    },
    {
      sku: 'RICE-001', barcode: '6001234567892', name: 'Basmati Rice 5kg',
      sellingPriceBasePence: 800, defaultCostBasePence: 600, reorderPointBase: 10, stockQty: 20,
      categoryId: cat('Staples'),
      units: [
        { unitId: bag.id, isBaseUnit: true, conversionToBase: 1 },
      ],
    },
    {
      sku: 'OIL-001', barcode: '6001234567893', name: 'Vegetable Oil 1L',
      sellingPriceBasePence: 350, defaultCostBasePence: 250, reorderPointBase: 12, stockQty: 24,
      categoryId: cat('Staples'),
      units: [
        { unitId: bottle.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 12 },
      ],
    },
    {
      sku: 'INDO-001', barcode: '0089686170030', name: 'Indomie Noodles',
      sellingPriceBasePence: 80, defaultCostBasePence: 50, reorderPointBase: 40, stockQty: 120,
      promoBuyQty: 5, promoGetQty: 1, categoryId: cat('Snacks'),
      units: [
        { unitId: pack.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 40 },
      ],
    },
    {
      sku: 'SOAP-001', barcode: '6001234567894', name: 'Key Soap',
      sellingPriceBasePence: 100, defaultCostBasePence: 70, reorderPointBase: 20, stockQty: 36,
      categoryId: cat('Household'),
      units: [
        { unitId: piece.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 36 },
      ],
    },
    {
      sku: 'COLG-001', barcode: '8901314010117', name: 'Colgate Toothpaste 100ml',
      sellingPriceBasePence: 180, defaultCostBasePence: 120, reorderPointBase: 12, stockQty: 24,
      categoryId: cat('Toiletries'),
      units: [
        { unitId: piece.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: box.id, isBaseUnit: false, conversionToBase: 24 },
      ],
    },
    {
      sku: 'CORB-001', barcode: '5000312010000', name: 'Exeter Corned Beef',
      sellingPriceBasePence: 300, defaultCostBasePence: 200, reorderPointBase: 12, stockQty: 24,
      categoryId: cat('Canned Goods'),
      units: [
        { unitId: tin.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 24 },
      ],
    },
    {
      sku: 'SARD-001', barcode: '6001234567895', name: 'Sardines in Tomato Sauce',
      sellingPriceBasePence: 150, defaultCostBasePence: 100, reorderPointBase: 20, stockQty: 36,
      categoryId: cat('Canned Goods'),
      units: [
        { unitId: tin.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 24 },
      ],
    },
    {
      sku: 'TOMA-001', barcode: '6001234567896', name: 'Tomato Paste 400g',
      sellingPriceBasePence: 200, defaultCostBasePence: 130, reorderPointBase: 12, stockQty: 24,
      categoryId: cat('Canned Goods'),
      units: [
        { unitId: tin.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 12 },
      ],
    },
    {
      sku: 'BISC-001', barcode: '5000168137841', name: 'Digestive Biscuits',
      sellingPriceBasePence: 120, defaultCostBasePence: 80, reorderPointBase: 15, stockQty: 30,
      categoryId: cat('Snacks'),
      units: [
        { unitId: pack.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: box.id, isBaseUnit: false, conversionToBase: 12 },
      ],
    },
    {
      sku: 'BREAD-001', barcode: '6001234567897', name: 'White Bread',
      sellingPriceBasePence: 150, defaultCostBasePence: 100, reorderPointBase: 10, stockQty: 20,
      categoryId: cat('Staples'),
      units: [
        { unitId: piece.id, isBaseUnit: true, conversionToBase: 1 },
      ],
    },
    {
      sku: 'MARG-001', barcode: '6001234567898', name: 'Blue Band Margarine 250g',
      sellingPriceBasePence: 180, defaultCostBasePence: 120, reorderPointBase: 12, stockQty: 24,
      categoryId: cat('Dairy'),
      units: [
        { unitId: piece.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: box.id, isBaseUnit: false, conversionToBase: 24 },
      ],
    },
    {
      sku: 'NESC-001', barcode: '7613036345678', name: 'Nescafe Classic 200g',
      sellingPriceBasePence: 450, defaultCostBasePence: 320, reorderPointBase: 8, stockQty: 18,
      categoryId: cat('Beverages'),
      units: [
        { unitId: piece.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 12 },
      ],
    },
    {
      sku: 'TEA-001', barcode: '8712566123456', name: 'Lipton Tea Bags (50)',
      sellingPriceBasePence: 250, defaultCostBasePence: 170, reorderPointBase: 10, stockQty: 18,
      categoryId: cat('Beverages'),
      units: [
        { unitId: box.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 12 },
      ],
    },
    {
      sku: 'DISH-001', barcode: '6001234567899', name: 'Sunlight Dish Soap 500ml',
      sellingPriceBasePence: 200, defaultCostBasePence: 130, reorderPointBase: 12, stockQty: 24,
      categoryId: cat('Household'),
      units: [
        { unitId: bottle.id, isBaseUnit: true, conversionToBase: 1 },
        { unitId: carton.id, isBaseUnit: false, conversionToBase: 12 },
      ],
    },
  ];

  for (const p of products) {
    await seedProduct(business.id, store.id, p);
  }

  /* ---------- Chart of Accounts ---------- */
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
    { code: '6600', name: 'Marketing', type: 'EXPENSE' },
  ];

  for (const account of accounts) {
    await prisma.account.upsert({
      where: { businessId_code: { businessId: business.id, code: account.code } },
      update: { name: account.name, type: account.type as any },
      create: { businessId: business.id, ...account },
    });
  }

  /* ---------- Customers ---------- */
  await prisma.customer.upsert({
    where: { id: 'walk-in' },
    update: {},
    create: { id: 'walk-in', businessId: business.id, name: 'Walk-in Customer' },
  });

  // Additional demo customers
  const demoCustomers = [
    { name: 'Kofi Mensah', phone: '0241234567', email: 'kofi.mensah@email.com' },
    { name: 'Ama Serwaa', phone: '0551234567', email: 'ama.serwaa@email.com' },
    { name: 'Emmanuel Asante', phone: '0271234567', email: null },
    { name: 'Abena Pokua', phone: '0201234567', email: null },
  ];

  for (const c of demoCustomers) {
    const existing = await prisma.customer.findFirst({
      where: { businessId: business.id, name: c.name },
    });
    if (!existing) {
      await prisma.customer.create({
        data: { businessId: business.id, name: c.name, phone: c.phone, email: c.email },
      });
    }
  }

  /* ---------- Suppliers ---------- */
  await prisma.supplier.upsert({
    where: { id: 'default-supplier' },
    update: {},
    create: { id: 'default-supplier', businessId: business.id, name: 'Default Supplier' },
  });

  const demoSuppliers = [
    { name: 'Unilever Ghana', phone: '0302123456', email: 'orders@unilever.gh' },
    { name: 'Nestlé Ghana', phone: '0302654321', email: 'supply@nestle.gh' },
    { name: 'Coca-Cola Bottling', phone: '0302987654', email: 'trade@cocacola.gh' },
  ];

  for (const s of demoSuppliers) {
    const existing = await prisma.supplier.findFirst({
      where: { businessId: business.id, name: s.name },
    });
    if (!existing) {
      await prisma.supplier.create({
        data: { businessId: business.id, name: s.name, phone: s.phone, email: s.email },
      });
    }
  }

  console.log('✓ Seed complete — 21 products, 7 categories, 5 customers, 4 suppliers, 17 accounts');
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
