/** Split the advertised amount from extras, whose prices remain VAT-exclusive. */
export function amountLineVat(subtotal: number, inclusiveAmount: number, discount: number, rateBps: number) {
  const discounted = subtotal - discount;
  const inclusiveGross = inclusiveAmount === 0 || subtotal === 0
    ? 0 : Math.round(inclusiveAmount * discounted / subtotal);
  const inclusiveNet = Math.round(inclusiveGross * 10000 / (10000 + rateBps));
  const exclusiveNet = discounted - inclusiveGross;
  return {
    net: inclusiveNet + exclusiveNet,
    vat: inclusiveGross - inclusiveNet + Math.round(exclusiveNet * rateBps / 10000),
  };
}
