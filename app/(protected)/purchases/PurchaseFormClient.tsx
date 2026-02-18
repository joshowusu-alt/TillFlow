'use client';

import { useEffect, useMemo, useState, useTransition } from 'react';
import { useFormStatus } from 'react-dom';
import { createPurchaseAction } from '@/app/actions/purchases';
import { quickCreateProductAction } from '@/app/actions/products';
import { formatMoney, getMinorUnitLabel, getCurrencySymbol } from '@/lib/format';
import { formatMixedUnit, getPrimaryPackagingUnit } from '@/lib/units';

type UnitDto = {
  id: string;
  name: string;
  pluralName?: string;
  conversionToBase: number;
  isBaseUnit: boolean;
};

type ProductDto = {
  id: string;
  name: string;
  barcode: string | null;
  defaultCostBasePence: number;
  sellingPriceBasePence: number;
  vatRateBps: number;
  units: UnitDto[];
};

type SupplierDto = {
  id: string;
  name: string;
};

type PaymentMethod = 'CASH' | 'CARD' | 'TRANSFER';

type UnitOption = { id: string; name: string };

type CartLine = {
  id: string;
  productId: string;
  unitId: string;
  qtyInUnit: number;
  unitCostInput: string;
};

export default function PurchaseFormClient({
  storeId,
  products,
  suppliers,
  currency,
  units,
  vatEnabled
}: {
  storeId: string;
  products: ProductDto[];
  suppliers: SupplierDto[];
  currency: string;
  units: UnitOption[];
  vatEnabled: boolean;
}) {
  const [productOptions, setProductOptions] = useState<ProductDto[]>(products);
  const [productId, setProductId] = useState(products[0]?.id ?? '');
  const [unitId, setUnitId] = useState(products[0]?.units[0]?.id ?? '');
  const [qtyInput, setQtyInput] = useState('1');
  const [unitCostInput, setUnitCostInput] = useState('');
  const [unitCostTouched, setUnitCostTouched] = useState(false);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});
  const [costDrafts, setCostDrafts] = useState<Record<string, string>>({});
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>(['CASH']);
  const [cashPaid, setCashPaid] = useState('');
  const [cardPaid, setCardPaid] = useState('');
  const [transferPaid, setTransferPaid] = useState('');
  const [barcodeLookup, setBarcodeLookup] = useState('');
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddError, setQuickAddError] = useState<string | null>(null);
  const [isCreating, startTransition] = useTransition();
  const [quickName, setQuickName] = useState('');
  const [quickSku, setQuickSku] = useState('');
  const [quickBarcode, setQuickBarcode] = useState('');
  const [quickBaseUnitId, setQuickBaseUnitId] = useState(units[0]?.id ?? '');
  const [quickPackagingUnitId, setQuickPackagingUnitId] = useState('');
  const [quickPackagingConversion, setQuickPackagingConversion] = useState('1');
  const [quickSellPrice, setQuickSellPrice] = useState('');
  const [quickCost, setQuickCost] = useState('');
  const [quickVatRate, setQuickVatRate] = useState('0');

  const selectedProduct = useMemo(
    () => productOptions.find((product) => product.id === productId),
    [productOptions, productId]
  );
  const unitsForProduct = selectedProduct?.units ?? [];
  const selectedUnit = unitsForProduct.find((unit) => unit.id === unitId);
  const hasMultipleUnits = unitsForProduct.length > 1;
  const baseUnit = unitsForProduct.find((u) => u.isBaseUnit);
  const qtyNumber = Math.max(0, Math.floor(Number(qtyInput) || 0));

  const parseCurrencyToPence = (value: string) => {
    const trimmed = value.replace(/,/g, '').trim();
    if (!trimmed) return 0;
    const parsed = Number(trimmed);
    return Number.isNaN(parsed) ? 0 : Math.round(parsed * 100);
  };

  useEffect(() => {
    if (!selectedProduct || !selectedUnit) return;
    if (unitCostTouched) return;
    const baseCost = selectedProduct.defaultCostBasePence * selectedUnit.conversionToBase;
    setUnitCostInput((baseCost / 100).toFixed(2));
  }, [selectedProduct, selectedUnit, unitCostTouched]);

  const resetQuickForm = () => {
    setQuickName('');
    setQuickSku('');
    setQuickBarcode('');
    setQuickBaseUnitId(units[0]?.id ?? '');
    setQuickPackagingUnitId('');
    setQuickPackagingConversion('1');
    setQuickSellPrice('');
    setQuickCost('');
    setQuickVatRate('0');
  };

  const openQuickAdd = (barcode?: string) => {
    setQuickAddOpen(true);
    setQuickAddError(null);
    if (barcode) {
      setQuickBarcode(barcode);
    }
  };

  const handleBarcodeLookup = () => {
    const code = barcodeLookup.trim();
    if (!code) return;
    const match = productOptions.find((product) => product.barcode === code);
    if (match) {
      setProductId(match.id);
      const baseUnit = match.units.find((unit) => unit.isBaseUnit) ?? match.units[0];
      setUnitId(baseUnit?.id ?? '');
      setQtyInput('1');
      setUnitCostTouched(false);
      setBarcodeLookup('');
      setQuickAddOpen(false);
      setQuickAddError(null);
    } else {
      openQuickAdd(code);
      setQuickAddError('No product found for that barcode. You can create a new one below.');
    }
  };

  const handleQuickCreate = () => {
    setQuickAddError(null);
    if (!quickName.trim()) {
      setQuickAddError('Please enter a product name.');
      return;
    }
    if (!quickBaseUnitId) {
      setQuickAddError('Please select a base unit.');
      return;
    }
    const selling = parseCurrencyToPence(quickSellPrice);
    const cost = parseCurrencyToPence(quickCost);
    if (selling <= 0 || cost <= 0) {
      setQuickAddError('Please enter both the selling price and cost.');
      return;
    }
    startTransition(async () => {
      try {
        const result = await quickCreateProductAction({
          name: quickName.trim(),
          sku: quickSku.trim() || null,
          barcode: quickBarcode.trim() || null,
          sellingPriceBasePence: selling,
          defaultCostBasePence: cost,
          vatRateBps: Math.max(0, parseInt(quickVatRate, 10) || 0),
          baseUnitId: quickBaseUnitId,
          packagingUnitId: quickPackagingUnitId || null,
          packagingConversion: parseInt(quickPackagingConversion, 10) || 1
        });
        if (!result.success) throw new Error(result.error);
        const created = result.data;
        setProductOptions((prev) => [...prev, created]);
        setProductId(created.id);
        const baseUnit = created.units.find((unit) => unit.isBaseUnit) ?? created.units[0];
        setUnitId(baseUnit?.id ?? '');
        setUnitCostTouched(false);
        setQtyInput('1');
        setUnitCostInput((created.defaultCostBasePence / 100).toFixed(2));
        setQuickAddOpen(false);
        setQuickAddError(null);
        resetQuickForm();
        setBarcodeLookup('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to create product.';
        setQuickAddError(message);
      }
    });
  };

  const addToCart = () => {
    if (!productId || !unitId) return;
    const qty = Math.floor(Number(qtyInput));
    if (!Number.isFinite(qty) || qty <= 0) return;
    const defaultCost =
      selectedProduct && selectedUnit
        ? ((selectedProduct.defaultCostBasePence * selectedUnit.conversionToBase) / 100).toFixed(2)
        : '0';
    const costValue = unitCostInput.trim() ? unitCostInput : defaultCost;
    const id = `${productId}:${unitId}`;
    setCart((prev) => {
      const existing = prev.find((line) => line.id === id);
      if (existing) {
        return prev.map((line) =>
          line.id === id
            ? {
                ...line,
                qtyInUnit: line.qtyInUnit + qty,
                unitCostInput: unitCostInput.trim() ? costValue : line.unitCostInput
              }
            : line
        );
      }
      return [
        ...prev,
        {
          id,
          productId,
          unitId,
          qtyInUnit: qty,
          unitCostInput: costValue
        }
      ];
    });
    setQtyInput('1');
  };

  const updateLine = (lineId: string, patch: Partial<CartLine>) => {
    setCart((prev) => prev.map((line) => (line.id === lineId ? { ...line, ...patch } : line)));
  };

  const removeLine = (lineId: string) => {
    setCart((prev) => prev.filter((line) => line.id !== lineId));
    setQtyDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
    setCostDrafts((prev) => {
      const next = { ...prev };
      delete next[lineId];
      return next;
    });
  };

  const cartDetails = useMemo(() => {
    return cart
      .map((line) => {
        const product = productOptions.find((item) => item.id === line.productId);
        const unit = product?.units.find((item) => item.id === line.unitId);
        if (!product || !unit) return null;
        const qtyBase = line.qtyInUnit * unit.conversionToBase;
        const unitCostPence = parseCurrencyToPence(line.unitCostInput);
        const lineSubtotal = unitCostPence * line.qtyInUnit;
        const lineVat = vatEnabled ? Math.round((lineSubtotal * product.vatRateBps) / 10000) : 0;
        const lineTotal = lineSubtotal + lineVat;
        const baseUnit = product.units.find((item) => item.isBaseUnit);
        const packaging = getPrimaryPackagingUnit(
          product.units.map((item) => ({ conversionToBase: item.conversionToBase, unit: item }))
        );
        const qtyLabel = formatMixedUnit({
          qtyBase,
          baseUnit: baseUnit?.name ?? 'unit',
          baseUnitPlural: baseUnit?.pluralName,
          packagingUnit: packaging?.unit.name,
          packagingUnitPlural: packaging?.unit.pluralName,
          packagingConversion: packaging?.conversionToBase
        });
        return {
          ...line,
          product,
          unit,
          qtyLabel,
          unitCostPence,
          lineSubtotal,
          lineVat,
          lineTotal
        };
      })
      .filter(Boolean) as Array<
      CartLine & {
        product: ProductDto;
        unit: UnitDto;
        qtyLabel: string;
        unitCostPence: number;
        lineSubtotal: number;
        lineVat: number;
        lineTotal: number;
      }
    >;
  }, [cart, productOptions, vatEnabled]);

  const totals = cartDetails.reduce(
    (acc, line) => {
      acc.subtotal += line.lineSubtotal;
      acc.vat += line.lineVat;
      acc.total += line.lineTotal;
      return acc;
    },
    { subtotal: 0, vat: 0, total: 0 }
  );

  const hasMethod = (method: PaymentMethod) => paymentMethods.includes(method);
  const cashPaidPence = hasMethod('CASH') ? parseCurrencyToPence(cashPaid) : 0;
  const cardPaidPence = hasMethod('CARD') ? parseCurrencyToPence(cardPaid) : 0;
  const transferPaidPence = hasMethod('TRANSFER') ? parseCurrencyToPence(transferPaid) : 0;
  const totalPaid = cashPaidPence + cardPaidPence + transferPaidPence;
  const overpay = totals.total > 0 && totalPaid > totals.total;

  const togglePaymentMethod = (method: PaymentMethod) => {
    const exists = paymentMethods.includes(method);
    let next = exists
      ? paymentMethods.filter((current) => current !== method)
      : [...paymentMethods, method];
    if (next.length === 0) {
      next = ['CASH'];
    }
    if (!next.includes(method) && exists) {
      if (method === 'CASH') setCashPaid('');
      if (method === 'CARD') setCardPaid('');
      if (method === 'TRANSFER') setTransferPaid('');
    }
    setPaymentMethods(next);
  };

  return (
    <div className="mt-4 space-y-6">
      <div className="rounded-xl border border-black/10 bg-white/70 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-[0.2em] text-black/40">Quick add product</div>
            <div className="text-sm text-black/60">Create a new product without leaving purchases.</div>
          </div>
          <button
            type="button"
            className="btn-secondary text-xs"
            onClick={() => (quickAddOpen ? setQuickAddOpen(false) : openQuickAdd(barcodeLookup.trim()))}
          >
            {quickAddOpen ? 'Hide' : 'New product'}
          </button>
        </div>
        {quickAddOpen ? (
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <div>
              <label className="label">Name</label>
              <input className="input" value={quickName} onChange={(e) => setQuickName(e.target.value)} />
            </div>
            <div>
              <label className="label">SKU</label>
              <input className="input" value={quickSku} onChange={(e) => setQuickSku(e.target.value)} />
            </div>
            <div>
              <label className="label">Barcode</label>
              <input className="input" value={quickBarcode} onChange={(e) => setQuickBarcode(e.target.value)} />
            </div>
            <div>
              <label className="label">Single Unit (smallest)</label>
              <select
                className="input"
                value={quickBaseUnitId}
                onChange={(e) => setQuickBaseUnitId(e.target.value)}
              >
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-black/50">
                Smallest unit you sell (e.g., piece, bottle, sachet).
              </div>
            </div>
            <div>
              <label className="label">Pack/Carton Unit (optional)</label>
              <select
                className="input"
                value={quickPackagingUnitId}
                onChange={(e) => setQuickPackagingUnitId(e.target.value)}
              >
                <option value="">None</option>
                {units.map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </select>
              <div className="mt-1 text-xs text-black/50">
                Bigger bundle you receive or sell (e.g., carton, box).
              </div>
            </div>
            <div>
              <label className="label">Units per Pack/Carton</label>
              <input
                className="input"
                type="number"
                min={1}
                value={quickPackagingConversion}
                onChange={(e) => setQuickPackagingConversion(e.target.value)}
              />
              <div className="mt-1 text-xs text-black/50">
                How many single units are inside 1 pack/carton.
              </div>
            </div>
            <div>
              <label className="label">Selling Price ({getMinorUnitLabel(currency)})</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={quickSellPrice}
                onChange={(e) => setQuickSellPrice(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Default Cost ({getMinorUnitLabel(currency)})</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={quickCost}
                onChange={(e) => setQuickCost(e.target.value)}
              />
            </div>
            <div>
              <label className="label">VAT Rate (bps)</label>
              <input
                className="input"
                type="number"
                min={0}
                value={quickVatRate}
                onChange={(e) => setQuickVatRate(e.target.value)}
              />
            </div>
            {quickAddError ? (
              <div className="md:col-span-3 rounded-xl border border-rose/30 bg-rose/10 px-3 py-2 text-sm text-rose">
                {quickAddError}
              </div>
            ) : null}
            <div className="md:col-span-3 flex flex-wrap gap-3">
              <button type="button" className="btn-primary" onClick={handleQuickCreate} disabled={isCreating}>
                {isCreating ? 'Creating...' : 'Create product'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setQuickAddOpen(false);
                  setQuickAddError(null);
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}
      </div>

      <form action={createPurchaseAction} className="space-y-6">
        <input type="hidden" name="storeId" value={storeId} />
        <input type="hidden" name="cart" value={JSON.stringify(cart)} />
        <input type="hidden" name="cashPaid" value={Math.max(0, cashPaidPence)} />
        <input type="hidden" name="cardPaid" value={Math.max(0, cardPaidPence)} />
        <input type="hidden" name="transferPaid" value={Math.max(0, transferPaidPence)} />

        <div className="grid gap-4 md:grid-cols-3">
          <div className="md:col-span-2">
            <label className="label">Barcode Lookup</label>
            <input
              className="input"
              value={barcodeLookup}
              onChange={(event) => setBarcodeLookup(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  handleBarcodeLookup();
                }
              }}
              placeholder="Scan barcode to select product"
            />
          </div>
          <div className="flex items-end">
            <button
              type="button"
              className="btn-secondary w-full"
              onClick={() => {
                if (barcodeLookup.trim()) {
                  handleBarcodeLookup();
                } else {
                  openQuickAdd();
                }
              }}
            >
              Find / Add
            </button>
          </div>
          <div>
            <label className="label">Supplier</label>
            <select className="input" name="supplierId">
              <option value="">Default Supplier</option>
              {suppliers.map((supplier) => (
                <option key={supplier.id} value={supplier.id}>
                  {supplier.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Product</label>
            <select
              className="input"
              value={productId}
              onChange={(event) => {
                const next = event.target.value;
                setProductId(next);
                const product = productOptions.find((p) => p.id === next);
                const baseUnit = product?.units.find((unit) => unit.isBaseUnit) ?? product?.units[0];
                setUnitId(baseUnit?.id ?? '');
                setQtyInput('1');
                setUnitCostTouched(false);
                setUnitCostInput('');
              }}
            >
              {productOptions.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Buy in</label>
            {hasMultipleUnits ? (
              <div className="mt-1 flex gap-1">
                {unitsForProduct.map((unit) => (
                  <button
                    key={unit.id}
                    type="button"
                    onClick={() => {
                      setUnitId(unit.id);
                      setUnitCostTouched(false);
                      setUnitCostInput('');
                    }}
                    className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                      unitId === unit.id
                        ? 'bg-emerald-600 text-white'
                        : 'bg-black/5 text-black/60 hover:bg-black/10'
                    }`}
                  >
                    {unit.name}
                    {unit.conversionToBase > 1 ? ` (${unit.conversionToBase})` : ''}
                  </button>
                ))}
              </div>
            ) : (
              <div className="mt-1 rounded-xl border border-black/10 bg-white px-3 py-2 text-sm">
                {selectedUnit?.name ?? 'Unit'}
              </div>
            )}
          </div>
          <div>
            <label className="label">Quantity ({selectedUnit?.name ?? 'units'})</label>
            <input
              className="input"
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={qtyInput}
              onChange={(event) => setQtyInput(event.target.value)}
              onFocus={(event) => event.currentTarget.select()}
            />
            {selectedUnit && selectedUnit.conversionToBase > 1 && qtyNumber > 0 ? (
              <div className="mt-1 text-xs font-medium text-emerald-700">
                = {qtyNumber * selectedUnit.conversionToBase} {baseUnit?.pluralName ?? baseUnit?.name ?? 'units'}
              </div>
            ) : null}
          </div>
          <div>
            <label className="label">Cost per {selectedUnit?.name ?? 'unit'}</label>
            <input
              className="input"
              type="number"
              min={0}
              step="0.01"
              inputMode="decimal"
              value={unitCostInput}
              onChange={(event) => {
                setUnitCostInput(event.target.value);
                setUnitCostTouched(true);
              }}
              placeholder="e.g., 12.50"
              onFocus={(event) => event.currentTarget.select()}
            />
            {selectedUnit && selectedUnit.conversionToBase > 1 && unitCostInput ? (
              <div className="mt-1 text-xs text-black/60">
                {formatMoney(parseCurrencyToPence(unitCostInput), currency)} per {selectedUnit.name}
                {' · '}
                {formatMoney(Math.round(parseCurrencyToPence(unitCostInput) / selectedUnit.conversionToBase), currency)} per {baseUnit?.name ?? 'unit'}
              </div>
            ) : null}
          </div>
          <div className="flex items-end">
            <button type="button" className="btn-primary w-full" onClick={addToCart}>
              Add line
            </button>
          </div>
        </div>

        <div className="card p-4">
          <div className="text-xs uppercase tracking-[0.2em] text-black/40">Purchase cart</div>
          {cartDetails.length === 0 ? (
            <div className="mt-3 text-sm text-black/50">No items yet.</div>
          ) : (
            <table className="table mt-3 w-full border-separate border-spacing-y-2">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Qty</th>
                  <th>Unit Cost</th>
                  <th>Total</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {cartDetails.map((line) => (
                  <tr key={line.id} className="rounded-xl bg-white">
                    <td className="px-3 py-3 text-sm font-semibold">{line.product.name}</td>
                    <td className="px-3 py-3 text-sm">
                      <div className="text-xs text-black/50">{line.qtyLabel}</div>
                      <input
                        className="input mt-1"
                        type="number"
                        min={1}
                        step={1}
                        inputMode="numeric"
                        value={qtyDrafts[line.id] ?? String(line.qtyInUnit)}
                        onChange={(event) => {
                          const value = event.target.value;
                          setQtyDrafts((prev) => ({ ...prev, [line.id]: value }));
                        }}
                        onBlur={() => {
                          const draft = qtyDrafts[line.id];
                          if (draft === undefined) return;
                          const parsed = Number(draft);
                          if (!Number.isFinite(parsed) || parsed <= 0) {
                            removeLine(line.id);
                            return;
                          }
                          updateLine(line.id, { qtyInUnit: Math.floor(parsed) });
                        }}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                    </td>
                    <td className="px-3 py-3 text-sm">
                      <input
                        className="input"
                        type="number"
                        min={0}
                        step="0.01"
                        inputMode="decimal"
                        value={costDrafts[line.id] ?? line.unitCostInput}
                        onChange={(event) => {
                          const value = event.target.value;
                          setCostDrafts((prev) => ({ ...prev, [line.id]: value }));
                        }}
                        onBlur={() => {
                          const draft = costDrafts[line.id];
                          if (draft === undefined) return;
                          updateLine(line.id, { unitCostInput: draft });
                        }}
                        onFocus={(event) => event.currentTarget.select()}
                      />
                      <div className="mt-1 text-xs text-black/50">
                        {formatMoney(line.unitCostPence, currency)} per {line.unit.name}
                        {line.unit.conversionToBase > 1 ? (
                          <> · {formatMoney(Math.round(line.unitCostPence / line.unit.conversionToBase), currency)} per {line.product.units.find((u) => u.isBaseUnit)?.name ?? 'unit'}</>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-sm font-semibold">
                      {formatMoney(line.lineTotal, currency)}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <button type="button" className="btn-ghost text-xs" onClick={() => removeLine(line.id)}>
                        Remove
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-4">
          <div>
            <label className="label">Payment Status</label>
            <select className="input" name="paymentStatus">
              <option value="PAID">Paid</option>
              <option value="PART_PAID">Part Paid</option>
              <option value="UNPAID">Unpaid</option>
            </select>
          </div>
          <div>
            <label className="label">Payment Method</label>
            <div className="mt-2 flex flex-wrap gap-3 text-sm text-black/70">
              {(['CASH', 'CARD', 'TRANSFER'] as PaymentMethod[]).map((method) => (
                <label key={method} className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={hasMethod(method)}
                    onChange={() => togglePaymentMethod(method)}
                  />
                  <span>{method === 'CASH' ? 'Cash' : method === 'CARD' ? 'Card' : 'Transfer'}</span>
                </label>
              ))}
            </div>
            <div className="mt-1 text-xs text-black/50">Select one or more methods.</div>
          </div>
          <div>
            <label className="label">Due Date</label>
            <input className="input" name="dueDate" type="date" />
          </div>
          <div>
            <label className="label">Cart Total</label>
            <div className="rounded-xl border border-black/10 bg-white px-3 py-2 text-sm font-semibold">
              {formatMoney(totals.total, currency)}
            </div>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {hasMethod('CASH') ? (
            <div>
              <label className="label">Cash Paid</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={cashPaid}
                onChange={(event) => setCashPaid(event.target.value)}
              />
            </div>
          ) : null}
          {hasMethod('CARD') ? (
            <div>
              <label className="label">Card Paid</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={cardPaid}
                onChange={(event) => setCardPaid(event.target.value)}
              />
            </div>
          ) : null}
          {hasMethod('TRANSFER') ? (
            <div>
              <label className="label">Transfer Paid</label>
              <input
                className="input"
                type="number"
                min={0}
                step="0.01"
                inputMode="decimal"
                value={transferPaid}
                onChange={(event) => setTransferPaid(event.target.value)}
              />
            </div>
          ) : null}
        </div>

        {overpay ? (
          <div className="rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800">
            Payment exceeds the total. Reduce the payment or adjust the cart.
          </div>
        ) : null}

        <div>
          <ReceivePurchaseButton disabled={cart.length === 0 || overpay} />
        </div>
      </form>
    </div>
  );
}

function ReceivePurchaseButton({ disabled }: { disabled: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" disabled={disabled || pending}>
      {pending ? 'Submitting…' : 'Receive Purchase'}
    </button>
  );
}
