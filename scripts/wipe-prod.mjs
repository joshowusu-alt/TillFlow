import pg from 'pg';
const { Client } = pg;

const c = new Client({
  connectionString: 'postgresql://neondb_owner:npg_zoCka2MQm9tI@ep-fancy-darkness-abyuvjxt-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require&pgbouncer=true&connect_timeout=15',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  await c.connect();

  // Check what exists
  const biz = await c.query('SELECT id, name FROM "Business"');
  console.log('Businesses:', JSON.stringify(biz.rows));

  const users = await c.query('SELECT name, email, role FROM "User"');
  console.log('Users:', JSON.stringify(users.rows));

  if (process.argv.includes('--wipe')) {
    console.log('\n--- WIPING ALL DATA ---');
    // Delete in dependency order (children first)
    const tables = [
      'JournalEntry', 'SalesPayment', 'SalesInvoiceLine', 'SalesReturn',
      'MobileMoneyCollection', 'SalesInvoice', 'PurchasePayment', 'PurchaseInvoiceLine',
      'PurchaseInvoice', 'ExpensePayment', 'Expense', 'StockAdjustment',
      'StockTransferLine', 'StockTransfer', 'InventoryBalance', 'Shift',
      'AuditLog', 'Notification', 'Session', 'Till', 'Branch',
      'ProductUnit', 'Product', 'Category', 'Customer', 'Supplier',
      'Account', 'User', 'Organization', 'Store', 'Business', 'Unit',
    ];
    for (const table of tables) {
      try {
        const result = await c.query(`DELETE FROM "${table}"`);
        console.log(`  Deleted ${result.rowCount} rows from ${table}`);
      } catch (e) {
        console.log(`  Skipped ${table}: ${e.message.split('\n')[0]}`);
      }
    }
    console.log('\nDone. Database is clean for fresh registrations.');
  } else {
    console.log('\nRun with --wipe to delete all data');
  }

  await c.end();
}

main().catch(e => { console.error(e); process.exit(1); });
