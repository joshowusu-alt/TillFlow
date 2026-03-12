export const PARKED_CARTS_STORAGE_KEY = 'pos.parkedCarts';

export type PosParkedCartLine = {
  id: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  discountType?: string;
  discountValue?: string;
};

export type ParkedCart<TCartLine extends PosParkedCartLine = PosParkedCartLine> = {
  id: string;
  label: string;
  cart: TCartLine[];
  customerId: string;
  parkedAt: string;
  itemCount: number;
};

export type RecallParkedSaleResult<
  TCartLine extends PosParkedCartLine = PosParkedCartLine,
> = {
  parkedCarts: ParkedCart<TCartLine>[];
  restoredCart: TCartLine[];
  restoredCustomerId: string;
  removedLineCount: number;
  missingCustomer: boolean;
};

type CreateParkedCartInput<TCartLine extends PosParkedCartLine> = {
  cart: TCartLine[];
  customerId: string;
  label: string;
  parkedAt?: string;
  idFactory?: () => string;
};

type ParkSaleInput<TCartLine extends PosParkedCartLine> = CreateParkedCartInput<TCartLine> & {
  parkedCarts: ParkedCart<TCartLine>[];
};

type RecallParkedSaleInput<TCartLine extends PosParkedCartLine> = {
  parkedCarts: ParkedCart<TCartLine>[];
  parkedId: string;
  currentCart: TCartLine[];
  currentCustomerId: string;
  productExists: (productId: string) => boolean;
  customerExists: (customerId: string) => boolean;
  parkedAt?: string;
  idFactory?: () => string;
};

const createParkedCartId = () => Date.now().toString(36);

const buildParkedLabel = (label: string, itemCount: number) => {
  const trimmed = label.trim();
  return trimmed || `Sale (${itemCount} items)`;
};

export function parseParkedCarts<TCartLine extends PosParkedCartLine = PosParkedCartLine>(
  raw: string | null
): ParkedCart<TCartLine>[] {
  if (!raw) return [];

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((item): item is ParkedCart<TCartLine> => {
      if (!item || typeof item !== 'object') return false;
      const candidate = item as Partial<ParkedCart<TCartLine>>;
      return (
        typeof candidate.id === 'string' &&
        typeof candidate.label === 'string' &&
        Array.isArray(candidate.cart) &&
        typeof candidate.customerId === 'string' &&
        typeof candidate.parkedAt === 'string' &&
        typeof candidate.itemCount === 'number'
      );
    });
  } catch {
    return [];
  }
}

export function createParkedCart<TCartLine extends PosParkedCartLine>(
  input: CreateParkedCartInput<TCartLine>
): ParkedCart<TCartLine> {
  const { cart, customerId, label, parkedAt = new Date().toISOString(), idFactory = createParkedCartId } = input;

  return {
    id: idFactory(),
    label: buildParkedLabel(label, cart.length),
    cart: [...cart],
    customerId,
    parkedAt,
    itemCount: cart.length,
  };
}

export function parkSale<TCartLine extends PosParkedCartLine>(
  input: ParkSaleInput<TCartLine>
): { parked: ParkedCart<TCartLine>; parkedCarts: ParkedCart<TCartLine>[] } {
  const parked = createParkedCart(input);
  return {
    parked,
    parkedCarts: [...input.parkedCarts, parked],
  };
}

export function recallParkedSale<TCartLine extends PosParkedCartLine>(
  input: RecallParkedSaleInput<TCartLine>
): RecallParkedSaleResult<TCartLine> | null {
  const {
    parkedCarts,
    parkedId,
    currentCart,
    currentCustomerId,
    productExists,
    customerExists,
    parkedAt,
    idFactory,
  } = input;

  const parked = parkedCarts.find((candidate) => candidate.id === parkedId);
  if (!parked) return null;

  let nextParkedCarts = parkedCarts.filter((candidate) => candidate.id !== parkedId);
  if (currentCart.length > 0) {
    const swapped = createParkedCart({
      cart: currentCart,
      customerId: currentCustomerId,
      label: `Swapped sale (${currentCart.length} items)`,
      parkedAt,
      idFactory,
    });
    nextParkedCarts = [...nextParkedCarts, swapped];
  }

  const restoredCart = parked.cart.filter((line) => productExists(line.productId));
  const restoredCustomerId = parked.customerId && customerExists(parked.customerId)
    ? parked.customerId
    : '';

  return {
    parkedCarts: nextParkedCarts,
    restoredCart,
    restoredCustomerId,
    removedLineCount: parked.cart.length - restoredCart.length,
    missingCustomer: Boolean(parked.customerId) && !restoredCustomerId,
  };
}

export function deleteParkedSale<TCartLine extends PosParkedCartLine>(
  parkedCarts: ParkedCart<TCartLine>[],
  parkedId: string
): ParkedCart<TCartLine>[] {
  return parkedCarts.filter((candidate) => candidate.id !== parkedId);
}
