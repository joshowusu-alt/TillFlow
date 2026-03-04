/**
 * Zod enum validators derived from Prisma schema string-enum fields.
 *
 * These are used in server actions to runtime-validate enum-constrained
 * fields before they reach the database, preventing tampered form
 * submissions from writing invalid values.
 */
import { z } from 'zod';

// ---------------------------------------------------------------------------
// Payment
// ---------------------------------------------------------------------------

/** PAID | PART_PAID | UNPAID */
export const PaymentStatusEnum = z.enum(
  ['PAID', 'PART_PAID', 'UNPAID'] as const,
  { message: 'Invalid payment status. Expected PAID, PART_PAID, or UNPAID.' }
);

/** CASH | CARD | TRANSFER | MOBILE_MONEY */
export const PaymentMethodEnum = z.enum(
  ['CASH', 'CARD', 'TRANSFER', 'MOBILE_MONEY'] as const,
  { message: 'Invalid payment method. Expected CASH, CARD, TRANSFER, or MOBILE_MONEY.' }
);

// ---------------------------------------------------------------------------
// Stock / Inventory
// ---------------------------------------------------------------------------

/** INCREASE | DECREASE */
export const StockDirectionEnum = z.enum(
  ['INCREASE', 'DECREASE'] as const,
  { message: 'Invalid stock adjustment direction. Expected INCREASE or DECREASE.' }
);

// ---------------------------------------------------------------------------
// Returns
// ---------------------------------------------------------------------------

/** RETURN | VOID */
export const ReturnTypeEnum = z.enum(
  ['RETURN', 'VOID'] as const,
  { message: 'Invalid return type. Expected RETURN or VOID.' }
);

// ---------------------------------------------------------------------------
// Users / Auth
// ---------------------------------------------------------------------------

/** CASHIER | MANAGER | OWNER */
export const UserRoleEnum = z.enum(
  ['CASHIER', 'MANAGER', 'OWNER'] as const,
  { message: 'Invalid user role. Expected CASHIER, MANAGER, or OWNER.' }
);

// ---------------------------------------------------------------------------
// Sales
// ---------------------------------------------------------------------------

/** NONE | PERCENT | AMOUNT */
export const DiscountTypeEnum = z.enum(
  ['NONE', 'PERCENT', 'AMOUNT'] as const,
  { message: 'Invalid discount type. Expected NONE, PERCENT, or AMOUNT.' }
);

// ---------------------------------------------------------------------------
// Accounting
// ---------------------------------------------------------------------------

/** ASSET | LIABILITY | EQUITY | INCOME | EXPENSE */
export const AccountTypeEnum = z.enum(
  ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const,
  { message: 'Invalid account type.' }
);

// ---------------------------------------------------------------------------
// Shifts
// ---------------------------------------------------------------------------

/** OPEN | CLOSED */
export const ShiftStatusEnum = z.enum(
  ['OPEN', 'CLOSED'] as const,
  { message: 'Invalid shift status. Expected OPEN or CLOSED.' }
);

// ---------------------------------------------------------------------------
// Stocktakes
// ---------------------------------------------------------------------------

/** IN_PROGRESS | COMPLETED */
export const StocktakeStatusEnum = z.enum(
  ['IN_PROGRESS', 'COMPLETED'] as const,
  { message: 'Invalid stocktake status. Expected IN_PROGRESS or COMPLETED.' }
);

// ---------------------------------------------------------------------------
// Stock Transfers
// ---------------------------------------------------------------------------

/** PENDING | APPROVED | COMPLETED | REJECTED */
export const StockTransferStatusEnum = z.enum(
  ['PENDING', 'APPROVED', 'COMPLETED', 'REJECTED'] as const,
  { message: 'Invalid stock transfer status.' }
);

// ---------------------------------------------------------------------------
// Mobile Money
// ---------------------------------------------------------------------------

/** PENDING | CONFIRMED | FAILED */
export const MobileMoneyStatusEnum = z.enum(
  ['PENDING', 'CONFIRMED', 'FAILED'] as const,
  { message: 'Invalid mobile money collection status.' }
);
