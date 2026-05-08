/**
 * Tag helpers for Customer and Supplier records.
 *
 * Tags are stored as a JSON-encoded string array on `Customer.tagsJson` and
 * `Supplier.tagsJson` so the dev SQLite schema and prod Postgres schema can
 * share the same column shape. Use the helpers below at every read/write
 * boundary so the on-disk encoding and the in-memory format stay aligned.
 */

const MAX_TAGS = 12;
const MAX_TAG_LENGTH = 30;

/** Parse the persisted JSON string into a deduplicated, sorted-by-input list. */
export function parseTags(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) return [];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const entry of parsed) {
      if (typeof entry !== 'string') continue;
      const trimmed = entry.trim();
      if (!trimmed) continue;
      const key = trimmed.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(trimmed.slice(0, MAX_TAG_LENGTH));
      if (out.length >= MAX_TAGS) break;
    }
    return out;
  } catch {
    return [];
  }
}

/** Serialize a list of tags for storage. Returns null when the list is empty. */
export function serializeTags(tags: string[] | null | undefined): string | null {
  if (!tags || tags.length === 0) return null;
  const cleaned = normalizeTagList(tags);
  return cleaned.length > 0 ? JSON.stringify(cleaned) : null;
}

/**
 * Accepts whatever the merchant typed (free-form comma- or semicolon-
 * separated input) and returns a clean tag list ready for storage.
 *
 * - trims each entry
 * - drops blanks
 * - dedupes case-insensitively (preserves the casing of the first occurrence)
 * - clamps to MAX_TAGS entries and MAX_TAG_LENGTH characters per tag
 */
export function normalizeTagInput(raw: string | null | undefined): string[] {
  if (!raw) return [];
  const parts = raw.split(/[,;\n]/g);
  return normalizeTagList(parts);
}

function normalizeTagList(values: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const entry of values) {
    if (typeof entry !== 'string') continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, MAX_TAG_LENGTH));
    if (out.length >= MAX_TAGS) break;
  }
  return out;
}
