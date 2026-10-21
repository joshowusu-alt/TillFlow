/** Prices and adjustments use integer minor units; percentage inputs have at most two decimals. */
export const BULK_PRICING_LIMIT = 200;
export const MAX_PRICE_PENCE = 2_147_483_647;
export class BulkPricingError extends Error {}
export type BulkPricingInput = {
  categoryId: string; divisionId: string; groupId: string; search: string;
  basis: 'SELLING_PRICE' | 'CATALOGUE_COST';
  operation: 'INCREASE' | 'DECREASE';
  method: 'PERCENT' | 'AMOUNT'; value: string; decimals: 0 | 1 | 2;
  units: 'BASE_ONLY' | 'ALL_UNITS';
};
export type BulkPriceLine = {
  id: string; label: string; before: number; after: number;
  beforeOverride: number | null; afterOverride: number | null;
  cost: number; changed: boolean;
};
export type BulkPriceRow = {
  id: string; name: string; baseBefore: number; baseAfter: number; baseCost: number;
  prices: BulkPriceLine[]; warnings: string[]; error: string | null; changed: boolean;
};
export type BulkPricingPreview = { fingerprint: string; input: BulkPricingInput; rows: BulkPriceRow[] };

export function parseBulkPricingInput(raw: unknown): BulkPricingInput {
  const data = raw as Partial<BulkPricingInput> | null;
  if (!data || typeof data !== 'object') throw new BulkPricingError('Review the price settings.');
  const text = (key: 'categoryId' | 'divisionId' | 'groupId' | 'search') => {
    const value = data[key] ?? '';
    if (typeof value !== 'string' || value.length > 150) throw new BulkPricingError('Review the product filters.');
    return value.trim();
  };
  if (!['SELLING_PRICE', 'CATALOGUE_COST'].includes(data.basis as string) ||
      !['INCREASE', 'DECREASE'].includes(data.operation as string) ||
      !['PERCENT', 'AMOUNT'].includes(data.method as string) ||
      !['BASE_ONLY', 'ALL_UNITS'].includes(data.units as string) ||
      ![0, 1, 2].includes(data.decimals as number) || typeof data.value !== 'string' ||
      !/^\d{1,9}(\.\d{1,2})?$/.test(data.value)) {
    throw new BulkPricingError('Enter a positive adjustment with up to two decimal places.');
  }
  const value = Number(data.value);
  if (value <= 0 || (data.method === 'PERCENT' && value > 1000) ||
      (data.method === 'PERCENT' && data.operation === 'DECREASE' && value >= 100) ||
      (data.method === 'AMOUNT' && value * 100 > MAX_PRICE_PENCE)) {
    throw new BulkPricingError('Use a percentage up to 1,000% (below 100% for decreases), or a valid positive amount.');
  }
  return { categoryId: text('categoryId'), divisionId: text('divisionId'), groupId: text('groupId'), search: text('search'),
    basis: data.basis!, operation: data.operation!, method: data.method!, value: data.value, decimals: data.decimals!, units: data.units! };
}

/** Round once, half up, directly to the chosen currency precision. */
export function calculateBulkPrice(basis: number, input: BulkPricingInput): number {
  if (!Number.isSafeInteger(basis) || basis < 0 || basis > MAX_PRICE_PENCE) throw new BulkPricingError('The starting price or cost is invalid.');
  const [whole, fraction = ''] = input.value.split('.');
  const adjustment = BigInt(whole) * BigInt(100) + BigInt(fraction.padEnd(2, '0'));
  const sign = input.operation === 'INCREASE' ? BigInt(1) : BigInt(-1);
  const denominator = input.method === 'PERCENT' ? BigInt(10_000) : BigInt(1);
  const numerator = input.method === 'PERCENT'
    ? BigInt(basis) * (BigInt(10_000) + sign * adjustment)
    : BigInt(basis) + sign * adjustment;
  if (numerator <= BigInt(0)) throw new BulkPricingError('This adjustment would produce a zero or negative price.');
  const quantum = BigInt(10 ** (2 - input.decimals));
  const divisor = denominator * quantum;
  const rounded = ((numerator * BigInt(2) + divisor) / (divisor * BigInt(2))) * quantum;
  if (rounded <= BigInt(0) || rounded > BigInt(MAX_PRICE_PENCE)) throw new BulkPricingError('The rounded price is outside the allowed range.');
  return Number(rounded);
}
