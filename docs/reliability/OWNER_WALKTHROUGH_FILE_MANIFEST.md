# Owner Walkthrough Programme — File Manifest

Generated before the first programme commit on `fix/tillflow-owner-walkthrough`.
HEAD at classification: `84689fef9be2dea6b48fdfe34cb59423f33cd807` (TishGroup fail-close, already committed).
Intended Production base: `origin/master` merge-base `535fa1a1614b04f6f7a04ac82da189546476dced`.

Classification covers 66 modified tracked files and all untracked files present at that moment.

## 1. Owner walkthrough programme files (to commit)

### Contracts, schema, document numbers

- `docs/reliability/OWNER_WALKTHROUGH_CONTRACTS.md`
- `docs/reliability/OWNER_WALKTHROUGH_FILE_MANIFEST.md`
- `lib/reliability/walkthrough-contracts.ts`
- `lib/reliability/walkthrough-contracts.test.ts`
- `lib/reliability/owner-walkthrough-schema.test.ts`
- `lib/services/document-numbers.ts`
- `prisma/schema.prisma`
- `prisma/schema.postgres.prisma`
- `prisma/migrations/20260917180000_owner_walkthrough_integrity/migration.sql`

### Supplier and expense integrity

- `lib/reliability/supplier-snapshot-reconcile.ts`
- `lib/reliability/supplier-snapshot-reconcile.test.ts`
- `lib/services/supplier-kpis.ts`
- `lib/services/supplier-kpis.test.ts`
- `lib/services/supplier-aging.ts`
- `lib/services/supplier-aging.test.ts`
- `lib/services/supplier-orphans.ts`
- `lib/services/supplier-orphans.test.ts`
- `lib/services/supplier-duplicates.ts`
- `lib/services/supplier-duplicates.test.ts`
- `lib/services/purchases.ts`
- `lib/services/purchases.test.ts`
- `lib/link-purchase-supplier-safety.test.ts`
- `lib/services/suppliers-ledger.test.ts`
- `lib/services/expenses.ts`
- `lib/services/expenses-cash-drawer.test.ts`
- `lib/services/expensePayments.ts`
- `lib/services/expense-payments-concurrency.test.ts`
- `lib/services/inventory-loss-expense-guard.ts`
- `lib/services/inventory-loss-expense-guard.test.ts`
- `app/actions/suppliers.ts`
- `app/actions/expenses.ts`
- `app/(protected)/suppliers/page.tsx`
- `app/(protected)/suppliers/[id]/page.tsx`
- `app/(protected)/suppliers/orphans/page.tsx`
- `app/(protected)/suppliers/duplicates/page.tsx`
- `app/(protected)/purchases/page.tsx`
- `app/(protected)/purchases/[id]/page.tsx`
- `app/(protected)/purchases/PurchaseFormClient.tsx`
- `app/(protected)/payments/supplier-aging/page.tsx`
- `app/(protected)/payments/supplier-aging/export/route.ts`
- `app/(protected)/expenses/page.tsx`
- `app/(protected)/expenses/ExpenseForm.tsx`
- `app/(protected)/payments/expense-payments/page.tsx`
- `app/(protected)/payments/expense-payments/ExpensePaymentForm.tsx`
- `app/(protected)/payments/customer-receipts/page.tsx`
- `app/(protected)/payments/customer-receipts/receipt-list.ts`
- `app/(protected)/payments/customer-receipts/receipt-list.test.ts`

### Stocktake and reversals

- `app/actions/stocktake.ts`
- `app/(protected)/inventory/stocktake/page.tsx`
- `app/(protected)/inventory/stocktake/StocktakeClient.tsx`
- `app/(protected)/inventory/stocktake/stocktake-state.ts`
- `app/actions/inventory.ts`
- `app/actions/inventory-reversal.ts`
- `lib/services/inventory-reversal.ts`
- `lib/services/inventory-reversal.test.ts`
- `lib/services/inventory-decrease.ts`
- `lib/services/inventory-decrease.test.ts`
- `lib/services/inventory-decrease-actions.test.ts`
- `lib/services/inventory-increase.ts`
- `lib/services/inventory-increase.test.ts`
- `lib/services/inventory-increase-actions.test.ts`
- `lib/services/inventory-increase-scoped-gate.test.ts`
- `lib/services/barcode-stocktake-hardening.test.ts`
- `lib/services/adjustments-page-polish.test.ts`
- `app/(protected)/inventory/StockAdjustmentClient.tsx`
- `app/(protected)/inventory/adjustments/page.tsx`
- `app/(protected)/inventory/adjustments/ReverseStockAdjustmentForm.tsx`
- `app/(protected)/reports/stock-movements/page.tsx`

### Shifts and cash variance

- `lib/services/shifts.ts`
- `lib/services/shift-integrity.test.ts`
- `lib/services/shifts-open-list.test.ts`
- `app/actions/shifts.ts`
- `app/(protected)/shifts/page.tsx`
- `app/(protected)/shifts/ShiftClient.tsx`
- `app/(protected)/shifts/ShiftClient.test.tsx`
- `app/(protected)/shifts/drawer/page.tsx`
- `app/(protected)/shifts/variance/page.tsx`
- `app/(protected)/shifts/variance/[id]/page.tsx`
- `app/(protected)/shifts/variance/VarianceWorkflowClient.tsx`
- `lib/services/cash-variance.ts`
- `lib/services/cash-variance.test.ts`
- `lib/services/cash-drawer.ts`
- `lib/services/cash-drawer.test.ts`
- `app/(protected)/reports/cash-drawer/page.tsx`
- `components/TillManagement.tsx`

### Operational UX

- `components/RemainingBalance.tsx`
- `components/ShowingRange.tsx`
- `components/AccountingDetails.tsx`
- `components/CompactMobileList.tsx`
- `components/ZeroValueRows.tsx`
- `components/ZeroValueRows.test.tsx`
- `components/products/ProductFormSections.tsx`
- `components/products/ProductCreateFormEnhancer.tsx`
- `components/products/ProductListStateSync.tsx`
- `lib/ui/document-label.ts`
- `lib/ui/document-label.test.ts`
- `lib/ui/drill-link.ts`
- `lib/ui/drill-link.test.ts`
- `lib/ui/list-state.ts`
- `lib/ui/list-state.test.ts`
- `lib/ui/use-list-state.ts`
- `lib/ui/stale-while-revalidate.tsx`
- `lib/ui/products-loading.measurement.test.ts`
- `lib/navigation/mobile-menu-config.ts`
- `lib/navigation/mobile-parity-p1.test.ts`
- `lib/navigation/mobile-parity-p2.test.ts`
- `app/(protected)/products/page.tsx`
- `app/(protected)/products/loading.tsx`
- `app/(protected)/products/new/loading.tsx`
- `app/(protected)/products/labels/page.tsx`
- `app/(protected)/products/labels/LabelPrintClient.tsx`
- `app/(protected)/products/labels/label-queue.ts`
- `app/(protected)/products/labels/label-queue.test.ts`
- `app/(protected)/products/labels/mobile-parity-p2.test.ts`
- `lib/loading/phase1-skeleton-route-polish.test.ts`
- `lib/loading/route-geometry-parity.test.ts`
- `lib/loading/route-skeletons.test.ts`
- `lib/services/people-clarity.test.ts`

### Independent QA / permissions documentation tests

- `lib/reliability/owner-walkthrough-permissions.test.ts`

## 2. Pre-existing TishGroup changes

Already committed on this branch. Not part of the uncommitted walkthrough working tree.

| SHA | Subject |
| --- | --- |
| `84689fef` | fail-close database targeting and read-only rollback mode |
| `51a78d84` | close support-audit P1 and password cutover CLI |
| `833dd9a9` | lastPaymentAt / control-plane fallbacks |
| `cb958264` | standalone Preview project from vendored TillFlow libs |
| `2c0e0ec2` | CI lint isolation / seed bootstrap |
| `b6a12394` | partial payments unlocking paid status |
| `7e9ab579` | null password hashes documentation |
| `18347428` | contain auth, billing writes, mock KPIs |

No additional uncommitted TishGroup files were found mixed into the working tree.

## 3. Temporary files — do not commit

Entire `tmp/` tree (prior programme logs, screenshots, probe scripts, commit-message drafts, contract-recovery fragments, build logs). Includes files that look like secrets:

- `tmp/phase0-preview-session-secret.txt`
- `tmp/phase0-preview-session-secret-oneline.txt`
- `tmp/phase0-preview-dsn.txt`
- `tmp/phase0.1-tg-prod.env`

These stay untracked.

## 4. Generated / database artefacts — do not commit

- `prisma/tmp/gate-f-lab.db`

## 5. Unrelated changes

None identified in the 66 modified tracked files. Every modified tracked path belongs to this walkthrough programme.

## 6. Commit exclusion proof

The following paths are excluded from every programme commit:

- `tmp/**`
- `prisma/tmp/**`
- `.env*`
- any `*.db`, log, screenshot, or probe-secret file

`git diff --check` was run on the working tree before the first programme commit. CRLF warnings on three supplier files are line-ending conversions, not conflict markers.
