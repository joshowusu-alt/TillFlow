export type PosCompletionCartLine = {
  productId: string;
  unitId: string;
  qtyInUnit: number;
  discountType?: string;
  discountValue?: string;
};

export type PosCompletionProduct = {
  id: string;
  onHandBase: number;
  units: Array<{
    id: string;
    conversionToBase: number;
  }>;
};

export type PosCompletionPaymentMethod = 'CASH' | 'CARD' | 'TRANSFER' | 'MOBILE_MONEY';

export type PosCompletionSnapshot<
  TCartLine extends PosCompletionCartLine,
  TProduct,
  TPaymentStatus extends string,
  TPaymentMethod extends string,
  TDiscountType extends string,
  TMomoNetwork extends string,
  TMomoCollectionStatus extends string,
> = {
  productOptions: TProduct[];
  cart: TCartLine[];
  customerId: string;
  cashTendered: string;
  cardPaid: string;
  transferPaid: string;
  momoPaid: string;
  momoRef: string;
  momoPayerMsisdn: string;
  momoNetwork: TMomoNetwork;
  momoCollectionId: string;
  momoCollectionStatus: TMomoCollectionStatus;
  momoCollectionError: string | null;
  momoIdempotencyKey: string;
  momoCollectionSignature: string;
  paymentStatus: TPaymentStatus;
  paymentMethods: TPaymentMethod[];
  orderDiscountType: TDiscountType;
  orderDiscountInput: string;
  discountManagerPin: string;
  discountReasonCode: string;
  discountReason: string;
  qtyDrafts: Record<string, string>;
  undoStack: TCartLine[][];
};

export function createSaleCompletionSnapshot<
  TCartLine extends PosCompletionCartLine,
  TProduct,
  TPaymentStatus extends string,
  TPaymentMethod extends string,
  TDiscountType extends string,
  TMomoNetwork extends string,
  TMomoCollectionStatus extends string,
>(
  snapshot: PosCompletionSnapshot<
    TCartLine,
    TProduct,
    TPaymentStatus,
    TPaymentMethod,
    TDiscountType,
    TMomoNetwork,
    TMomoCollectionStatus
  >
): PosCompletionSnapshot<
  TCartLine,
  TProduct,
  TPaymentStatus,
  TPaymentMethod,
  TDiscountType,
  TMomoNetwork,
  TMomoCollectionStatus
> {
  return {
    ...snapshot,
    productOptions: [...snapshot.productOptions],
    cart: [...snapshot.cart],
    paymentMethods: [...snapshot.paymentMethods],
    qtyDrafts: { ...snapshot.qtyDrafts },
    undoStack: [...snapshot.undoStack],
  };
}

export function buildOptimisticStockDecrements<
  TCartLine extends PosCompletionCartLine,
  TProduct extends PosCompletionProduct,
>(cart: TCartLine[], products: TProduct[]): Map<string, number> {
  const decrements = new Map<string, number>();

  for (const line of cart) {
    const product = products.find((candidate) => candidate.id === line.productId);
    const unit = product?.units.find((candidate) => candidate.id === line.unitId);
    if (!product || !unit) continue;

    const baseQty = line.qtyInUnit * unit.conversionToBase;
    decrements.set(line.productId, (decrements.get(line.productId) ?? 0) + baseQty);
  }

  return decrements;
}

export function applyOptimisticStock<
  TProduct extends PosCompletionProduct,
>(products: TProduct[], decrements: Map<string, number>): TProduct[] {
  return products.map((product) => {
    const decrement = decrements.get(product.id);
    if (!decrement) return product;
    return {
      ...product,
      onHandBase: Math.max(0, product.onHandBase - decrement),
    };
  });
}

export function buildOfflinePayments(input: {
  cashApplied: number;
  cardPaidValue: number;
  transferPaidValue: number;
  momoPaidValue: number;
}): Array<{ method: PosCompletionPaymentMethod; amountPence: number }> {
  return [
    ...(input.cashApplied > 0 ? [{ method: 'CASH' as const, amountPence: Math.round(input.cashApplied) }] : []),
    ...(input.cardPaidValue > 0 ? [{ method: 'CARD' as const, amountPence: Math.round(input.cardPaidValue) }] : []),
    ...(input.transferPaidValue > 0 ? [{ method: 'TRANSFER' as const, amountPence: Math.round(input.transferPaidValue) }] : []),
    ...(input.momoPaidValue > 0 ? [{ method: 'MOBILE_MONEY' as const, amountPence: Math.round(input.momoPaidValue) }] : []),
  ];
}
