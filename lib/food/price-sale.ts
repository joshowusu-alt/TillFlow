import { UserError } from '@/lib/action-utils';
import { isFoodBusiness } from '@/lib/food/business';
import { loadFoodCatalogue } from '@/lib/food/load-menus';
import {
  PlateError,
  foodLineVat,
  onlineHoldQty,
  pricePlate,
  type PlateSelection,
} from '@/lib/food/plate';

type PricedSaleLine = {
  productId: string;
  qtyInUnit: number;
  unitPricePence?: number;
  lineSubtotalPence?: number;
  qtyBase?: number;
  plate?: PlateSelection | null;
  plateSnapshotJson?: string | null;
};

function asUserError(error: unknown): never {
  if (error instanceof PlateError) throw new UserError(error.message);
  throw error;
}

/** Replace client prices on dish lines. Other products in the same sale are left alone. */
export async function priceFoodSaleLines<T extends PricedSaleLine>(businessId: string, lines: T[]): Promise<T[]> {
  if (lines.length === 0) return lines;
  const { menus, startingPrices } = await loadFoodCatalogue(
    businessId,
    lines.map((line) => line.productId),
  );
  if (menus.size === 0) return lines;
  try {
    return lines.map((line) => {
      const menu = menus.get(line.productId);
      if (!menu) return line;
      const snapshot = pricePlate(menu, line.plate, startingPrices.get(line.productId) ?? 0);
      const qty = Math.floor(line.qtyInUnit);
      return {
        ...line,
        unitPricePence: snapshot.platePricePence,
        lineSubtotalPence: snapshot.platePricePence * qty,
        qtyBase: snapshot.stockPortions * qty,
        plateSnapshotJson: JSON.stringify(snapshot),
      };
    });
  } catch (error) {
    asUserError(error);
  }
}

type CheckoutPricedLine = {
  productId: string;
  qtyInUnit: number;
  unitPricePence: number;
  qtyBase: number;
  lineSubtotalPence: number;
  lineVatPence: number;
  lineTotalPence: number;
  plateSnapshotJson?: string | null;
};

/**
 * Online checkout keeps the existing reservation. A counted plate reserves the
 * portions it uses, including an extra bowl. A dish that is not counted reserves nothing.
 * Supermarket and bookshop lines are returned unchanged.
 */
export async function repriceFoodCheckoutLines<T extends CheckoutPricedLine>(input: {
  businessId: string;
  businessCategory: string | null | undefined;
  vatEnabled: boolean;
  vatRateByProduct: Map<string, number>;
  lines: T[];
  plates: Array<PlateSelection | null | undefined>;
}): Promise<Array<T & { plateSnapshotJson?: string | null }>> {
  if (!isFoodBusiness(input.businessCategory)) return input.lines;
  const { menus, startingPrices } = await loadFoodCatalogue(
    input.businessId,
    input.lines.map((line) => line.productId),
  );
  if (menus.size === 0) return input.lines;
  try {
    return input.lines.map((line, index) => {
      const menu = menus.get(line.productId);
      if (!menu) return line;
      const snapshot = pricePlate(menu, input.plates[index], startingPrices.get(line.productId) ?? 0);
      const lineSubtotalPence = snapshot.platePricePence * line.qtyInUnit;
      const lineVatPence = foodLineVat(lineSubtotalPence, input.vatEnabled, input.vatRateByProduct.get(line.productId) ?? 0);
      return {
        ...line,
        unitPricePence: snapshot.platePricePence,
        qtyBase: onlineHoldQty(snapshot, line.qtyInUnit),
        lineSubtotalPence,
        lineVatPence,
        lineTotalPence: lineSubtotalPence + lineVatPence,
        plateSnapshotJson: JSON.stringify(snapshot),
      };
    });
  } catch (error) {
    asUserError(error);
  }
}
