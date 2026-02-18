import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';

// One-time seed endpoint — safe to call multiple times (idempotent).
// Protected by a secret token: GET /api/seed-once?token=<SEED_SECRET>
export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get('token');
  const validToken = process.env.SEED_SECRET ?? 'supermarket-seed-init-2024';
  if (!token || token !== validToken) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    /* ---- Business ---- */
    let business = await prisma.business.findFirst();
    if (!business) {
      business = await prisma.business.create({
        data: { name: 'Supermarket Demo', currency: 'GHS', vatEnabled: false, mode: 'SIMPLE', openingCapitalPence: 2000000 },
      });
    }

    /* ---- Store ---- */
    let store = await prisma.store.findFirst({ where: { businessId: business.id } });
    if (!store) {
      store = await prisma.store.create({
        data: { businessId: business.id, name: 'Main Store', address: 'High Street' },
      });
    }

    /* ---- Organization + Branch ---- */
    let org = await prisma.organization.findUnique({ where: { businessId: business.id } });
    if (!org) {
      org = await prisma.organization.create({
        data: { businessId: business.id, name: `${business.name} Organization` },
      });
    }
    const branchExists = await prisma.branch.findFirst({ where: { businessId: business.id, storeId: store.id } });
    if (!branchExists) {
      await prisma.branch.create({
        data: { businessId: business.id, organizationId: org.id, storeId: store.id, code: 'MAIN01', name: store.name },
      });
    }

    /* ---- Tills ---- */
    const tills = await prisma.till.findMany({ where: { storeId: store.id } });
    if (tills.length === 0) {
      await prisma.till.createMany({ data: [{ storeId: store.id, name: 'Till 1' }, { storeId: store.id, name: 'Till 2' }] });
    }

    /* ---- Users ---- */
    const ownerHash = await bcrypt.hash('Pass1234!', 10);
    const cashierHash = await bcrypt.hash('Pass1234!', 10);
    const pinHash = await bcrypt.hash('1234', 10);

    await prisma.user.upsert({
      where: { email: 'owner@store.com' },
      update: { passwordHash: ownerHash, approvalPinHash: pinHash },
      create: { businessId: business.id, name: 'Owner', email: 'owner@store.com', passwordHash: ownerHash, approvalPinHash: pinHash, role: 'OWNER' },
    });
    await prisma.user.upsert({
      where: { email: 'cashier@store.com' },
      update: {},
      create: { businessId: business.id, name: 'Cashier', email: 'cashier@store.com', passwordHash: cashierHash, role: 'CASHIER' },
    });

    /* ---- Units ---- */
    const ensureUnit = async (name: string, pluralName: string, symbol: string) => {
      const ex = await prisma.unit.findFirst({ where: { name } });
      if (ex) return ex;
      return prisma.unit.create({ data: { name, pluralName, symbol } });
    };

    const piece  = await ensureUnit('piece',  'pieces',  'pc');
    const carton = await ensureUnit('carton', 'cartons', 'ctn');
    const bottle = await ensureUnit('bottle', 'bottles', 'btl');
    const pack   = await ensureUnit('pack',   'packs',   'pk');
    const bag    = await ensureUnit('bag',    'bags',    'bag');
    const box    = await ensureUnit('box',    'boxes',   'bx');
    const tin    = await ensureUnit('tin',    'tins',    'tin');
    const crate  = await ensureUnit('crate',  'crates',  'crt');

    /* ---- Categories ---- */
    const catDefs = [
      { name: 'Beverages',    colour: '#2563EB', sortOrder: 1 },
      { name: 'Dairy',        colour: '#7C3AED', sortOrder: 2 },
      { name: 'Canned Goods', colour: '#DC2626', sortOrder: 3 },
      { name: 'Staples',      colour: '#D97706', sortOrder: 4 },
      { name: 'Snacks',       colour: '#059669', sortOrder: 5 },
      { name: 'Toiletries',   colour: '#EC4899', sortOrder: 6 },
      { name: 'Household',    colour: '#6366F1', sortOrder: 7 },
    ];
    const catMap = new Map<string, string>();
    for (const c of catDefs) {
      const ex = await prisma.category.findFirst({ where: { businessId: business.id, name: c.name } });
      if (ex) { catMap.set(c.name, ex.id); }
      else {
        const created = await prisma.category.create({ data: { businessId: business.id, ...c } });
        catMap.set(c.name, created.id);
      }
    }

    /* ---- Walk-in customer ---- */
    await prisma.customer.upsert({
      where: { id: 'walk-in' },
      update: {},
      create: { id: 'walk-in', businessId: business.id, name: 'Walk-in Customer' },
    });

    /* ---- Chart of accounts ---- */
    const accounts: { code: string; name: string; type: string }[] = [
      { code: '1000', name: 'Cash on Hand',       type: 'ASSET'     },
      { code: '1010', name: 'Bank',                type: 'ASSET'     },
      { code: '1100', name: 'Accounts Receivable', type: 'ASSET'     },
      { code: '1200', name: 'Inventory',           type: 'ASSET'     },
      { code: '2000', name: 'Accounts Payable',    type: 'LIABILITY' },
      { code: '3000', name: 'Retained Earnings',   type: 'EQUITY'    },
      { code: '4000', name: 'Sales Revenue',       type: 'INCOME'    },
      { code: '5000', name: 'Cost of Goods Sold',  type: 'EXPENSE'   },
      { code: '6000', name: 'Operating Expenses',  type: 'EXPENSE'   },
    ];
    for (const a of accounts) {
      await prisma.account.upsert({
        where: { businessId_code: { businessId: business.id, code: a.code } },
        update: { name: a.name },
        create: { businessId: business.id, ...a },
      } as Parameters<typeof prisma.account.upsert>[0]);
    }

    /* ---- 5 core products ---- */
    const seedProduct = async (
      sku: string, barcode: string, name: string,
      sellingPriceBasePence: number, defaultCostBasePence: number,
      reorderPointBase: number, stockQty: number,
      categoryName: string,
      units: { unitId: string; isBaseUnit: boolean; conversionToBase: number }[],
    ) => {
      let product = await prisma.product.findFirst({ where: { OR: [{ barcode }, { businessId: business.id, name }] } });
      if (!product) {
        product = await prisma.product.create({
          data: { businessId: business.id, sku, barcode, name, sellingPriceBasePence, defaultCostBasePence, reorderPointBase, categoryId: catMap.get(categoryName) ?? null },
        });
      }
      for (const u of units) {
        const ex = await prisma.productUnit.findFirst({ where: { productId: product.id, unitId: u.unitId } });
        if (!ex) await prisma.productUnit.create({ data: { productId: product.id, ...u } });
      }
      await prisma.inventoryBalance.upsert({
        where: { storeId_productId: { storeId: store!.id, productId: product.id } },
        update: { qtyOnHandBase: stockQty, avgCostBasePence: defaultCostBasePence },
        create: { storeId: store!.id, productId: product.id, qtyOnHandBase: stockQty, avgCostBasePence: defaultCostBasePence },
      });
    };

    await seedProduct('COCA-001','5449000000996','Coca-Cola 500ml', 120,80,24,72,'Beverages',[{unitId:bottle.id,isBaseUnit:true,conversionToBase:1},{unitId:crate.id,isBaseUnit:false,conversionToBase:24}]);
    await seedProduct('CARN-001','5000312123456','Carnation Milk', 150,100,24,48,'Dairy',[{unitId:piece.id,isBaseUnit:true,conversionToBase:1},{unitId:carton.id,isBaseUnit:false,conversionToBase:48}]);
    await seedProduct('SUGAR-001','6001234567891','Sugar 1kg', 150,100,20,40,'Staples',[{unitId:bag.id,isBaseUnit:true,conversionToBase:1},{unitId:box.id,isBaseUnit:false,conversionToBase:10}]);
    await seedProduct('INDO-001','0089686170030','Indomie Noodles', 80,50,40,120,'Snacks',[{unitId:pack.id,isBaseUnit:true,conversionToBase:1},{unitId:carton.id,isBaseUnit:false,conversionToBase:40}]);
    await seedProduct('SOAP-001','6001234567894','Key Soap', 100,70,20,36,'Household',[{unitId:piece.id,isBaseUnit:true,conversionToBase:1}]);

    // suppress unused warnings
    void bag; void pack; void box; void tin;

    return NextResponse.json({
      ok: true,
      business: business.name,
      store: store.name,
      message: 'Seed complete — users owner@store.com and cashier@store.com created',
    });
  } catch (err: unknown) {
    console.error('Seed error', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
