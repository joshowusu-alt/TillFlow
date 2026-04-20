'use server';

import { redirect } from 'next/navigation';
import { revalidatePath, revalidateTag } from 'next/cache';
import { audit } from '@/lib/audit';
import { ok, safeAction, UserError, withBusinessContext } from '@/lib/action-utils';
import { formString } from '@/lib/form-helpers';
import { prisma } from '@/lib/prisma';
import { buildInvoiceGrossMarginMap } from '@/lib/services/targeted-sale-cost-corrections';

const TARGETED_SALE_COST_CORRECTION_PATH = '/settings/data-repair/sale-cost-corrections';
const PRESERVED_FILTER_KEYS = ['q', 'status', 'period', 'from', 'to'] as const;

function buildReturnUrl(formData: FormData, extras?: Record<string, string>) {
  const params = new URLSearchParams();

  for (const key of PRESERVED_FILTER_KEYS) {
    const value = formString(formData, key);
    if (value) params.set(key, value);
  }

  Object.entries(extras ?? {}).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  const query = params.toString();
  return query ? `${TARGETED_SALE_COST_CORRECTION_PATH}?${query}` : TARGETED_SALE_COST_CORRECTION_PATH;
}

export async function correctTargetedSaleCostsAction(formData: FormData): Promise<void> {
  const result = await safeAction(async () => {
    const { businessId, user } = await withBusinessContext(['OWNER']);
    const reason = formString(formData, 'reason');
    const confirmed = formData.get('confirmCorrection') === 'on';
    const lineIds = [...new Set(formData.getAll('lineIds').map((value) => String(value).trim()).filter(Boolean))];

    if (!lineIds.length) {
      throw new UserError('Select at least one affected sale line to correct.');
    }
    if (!reason) {
      throw new UserError('Enter a correction reason before applying the update.');
    }
    if (!confirmed) {
      throw new UserError('Confirm that the receipt totals were correct before applying the cost correction.');
    }

    const selectedLines = await prisma.salesInvoiceLine.findMany({
      where: {
        id: { in: lineIds },
        salesInvoice: {
          businessId,
          paymentStatus: { notIn: ['RETURNED', 'VOID'] },
        },
      },
      select: {
        id: true,
        salesInvoiceId: true,
        productId: true,
        qtyBase: true,
        lineCostPence: true,
        lineSubtotalPence: true,
        salesInvoice: {
          select: {
            id: true,
            transactionNumber: true,
          },
        },
        product: {
          select: {
            name: true,
            defaultCostBasePence: true,
          },
        },
      },
    });

    if (selectedLines.length !== lineIds.length) {
      throw new UserError('Some selected sale lines could not be loaded. Refresh the page and try again.');
    }

    // Look up the existing SALE movement cost for each invoice+product pair.
    // When a movement already has a real cost we use that as the correction value —
    // it is the stable historical anchor that the page uses for the needsCorrection check.
    // This keeps the page and the action in perfect agreement about what "corrected" means.
    const selectedInvoiceIds = [...new Set(selectedLines.map((l) => l.salesInvoiceId))];
    const selectedProductIds = [...new Set(selectedLines.map((l) => l.productId))];
    const existingMovements = await prisma.stockMovement.findMany({
      where: {
        referenceType: 'SALES_INVOICE',
        referenceId: { in: selectedInvoiceIds },
        productId: { in: selectedProductIds },
        type: 'SALE',
        unitCostBasePence: { gt: 0 },
      },
      select: {
        referenceId: true,
        productId: true,
        unitCostBasePence: true,
      },
    });
    const existingMovementCostMap = new Map<string, number>();
    for (const m of existingMovements) {
      const cost = m.unitCostBasePence ?? 0;
      if (cost > 0) {
        const key = `${m.referenceId}:${m.productId}`;
        if (!existingMovementCostMap.has(key)) {
          existingMovementCostMap.set(key, cost);
        }
      }
    }

    const corrections = selectedLines
      .map((line) => {
        const movementCost = existingMovementCostMap.get(`${line.salesInvoiceId}:${line.productId}`);
        // Use the stable movement cost when available; fall back to the product's current default.
        const correctedUnitCostBasePence =
          movementCost != null && movementCost > 0
            ? movementCost
            : line.product.defaultCostBasePence;
        return {
          id: line.id,
          salesInvoiceId: line.salesInvoiceId,
          productId: line.productId,
          productName: line.product.name,
          transactionNumber: line.salesInvoice.transactionNumber,
          previousLineCostPence: line.lineCostPence,
          correctedUnitCostBasePence,
          correctedLineCostPence: correctedUnitCostBasePence * line.qtyBase,
        };
      })
      .filter((line) => line.previousLineCostPence !== line.correctedLineCostPence);

    if (!corrections.length) {
      throw new UserError('All selected sale lines already match the recorded movement cost.');
    }

    const affectedInvoiceIds = [...new Set(corrections.map((line) => line.salesInvoiceId))];
    const movementUpdates = [...new Map(
      corrections.map((line) => [
        `${line.salesInvoiceId}:${line.productId}`,
        {
          salesInvoiceId: line.salesInvoiceId,
          productId: line.productId,
          unitCostBasePence: line.correctedUnitCostBasePence,
        },
      ]),
    ).values()];

    await prisma.$transaction(async (tx) => {
      for (const correction of corrections) {
        await tx.salesInvoiceLine.update({
          where: { id: correction.id },
          data: { lineCostPence: correction.correctedLineCostPence },
        });
      }

      for (const movement of movementUpdates) {
        await tx.stockMovement.updateMany({
          where: {
            referenceType: 'SALES_INVOICE',
            referenceId: movement.salesInvoiceId,
            productId: movement.productId,
            type: 'SALE',
          },
          data: { unitCostBasePence: movement.unitCostBasePence },
        });
      }

      const refreshedLines = await tx.salesInvoiceLine.findMany({
        where: { salesInvoiceId: { in: affectedInvoiceIds } },
        select: {
          salesInvoiceId: true,
          lineSubtotalPence: true,
          lineCostPence: true,
        },
      });

      const grossMarginMap = buildInvoiceGrossMarginMap(refreshedLines);
      for (const [salesInvoiceId, grossMarginPence] of grossMarginMap.entries()) {
        await tx.salesInvoice.update({
          where: { id: salesInvoiceId },
          data: { grossMarginPence },
        });
      }
    });

    await audit({
      businessId,
      userId: user.id,
      userName: user.name,
      userRole: user.role,
      action: 'PRICE_REPAIR',
      entity: 'SalesInvoiceLine',
      details: {
        source: 'current-product-cost',
        lineCount: corrections.length,
        invoiceCount: affectedInvoiceIds.length,
        reason,
        receipts: corrections
          .map((line) => line.transactionNumber ?? line.salesInvoiceId)
          .slice(0, 25),
      },
    }).catch(() => {});

    revalidateTag('reports');
    revalidatePath('/reports', 'layout');
    revalidatePath('/sales');
    revalidatePath('/settings/data-repair');
    revalidatePath(TARGETED_SALE_COST_CORRECTION_PATH);
    for (const invoiceId of affectedInvoiceIds) {
      revalidatePath(`/receipts/${invoiceId}`);
    }

    return ok({ updated: corrections.length, invoiceCount: affectedInvoiceIds.length });
  });

  if (!result.success) {
    redirect(buildReturnUrl(formData, { error: result.error }));
  }

  redirect(
    buildReturnUrl(formData, {
      updated: String(result.data.updated),
      invoices: String(result.data.invoiceCount),
    }),
  );
}