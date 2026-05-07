import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { UserError } from '@/lib/action-utils';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { buildQtyByProductMap, resolveEffectiveSellingPricePence, resolveProductUnitBaseValuePence } from '@/lib/services/shared';
import { initiateMobileMoneyCollection, normalizeAfricanMsisdn, currencyToDialCode } from '@/lib/services/mobile-money';
import { normalizeGhanaPhone } from '@/lib/storefront-phone';
import { enqueueOrderNotificationSafe } from '@/lib/services/storefront-notifications';
import { getOpenStatus, parseWeeklyHours, type OpenStatus } from '@/lib/business-hours';
import { normalizePaymentMode, paymentConfigIsReady, type StorefrontPaymentConfig } from '@/lib/storefront-payments';
import {
  buildCategoryMappingLookup,
  resolvePublicCategory,
  slugifyPublicCategory,
  type PublicCategory,
} from '@/lib/storefront-taxonomy';
import { Redis } from '@upstash/redis';

// Redis client for short-lived storefront read caching (60 s TTL).
// Falls back gracefully to Postgres on any Redis error or missing env vars.
const storefrontRedis =
  Boolean(process.env.UPSTASH_REDIS_REST_URL) && Boolean(process.env.UPSTASH_REDIS_REST_TOKEN)
    ? Redis.fromEnv()
    : null;
const STOREFRONT_CACHE_TTL = 60; // seconds

export async function invalidateStorefrontBusinessCache(slug: string | null | undefined) {
  if (!storefrontRedis || !slug) return;
  const normalizedSlug = normalizeStorefrontSlug(slug);
  if (!normalizedSlug) return;
  storefrontRedis.del(`sf:biz:v2:${normalizedSlug}`).catch(() => null);
}

export type StorefrontCatalogProduct = {
  id: string;
  name: string;
  barcode: string | null;
  sellingPriceBasePence: number;
  vatRateBps: number;
  promoBuyQty: number;
  promoGetQty: number;
  categoryId: string | null;
  categoryName: string | null;
  publicCategoryId: string;
  publicCategoryName: string;
  publicCategoryPriority: number;
  imageUrl: string | null;
  storefrontDescription: string | null;
  units: Array<{
    id: string;
    name: string;
    pluralName: string;
    conversionToBase: number;
    isBaseUnit: boolean;
    sellingPricePence?: number | null;
    defaultCostPence?: number | null;
  }>;
  onHandBase: number;
};

export type StorefrontPickupStore = {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
};

export type StorefrontBrandingData = {
  logoUrl: string | null;
  logoWidth: number | null;
  logoHeight: number | null;
  compactLogoUrl: string | null;
  compactLogoWidth: number | null;
  compactLogoHeight: number | null;
  squareLogoUrl: string | null;
  squareLogoWidth: number | null;
  squareLogoHeight: number | null;
  initials: string | null;
  brandPrimaryColor: string | null;
  compactMode: string | null;
  logoBackground: string | null;
  primaryColor: string | null;
  accentColor: string | null;
  tagline: string | null;
};

export type PublicStorefront = {
  businessId: string;
  name: string;
  currency: string;
  vatEnabled: boolean;
  slug: string;
  headline: string | null;
  description: string | null;
  pickupInstructions: string | null;
  phone: string | null;
  address: string | null;
  branding: StorefrontBrandingData;
  stores: StorefrontPickupStore[];
  products: Array<StorefrontCatalogProduct & { onHandByStore: Record<string, number> }>;
  categories: PublicCategory[];
  totalProductCount: number;
  initialProductCount: number;
  openStatus: OpenStatus | null;
  paymentConfig: StorefrontPaymentConfig;
  prepMinutes: number;
};

export type StorefrontCatalogQuery = {
  search?: string | null;
  categoryId?: string | null;
  offset?: number;
  limit?: number;
};

export type OnlineCheckoutItemInput = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
};

export type CreateOnlineCheckoutInput = {
  slug: string;
  storeId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string | null;
  customerNotes?: string | null;
  customerId?: string | null;
  sessionId?: string | null;
  network?: 'MTN' | 'TELECEL' | 'AIRTELTIGO' | null;
  items: OnlineCheckoutItemInput[];
};

type CheckoutProduct = {
  id: string;
  name: string;
  imageUrl: string | null;
  sellingPriceBasePence: number;
  vatRateBps: number;
  promoBuyQty: number;
  promoGetQty: number;
  productUnits: Array<{
    unitId: string;
    conversionToBase: number;
    sellingPricePence: number | null;
    unit: {
      id: string;
      name: string;
      pluralName: string;
    };
  }>;
};

type CheckoutLine = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  qtyBase: number;
  conversionToBase: number;
  unitPricePence: number;
  lineSubtotalPence: number;
  lineVatPence: number;
  lineTotalPence: number;
  productName: string;
  unitName: string;
  imageUrl: string | null;
};

type OnlineOrderInventoryLine = {
  productId: string;
  qtyBase: number;
};

type BusinessStorefrontSnapshot = {
  id: string;
  name: string;
  currency: string;
  vatEnabled: boolean;
  momoEnabled: boolean;
  mode: string;
  plan: string;
  storeMode: string;
  addonOnlineStorefront: boolean;
  storefrontEnabled: boolean;
  storefrontSlug: string | null;
  storefrontHeadline: string | null;
  storefrontDescription: string | null;
  storefrontPickupInstructions: string | null;
  phone: string | null;
  address: string | null;
  stores: Array<{ id: string; name: string }>;
};

export function normalizeStorefrontSlug(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Friendly order reference customers use as the MoMo payment note. */
export function createOnlineOrderRef() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // omit similar-looking chars
  let suffix = '';
  for (let i = 0; i < 4; i += 1) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `ORD-${suffix}`;
}

/** @deprecated Kept for backwards compatibility with older callers. Prefer createOnlineOrderRef. */
export function createOnlineOrderNumber(now = new Date(), random = Math.floor(Math.random() * 10_000)) {
  const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
  return `WEB-${datePart}-${String(Math.max(0, random) % 10_000).padStart(4, '0')}`;
}

async function generateUniqueOnlineOrderRef(businessId: string): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const candidate = createOnlineOrderRef();
    const existing = await prisma.onlineOrder.findFirst({
      where: { businessId, orderNumber: candidate },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  // Extremely unlikely fallback: append a longer random suffix.
  return `${createOnlineOrderRef()}-${Date.now().toString(36).slice(-3).toUpperCase()}`;
}

export async function restoreOnlineOrderInventoryReservation(input: {
  storeId: string;
  lines: OnlineOrderInventoryLine[];
  tx?: Prisma.TransactionClient;
}) {
  const client = input.tx ?? prisma;
  await Promise.all(
    input.lines.map((line) =>
      client.inventoryBalance.updateMany({
        where: {
          productId: line.productId,
          storeId: input.storeId,
        },
        data: {
          qtyOnHandBase: { increment: line.qtyBase },
        },
      }),
    ),
  );
}

export function getOnlineOrderStateForCollectionStatus(status: string) {
  switch (status) {
    case 'CONFIRMED':
      return { status: 'PAID', paymentStatus: 'PAID' } as const;
    case 'FAILED':
    case 'TIMEOUT':
      return { status: 'PAYMENT_FAILED', paymentStatus: 'FAILED' } as const;
    default:
      return { status: 'AWAITING_PAYMENT', paymentStatus: 'PENDING' } as const;
  }
}

function assertOnlineStorefrontAvailable(business: Pick<BusinessStorefrontSnapshot, 'plan' | 'mode' | 'storeMode' | 'storefrontEnabled' | 'addonOnlineStorefront'>) {
  const features = getFeatures(
    (business.plan ?? business.mode) as any,
    business.storeMode as any,
    { onlineStorefront: business.addonOnlineStorefront },
  );
  if (!features.onlineStorefront || !business.storefrontEnabled) {
    throw new UserError('This online store is not available right now.');
  }
}

function buildCheckoutLines(
  items: OnlineCheckoutItemInput[],
  products: CheckoutProduct[],
  vatEnabled: boolean,
) {
  const productMap = new Map(products.map((product) => [product.id, product]));

  return items.map((item) => {
    const product = productMap.get(item.productId);
    if (!product) {
      throw new UserError('One of the selected products is no longer available online.');
    }

    if (!Number.isInteger(item.qtyInUnit) || item.qtyInUnit <= 0) {
      throw new UserError(`Enter a valid quantity for ${product.name}.`);
    }

    const unit = product.productUnits.find((candidate) => candidate.unitId === item.unitId);
    if (!unit) {
      throw new UserError(`The selected unit is no longer available for ${product.name}.`);
    }

    const qtyBase = item.qtyInUnit * unit.conversionToBase;
    const unitPricePence = resolveEffectiveSellingPricePence(product, unit);
    const lineSubtotalPence = unitPricePence * item.qtyInUnit;
    const promoBuyQty = product.promoBuyQty ?? 0;
    const promoGetQty = product.promoGetQty ?? 0;
    const promoGroup = promoBuyQty + promoGetQty;
    const promoFreeUnits =
      promoBuyQty > 0 && promoGetQty > 0 && promoGroup > 0
        ? Math.floor(qtyBase / promoGroup) * promoGetQty
        : 0;
    const promoDiscountPence = Math.min(
      resolveProductUnitBaseValuePence(unitPricePence, unit, promoFreeUnits),
      lineSubtotalPence,
    );
    const netSubtotalPence = Math.max(lineSubtotalPence - promoDiscountPence, 0);
    const lineVatPence = vatEnabled ? Math.round((netSubtotalPence * product.vatRateBps) / 10_000) : 0;
    const lineTotalPence = netSubtotalPence + lineVatPence;

    return {
      productId: product.id,
      unitId: unit.unitId,
      qtyInUnit: item.qtyInUnit,
      qtyBase,
      conversionToBase: unit.conversionToBase,
      unitPricePence,
      lineSubtotalPence: netSubtotalPence,
      lineVatPence,
      lineTotalPence,
      productName: product.name,
      unitName: unit.unit.name,
      imageUrl: product.imageUrl,
    } satisfies CheckoutLine;
  });
}

async function getStorefrontBusinessBySlug(slug: string) {
  const fetchFromDb = () => prisma.business.findFirst({
    where: { storefrontSlug: slug },
    select: {
      id: true,
      name: true,
      currency: true,
      vatEnabled: true,
      momoEnabled: true,
      mode: true,
      plan: true,
      storeMode: true,
      addonOnlineStorefront: true,
      timezone: true,
      storefrontEnabled: true,
      storefrontSlug: true,
      storefrontHoursJson: true,
      storefrontPickupPrepMinutes: true,
      storefrontPaymentMode: true,
      storefrontMomoNumber: true,
      storefrontMomoNetwork: true,
      storefrontMerchantShortcode: true,
      storefrontBankName: true,
      storefrontBankAccountName: true,
      storefrontBankAccountNumber: true,
      storefrontBankBranch: true,
      storefrontPaymentNote: true,
      storefrontHeadline: true,
      storefrontDescription: true,
      storefrontPickupInstructions: true,
      logoUrl: true,
      logoWidth: true,
      logoHeight: true,
      brandCompactLogoUrl: true,
      brandCompactLogoWidth: true,
      brandCompactLogoHeight: true,
      brandSquareLogoUrl: true,
      brandSquareLogoWidth: true,
      brandSquareLogoHeight: true,
      brandInitials: true,
      brandPrimaryColor: true,
      brandCompactMode: true,
      brandLogoBackground: true,
      storefrontLogoUrl: true,
      storefrontPrimaryColor: true,
      storefrontAccentColor: true,
      storefrontTagline: true,
      phone: true,
      address: true,
      stores: {
        orderBy: [{ isMainStore: 'desc' }, { createdAt: 'asc' }],
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
        },
      },
    },
  });

  const cacheKey = `sf:biz:v2:${slug}`;
  if (storefrontRedis) {
    try {
      const hit = await storefrontRedis.get<NonNullable<Awaited<ReturnType<typeof fetchFromDb>>>>(cacheKey);
      if (hit) return hit;
    } catch { /* fall through to DB on Redis error */ }
  }

  const data = await fetchFromDb();
  if (storefrontRedis && data) {
    storefrontRedis.set(cacheKey, data, { ex: STOREFRONT_CACHE_TTL }).catch(() => null);
  }
  return data;
}

type StorefrontBusiness = NonNullable<Awaited<ReturnType<typeof getStorefrontBusinessBySlug>>>;

function buildStorefrontPaymentConfig(business: StorefrontBusiness): StorefrontPaymentConfig {
  return {
    mode: normalizePaymentMode(business.storefrontPaymentMode),
    momoNumber: business.storefrontMomoNumber ?? null,
    momoNetwork: business.storefrontMomoNetwork ?? null,
    merchantShortcode: business.storefrontMerchantShortcode ?? null,
    bankName: business.storefrontBankName ?? null,
    bankAccountName: business.storefrontBankAccountName ?? null,
    bankAccountNumber: business.storefrontBankAccountNumber ?? null,
    bankBranch: business.storefrontBankBranch ?? null,
    paymentNote: business.storefrontPaymentNote ?? null,
  };
}

const STOREFRONT_INITIAL_PRODUCT_LIMIT = 48;
const STOREFRONT_MAX_PAGE_SIZE = 60;

function normalizeCatalogQuery(query: StorefrontCatalogQuery = {}) {
  return {
    search: (query.search ?? '').trim().slice(0, 80),
    categoryId: (query.categoryId ?? '').trim(),
    offset: Math.max(0, Math.floor(query.offset ?? 0)),
    limit: Math.max(1, Math.min(STOREFRONT_MAX_PAGE_SIZE, Math.floor(query.limit ?? STOREFRONT_INITIAL_PRODUCT_LIMIT))),
  };
}

async function getBusinessCategoryMappings(businessId: string) {
  const fetchFromDb = () => prisma.storefrontCategoryMapping.findMany({
    where: { businessId },
    orderBy: [{ priority: 'asc' }, { publicCategoryName: 'asc' }],
    select: {
      rawCategoryName: true,
      publicCategoryName: true,
      priority: true,
      hidden: true,
    },
  });

  const cacheKey = `sf:catmap:${businessId}`;
  if (storefrontRedis) {
    try {
      const hit = await storefrontRedis.get<Awaited<ReturnType<typeof fetchFromDb>>>(cacheKey);
      if (hit) return hit;
    } catch { /* fall through to DB on Redis error */ }
  }

  const data = await fetchFromDb();
  if (storefrontRedis) {
    storefrontRedis.set(cacheKey, data, { ex: STOREFRONT_CACHE_TTL }).catch(() => null);
  }
  return data;
}

function hasCustomCategoryMappings(mappingLookup: ReturnType<typeof buildCategoryMappingLookup>) {
  return mappingLookup.size > 0;
}

function productMatchesPublicCategory(product: { category: { name: string } | null }, categoryId: string, mappingLookup: ReturnType<typeof buildCategoryMappingLookup>) {
  if (!categoryId || categoryId === '__all__') return true;
  const publicCategory = resolvePublicCategory(product.category?.name ?? null, mappingLookup);
  return !publicCategory.hidden && publicCategory.id === categoryId;
}

function formatStorefrontCatalogProduct(
  product: {
    id: string;
    name: string;
    barcode: string | null;
    sellingPriceBasePence: number;
    vatRateBps: number;
    promoBuyQty: number;
    promoGetQty: number;
    categoryId: string | null;
    storefrontDescription: string | null;
    imageUrl: string | null;
    category: { name: string } | null;
    productUnits: Array<{
      isBaseUnit: boolean;
      conversionToBase: number;
      sellingPricePence: number | null;
      defaultCostPence: number | null;
      unit: { id: string; name: string; pluralName: string };
    }>;
    inventoryBalances: Array<{ storeId: string; qtyOnHandBase: number }>;
  },
  mappingLookup: ReturnType<typeof buildCategoryMappingLookup>,
) {
  const onHandByStore: Record<string, number> = {};
  let totalOnHand = 0;
  for (const balance of product.inventoryBalances) {
    onHandByStore[balance.storeId] = balance.qtyOnHandBase;
    totalOnHand += balance.qtyOnHandBase;
  }
  const publicCategory = resolvePublicCategory(product.category?.name ?? null, mappingLookup);
  return {
    id: product.id,
    name: product.name,
    barcode: product.barcode,
    sellingPriceBasePence: product.sellingPriceBasePence,
    vatRateBps: product.vatRateBps,
    promoBuyQty: product.promoBuyQty,
    promoGetQty: product.promoGetQty,
    categoryId: product.categoryId,
    categoryName: product.category?.name ?? null,
    publicCategoryId: publicCategory.id,
    publicCategoryName: publicCategory.name,
    publicCategoryPriority: publicCategory.priority,
    imageUrl: product.imageUrl,
    storefrontDescription: product.storefrontDescription,
    units: product.productUnits.map((unit) => ({
      id: unit.unit.id,
      name: unit.unit.name,
      pluralName: unit.unit.pluralName,
      conversionToBase: unit.conversionToBase,
      isBaseUnit: unit.isBaseUnit,
      sellingPricePence: unit.sellingPricePence,
      defaultCostPence: unit.defaultCostPence,
    })),
    onHandBase: totalOnHand,
    onHandByStore,
  };
}

async function getStorefrontProductRows(businessId: string, storeIds: string[], query: StorefrontCatalogQuery, mappingLookup: ReturnType<typeof buildCategoryMappingLookup>) {
  const normalized = normalizeCatalogQuery(query);
  const where: Prisma.ProductWhereInput = {
    businessId,
    active: true,
    storefrontPublished: true,
  };
  if (normalized.search) {
    // Postgres `contains` is case-sensitive by default. Without mode:'insensitive'
    // a customer search for "pride" would not match a product named "Pride", which
    // is exactly the parity gap merchants notice between POS (client-side
    // toLowerCase().includes) and the storefront. Same pattern as the rest of the
    // app (products, inventory, sales, customers searches).
    where.OR = [
      { name: { contains: normalized.search, mode: 'insensitive' as const } },
      { barcode: { contains: normalized.search, mode: 'insensitive' as const } },
      { category: { name: { contains: normalized.search, mode: 'insensitive' as const } } },
    ];
  }

  const canUseDatabasePagination =
    !hasCustomCategoryMappings(mappingLookup) &&
    (!normalized.categoryId || normalized.categoryId === '__all__');

  if (canUseDatabasePagination) {
    const [rows, total] = await Promise.all([
      prisma.product.findMany({
        where,
        orderBy: [{ category: { name: 'asc' } }, { imageUrl: { sort: 'asc', nulls: 'last' } }, { name: 'asc' }],
        skip: normalized.offset,
        take: normalized.limit,
        select: {
          id: true,
          name: true,
          barcode: true,
          sellingPriceBasePence: true,
          vatRateBps: true,
          promoBuyQty: true,
          promoGetQty: true,
          categoryId: true,
          storefrontDescription: true,
          imageUrl: true,
          category: { select: { name: true } },
          productUnits: {
            orderBy: [{ isBaseUnit: 'desc' }, { conversionToBase: 'asc' }],
            select: {
              unitId: true,
              isBaseUnit: true,
              conversionToBase: true,
              sellingPricePence: true,
              defaultCostPence: true,
              unit: { select: { id: true, name: true, pluralName: true } },
            },
          },
          inventoryBalances: {
            where: { storeId: { in: storeIds } },
            select: { storeId: true, qtyOnHandBase: true },
          },
        },
      }),
      prisma.product.count({ where }),
    ]);

    return {
      products: rows.map((product) => formatStorefrontCatalogProduct(product, mappingLookup)),
      total,
      offset: normalized.offset,
      limit: normalized.limit,
    };
  }

  const rows = await prisma.product.findMany({
    where,
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      name: true,
      barcode: true,
      sellingPriceBasePence: true,
      vatRateBps: true,
      promoBuyQty: true,
      promoGetQty: true,
      categoryId: true,
      storefrontDescription: true,
      imageUrl: true,
      category: { select: { name: true } },
      productUnits: {
        orderBy: [{ isBaseUnit: 'desc' }, { conversionToBase: 'asc' }],
        select: {
          unitId: true,
          isBaseUnit: true,
          conversionToBase: true,
          sellingPricePence: true,
          defaultCostPence: true,
          unit: { select: { id: true, name: true, pluralName: true } },
        },
      },
      inventoryBalances: {
        where: { storeId: { in: storeIds } },
        select: { storeId: true, qtyOnHandBase: true },
      },
    },
  });

  const visibleRows = normalized.categoryId && normalized.categoryId !== '__all__'
    ? rows.filter((product) => productMatchesPublicCategory(product, normalized.categoryId, mappingLookup))
    : rows.filter((product) => !resolvePublicCategory(product.category?.name ?? null, mappingLookup).hidden);

  const sortedRows = visibleRows.sort((a, b) => {
    const aCategory = resolvePublicCategory(a.category?.name ?? null, mappingLookup);
    const bCategory = resolvePublicCategory(b.category?.name ?? null, mappingLookup);
    if (aCategory.priority !== bCategory.priority) return aCategory.priority - bCategory.priority;
    const aHasImage = a.imageUrl ? 0 : 1;
    const bHasImage = b.imageUrl ? 0 : 1;
    if (aHasImage !== bHasImage) return aHasImage - bHasImage;
    return a.name.localeCompare(b.name);
  });

  const pageRows = sortedRows.slice(normalized.offset, normalized.offset + normalized.limit);
  return {
    products: pageRows.map((product) => formatStorefrontCatalogProduct(product, mappingLookup)),
    total: sortedRows.length,
    offset: normalized.offset,
    limit: normalized.limit,
  };
}

// Single DB fetch for initial storefront page load (no search/category filter).
// Replaces the previous Promise.all([getStorefrontProductRows, getPublicCategoriesForBusiness])
// which hit the same Product table twice on every storefront home page visit.
async function getStorefrontInitialData(
  businessId: string,
  storeIds: string[],
  mappingLookup: ReturnType<typeof buildCategoryMappingLookup>,
) {
  const rows = await prisma.product.findMany({
    where: { businessId, active: true, storefrontPublished: true },
    orderBy: [{ name: 'asc' }],
    select: {
      id: true,
      name: true,
      barcode: true,
      sellingPriceBasePence: true,
      vatRateBps: true,
      promoBuyQty: true,
      promoGetQty: true,
      categoryId: true,
      storefrontDescription: true,
      imageUrl: true,
      category: { select: { name: true } },
      productUnits: {
        orderBy: [{ isBaseUnit: 'desc' }, { conversionToBase: 'asc' }],
        select: {
          unitId: true,
          isBaseUnit: true,
          conversionToBase: true,
          sellingPricePence: true,
          defaultCostPence: true,
          unit: { select: { id: true, name: true, pluralName: true } },
        },
      },
      inventoryBalances: {
        where: { storeId: { in: storeIds } },
        select: { storeId: true, qtyOnHandBase: true },
      },
    },
  });

  // Derive category counts from the full result set before pagination
  const categoryMap = new Map<string, PublicCategory>();
  for (const product of rows) {
    const publicCategory = resolvePublicCategory(product.category?.name ?? null, mappingLookup);
    if (publicCategory.hidden) continue;
    const existing = categoryMap.get(publicCategory.id);
    categoryMap.set(publicCategory.id, {
      id: publicCategory.id,
      name: publicCategory.name,
      priority: publicCategory.priority,
      count: (existing?.count ?? 0) + 1,
    });
  }
  const categories = Array.from(categoryMap.values()).sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name),
  );

  // Derive the first page using the same filter/sort logic as getStorefrontProductRows
  const visibleRows = rows.filter(
    (product) => !resolvePublicCategory(product.category?.name ?? null, mappingLookup).hidden,
  );
  const sortedRows = visibleRows.sort((a, b) => {
    const aCategory = resolvePublicCategory(a.category?.name ?? null, mappingLookup);
    const bCategory = resolvePublicCategory(b.category?.name ?? null, mappingLookup);
    if (aCategory.priority !== bCategory.priority) return aCategory.priority - bCategory.priority;
    const aHasImage = a.imageUrl ? 0 : 1;
    const bHasImage = b.imageUrl ? 0 : 1;
    if (aHasImage !== bHasImage) return aHasImage - bHasImage;
    return a.name.localeCompare(b.name);
  });
  const pageRows = sortedRows.slice(0, STOREFRONT_INITIAL_PRODUCT_LIMIT);
  const catalogPage = {
    products: pageRows.map((product) => formatStorefrontCatalogProduct(product, mappingLookup)),
    total: sortedRows.length,
    offset: 0,
    limit: STOREFRONT_INITIAL_PRODUCT_LIMIT,
  };

  return { catalogPage, categories };
}

async function getPublicCategoriesForBusiness(businessId: string, mappingLookup: ReturnType<typeof buildCategoryMappingLookup>): Promise<PublicCategory[]> {
  const rawCategories = await prisma.product.findMany({
    where: { businessId, active: true, storefrontPublished: true },
    select: { category: { select: { name: true } } },
  });
  const categories = new Map<string, PublicCategory>();
  for (const product of rawCategories) {
    const publicCategory = resolvePublicCategory(product.category?.name ?? null, mappingLookup);
    if (publicCategory.hidden) continue;
    const existing = categories.get(publicCategory.id);
    categories.set(publicCategory.id, {
      id: publicCategory.id,
      name: publicCategory.name,
      priority: publicCategory.priority,
      count: (existing?.count ?? 0) + 1,
    });
  }
  return Array.from(categories.values()).sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
}

export async function getStorefrontCatalogPage(rawSlug: string, query: StorefrontCatalogQuery = {}) {
  const slug = normalizeStorefrontSlug(rawSlug);
  if (!slug) return null;

  const business = await getStorefrontBusinessBySlug(slug);
  if (!business || !business.storefrontSlug || business.stores.length === 0) return null;

  const features = getFeatures(
    (business.plan ?? business.mode) as any,
    business.storeMode as any,
    { onlineStorefront: business.addonOnlineStorefront },
  );
  if (!business.storefrontEnabled || !features.onlineStorefront) return null;

  const mappings = await getBusinessCategoryMappings(business.id);
  const mappingLookup = buildCategoryMappingLookup(mappings);
  return getStorefrontProductRows(
    business.id,
    business.stores.map((store) => store.id),
    query,
    mappingLookup,
  );
}

export async function getPublicStorefrontBySlug(rawSlug: string): Promise<PublicStorefront | null> {
  const slug = normalizeStorefrontSlug(rawSlug);
  if (!slug) return null;

  const business = await getStorefrontBusinessBySlug(slug);
  if (!business || !business.storefrontSlug || business.stores.length === 0) {
    return null;
  }

  const features = getFeatures(
    (business.plan ?? business.mode) as any,
    business.storeMode as any,
    { onlineStorefront: business.addonOnlineStorefront },
  );
  if (!business.storefrontEnabled || !features.onlineStorefront) {
    return null;
  }

  const storeIds = business.stores.map((store) => store.id);
  const mappings = await getBusinessCategoryMappings(business.id);
  const mappingLookup = buildCategoryMappingLookup(mappings);
  const { catalogPage, categories } = await getStorefrontInitialData(business.id, storeIds, mappingLookup);

  const weeklyHours = parseWeeklyHours((business as any).storefrontHoursJson ?? null);
  const openStatus = getOpenStatus({
    hours: weeklyHours,
    timezone: (business as any).timezone ?? null,
    pickupPrepMinutes: (business as any).storefrontPickupPrepMinutes ?? 0,
  });

  return {
    businessId: business.id,
    name: business.name,
    currency: business.currency,
    vatEnabled: business.vatEnabled,
    slug: business.storefrontSlug,
    headline: business.storefrontHeadline,
    description: business.storefrontDescription,
    pickupInstructions: business.storefrontPickupInstructions,
    phone: business.phone,
    address: business.address,
    branding: {
      // Per-surface storefrontLogoUrl wins; fall back to the canonical Business.logoUrl.
      logoUrl:
        (business as any).storefrontLogoUrl ??
        (business as any).logoUrl ??
        null,
      logoWidth: (business as any).logoWidth ?? null,
      logoHeight: (business as any).logoHeight ?? null,
      compactLogoUrl: (business as any).brandCompactLogoUrl ?? null,
      compactLogoWidth: (business as any).brandCompactLogoWidth ?? null,
      compactLogoHeight: (business as any).brandCompactLogoHeight ?? null,
      squareLogoUrl: (business as any).brandSquareLogoUrl ?? null,
      squareLogoWidth: (business as any).brandSquareLogoWidth ?? null,
      squareLogoHeight: (business as any).brandSquareLogoHeight ?? null,
      initials: (business as any).brandInitials ?? null,
      brandPrimaryColor: (business as any).brandPrimaryColor ?? null,
      compactMode: (business as any).brandCompactMode ?? 'AUTO',
      logoBackground: (business as any).brandLogoBackground ?? 'AUTO',
      primaryColor: (business as any).storefrontPrimaryColor ?? null,
      accentColor: (business as any).storefrontAccentColor ?? null,
      tagline: (business as any).storefrontTagline ?? null,
    },
    openStatus,
    paymentConfig: {
      mode: normalizePaymentMode((business as any).storefrontPaymentMode),
      momoNumber: (business as any).storefrontMomoNumber ?? null,
      momoNetwork: (business as any).storefrontMomoNetwork ?? null,
      merchantShortcode: (business as any).storefrontMerchantShortcode ?? null,
      bankName: (business as any).storefrontBankName ?? null,
      bankAccountName: (business as any).storefrontBankAccountName ?? null,
      bankAccountNumber: (business as any).storefrontBankAccountNumber ?? null,
      bankBranch: (business as any).storefrontBankBranch ?? null,
      paymentNote: (business as any).storefrontPaymentNote ?? null,
    },
    prepMinutes: (business as any).storefrontPickupPrepMinutes ?? 0,
    stores: business.stores.map((store) => ({
      id: store.id,
      name: store.name,
      address: store.address,
      phone: store.phone,
    })),
    products: catalogPage.products,
    categories,
    totalProductCount: catalogPage.total,
    initialProductCount: catalogPage.products.length,
  };
}

export async function recordStorefrontEvent(input: {
  businessId?: string | null;
  storeSlug: string;
  eventType: 'view' | 'product_view' | 'add_to_cart' | 'checkout_start' | 'order_placed';
  productId?: string | null;
  sessionId: string;
  metadata?: Record<string, unknown> | null;
}) {
  const sessionId = input.sessionId.trim().slice(0, 120);
  if (!sessionId) return;
  const storeSlug = normalizeStorefrontSlug(input.storeSlug);
  if (!storeSlug) return;

  const business = await prisma.business.findFirst({
    where: {
      storefrontSlug: storeSlug,
      storefrontEnabled: true,
      ...(input.businessId ? { id: input.businessId } : {}),
    },
    select: { id: true },
  });
  if (!business) return;

  let productId = input.productId ?? null;
  if (productId) {
    const product = await prisma.product.findFirst({
      where: { id: productId, businessId: business.id, active: true, storefrontPublished: true },
      select: { id: true },
    });
    productId = product?.id ?? null;
  }

  await prisma.storefrontEvent.create({
    data: {
      businessId: business.id,
      storeSlug,
      eventType: input.eventType,
      productId,
      sessionId,
      metadata: input.metadata ? JSON.stringify(input.metadata).slice(0, 2000) : null,
    },
  });
}

export async function createOnlineCheckout(input: CreateOnlineCheckoutInput) {
  const slug = normalizeStorefrontSlug(input.slug);
  if (!slug) {
    throw new UserError('This online store link is invalid.');
  }

  const business = await getStorefrontBusinessBySlug(slug);
  if (!business || !business.storefrontSlug || business.stores.length === 0) {
    throw new UserError('This online store is not available right now.');
  }

  assertOnlineStorefrontAvailable(business);

  if (!paymentConfigIsReady(buildStorefrontPaymentConfig(business))) {
    throw new UserError('This shop is updating its payment details — please check back soon.');
  }

  const customerName = input.customerName.trim();
  const rawCustomerPhone = input.customerPhone.trim();
  const customerEmail = input.customerEmail?.trim() ? input.customerEmail.trim() : null;
  const customerNotes = input.customerNotes?.trim() ? input.customerNotes.trim() : null;

  if (!customerName) {
    throw new UserError('Enter your name before checking out.');
  }
  if (!rawCustomerPhone) {
    throw new UserError('Enter your phone number before checking out.');
  }
  if (!input.items.length) {
    throw new UserError('Add at least one item to your cart.');
  }

  // Normalize to E.164 (+233XXXXXXXXX) for identity consistency with StorefrontCustomer.phone.
  // normalizeGhanaPhone is the canonical Ghana normalizer; fall back to normalizeAfricanMsisdn
  // for non-Ghana currencies and ensure the result always starts with +.
  const rawNormalized =
    normalizeGhanaPhone(rawCustomerPhone) ??
    (() => {
      const msisdn = normalizeAfricanMsisdn(rawCustomerPhone, currencyToDialCode(business.currency));
      return msisdn ? (msisdn.startsWith('+') ? msisdn : `+${msisdn}`) : null;
    })();
  const customerPhone = rawNormalized ?? '';
  if (!customerPhone || customerPhone.length < 10) {
    throw new UserError('Enter a valid phone number (e.g. 024 123 4567).');
  }

  const requestedStoreId = input.storeId?.trim() ?? '';
  const store = requestedStoreId
    ? business.stores.find((candidate) => candidate.id === requestedStoreId)
    : business.stores[0];
  if (!store) {
    throw new UserError('Choose a pickup store before checking out.');
  }
  const productIds = [...new Set(input.items.map((item) => item.productId))];

  const products = await prisma.product.findMany({
    where: {
      businessId: business.id,
      active: true,
      storefrontPublished: true,
      id: { in: productIds },
    },
    select: {
      id: true,
      name: true,
      imageUrl: true,
      sellingPriceBasePence: true,
      vatRateBps: true,
      promoBuyQty: true,
      promoGetQty: true,
      productUnits: {
        select: {
          unitId: true,
          conversionToBase: true,
          sellingPricePence: true,
          unit: {
            select: {
              id: true,
              name: true,
              pluralName: true,
            },
          },
        },
      },
    },
  });

  const lineDetails = buildCheckoutLines(input.items, products, business.vatEnabled);
  const qtyByProduct = buildQtyByProductMap(lineDetails);

  const subtotalPence = lineDetails.reduce((sum, line) => sum + line.lineSubtotalPence, 0);
  const vatPence = lineDetails.reduce((sum, line) => sum + line.lineVatPence, 0);
  const totalPence = lineDetails.reduce((sum, line) => sum + line.lineTotalPence, 0);
  const publicToken = randomUUID();
  const orderNumber = await generateUniqueOnlineOrderRef(business.id);

  const order = await prisma.$transaction(async (tx) => {
    for (const [productId, qtyBase] of qtyByProduct.entries()) {
      const result = await tx.inventoryBalance.updateMany({
        where: {
          productId,
          storeId: store.id,
          qtyOnHandBase: { gte: qtyBase },
        },
        data: {
          qtyOnHandBase: { decrement: qtyBase },
        },
      });

      if (result.count === 0) {
        const product = products.find((candidate) => candidate.id === productId);
        throw new UserError(`${product?.name ?? 'An item'} is out of stock right now.`);
      }
    }

    // Resolve the customer link: prefer the explicit session customerId
    // when it really belongs to this business, otherwise opportunistically
    // attach by phone if an account exists. Anonymous orders stay unlinked.
    let resolvedCustomerId: string | null = null;
    if (input.customerId) {
      const sessionCustomer = await tx.storefrontCustomer.findFirst({
        where: { id: input.customerId, businessId: business.id },
        select: { id: true },
      });
      resolvedCustomerId = sessionCustomer?.id ?? null;
    }
    if (!resolvedCustomerId) {
      const matchByPhone = await tx.storefrontCustomer.findUnique({
        where: { businessId_phone: { businessId: business.id, phone: customerPhone } },
        select: { id: true },
      });
      resolvedCustomerId = matchByPhone?.id ?? null;
    }

    return tx.onlineOrder.create({
      data: {
        businessId: business.id,
        storeId: store.id,
        customerId: resolvedCustomerId,
        publicToken,
        orderNumber,
        customerName,
        customerPhone,
        customerEmail,
        customerNotes,
        subtotalPence,
        vatPence,
        totalPence,
        currency: business.currency,
        lines: {
          create: lineDetails.map((line) => ({
            productId: line.productId,
            unitId: line.unitId,
            productName: line.productName,
            unitName: line.unitName,
            imageUrl: line.imageUrl,
            qtyInUnit: line.qtyInUnit,
            conversionToBase: line.conversionToBase,
            qtyBase: line.qtyBase,
            unitPricePence: line.unitPricePence,
            lineSubtotalPence: line.lineSubtotalPence,
            lineVatPence: line.lineVatPence,
            lineTotalPence: line.lineTotalPence,
          })),
        },
      },
      select: {
        id: true,
        publicToken: true,
        orderNumber: true,
      },
    });
  });

  // Enqueue ORDER_RECEIVED SMS notification (soft-fail — never aborts checkout)
  await enqueueOrderNotificationSafe({ orderId: order.id, eventType: 'ORDER_RECEIVED' });

  if (input.sessionId) {
    recordStorefrontEvent({
      businessId: business.id,
      storeSlug: business.storefrontSlug,
      eventType: 'order_placed',
      sessionId: input.sessionId,
      metadata: { orderId: order.id },
    }).catch((eventError) => console.error('[storefront-event]', eventError));
  }

  // Manual reference flow: order is created in AWAITING_PAYMENT state. Customer
  // sends MoMo to the store's payout number using the order reference, then the
  // merchant confirms receipt in /online-orders to flip the status to PAID.
  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    publicToken: order.publicToken,
    redirectPath: `/shop/${business.storefrontSlug}/orders/${order.id}?token=${encodeURIComponent(order.publicToken)}`,
  };
}

export async function getPublicOnlineOrder(input: {
  slug: string;
  orderId: string;
  token: string;
}) {
  const slug = normalizeStorefrontSlug(input.slug);
  if (!slug || !input.orderId.trim() || !input.token.trim()) {
    return null;
  }

  const order = await prisma.onlineOrder.findFirst({
    where: {
      id: input.orderId,
      publicToken: input.token,
      business: {
        storefrontSlug: slug,
      },
    },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      fulfillmentStatus: true,
      fulfillmentMethod: true,
      customerName: true,
      customerPhone: true,
      customerEmail: true,
      customerNotes: true,
      subtotalPence: true,
      vatPence: true,
      totalPence: true,
      currency: true,
      createdAt: true,
      paidAt: true,
      fulfilledAt: true,
      paymentCollectionId: true,
      business: {
        select: {
          id: true,
          name: true,
          phone: true,
          storefrontPickupInstructions: true,
          storefrontSlug: true,
          logoUrl: true,
          logoWidth: true,
          logoHeight: true,
          brandCompactLogoUrl: true,
          brandCompactLogoWidth: true,
          brandCompactLogoHeight: true,
          brandSquareLogoUrl: true,
          brandSquareLogoWidth: true,
          brandSquareLogoHeight: true,
          brandInitials: true,
          brandPrimaryColor: true,
          brandCompactMode: true,
          brandLogoBackground: true,
          storefrontLogoUrl: true,
          receiptLogoUrl: true,
          storefrontPrimaryColor: true,
          storefrontTagline: true,
          storefrontMomoNumber: true,
          storefrontMomoNetwork: true,
          storefrontPaymentMode: true,
          storefrontMerchantShortcode: true,
          storefrontBankName: true,
          storefrontBankAccountName: true,
          storefrontBankAccountNumber: true,
          storefrontBankBranch: true,
          storefrontPaymentNote: true,
        },
      },
      store: {
        select: {
          id: true,
          name: true,
          address: true,
          phone: true,
        },
      },
      paymentCollection: {
        select: {
          id: true,
          status: true,
          providerStatus: true,
          providerReference: true,
          providerTransactionId: true,
          failureReason: true,
          updatedAt: true,
        },
      },
      lines: {
        orderBy: { createdAt: 'asc' },
        select: {
          id: true,
          productName: true,
          unitName: true,
          imageUrl: true,
          qtyInUnit: true,
          unitPricePence: true,
          lineTotalPence: true,
        },
      },
    },
  });

  if (!order || !order.business.storefrontSlug) {
    return null;
  }

  return {
    ...order,
    storefrontSlug: order.business.storefrontSlug,
    storefrontName: order.business.name,
    storefrontPhone: order.business.phone,
    pickupInstructions: order.business.storefrontPickupInstructions,
    branding: {
      logoUrl: order.business.storefrontLogoUrl ?? order.business.logoUrl ?? null,
      logoWidth: (order.business as any).logoWidth ?? null,
      logoHeight: (order.business as any).logoHeight ?? null,
      compactLogoUrl: order.business.brandCompactLogoUrl ?? null,
      compactLogoWidth: (order.business as any).brandCompactLogoWidth ?? null,
      compactLogoHeight: (order.business as any).brandCompactLogoHeight ?? null,
      squareLogoUrl: order.business.brandSquareLogoUrl ?? null,
      squareLogoWidth: (order.business as any).brandSquareLogoWidth ?? null,
      squareLogoHeight: (order.business as any).brandSquareLogoHeight ?? null,
      initials: order.business.brandInitials ?? null,
      brandPrimaryColor: order.business.brandPrimaryColor ?? null,
      compactMode: order.business.brandCompactMode ?? 'AUTO',
      logoBackground: order.business.brandLogoBackground ?? 'AUTO',
      primaryColor: order.business.storefrontPrimaryColor ?? null,
      accentColor: null,
      tagline: order.business.storefrontTagline ?? null,
    },
    momoPayoutNumber: order.business.storefrontMomoNumber,
    momoPayoutNetwork: order.business.storefrontMomoNetwork,
    paymentMode: order.business.storefrontPaymentMode ?? 'MOMO_NUMBER',
    merchantShortcode: order.business.storefrontMerchantShortcode,
    bankName: order.business.storefrontBankName,
    bankAccountName: order.business.storefrontBankAccountName,
    bankAccountNumber: order.business.storefrontBankAccountNumber,
    bankBranch: order.business.storefrontBankBranch,
    storeMessage: order.business.storefrontPaymentNote,
    pickupStoreName: order.store?.name ?? null,
    pickupStoreAddress: order.store?.address ?? null,
  };
}

function buildOrderLookupPhoneVariants(rawPhone: string) {
  const compact = rawPhone.replace(/\s+/g, '').trim();
  const digits = compact.replace(/\D/g, '');
  const normalizedIntl = digits.startsWith('233') ? digits : `233${digits.replace(/^0+/, '')}`;
  const normalizedLocal = normalizedIntl.startsWith('233') ? `0${normalizedIntl.slice(3)}` : digits;

  return [...new Set([compact, digits, normalizedIntl, `+${normalizedIntl}`, normalizedLocal].filter(Boolean))];
}

export async function getOrdersByPhone(slugInput: string, rawPhone: string) {
  const slug = normalizeStorefrontSlug(slugInput);
  if (!slug || !rawPhone.trim()) {
    return null;
  }

  const store = await prisma.business.findFirst({
    where: {
      storefrontSlug: slug,
      storefrontEnabled: true,
    },
    select: {
      name: true,
    },
  });

  if (!store) {
    return null;
  }

  const phoneVariants = buildOrderLookupPhoneVariants(rawPhone);

  const orders = await prisma.onlineOrder.findMany({
    where: {
      business: {
        storefrontSlug: slug,
      },
      OR: phoneVariants.flatMap((phone) => [
        { customerPhone: { equals: phone } },
        { customerPhone: { contains: phone } },
      ]),
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paymentStatus: true,
      totalPence: true,
      currency: true,
      createdAt: true,
      customerName: true,
      publicToken: true,
      lines: {
        select: {
          productName: true,
          qtyInUnit: true,
          unitName: true,
        },
        take: 3,
      },
    },
  });

  return {
    storeName: store.name,
    orders,
  };
}
