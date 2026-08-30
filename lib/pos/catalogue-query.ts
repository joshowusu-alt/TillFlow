import type { Prisma } from '@prisma/client';
import { normalizeBarcodeDigits } from '@/lib/payments/pos-weighed-barcode';
import { SELLABLE_PRODUCT_SELECT, clampPosSearchTake } from '@/lib/pos/sellable-dto';

export function posSearchWhere(businessId: string, q: string): Prisma.ProductWhereInput {
  const trimmed = q.trim();
  const where: Prisma.ProductWhereInput = { businessId, active: true };
  if (!trimmed) return where;

  const digits = normalizeBarcodeDigits(trimmed);
  const or: Prisma.ProductWhereInput[] = [
    { name: { contains: trimmed, mode: 'insensitive' } as any },
    { sku: { contains: trimmed, mode: 'insensitive' } as any },
    { barcode: { contains: trimmed } },
    { category: { name: { contains: trimmed, mode: 'insensitive' } as any } },
  ];
  if (digits && digits !== trimmed) {
    or.push({ barcode: { contains: digits } });
  }
  where.OR = or;
  return where;
}

export function posBarcodeWhere(businessId: string, code: string): Prisma.ProductWhereInput {
  const trimmed = code.trim();
  const digits = normalizeBarcodeDigits(trimmed);
  const barcodes = Array.from(new Set([trimmed, digits].filter(Boolean)));
  return {
    businessId,
    active: true,
    barcode: barcodes.length === 1 ? barcodes[0] : { in: barcodes },
  };
}

export { SELLABLE_PRODUCT_SELECT, clampPosSearchTake };
