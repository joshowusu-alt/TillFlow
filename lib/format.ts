export function formatMoney(pence: number, currency = 'GBP') {
  try {
    return new Intl.NumberFormat('en-GB', {
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
    timeStyle: 'short'
  });
}

export function formatDate(value: Date) {
  return value.toLocaleDateString('en-GB', {
    dateStyle: 'medium'
  });
}

