import { prisma } from '@/lib/prisma';
import { loadHistoricalCostPreview } from './historical-cost-preview-load';

export const COST_RESOLUTION_BATCH_SIZE = 5;

/** Bounded, read-only bulk review. Every candidate is independently re-proven. */
export async function loadCostResolutionBatch(businessId: string, after: string | undefined, review: boolean) {
  const where = {
    store: { businessId },
    product: { businessId, foodDish: { is: null } },
    qtyOnHandBase: { gt: 0 },
    OR: [{ knownValuePence: null }, { unvaluedQtyBase: null }, { unvaluedQtyBase: { not: 0 } }],
  };
  const [total, balances] = await Promise.all([
    prisma.inventoryBalance.count({where}),
    prisma.inventoryBalance.findMany({
      where: { ...where, ...(after ? {id:{gt:after}} : {}) },
      orderBy: {id:'asc'}, take:COST_RESOLUTION_BATCH_SIZE+1,
      select: {id:true,productId:true,storeId:true,qtyOnHandBase:true,product:{select:{name:true}},store:{select:{name:true}}},
    }),
  ]);
  const page = balances.slice(0,COST_RESOLUTION_BATCH_SIZE);
  const rows = await Promise.all(page.map(async row => {
    if (!review) return {...row, preview: null};
    try {
      const preview = await loadHistoricalCostPreview(businessId,row.productId,row.storeId);
      return {...row,preview:preview?.result ?? {status:'BLOCKED' as const,reason:'The stock record no longer belongs to the selected business or branch.'}};
    } catch {
      return {...row,preview:{status:'BLOCKED' as const,reason:'Evidence could not be reviewed. Retry this batch or review the product manually.'}};
    }
  }));
  return {total,rows,next:balances.length>page.length?page[page.length-1].id:null};
}
