export const POS_CART_STORAGE_KEY = 'pos.savedCart';
export const POS_CART_CUSTOMER_STORAGE_KEY = 'pos.savedCustomer';
export const POS_SALE_ATTEMPT_STORAGE_KEY_PREFIX = 'pos.saleAttempt';

export type PersistedSaleAttempt = {
  attemptId: string;
  ambiguousFailure: boolean;
};

export function buildPosSaleAttemptStorageKey(businessId: string, storeId: string) {
  return `${POS_SALE_ATTEMPT_STORAGE_KEY_PREFIX}:${businessId}:${storeId}`;
}

export function readPersistedSaleAttempt(raw: string | null): PersistedSaleAttempt | null {
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const attemptId = (parsed as { attemptId?: unknown }).attemptId;
    const ambiguousFailure = (parsed as { ambiguousFailure?: unknown }).ambiguousFailure;
    if (typeof attemptId !== 'string' || !attemptId) return null;
    return {
      attemptId,
      ambiguousFailure: ambiguousFailure === true,
    };
  } catch {
    return null;
  }
}

export type PersistedCartLine = {
  productId: string;
};

export type RestorePersistedCartResult<TCartLine extends PersistedCartLine> = {
  cart: TCartLine[];
  customerId: string;
  restored: boolean;
};

type RestorePersistedCartInput<TCartLine extends PersistedCartLine> = {
  savedCartRaw: string | null;
  savedCustomerRaw: string | null;
  productExists: (productId: string) => boolean;
  customerExists: (customerId: string) => boolean;
};

function isPersistedCartLine(value: unknown): value is PersistedCartLine {
  return Boolean(value) && typeof value === 'object' && typeof (value as PersistedCartLine).productId === 'string';
}

export function parsePersistedCart<TCartLine extends PersistedCartLine = PersistedCartLine>(
  savedCartRaw: string | null
): TCartLine[] {
  if (!savedCartRaw) return [];

  try {
    const parsed: unknown = JSON.parse(savedCartRaw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((line): line is TCartLine => isPersistedCartLine(line));
  } catch {
    return [];
  }
}

export function restorePersistedCart<TCartLine extends PersistedCartLine>(
  input: RestorePersistedCartInput<TCartLine>
): RestorePersistedCartResult<TCartLine> {
  const parsedCart = parsePersistedCart<TCartLine>(input.savedCartRaw);
  const cart = parsedCart.filter((line) => input.productExists(line.productId));
  const customerId = input.savedCustomerRaw && input.customerExists(input.savedCustomerRaw)
    ? input.savedCustomerRaw
    : '';

  return {
    cart,
    customerId,
    restored: cart.length > 0,
  };
}
