import { normalizePublicCategoryName, toPublicTitle } from '@/lib/storefront-taxonomy';

/**
 * Suggest a clean in-catalog category name for import rows.
 * Uses the same typo fixes as storefront taxonomy without changing storefront mappings.
 */
export function suggestImportCategoryName(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return '';
  const { name } = normalizePublicCategoryName(trimmed);
  return name === 'Other' && trimmed ? toPublicTitle(trimmed) : name;
}
