'use server';

import { audit } from '@/lib/audit';
import { type ActionResult, err, ok, safeAction, withBusinessContext } from '@/lib/action-utils';
import { detectBarcodeFormat } from '@/lib/labels/detect-barcode-format';
import { renderLabelsHtml } from '@/lib/labels/templates';
import type { LabelData, LabelSize } from '@/lib/labels/types';
import { prisma } from '@/lib/prisma';

const MAX_PRODUCTS_PER_REQUEST = 200;
const LABEL_TEMPLATES: LabelSize[] = ['SHELF_TAG', 'PRODUCT_STICKER', 'A4_SHEET'];

export interface LabelGenerationInput {
  products: Array<{
    productId: string;
    quantity: number;
  }>;
  template: LabelSize;
}

export interface LabelGenerationResult {
  html: string;
  labelCount: number;
}

function isLabelTemplate(value: string): value is LabelSize {
  return LABEL_TEMPLATES.includes(value as LabelSize);
}

function normalizeSelections(input: LabelGenerationInput['products']) {
  return input
    .filter((item) => item && typeof item.productId === 'string')
    .map((item) => ({
      productId: item.productId.trim(),
      quantity: Math.max(1, Math.min(500, Math.floor(Number(item.quantity) || 1))),
    }))
    .filter((item) => item.productId.length > 0);
}

export async function generateLabelsHtmlAction(
  input: LabelGenerationInput,
): Promise<ActionResult<LabelGenerationResult>> {
  return safeAction(async () => {
    const { user, businessId } = await withBusinessContext(['CASHIER', 'MANAGER', 'OWNER']);

    if (!input || !isLabelTemplate(String(input.template))) {
      return err('Choose a valid label template before generating labels.');
    }

    const selectedProducts = normalizeSelections(Array.isArray(input.products) ? input.products : []);
    if (selectedProducts.length === 0) {
      return err('Select at least one product to generate labels.');
    }

    if (selectedProducts.length > MAX_PRODUCTS_PER_REQUEST) {
      return err(`You can print up to ${MAX_PRODUCTS_PER_REQUEST} products at a time.`);
    }

    const uniqueProductIds = [...new Set(selectedProducts.map((item) => item.productId))];
    const [business, products] = await Promise.all([
      prisma.business.findUnique({
        where: { id: businessId },
        select: { currency: true },
      }),
      prisma.product.findMany({
        where: {
          businessId,
          active: true,
          id: { in: uniqueProductIds },
        },
        select: {
          id: true,
          name: true,
          barcode: true,
          sku: true,
          sellingPriceBasePence: true,
          category: {
            select: {
              name: true,
            },
          },
          productUnits: {
            where: { isBaseUnit: true },
            take: 1,
            select: {
              unit: {
                select: {
                  name: true,
                  symbol: true,
                },
              },
            },
          },
        },
      }),
    ]);

    if (!business) {
      return err('Business settings could not be loaded.');
    }

    if (products.length !== uniqueProductIds.length) {
      return err('One or more selected products could not be loaded for label printing.');
    }

    const currency = business.currency?.trim() || 'GHS';
    const today = new Date().toISOString().slice(0, 10);
    const productMap = new Map(products.map((product) => [product.id, product]));

    const items: Array<{ data: LabelData; quantity: number }> = selectedProducts.map((selection) => {
      const product = productMap.get(selection.productId);
      if (!product) {
        throw new Error('A selected product is no longer available.');
      }

      const barcode = product.barcode?.trim() || undefined;
      const baseUnit = product.productUnits[0]?.unit;

      return {
        data: {
          productName: product.name,
          price: `${currency} ${(product.sellingPriceBasePence / 100).toFixed(2)}`,
          barcode,
          barcodeFormat: detectBarcodeFormat(barcode),
          sku: product.sku ?? undefined,
          unit: baseUnit?.symbol ?? baseUnit?.name ?? undefined,
          category: product.category?.name ?? undefined,
          date: today,
          currency,
        },
        quantity: selection.quantity,
      };
    });

    const html = await renderLabelsHtml(items, input.template);
    const labelCount = selectedProducts.reduce((sum, item) => sum + item.quantity, 0);

    audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'LABEL_EXPORT',
      entity: 'Product',
      entityId: selectedProducts.length === 1 ? selectedProducts[0].productId : 'bulk',
      details: {
        template: input.template,
        productCount: selectedProducts.length,
        labelCount,
      },
    }).catch((auditError) => console.error('[audit]', auditError));

    return ok({ html, labelCount });
  });
}
