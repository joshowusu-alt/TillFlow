# Agent B — required `createSale` hook

Baseline `createSale` (`lib/services/sales.ts` at `1e176577`) does **not** accept
`capturedShiftId` or `saleSource`. It always binds the invoice to
`getOpenShiftForTill(businessId, tillId)` — the current OPEN shift of that till.

Agent B must not silently reassign a captured sale onto a later shift. Until
this hook lands, closed-shift sync returns `needs_review` / `shift_closed` and
does **not** call `createSale`.

## Required optional fields on `CreateSaleInput`

```ts
capturedShiftId?: string | null;
saleSource?: 'POS' | 'LATE_OFFLINE' | 'ONLINE_ORDER' | 'UNRECONCILED_LEGACY';
```

## Required behaviour (do not relax till/shift checks)

1. If `capturedShiftId` is set, load **that** shift (same business + till).
   Do not substitute a later OPEN shift.
2. If that shift is OPEN, attach the invoice to it (same as today).
3. If that shift is CLOSED, persist the invoice on the **original** shift and
   set `saleSource = LATE_OFFLINE` (or the provided value). Still require:
   - the shift belongs to `input.tillId`
   - the till belongs to `input.storeId` / `input.businessId`
   - do **not** set `bypassOpenTillRequirement` for this path
4. Honor `input.cashierUserId` as captured. Do not rewrite it to the syncing
   user when the captured cashier is revoked; fail closed if the user row is
   missing or belongs to another business.
5. Keep `externalRef` exact-replay + unique constraint so stock decrements once.

## Call site (once the hook exists)

`app/api/offline/process-offline-sale.ts` will pass:

```ts
await createSale({
  // …existing fields…
  cashierUserId: captured.cashierUserId,
  capturedShiftId: captured.shiftId,
  saleSource: shift.closedAt ? 'LATE_OFFLINE' : undefined,
  externalRef: `OFFLINE_SYNC:${captured.idempotencyKey}`,
  inventoryPolicy: captured.inventoryPolicy ?? 'enforce',
});
```

Until then, closed original shift → `needs_review` / `shift_closed`.
