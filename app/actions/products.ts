'use server';

import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { Prisma } from '@prisma/client';

const toInt = (value: FormDataEntryValue | null) => {
  if (value === null) return 0;
  const parsed = parseInt(String(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

export async function createProductAction(formData: FormData) {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const name = String(formData.get('name') || '').trim();
  const sku = String(formData.get('sku') || '') || null;
  const barcode = String(formData.get('barcode') || '') || null;
  const sellingPriceBasePence = toInt(formData.get('sellingPriceBasePence'));
  const defaultCostBasePence = toInt(formData.get('defaultCostBasePence'));
  const vatRateBps = toInt(formData.get('vatRateBps'));
  const promoBuyQty = toInt(formData.get('promoBuyQty'));
  const promoGetQty = toInt(formData.get('promoGetQty'));
  const baseUnitId = String(formData.get('baseUnitId') || '');
  const packagingUnitId = String(formData.get('packagingUnitId') || '');
  const packagingConversion = toInt(formData.get('packagingConversion'));

  const duplicate = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM Product
    WHERE businessId = ${business.id}
      AND lower(name) = lower(${name})
    LIMIT 1
  `;
  if (duplicate.length > 0) {
    redirect('/products?error=duplicate-name');
  }

  await prisma.product.create({
    data: {
      businessId: business.id,
      name,
      sku,
      barcode,
      sellingPriceBasePence,
      defaultCostBasePence,
      vatRateBps,
      promoBuyQty,
      promoGetQty,
      productUnits: {
        create: [
          {
            unitId: baseUnitId,
            isBaseUnit: true,
            conversionToBase: 1
          },
          packagingUnitId && packagingConversion > 1 && packagingUnitId !== baseUnitId
            ? {
                unitId: packagingUnitId,
                isBaseUnit: false,
                conversionToBase: packagingConversion
              }
            : null
        ].filter(Boolean) as any
      }
    }
  });

  redirect('/products');
}

export async function updateProductAction(formData: FormData) {
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) redirect('/settings');

  const id = String(formData.get('id') || '');
  if (!id) redirect('/products');

  const name = String(formData.get('name') || '').trim();
  const sku = String(formData.get('sku') || '') || null;
  const barcode = String(formData.get('barcode') || '') || null;
  const sellingPriceBasePence = toInt(formData.get('sellingPriceBasePence'));
  const defaultCostBasePence = toInt(formData.get('defaultCostBasePence'));
  const vatRateBps = toInt(formData.get('vatRateBps'));
  const promoBuyQty = toInt(formData.get('promoBuyQty'));
  const promoGetQty = toInt(formData.get('promoGetQty'));
  const baseUnitId = String(formData.get('baseUnitId') || '');
  const packagingUnitId = String(formData.get('packagingUnitId') || '');
  const packagingConversion = toInt(formData.get('packagingConversion'));

  const duplicate = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM Product
    WHERE businessId = ${business.id}
      AND lower(name) = lower(${name})
      AND id <> ${id}
    LIMIT 1
  `;
  if (duplicate.length > 0) {
    redirect(`/products/${id}?error=duplicate-name`);
  }

  await prisma.$transaction(async (tx) => {
    await tx.product.update({
      where: { id },
      data: {
        name,
        sku,
        barcode,
        sellingPriceBasePence,
        defaultCostBasePence,
        vatRateBps,
        promoBuyQty,
        promoGetQty
      }
    });

    const existingUnits = await tx.productUnit.findMany({ where: { productId: id } });

    if (baseUnitId) {
      const baseUnit = existingUnits.find((unit) => unit.unitId === baseUnitId);
      if (baseUnit) {
        await tx.productUnit.update({
          where: { id: baseUnit.id },
          data: { isBaseUnit: true, conversionToBase: 1 }
        });
      } else {
        await tx.productUnit.create({
          data: {
            productId: id,
            unitId: baseUnitId,
            isBaseUnit: true,
            conversionToBase: 1
          }
        });
      }

      await tx.productUnit.updateMany({
        where: { productId: id, unitId: { not: baseUnitId } },
        data: { isBaseUnit: false }
      });
    }

    if (packagingUnitId && packagingConversion > 1 && packagingUnitId !== baseUnitId) {
      const packagingUnit = existingUnits.find((unit) => unit.unitId === packagingUnitId);
      if (packagingUnit) {
        await tx.productUnit.update({
          where: { id: packagingUnit.id },
          data: { isBaseUnit: false, conversionToBase: packagingConversion }
        });
      } else {
        await tx.productUnit.create({
          data: {
            productId: id,
            unitId: packagingUnitId,
            isBaseUnit: false,
            conversionToBase: packagingConversion
          }
        });
      }

      await tx.productUnit.deleteMany({
        where: { productId: id, isBaseUnit: false, unitId: { not: packagingUnitId } }
      });
    } else {
      await tx.productUnit.deleteMany({ where: { productId: id, isBaseUnit: false } });
    }
  });

  redirect(`/products/${id}`);
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
  await requireRole(['MANAGER', 'OWNER']);
  const business = await prisma.business.findFirst();
  if (!business) {
    throw new Error('Business not found.');
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error('Product name is required.');
  }

  const duplicateName = await prisma.$queryRaw<{ id: string }[]>`
    SELECT id FROM Product
    WHERE businessId = ${business.id}
      AND lower(name) = lower(${name})
    LIMIT 1
  `;
  if (duplicateName.length > 0) {
    throw new Error('A product with that name already exists.');
  }

  if (input.barcode) {
    const duplicateBarcode = await prisma.product.findFirst({
      where: { businessId: business.id, barcode: input.barcode }
    });
    if (duplicateBarcode) {
      throw new Error('That barcode is already in use.');
    }
  }

  try {
    const created = await prisma.product.create({
      data: {
        businessId: business.id,
        name,
        sku: input.sku ?? null,
        barcode: input.barcode ?? null,
        sellingPriceBasePence: input.sellingPriceBasePence,
        defaultCostBasePence: input.defaultCostBasePence,
        vatRateBps: input.vatRateBps,
        productUnits: {
          create: [
            {
              unitId: input.baseUnitId,
              isBaseUnit: true,
              conversionToBase: 1
            },
            input.packagingUnitId &&
            input.packagingConversion &&
            input.packagingConversion > 1 &&
            input.packagingUnitId !== input.baseUnitId
              ? {
                  unitId: input.packagingUnitId,
                  isBaseUnit: false,
                  conversionToBase: input.packagingConversion
                }
              : null
          ].filter(Boolean) as any
        }
      },
      include: { productUnits: { include: { unit: true } } }
    });

    return {
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
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new Error('Product already exists with the same name or barcode.');
    }
    throw error;
  }
}
