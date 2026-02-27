export function formatMoney(pence: number, currency = 'GHS') {
  try {
    return new Intl.NumberFormat('en-GH', {
      style: 'currency',
      currency
    }).format(pence / 100);
  } catch {
    return `${currency} ${(pence / 100).toFixed(2)}`;
  }
}

export function getCurrencySymbol(currency: string): string {
  const symbols: Record<string, string> = {
    GBP: '£', USD: '$', EUR: '€',
    GHS: '₵', NGN: '₦', KES: 'KSh', ZAR: 'R',
    UGX: 'USh', TZS: 'TSh', CAD: 'C$', AUD: 'A$',
    INR: '₹', JPY: '¥', CNY: '¥', XOF: 'CFA', XAF: 'CFA',
    EGP: 'E£', MAD: 'DH', BWP: 'P', MZN: 'MT', ZMW: 'K'
  };
  return symbols[currency] || currency + ' ';
}

/** User-friendly label for the minor unit (e.g. "pesewas" for GHS, "cents" for USD). */
export function getMinorUnitLabel(currency: string): string {
  const labels: Record<string, string> = {
    GBP: 'pence', USD: 'cents', EUR: 'cents',
    GHS: 'pesewas', NGN: 'kobo', KES: 'cents', ZAR: 'cents',
    UGX: 'cents', TZS: 'cents', CAD: 'cents', AUD: 'cents',
    INR: 'paise', JPY: 'yen', CNY: 'fen', XOF: 'centimes', XAF: 'centimes',
    EGP: 'piastres', MAD: 'centimes', BWP: 'thebe', MZN: 'centavos', ZMW: 'ngwee'
  };
  return labels[currency] || 'minor units';
}

export function formatDateTime(value: Date) {
  return value.toLocaleString('en-GB', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'UTC',
  });
}

export function formatDate(value: Date) {
  return value.toLocaleDateString('en-GB', {
    dateStyle: 'medium',
    timeZone: 'UTC',
  });
}

/**
 * Canonical discount-value parser used by both live POS sales and offline-sync.
 *
 * - PERCENT: returns the raw percentage number clamped to [0, 100].
 * - AMOUNT:  strips commas, converts "major units → pence" via Math.round(× 100),
 *            and clamps to ≥ 0 so negative discounts are impossible.
 */
export function parseDiscountValue(type: string | undefined, raw: unknown): number {
  if (!type || type === 'NONE') return 0;
  if (type === 'PERCENT') {
    const pct = Number(raw);
    if (Number.isNaN(pct)) return 0;
    return Math.min(Math.max(pct, 0), 100);
  }
  if (type === 'AMOUNT') {
    const cleaned = String(raw ?? '').replace(/,/g, '').trim();
    if (!cleaned) return 0;
    const amount = Number(cleaned);
    if (Number.isNaN(amount)) return 0;
    return Math.max(Math.round(amount * 100), 0);
  }
  return 0;
}

/** Default number of items per page for paginated list views. */
export const DEFAULT_PAGE_SIZE = 25;

