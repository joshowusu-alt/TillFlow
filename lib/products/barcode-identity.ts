type Identity = { barcode?: string | null; additionalBarcodes?: string[] };

export function aliasCodes(input: Identity): string[] {
  return [...new Set((input.additionalBarcodes ?? []).map(code => code.trim()).filter(code => code && code !== input.barcode?.trim()))];
}

export async function assertAvailableBarcodes(db: any, businessId: string, input: Identity, excludeId?: string) {
  const codes = [...new Set([input.barcode?.trim(), ...aliasCodes(input)].filter(Boolean))] as string[];
  if (!codes.length) return;
  if (codes.length > 50) throw new Error("Use at most 50 barcodes for one product.");
  if (codes.some(code => code.length > 100 || /[\r\n\t]/.test(code))) throw new Error('Barcodes must contain 1–100 characters without control characters.');
  const conflict = await db.product.findFirst({
    where: { businessId, ...(excludeId ? { id: { not: excludeId } } : {}), OR: [{ barcode: { in: codes } }, { barcodes: { some: { code: { in: codes } } } }] },
    select: { id: true },
  });
  if (conflict) throw new Error('A barcode is already assigned to another product in this business.');
}

export function productDisplayName(product: { name: string; publisher?: string | null; edition?: string | null }) {
  return [product.name, product.publisher, product.edition].filter(Boolean).join(' · ');
}
