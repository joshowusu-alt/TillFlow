import type { Prisma } from '@prisma/client';
import { FOOD_BUSINESS_CATEGORY } from './business';

// A snapshot still identifies the dish after it is archived or renamed.
export const foodDishSaleLine: Prisma.SalesInvoiceLineWhereInput = {
  salesInvoice: { business: { businessCategory: FOOD_BUSINESS_CATEGORY } },
  OR: [{ plateSnapshotJson: { not: null } }, { product: { foodDish: { isNot: null } } }],
};
