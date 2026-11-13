import { prisma } from '@/lib/prisma';
import { UserError } from '@/lib/action-utils';
import { isFoodBusiness } from '@/lib/food/business';
import { normalizeDishDraft, type DishDraft } from '@/lib/food/dish-draft';
import { createProduct } from '@/lib/services/products';

async function plateUnitId() {
  const existing = await prisma.unit.findFirst({
    where: { name: 'Plate' },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.unit.create({
    data: { name: 'Plate', pluralName: 'Plates', symbol: 'plate' },
    select: { id: true },
  });
  return created.id;
}

export async function saveDish(input: { businessId: string; draft: DishDraft }) {
  const business = await prisma.business.findUnique({
    where: { id: input.businessId },
    select: { businessCategory: true },
  });
  if (!isFoodBusiness(business?.businessCategory)) {
    throw new UserError('Dishes can only be added for a food business.');
  }

  let normalized;
  try {
    normalized = normalizeDishDraft(input.draft);
  } catch (error) {
    throw new UserError(error instanceof Error ? error.message : 'Check the dish and try again.');
  }

  const productId = input.draft.productId?.trim() || null;
  const unitId = await plateUnitId();

  return prisma.$transaction(async (tx) => {
    let id = productId;
    if (id) {
      const existing = await tx.product.findFirst({
        where: { id, businessId: input.businessId },
        select: { id: true },
      });
      if (!existing) throw new UserError('Dish not found.');
      await tx.product.update({
        where: { id },
        data: {
          name: normalized.name,
          sellingPriceBasePence: normalized.startingPricePence,
          defaultCostBasePence: normalized.estimatedCostPence,
          storefrontDescription: normalized.description,
          storefrontPublished: normalized.showOnline,
          reorderPointBase: normalized.lowAt,
          active: true,
        },
      });
    } else {
      const created = await createProduct(
        input.businessId,
        {
          name: normalized.name,
          sku: null,
          barcode: null,
          categoryId: null,
          imageUrl: null,
          sellingPriceBasePence: normalized.startingPricePence,
          defaultCostBasePence: normalized.estimatedCostPence,
          minimumMarginThresholdBps: null,
          vatRateBps: 0,
          promoBuyQty: 0,
          promoGetQty: 0,
          baseUnitId: unitId,
          packagingUnitId: '',
          packagingConversion: 1,
          unitConfigs: [{ unitId, conversionToBase: 1, isBaseUnit: true }],
        },
        tx,
      );
      id = created.id;
      await tx.product.update({
        where: { id },
        data: {
          storefrontDescription: normalized.description,
          storefrontPublished: normalized.showOnline,
          reorderPointBase: normalized.lowAt,
        },
      });
    }

    await tx.foodDish.deleteMany({ where: { productId: id, businessId: input.businessId } });
    await tx.foodDish.create({
      data: {
        businessId: input.businessId,
        productId: id,
        stockMode: normalized.stockMode,
        soldOut: normalized.soldOut,
        lowAt: normalized.lowAt,
        sizes: {
          create: normalized.sizes.map((size, index) => ({
            name: size.name,
            pricePence: size.pricePence,
            isDefault: size.isDefault,
            sortOrder: index,
          })),
        },
        inclusions: {
          create: normalized.inclusions.map((item, index) => ({
            name: item.name,
            qty: item.qty,
            stockPortions: item.stockPortions,
            sortOrder: index,
          })),
        },
        groups: {
          create: normalized.groups.map((group, index) => ({
            name: group.name,
            selection: group.selection,
            required: group.required,
            sortOrder: index,
            addons: {
              create: group.addons.map((addon, addonIndex) => ({
                name: addon.name,
                pricePence: addon.pricePence,
                maxQty: addon.maxQty,
                stockPortions: addon.stockPortions,
                sortOrder: addonIndex,
              })),
            },
          })),
        },
      },
    });
    return { id, name: normalized.name };
  });
}
