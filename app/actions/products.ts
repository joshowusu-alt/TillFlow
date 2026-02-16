'use server';

import { prisma } from '@/lib/prisma';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';
import { formString, formOptionalString, formInt } from '@/lib/form-helpers';
import {
  withBusinessContext,
  formAction,
  safeAction,
  ok,
  err,
  type ActionResult
} from '@/lib/action-utils';
import { audit } from '@/lib/audit';

// ---------------------------------------------------------------------------
// Shared helpers (private to this module)
// ---------------------------------------------------------------------------

/** Check for a case-insensitive duplicate product name. */
async function hasDuplicateName(businessId: string, name: string, excludeId?: string) {
  const rows = excludeId
    ? await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM Product
        WHERE businessId = ${businessId}
          AND lower(name) = lower(${name})
          AND id <> ${excludeId}
        LIMIT 1`
    : await prisma.$queryRaw<{ id: string }[]>`
        SELECT id FROM Product
        WHERE businessId = ${businessId}
          AND lower(name) = lower(${name})
        LIMIT 1`;
  return rows.length > 0;
}

/** Build the productUnits `create` array from base + optional packaging unit. */
function buildUnitCreates(
  baseUnitId: string,
  packagingUnitId: string,
  packagingConversion: number
) {
  return [
    { unitId: baseUnitId, isBaseUnit: true, conversionToBase: 1 },
    packagingUnitId && packagingConversion > 1 && packagingUnitId !== baseUnitId
      ? { unitId: packagingUnitId, isBaseUnit: false, conversionToBase: packagingConversion }
      : null
  ].filter(Boolean) as { unitId: string; isBaseUnit: boolean; conversionToBase: number }[];
}

/** Extract the common product fields from FormData. */
function parseProductFields(formData: FormData) {
  return {
    name: formString(formData, 'name'),
    sku: formString(formData, 'sku') || null,
    barcode: formString(formData, 'barcode') || null,
    categoryId: formOptionalString(formData, 'categoryId') || null,
    imageUrl: formOptionalString(formData, 'imageUrl') || null,
    sellingPriceBasePence: formInt(formData, 'sellingPriceBasePence'),
    defaultCostBasePence: formInt(formData, 'defaultCostBasePence'),
    vatRateBps: formInt(formData, 'vatRateBps'),
    promoBuyQty: formInt(formData, 'promoBuyQty'),
    promoGetQty: formInt(formData, 'promoGetQty'),
    baseUnitId: formString(formData, 'baseUnitId'),
    packagingUnitId: formString(formData, 'packagingUnitId'),
    packagingConversion: formInt(formData, 'packagingConversion')
  };
}

// ---------------------------------------------------------------------------
// Actions
// ---------------------------------------------------------------------------

export async function createProductAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);
    const fields = parseProductFields(formData);

    if (await hasDuplicateName(businessId, fields.name)) {
      redirect('/products?error=duplicate-name');
    }

    const product = await prisma.product.create({
      data: {
        businessId,
        name: fields.name,
        sku: fields.sku,
        barcode: fields.barcode,
        categoryId: fields.categoryId,
        imageUrl: fields.imageUrl,
        sellingPriceBasePence: fields.sellingPriceBasePence,
        defaultCostBasePence: fields.defaultCostBasePence,
        vatRateBps: fields.vatRateBps,
        promoBuyQty: fields.promoBuyQty,
        promoGetQty: fields.promoGetQty,
        productUnits: {
          create: buildUnitCreates(fields.baseUnitId, fields.packagingUnitId, fields.packagingConversion)
        }
      }
    });

    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PRODUCT_CREATE', entity: 'Product', entityId: product.id, details: { name: fields.name, price: fields.sellingPriceBasePence } });

    redirect('/products');
  });
}

export async function updateProductAction(formData: FormData): Promise<void> {
  return formAction(async () => {
    const { user, businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const id = formString(formData, 'id');
    if (!id) redirect('/products');

    const fields = parseProductFields(formData);

    if (await hasDuplicateName(businessId, fields.name, id)) {
      redirect(`/products/${id}?error=duplicate-name`);
    }

    await prisma.$transaction(async (tx) => {
      await tx.product.update({
        where: { id },
        data: {
          name: fields.name,
          sku: fields.sku,
          barcode: fields.barcode,
          categoryId: fields.categoryId,
          imageUrl: fields.imageUrl,
          sellingPriceBasePence: fields.sellingPriceBasePence,
          defaultCostBasePence: fields.defaultCostBasePence,
          vatRateBps: fields.vatRateBps,
          promoBuyQty: fields.promoBuyQty,
          promoGetQty: fields.promoGetQty
        }
      });

      const existingUnits = await tx.productUnit.findMany({ where: { productId: id } });

      if (fields.baseUnitId) {
        const baseUnit = existingUnits.find((u) => u.unitId === fields.baseUnitId);
        if (baseUnit) {
          await tx.productUnit.update({
            where: { id: baseUnit.id },
            data: { isBaseUnit: true, conversionToBase: 1 }
          });
        } else {
          await tx.productUnit.create({
            data: { productId: id, unitId: fields.baseUnitId, isBaseUnit: true, conversionToBase: 1 }
          });
        }
        await tx.productUnit.updateMany({
          where: { productId: id, unitId: { not: fields.baseUnitId } },
          data: { isBaseUnit: false }
        });
      }

      if (
        fields.packagingUnitId &&
        fields.packagingConversion > 1 &&
        fields.packagingUnitId !== fields.baseUnitId
      ) {
        const packagingUnit = existingUnits.find((u) => u.unitId === fields.packagingUnitId);
        if (packagingUnit) {
          await tx.productUnit.update({
            where: { id: packagingUnit.id },
            data: { isBaseUnit: false, conversionToBase: fields.packagingConversion }
          });
        } else {
          await tx.productUnit.create({
            data: {
              productId: id,
              unitId: fields.packagingUnitId,
              isBaseUnit: false,
              conversionToBase: fields.packagingConversion
            }
          });
        }
        await tx.productUnit.deleteMany({
          where: { productId: id, isBaseUnit: false, unitId: { not: fields.packagingUnitId } }
        });
      } else {
        await tx.productUnit.deleteMany({ where: { productId: id, isBaseUnit: false } });
      }
    });

    await audit({ businessId, userId: user.id, userName: user.name, userRole: user.role, action: 'PRODUCT_UPDATE', entity: 'Product', entityId: id, details: { name: fields.name, price: fields.sellingPriceBasePence } });

    redirect(`/products/${id}`);
  });
}

export async function quickCreateProductAction(input: {
  name: string;
  sku?: string | null;
  barcode?: string | null;
  sellingPriceBasePence: number;
  defaultCostBasePence: number;
  vatRateBps: number;
  baseUnitId: string;
  packagingUnitId?: string | null;
  packagingConversion?: number | null;
}) {
  return safeAction(async () => {
    const { businessId } = await withBusinessContext(['MANAGER', 'OWNER']);

    const name = input.name.trim();
    if (!name) return err('Product name is required.');

    if (await hasDuplicateName(businessId, name)) {
      return err('A product with that name already exists.');
    }

    if (input.barcode) {
      const dup = await prisma.product.findFirst({
        where: { businessId, barcode: input.barcode }
      });
      if (dup) return err('That barcode is already in use.');
    }

    try {
      const created = await prisma.product.create({
        data: {
          businessId,
          name,
          sku: input.sku ?? null,
          barcode: input.barcode ?? null,
          sellingPriceBasePence: input.sellingPriceBasePence,
          defaultCostBasePence: input.defaultCostBasePence,
          vatRateBps: input.vatRateBps,
          productUnits: {
            create: buildUnitCreates(
              input.baseUnitId,
              input.packagingUnitId ?? '',
              input.packagingConversion ?? 0
            )
          }
        },
        include: { productUnits: { include: { unit: true } } }
      });

      return ok({
        id: created.id,
        name: created.name,
        barcode: created.barcode,
        defaultCostBasePence: created.defaultCostBasePence,
        sellingPriceBasePence: created.sellingPriceBasePence,
        vatRateBps: created.vatRateBps,
        promoBuyQty: created.promoBuyQty,
        promoGetQty: created.promoGetQty,
        onHandBase: 0,
        units: created.productUnits.map((pu) => ({
          id: pu.unitId,
          name: pu.unit.name,
          pluralName: pu.unit.pluralName,
          conversionToBase: pu.conversionToBase,
          isBaseUnit: pu.isBaseUnit
        }))
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return err('Product already exists with the same name or barcode.');
      }
      throw error;
    }
  });
}

/**
 * Soft-delete a product by setting active = false.
 * Only OWNER can delete products.
 */
export async function deleteProductAction(productId: string): Promise<ActionResult<{ message: string }>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['OWNER']);

    const product = await prisma.product.findFirst({
      where: { id: productId, businessId },
    });
    if (!product) return err('Product not found.');

    await prisma.product.update({
      where: { id: productId },
      data: { active: false },
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRODUCT_DELETE',
      entity: 'Product',
      entityId: productId,
      details: { name: product.name },
    });

    return ok({ message: `"${product.name}" has been deactivated.` });
  });
}
