/**
 * Budgets for the stock import write path.
 *
 * Prisma's interactive transaction defaults to 5s. A few thousand opening-stock
 * lines in one transaction exceed that on Neon and roll back after products
 * have already been saved. Each chunk below is a handful of statements once
 * inventory rows are written in bulk, so it finishes well under a few seconds.
 * The timeout is the safety margin, not the expected runtime.
 */

/** Opening-equity lines posted in one transaction. */
export const OPENING_EQUITY_CHUNK_SIZE = 200;

/** New products (plus their units) created in one transaction. */
export const PRODUCT_CREATE_CHUNK_SIZE = 400;

/**
 * Existing-product updates issued together.
 * These are separate statements, not one interactive transaction.
 */
export const PRODUCT_UPDATE_CHUNK_SIZE = 20;

export const IMPORT_INTERACTIVE_TX = { maxWait: 10_000, timeout: 20_000 } as const;
