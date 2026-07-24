import pg from 'pg';
import { assertIsolatedPreviewDb } from './assert-preview-db.mjs';

const preview = assertIsolatedPreviewDb();
const client = new pg.Client({
  connectionString: preview.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
});
await client.connect();
for (const table of ['Business', 'User', 'Store', 'Product', 'ProductUnit', 'InventoryBalance', 'StockMovement', 'Unit']) {
  const r = await client.query(
    `SELECT column_name, is_nullable, data_type
     FROM information_schema.columns
     WHERE table_schema='public' AND table_name=$1
     ORDER BY ordinal_position`,
    [table],
  );
  console.log('\n==', table, '==');
  console.log(r.rows.map((x) => x.column_name).join(', '));
}
await client.end();
