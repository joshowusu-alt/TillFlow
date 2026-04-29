import { randomUUID } from 'crypto';
import { UserError } from '@/lib/action-utils';
import { getFeatures } from '@/lib/features';
import { prisma } from '@/lib/prisma';
import { buildQtyByProductMap, fetchInventoryMap, resolveEffectiveSellingPricePence, resolveProductUnitBaseValuePence } from '@/lib/services/shared';
import { initiateMobileMoneyCollection, normalizeAfricanMsisdn, currencyToDialCode } from '@/lib/services/mobile-money';
import { getOpenStatus, parseWeeklyHours, type OpenStatus } from '@/lib/business-hours';

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
  stores: StorefrontPickupStore[];
  products: Array<StorefrontCatalogProduct & { onHandByStore: Record<string, number> }>;
  openStatus: OpenStatus | null;
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
  network: 'MTN' | 'TELECEL' | 'AIRTELTIGO';
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
  return prisma.business.findFirst({
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
      storefrontHeadline: true,
      storefrontDescription: true,
      storefrontPickupInstructions: true,
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
  const products = await prisma.product.findMany({
    where: {
      businessId: business.id,
      active: true,
      storefrontPublished: true,
    },
    orderBy: { name: 'asc' },
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
      category: {
        select: {
          name: true,
        },
      },
      productUnits: {
        orderBy: [{ isBaseUnit: 'desc' }, { conversionToBase: 'asc' }],
        select: {
          unitId: true,
          isBaseUnit: true,
          conversionToBase: true,
          sellingPricePence: true,
          defaultCostPence: true,
          unit: {
            select: {
              id: true,
              name: true,
              pluralName: true,
            },
          },
        },
      },
      inventoryBalances: {
        where: {
          storeId: { in: storeIds },
        },
        select: {
          storeId: true,
          qtyOnHandBase: true,
        },
      },
    },
  });

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
    openStatus,
    stores: business.stores.map((store) => ({
      id: store.id,
      name: store.name,
      address: store.address,
      phone: store.phone,
    })),
    products: products.map((product) => {
      const onHandByStore: Record<string, number> = {};
      let totalOnHand = 0;
      for (const balance of product.inventoryBalances) {
        onHandByStore[balance.storeId] = balance.qtyOnHandBase;
        totalOnHand += balance.qtyOnHandBase;
      }
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
    }),
  };
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

  const customerName = input.customerName.trim();
  const rawCustomerPhone = input.customerPhone.trim();
  const customerEmail = input.customerEmail?.trim() ? input.customerEmail.trim() : null;
  const customerNotes = input.customerNotes?.trim() ? input.customerNotes.trim() : null;

  if (!customerName) {
    throw new UserError('Enter your name before checking out.');
  }
  if (!rawCustomerPhone) {
    throw new UserError('Enter your mobile money number before checking out.');
  }
  if (!input.items.length) {
    throw new UserError('Add at least one item to your cart.');
  }

  const customerPhone = normalizeAfricanMsisdn(rawCustomerPhone, currencyToDialCode(business.currency));
  if (!customerPhone || customerPhone.length < 10) {
    throw new UserError('Enter a valid mobile money number.');
  }

  const requestedStoreId = input.storeId?.trim() ?? '';
  const store = requestedStoreId
    ? business.stores.find((candidate) => candidate.id === requestedStoreId)
    : business.stores[0];
  if (!store) {
    throw new UserError('Choose a pickup store before checking out.');
  }
  const productIds = [...new Set(input.items.map((item) => item.productId))];

  const [products, inventoryMap] = await Promise.all([
    prisma.product.findMany({
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
    }),
    fetchInventoryMap(store.id, productIds),
  ]);

  const lineDetails = buildCheckoutLines(input.items, products, business.vatEnabled);
  const qtyByProduct = buildQtyByProductMap(lineDetails);

  for (const [productId, qtyBase] of qtyByProduct.entries()) {
    const onHand = inventoryMap.get(productId)?.qtyOnHandBase ?? 0;
    if (onHand < qtyBase) {
      const product = products.find((candidate) => candidate.id === productId);
      throw new UserError(`${product?.name ?? 'An item'} does not have enough stock right now.`);
    }
  }

  const subtotalPence = lineDetails.reduce((sum, line) => sum + line.lineSubtotalPence, 0);
  const vatPence = lineDetails.reduce((sum, line) => sum + line.lineVatPence, 0);
  const totalPence = lineDetails.reduce((sum, line) => sum + line.lineTotalPence, 0);
  const publicToken = randomUUID();
  const orderNumber = await generateUniqueOnlineOrderRef(business.id);

  const order = await prisma.onlineOrder.create({
    data: {
      businessId: business.id,
      storeId: store.id,
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
          storefrontMomoNumber: true,
          storefrontMomoNetwork: true,
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
    momoPayoutNumber: order.business.storefrontMomoNumber,
    momoPayoutNetwork: order.business.storefrontMomoNetwork,
    pickupStoreName: order.store?.name ?? null,
    pickupStoreAddress: order.store?.address ?? null,
  };
}
