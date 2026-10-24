/** Native PostgreSQL recovery drill. Fictional local CI databases ONLY; never uploads dumps. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');

const quote = value => `"${value.replaceAll('"', '""')}"`;

let phase = 'guard';
async function controls(db) {
  phase = 'enumerate tables';
  const tables = await db.$queryRawUnsafe("SELECT tablename FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename");
  const rows = {};
  for (const { tablename } of tables) {
    phase = `control table ${tablename}`;
    // Full rows include authentication factors, audit history, idempotency keys,
    // operational evidence and tables outside the limited application JSON export.
    const [result] = await db.$queryRawUnsafe(`SELECT count(*)::int AS count, md5(coalesce(string_agg(to_jsonb(t)::text, E'\\n' ORDER BY to_jsonb(t)::text), '')) AS digest FROM public.${quote(tablename)} t`);
    rows[tablename] = result;
  }
  phase = 'schema controls';
  const schema = await db.$queryRawUnsafe(`SELECT 'constraint' AS kind, c.relname AS object, con.conname AS name, pg_get_constraintdef(con.oid) AS definition, con.convalidated AS valid
    FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public'
    UNION ALL SELECT 'index', tablename, indexname, indexdef, true FROM pg_indexes WHERE schemaname='public'
    UNION ALL SELECT 'trigger', c.relname, t.tgname, pg_get_triggerdef(t.oid), t.tgenabled <> 'D' FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal
    UNION ALL SELECT 'routine', p.proname, pg_get_function_identity_arguments(p.oid), pg_get_functiondef(p.oid), true FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.prokind IN ('f','p')
    ORDER BY kind, object, name, definition`);
  phase = 'column controls';
  const columns = await db.$queryRawUnsafe("SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name, ordinal_position");
  phase = 'sequence controls';
  const sequences = await db.$queryRawUnsafe("SELECT sequencename, start_value::text, min_value::text, max_value::text, increment_by::text, cycle, last_value::text FROM pg_sequences WHERE schemaname='public' ORDER BY sequencename");
  phase = 'ledger controls';
  const [ledger] = await db.$queryRawUnsafe('SELECT coalesce(sum("debitPence"),0)::text AS debit, coalesce(sum("creditPence"),0)::text AS credit FROM "JournalLine"');
  assert.equal(ledger.debit, ledger.credit, 'Whole fictional ledger must balance');
  return { rows, schema, columns, sequences, ledger };
}

async function main() {
  assert.equal(process.env.CI, 'true', 'Disposable CI only');
  assert.equal(process.env.TILLFLOW_RUN_FULL_DB_RECOVERY, '1', 'Explicit recovery opt-in required');
  const source = new URL(process.env.TILLFLOW_TEST_DATABASE_URL);
  assert(['localhost', '127.0.0.1'].includes(source.hostname), 'Only a local PostgreSQL service is allowed');
  assert.equal(source.pathname, '/tillflow_ci_pilot', 'Only the dedicated fictional acceptance database is allowed');
  const container = process.env.TILLFLOW_TEST_POSTGRES_CONTAINER;
  assert.match(container || '', /^[a-f0-9]{12,64}$/, 'A local CI service container ID is required');
  const restoredName = `tillflow_ci_recovered_${Date.now()}`;
  const target = new URL(source); target.pathname = `/${restoredName}`;
  const fixture = JSON.parse(fs.readFileSync(process.env.PILOT_FIXTURE_PATH || 'tmp/pilot-acceptance.json', 'utf8'));
  const { prisma: original } = await openGuardedPrismaClient({ url: source.toString() });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tillflow-recovery-'));
  let recovered;
  try {
    const business = await original.business.findUniqueOrThrow({ where: { id: fixture.businessId } });
    assert.match(business.name, /^FICTIONAL/);
    await original.auditLog.create({ data: { businessId: business.id, userId: fixture.users.owner.id, userName: 'Fictional owner', userRole: 'OWNER', action: 'FULL_DATABASE_RECOVERY_DRILL', details: 'Native backup must retain this audit evidence' } });
    await original.riskAlert.create({ data: { businessId: business.id, storeId: fixture.stores[0].id, alertType: 'FICTIONAL_RECOVERY', summary: 'Isolated full recovery evidence' } });
    await original.stocktake.create({ data: { storeId: fixture.stores[0].id, userId: fixture.users.owner.id, notes: 'Fictional in-progress count retained by native backup', lines: { create: { productId: fixture.products[0].id, expectedBase: 99, countedBase: 99, varianceBase: 0 } } } });
    phase = 'fixture controls';
    const before = await controls(original);
    for (const table of ['Business', 'User', 'Product', 'InventoryBalance', 'StockMovement', 'SalesInvoice', 'SalesPayment', 'PurchaseInvoice', 'PurchasePayment', 'Expense', 'ExpensePayment', 'CashDrawerEntry', 'MoneyIdempotency', 'JournalEntry', 'JournalLine', 'AuditLog', 'RiskAlert', 'Stocktake', 'StocktakeLine']) assert(before.rows[table]?.count > 0, `Non-empty ${table} evidence required`);
    phase = 'native dump';
    const dump = path.join(dir, 'fictional.dump');
    const fd = fs.openSync(dump, 'wx', 0o600);
    const started = performance.now();
    try {
      execFileSync('docker', ['exec', container, 'pg_dump', '-U', 'postgres', '-d', 'tillflow_ci_pilot', '--format=custom', '--no-owner', '--no-acl'], { stdio: ['ignore', fd, 'pipe'] });
    } finally { fs.closeSync(fd); }
    phase = 'create isolated restore database';
    execFileSync('docker', ['exec', container, 'createdb', '-U', 'postgres', restoredName]);
    phase = 'native restore';
    const input = fs.openSync(dump, 'r');
    try {
      execFileSync('docker', ['exec', '-i', container, 'pg_restore', '-U', 'postgres', '-d', restoredName, '--exit-on-error', '--no-owner', '--no-acl'], { stdio: [input, 'ignore', 'pipe'] });
    } finally { fs.closeSync(input); }
    const recoveryMs = performance.now() - started;
    ({ prisma: recovered } = await openGuardedPrismaClient({ url: target.toString() }));
    const after = await controls(recovered);
    phase = 'compare complete controls';
    if (JSON.stringify(after) !== JSON.stringify(before)) {
      // Diagnostic metadata only: never print financial rows, authentication
      // factors, row fingerprints or native archive contents on a mismatch.
      console.error('RECOVERY_CONTROL_DIFFERENCES', JSON.stringify({
        tables: Object.keys(before.rows).filter(table => JSON.stringify(before.rows[table]) !== JSON.stringify(after.rows[table])).map(table => ({ table, beforeCount: before.rows[table].count, afterCount: after.rows[table]?.count })),
        schema: ['schema', 'columns', 'sequences'].map(key => ({ key, beforeCount: before[key].length, afterCount: after[key].length, mismatches: before[key].flatMap((row, index) => JSON.stringify(row) === JSON.stringify(after[key][index]) ? [] : [{ object: row.object || row.table_name || row.sequencename, name: row.name || row.column_name, fields: Object.keys(row).filter(field => row[field] !== after[key][index]?.[field]) }]).slice(0, 12) })),
        ledgerMatches: JSON.stringify(before.ledger) === JSON.stringify(after.ledger),
      }));
    }
    assert.deepEqual(after, before, 'Every public table, column, constraint, index, trigger, routine and sequence must match');
    assert.deepEqual(await controls(original), before, 'Source must remain unchanged during dump/restore');
    phase = 'restored authentication';
    for (const key of ['owner', 'cashier1', 'cashier2']) {
      const user = await recovered.user.findUniqueOrThrow({ where: { id: fixture.users[key].id } });
      assert.equal(await bcrypt.compare(fixture.password, user.passwordHash), true, `${key} restored password must authenticate`);
      assert.equal(user.active, true);
      assert.equal(user.role, fixture.users[key].role);
    }
    console.log('FULL_DATABASE_RECOVERY ' + JSON.stringify({ passed: true, fictional: true, tableCount: Object.keys(after.rows).length, nonEmptyTables: Object.values(after.rows).filter(row => row.count).length, rowCount: Object.values(after.rows).reduce((sum, row) => sum + row.count, 0), recoveryMs: Math.round(recoveryMs), ledger: after.ledger, controls: Object.fromEntries(Object.entries(after.rows).map(([name, row]) => [name, row.count])), credentialsVerified: ['owner', 'cashier1', 'cashier2'], schemaAndAuditHistoryMatch: true, sourceUnchanged: true }));
  } finally {
    await original.$disconnect();
    if (recovered) await recovered.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
    // Both databases/container are ephemeral CI resources. No production drop or cleanup command exists.
  }
}
module.exports = { controls };
if (require.main === module) main().catch(error => { console.error('Full isolated database recovery failed', { phase, code: error.code, databaseCode: error.meta?.code, assertion: error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : undefined }); process.exitCode = 1; });
