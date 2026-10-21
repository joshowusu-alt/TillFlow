export type ShortcutScreen = { id: string; name: string; productIds: string[] };
export type ShortcutLayout = { screens: ShortcutScreen[] };
export const EMPTY_SHORTCUT_LAYOUT: ShortcutLayout = { screens: [] };

/** Small, bounded branch layouts. Products remain authoritative catalogue records. */
export function parseShortcutLayout(value: unknown): ShortcutLayout {
  if (!value || typeof value !== 'object' || !('screens' in value) || !Array.isArray(value.screens) || value.screens.length > 12) {
    throw new Error('Use up to 12 shortcut screens.');
  }
  const ids = new Set<string>();
  const names = new Set<string>();
  const screens = value.screens.map((screen: unknown): ShortcutScreen => {
    if (!screen || typeof screen !== 'object') throw new Error('Invalid shortcut screen.');
    const row = screen as Record<string, unknown>;
    if (typeof row.id !== 'string' || !/^[\w-]{1,80}$/.test(row.id) || ids.has(row.id)) throw new Error('Invalid or duplicate screen.');
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.trim().length > 40 || names.has(row.name.trim().toLowerCase())) throw new Error('Give each screen a unique name of up to 40 characters.');
    if (!Array.isArray(row.productIds) || row.productIds.length > 40 || row.productIds.some(id => typeof id !== 'string' || !id || id.length > 100) || new Set(row.productIds).size !== row.productIds.length) throw new Error('Choose up to 40 different products per screen.');
    ids.add(row.id); names.add(row.name.trim().toLowerCase());
    return { id: row.id, name: row.name.trim(), productIds: row.productIds as string[] };
  });
  return { screens };
}

export function readShortcutLayout(raw: string | null): ShortcutLayout {
  if (!raw) return EMPTY_SHORTCUT_LAYOUT;
  return parseShortcutLayout(JSON.parse(raw));
}
