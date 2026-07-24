/**
 * Verify a completed Preview migration E2E tenant by businessId.
 */
import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import { assertIsolatedPreviewDb } from './assert-preview-db.mjs';

const businessId = process.argv[2];
if (!businessId) {
  console.error('Usage: node scripts/migration/verify-workflow-business.mjs <businessId>');
  process.exit(2);
}

const preview = assertIsolatedPreviewDb();
const client = new pg.Client({
  connectionString: preview.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

const q = (sql, params = []) => client.query(sql, params);

const biz = await q(`SELECT id, name FROM "Business" WHERE id=$1`, [businessId]);
const products = await q(`SELECT COUNT(*)::int AS c FROM "Product" WHERE "businessId"=$1`, [businessId]);
const maps = await q(
  `SELECT COUNT(*)::int AS c FROM "MigrationEntityMap" WHERE "businessId"=$1 AND "entityType"='PRODUCT'`,
  [businessId],
);
const suppliers = await q(`SELECT COUNT(*)::int AS c FROM "Supplier" WHERE "businessId"=$1`, [businessId]);
const posts = await q(
  `SELECT COUNT(*)::int AS c, COALESCE(SUM("qtyBase"),0)::int AS qty FROM "MigrationOpeningStockPosting" WHERE "businessId"=$1`,
  [businessId],
);
const inv = await q(
  `SELECT COALESCE(SUM(ib."qtyOnHandBase"),0)::int AS qty,
          COALESCE(SUM(ib."qtyOnHandBase" * ib."avgCostBasePence"),0)::bigint AS value
   FROM "InventoryBalance" ib
   JOIN "Store" s ON s.id = ib."storeId"
   WHERE s."businessId"=$1`,
  [businessId],
);
const sales = await q(`SELECT COUNT(*)::int AS c FROM "SalesInvoice" WHERE "businessId"=$1`, [businessId]);
const momo = await q(
  `SELECT COUNT(*)::int AS c FROM "MobileMoneyCollection" WHERE "businessId"=$1`,
  [businessId],
);
const purchases = await q(
  `SELECT COUNT(*)::int AS c FROM "PurchaseInvoice" WHERE "businessId"=$1`,
  [businessId],
);
const shifts = await q(
  `SELECT COUNT(*)::int AS c FROM "Shift" sh
   JOIN "User" u ON u.id = sh."userId"
   WHERE u."businessId"=$1`,
  [businessId],
);
const batches = await q(
  `SELECT "templateKind", status, "reconciliationStatus", "rowsImported", "rowsFailed", "chunksImported"
   FROM "MigrationBatch" WHERE "businessId"=$1 ORDER BY "createdAt"`,
  [businessId],
);
const receipts = await q(
  `SELECT phase, COUNT(*)::int AS c FROM "MigrationChunkReceipt" WHERE "businessId"=$1 GROUP BY phase`,
  [businessId],
);

// Retry posting uniqueness: duplicate attempt should be 0 extra
const dup = await q(
  `SELECT "storeId", "productId", COUNT(*)::int AS c
   FROM "MigrationOpeningStockPosting"
   WHERE "businessId"=$1
   GROUP BY 1,2 HAVING COUNT(*) > 1`,
  [businessId],
);

const report = {
  business: biz.rows[0],
  products: products.rows[0].c,
  productMaps: maps.rows[0].c,
  suppliers: suppliers.rows[0].c,
  postings: posts.rows[0],
  inventory: { qty: inv.rows[0].qty, value: Number(inv.rows[0].value) },
  nonImpact: {
    sales: sales.rows[0].c,
    momo: momo.rows[0].c,
    purchases: purchases.rows[0].c,
    shifts: shifts.rows[0].c,
  },
  batches: batches.rows,
  receipts: receipts.rows,
  duplicatePostings: dup.rowCount,
  ok:
    products.rows[0].c === 2500 &&
    maps.rows[0].c === 2500 &&
    posts.rows[0].c > 0 &&
    posts.rows[0].qty === inv.rows[0].qty &&
    sales.rows[0].c === 0 &&
    momo.rows[0].c === 0 &&
    purchases.rows[0].c === 0 &&
    shifts.rows[0].c === 0 &&
    dup.rowCount === 0,
};

mkdirSync('tmp', { recursive: true });
writeFileSync('tmp/migration-preview-workflow-e2e.json', JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await client.end();
process.exit(report.ok ? 0 : 1);
