export type ProductAttribute = { label: string; value: string };
export function parseProductAttributes(raw?: string | null): ProductAttribute[] {
  if (!raw) return [];
  if (raw.length > 20000) throw new Error('Product details are too long.');
  let items: unknown;
  try { items = JSON.parse(raw); } catch { throw new Error('Product details could not be read.'); }
  if (!Array.isArray(items) || items.length > 50) throw new Error('Use up to 50 product details.');
  return items.map(item => {
    if (!item || typeof item.label !== 'string' || typeof item.value !== 'string') throw new Error('Enter a label and value for each product detail.');
    const label = item.label.trim(), value = item.value.trim();
    if (label.length > 60 || value.length > 240 || /[\x00-\x1f]/.test(label + value)) throw new Error('Keep detail labels within 60 characters and values within 240 characters.');
    if ((label && !value) || (!label && value)) throw new Error('Enter both a label and a value for each product detail.');
    return { label, value };
  }).filter(item => item.label && item.value);
}
export function normalizeProductAttributes(raw?: string | null) {
  if (raw === undefined) return undefined;
  const items = parseProductAttributes(raw);
  return items.length ? JSON.stringify(items) : null;
}
