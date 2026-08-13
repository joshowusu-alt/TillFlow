/**
 * Read-only MoMo confirmation review types (Step 5M).
 * Presentation/query only — does not change Money Received aggregation.
 */

export const MOMO_CONFIRMATION_STATUS = 'PENDING_MANUAL' as const;

export type MomoConfirmationRow = {
  paymentId: string;
  receivedAt: Date;
  amountPence: number;
  method: string;
  status: string;
  receiptOrigin: string | null;
  reference: string | null;
  network: string | null;
  provider: string | null;
  payerMsisdn: string | null;
  collectionId: string | null;
  salesInvoiceId: string;
  transactionNumber: string | null;
  saleStatus: string;
  storeId: string;
  storeName: string;
  cashierUserId: string | null;
  cashierName: string | null;
  customerName: string | null;
};

export type MomoConfirmationListResult = {
  rows: MomoConfirmationRow[];
  totalCount: number;
  totalAmountPence: number;
  page: number;
  pageSize: number;
  totalPages: number;
  queryFailed?: boolean;
  queryError?: string;
};

export type MomoConfirmationFilters = {
  businessId: string;
  branchIds: string[] | null;
  periodStart: Date;
  periodEndExclusive: Date;
  /** Exact payment status, or null/'ALL' for all non-classified statuses. */
  status: string | null;
  /** Parent sale paymentStatus, or null/'ALL'. */
  saleStatus: string | null;
  /** Cashier user id, or null/'ALL'. */
  cashierUserId: string | null;
};
