'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { randomBytes } from 'crypto';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';

/**
 * Self-service registration: creates a new Business, Store, Till, and OWNER user.
 * Then seeds demo data (categories, products, inventory, accounts, customers, suppliers)
 * so the new owner can explore the system immediately.
 */
export async function register(formData: FormData) {
  const businessName = String(formData.get('businessName') || '').trim();
  const ownerName = String(formData.get('ownerName') || '').trim();
  const email = String(formData.get('email') || '').toLowerCase().trim();
  const password = String(formData.get('password') || '');
  const currency = String(formData.get('currency') || 'GHS');

  // Validation
  if (!businessName || !ownerName || !email || !password) {
    redirect('/register?error=missing');
  }
  if (password.length < 6) {
    redirect('/register?error=weak');
  }

  // Check if email already taken
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    redirect('/register?error=exists');
  }

  // Create Business → Store → Till → Owner (all in one transaction)
  const passwordHash = await bcrypt.hash(password, 10);

  const result = await prisma.$transaction(async (tx) => {
    const business = await tx.business.create({
      data: {
        name: businessName,
        currency,
        vatEnabled: false,
        mode: 'SIMPLE',
      },
    });

    const store = await tx.store.create({
      data: {
        businessId: business.id,
        name: 'Main Store',
      },
    });

    await tx.till.createMany({
      data: [
        { storeId: store.id, name: 'Till 1' },
        { storeId: store.id, name: 'Till 2' },
      ],
    });

    const owner = await tx.user.create({
      data: {
        businessId: business.id,
        name: ownerName,
        email,
        passwordHash,
        role: 'OWNER',
      },
    });

    return { business, store, owner };
  });

  // Seed demo data in the background (non-blocking, best-effort)
  await seedDemoData(result.business.id, result.store.id);

  // Auto-login
  const token = randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);
  await prisma.session.create({
    data: { token, userId: result.owner.id, expiresAt },
  });
  cookies().set('pos_session', token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });

  redirect('/onboarding');
}

// ---------------------------------------------------------------------------
// Demo data seeder — creates categories, products, inventory, accounts, etc.
// ---------------------------------------------------------------------------

interface DemoProduct {
  sku: string;
  barcode: string;
  name: string;
  sellingPriceBasePence: number;
  defaultCostBasePence: number;
  reorderPointBase: number;
  categoryId?: string;
  units: { unitId: string; isBaseUnit: boolean; conversionToBase: number }[];
  stockQty: number;
}

async function seedDemoData(businessId: string, storeId: string) {
  try {
    // Units (global / shared) — batch check + create
    const existingUnits = await prisma.unit.findMany();
    const unitMap = new Map(existingUnits.map(u => [u.name, u]));
    
    const unitDefs = [
      { name: 'piece', pluralName: 'pieces', symbol: 'pc' },
      { name: 'carton', pluralName: 'cartons', symbol: 'ctn' },
      { name: 'bottle', pluralName: 'bottles', symbol: 'btl' },
      { name: 'pack', pluralName: 'packs', symbol: 'pk' },
      { name: 'bag', pluralName: 'bags', symbol: 'bag' },
      { name: 'box', pluralName: 'boxes', symbol: 'bx' },
      { name: 'sachet', pluralName: 'sachets', symbol: 'sct' },
      { name: 'tin', pluralName: 'tins', symbol: 'tin' },
      { name: 'crate', pluralName: 'crates', symbol: 'crt' },
    ];
    
    const missingUnits = unitDefs.filter(u => !unitMap.has(u.name));
    if (missingUnits.length > 0) {
      await prisma.unit.createMany({ data: missingUnits, skipDuplicates: true });
      const newUnits = await prisma.unit.findMany();
      newUnits.forEach(u => unitMap.set(u.name, u));
    }
    
    const piece = unitMap.get('piece')!;
    const carton = unitMap.get('carton')!;
    const bottle = unitMap.get('bottle')!;
    const pack = unitMap.get('pack')!;
    const bag = unitMap.get('bag')!;
    const box = unitMap.get('box')!;
    const tin = unitMap.get('tin')!;
    const crate = unitMap.get('crate')!;

    // Categories — batch create
    const categoryDefs = [
      { name: 'Beverages', colour: '#2563EB', sortOrder: 1 },
      { name: 'Dairy', colour: '#7C3AED', sortOrder: 2 },
      { name: 'Canned Goods', colour: '#DC2626', sortOrder: 3 },
      { name: 'Staples', colour: '#D97706', sortOrder: 4 },
      { name: 'Snacks', colour: '#059669', sortOrder: 5 },
      { name: 'Toiletries', colour: '#EC4899', sortOrder: 6 },
      { name: 'Household', colour: '#6366F1', sortOrder: 7 },
    ];
    
    // Use transaction for all batch inserts
    await prisma.$transaction(async (tx) => {
      for (const c of categoryDefs) {
        await tx.category.create({ data: { businessId, name: c.name, colour: c.colour, sortOrder: c.sortOrder } });
      }
    });
    
    const categories = await prisma.category.findMany({ where: { businessId } });
    const categoryMap = new Map(categories.map(c => [c.name, c.id]));
    const cat = (name: string) => categoryMap.get(name);

    // Products
    const products: DemoProduct[] = [
      {
        sku: 'CARN-001', barcode: '', name: 'Carnation Milk',
        sellingPriceBasePence: 150, defaultCostBasePence: 100, reorderPointBase: 24, stockQty: 48,
        categoryId: cat('Dairy'),
        units: [
          { unitId: piece.id, isBaseUnit: true, conversionToBase: 1 },
          { unitId: carton.id, isBaseUnit: false, conversionToBase: 48 },
        ],
      },
      {
        sku: 'COCA-001', barcode: '', name: 'Coca-Cola 500ml',
        sellingPriceBasePence: 120, defaultCostBasePence: 80, reorderPointBase: 24, stockQty: 72,
        categoryId: cat('Beverages'),
        units: [
          { unitId: bottle.id, isBaseUnit: true, conversionToBase: 1 },
          { unitId: crate.id, isBaseUnit: false, conversionToBase: 24 },
        ],
      },
      {
        sku: 'MILO-001', barcode: '', name: 'Milo 400g',
        sellingPriceBasePence: 550, defaultCostBasePence: 400, reorderPointBase: 12, stockQty: 24,
        categoryId: cat('Beverages'),
        units: [
          { unitId: tin.id, isBaseUnit: true, conversionToBase: 1 },
          { unitId: carton.id, isBaseUnit: false, conversionToBase: 12 },
        ],
      },
      {
        sku: 'SUGAR-001', barcode: '', name: 'Sugar 1kg',
        sellingPriceBasePence: 150, defaultCostBasePence: 100, reorderPointBase: 20, stockQty: 40,
        categoryId: cat('Staples'),
        units: [
          { unitId: bag.id, isBaseUnit: true, conversionToBase: 1 },
          { unitId: box.id, isBaseUnit: false, conversionToBase: 10 },
        ],
      },
      {
        sku: 'RICE-001', barcode: '', name: 'Basmati Rice 5kg',
        sellingPriceBasePence: 800, defaultCostBasePence: 600, reorderPointBase: 10, stockQty: 20,
        categoryId: cat('Staples'),
        units: [{ unitId: bag.id, isBaseUnit: true, conversionToBase: 1 }],
      },
      {
        sku: 'OIL-001', barcode: '', name: 'Vegetable Oil 1L',
        sellingPriceBasePence: 350, defaultCostBasePence: 250, reorderPointBase: 12, stockQty: 24,
        categoryId: cat('Staples'),
        units: [
          { unitId: bottle.id, isBaseUnit: true, conversionToBase: 1 },
          { unitId: carton.id, isBaseUnit: false, conversionToBase: 12 },
        ],
      },
      {
        sku: 'INDO-001', barcode: '', name: 'Indomie Noodles',
        sellingPriceBasePence: 80, defaultCostBasePence: 50, reorderPointBase: 40, stockQty: 120,
        categoryId: cat('Snacks'),
        units: [
          { unitId: pack.id, isBaseUnit: true, conversionToBase: 1 },
          { unitId: carton.id, isBaseUnit: false, conversionToBase: 40 },
        ],
      },
      {
        sku: 'SOAP-001', barcode: '', name: 'Key Soap',
        sellingPriceBasePence: 100, defaultCostBasePence: 70, reorderPointBase: 20, stockQty: 36,
        categoryId: cat('Household'),
        units: [
          { unitId: piece.id, isBaseUnit: true, conversionToBase: 1 },
          { unitId: carton.id, isBaseUnit: false, conversionToBase: 36 },
        ],
      },
      {
        sku: 'CORB-001', barcode: '', name: 'Exeter Corned Beef',
        sellingPriceBasePence: 300, defaultCostBasePence: 200, reorderPointBase: 12, stockQty: 24,
        categoryId: cat('Canned Goods'),
        units: [
          { unitId: tin.id, isBaseUnit: true, conversionToBase: 1 },
          { unitId: carton.id, isBaseUnit: false, conversionToBase: 24 },
        ],
      },
      {
        sku: 'COLG-001', barcode: '', name: 'Colgate Toothpaste 100ml',
        sellingPriceBasePence: 180, defaultCostBasePence: 120, reorderPointBase: 12, stockQty: 24,
        categoryId: cat('Toiletries'),
        units: [
          { unitId: piece.id, isBaseUnit: true, conversionToBase: 1 },
          { unitId: box.id, isBaseUnit: false, conversionToBase: 24 },
        ],
      },
    ];

    // Create all products, units, inventory, accounts, customers, and supplier in one transaction
    await prisma.$transaction(async (tx) => {
      for (const p of products) {
        const product = await tx.product.create({
          data: {
            businessId,
            sku: p.sku,
            barcode: p.barcode || null,
            name: p.name,
            sellingPriceBasePence: p.sellingPriceBasePence,
            defaultCostBasePence: p.defaultCostBasePence,
            vatRateBps: 0,
            reorderPointBase: p.reorderPointBase,
            categoryId: p.categoryId ?? null,
          },
        });

        if (p.units.length > 0) {
          await tx.productUnit.createMany({
            data: p.units.map(u => ({
              productId: product.id,
              unitId: u.unitId,
              isBaseUnit: u.isBaseUnit,
              conversionToBase: u.conversionToBase,
            })),
          });
        }

        await tx.inventoryBalance.create({
          data: {
            storeId,
            productId: product.id,
            qtyOnHandBase: p.stockQty,
            avgCostBasePence: p.defaultCostBasePence,
          },
        });
      }

      // Chart of Accounts — batch create
      await tx.account.createMany({
        data: [
          { businessId, code: '1000', name: 'Cash on Hand', type: 'ASSET' },
          { businessId, code: '1010', name: 'Bank', type: 'ASSET' },
          { businessId, code: '1100', name: 'Accounts Receivable', type: 'ASSET' },
          { businessId, code: '1200', name: 'Inventory', type: 'ASSET' },
          { businessId, code: '1300', name: 'VAT Receivable', type: 'ASSET' },
          { businessId, code: '2000', name: 'Accounts Payable', type: 'LIABILITY' },
          { businessId, code: '2100', name: 'VAT Payable', type: 'LIABILITY' },
          { businessId, code: '3000', name: 'Retained Earnings', type: 'EQUITY' },
          { businessId, code: '4000', name: 'Sales Revenue', type: 'INCOME' },
          { businessId, code: '5000', name: 'Cost of Goods Sold', type: 'EXPENSE' },
          { businessId, code: '6000', name: 'Operating Expenses', type: 'EXPENSE' },
          { businessId, code: '6100', name: 'Rent', type: 'EXPENSE' },
          { businessId, code: '6200', name: 'Utilities', type: 'EXPENSE' },
          { businessId, code: '6300', name: 'Salaries', type: 'EXPENSE' },
          { businessId, code: '6400', name: 'Repairs & Maintenance', type: 'EXPENSE' },
          { businessId, code: '6500', name: 'Fuel & Transport', type: 'EXPENSE' },
          { businessId, code: '6600', name: 'Marketing', type: 'EXPENSE' },
        ],
      });

      // Customers — batch create
      await tx.customer.createMany({
        data: [
          { businessId, name: 'Walk-in Customer' },
          { businessId, name: 'Kofi Mensah', phone: '0241234567' },
          { businessId, name: 'Ama Serwaa', phone: '0551234567' },
        ],
      });

      // Demo supplier
      await tx.supplier.create({
        data: { businessId, name: 'Default Supplier' },
      });
    });

    console.log(`[register] Demo data seeded for business ${businessId}`);
  } catch (err) {
    // Non-fatal: the business/user is already created, demo data is a convenience
    console.error('[register] Failed to seed demo data:', err);
  }
}
