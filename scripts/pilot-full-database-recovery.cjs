/** Native PostgreSQL recovery drill. Fictional local CI databases ONLY; never uploads dumps. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const bcrypt = require('bcryptjs');
const { createHash, randomBytes } = require('node:crypto');
const { openGuardedPrismaClient } = require('./lib/guarded-prisma.cjs');

const quote = value => `"${value.replaceAll('"', '""')}"`;

let phase = 'guard';
function normalizeConstraintDefinition(row) {
  if (row.kind !== 'constraint' || !['PurchaseInvoice_discount_check', 'PurchaseInvoiceLine_discount_check'].includes(row.name)) return row;
  // pg_dump reparses BETWEEN's nested AND expression as one flat AND. Only
  // this exact pure conjunction is canonicalized; OR, changed bounds, extra
  // terms and NOT VALID remain distinct. Behaviour is also tested on both DBs.
  const flat = row.definition.replace(/[()]/g, '').replace(/\s+/g, ' ').trim();
  const expected = 'CHECK "discountBps" >= 0 AND "discountBps" <= 10000 AND "discountPence" >= 0';
  return flat === expected ? { ...row, definition: expected } : row;
}

async function verifyDiscountConstraints(db, businessId) {
  for (const table of ['PurchaseInvoice', 'PurchaseInvoiceLine']) {
    const rows = table === 'PurchaseInvoice'
      ? await db.$queryRawUnsafe('SELECT id FROM "PurchaseInvoice" WHERE "businessId"=$1 LIMIT 1', businessId)
      : await db.$queryRawUnsafe('SELECT l.id FROM "PurchaseInvoiceLine" l JOIN "PurchaseInvoice" p ON p.id=l."purchaseInvoiceId" WHERE p."businessId"=$1 LIMIT 1', businessId);
    assert.equal(rows.length, 1, 'Persisted purchase discount evidence required');
    for (const [column, value] of [['discountBps', -1], ['discountBps', 10001], ['discountPence', -1]]) {
      let rejected = false;
      try {
        await db.$transaction(async tx => { await tx.$executeRawUnsafe(`UPDATE ${quote(table)} SET ${quote(column)}=$1 WHERE id=$2`, value, rows[0].id); });
      } catch (error) {
        rejected = error.meta?.code === '23514' && String(error.meta?.message).includes(`${table}_discount_check`);
      }
      assert(rejected, `${table} must reject ${column}=${value} with its discount CHECK`);
    }
    const rollback = new Error('rollback-valid-discount-boundaries');
    try {
      await db.$transaction(async tx => {
        for (const value of [0, 10000]) await tx.$executeRawUnsafe(`UPDATE ${quote(table)} SET "discountBps"=$1, "discountPence"=0 WHERE id=$2`, value, rows[0].id);
        throw rollback;
      });
    } catch (error) { if (error !== rollback) throw error; }
  }
}
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
  return { rows, schema: schema.map(normalizeConstraintDefinition), columns, sequences, ledger };
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
    phase = 'source discount constraint behaviour';
    await verifyDiscountConstraints(original, business.id);
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
    // Operator-package rehearsal uses fictional external/configuration bytes;
    // it does not claim a live Blob export or production secret-vault backup.
    phase = 'encrypted operational recovery package';
    const packageDir = path.join(dir, 'package'); fs.mkdirSync(packageDir, { mode: 0o700 });
    fs.copyFileSync(dump, path.join(packageDir, 'database.dump'));
    const externalBytes = Buffer.from('FICTIONAL external product image recovery evidence');
    const configBytes = Buffer.from(JSON.stringify({ NEXTAUTH_SECRET: 'fictional-not-a-real-secret', NODE_VERSION: '22', TILLFLOW_PILOT_MANUAL_PAYMENTS: '1' }));
    fs.writeFileSync(path.join(packageDir, 'external-image.fixture'), externalBytes, { mode: 0o600 });
    fs.writeFileSync(path.join(packageDir, 'environment.fixture.json'), configBytes, { mode: 0o600 });
    const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
    const manifest = Object.fromEntries(['database.dump','external-image.fixture','environment.fixture.json'].map(name => [name, digest(path.join(packageDir,name))]));
    fs.writeFileSync(path.join(packageDir,'manifest.json'), JSON.stringify(manifest), { mode: 0o600 });
    const archive = path.join(dir,'package.tar'), encrypted = path.join(dir,'package.tar.gpg');
    execFileSync('tar',['-cf',archive,'-C',packageDir,'.']);
    const secretFile = path.join(dir,'fictional-package-key'); fs.writeFileSync(secretFile,randomBytes(32).toString('hex'),{mode:0o600});
    const gnupg = path.join(dir,'gnupg'); fs.mkdirSync(gnupg,{mode:0o700});
    const crypt = (args, keyFile=secretFile) => {
      const keyFd = fs.openSync(keyFile,'r');
      try { return execFileSync('gpg',['--homedir',gnupg,'--batch','--yes','--no-symkey-cache','--pinentry-mode','loopback','--passphrase-fd','3',...args],{stdio:['ignore','ignore','pipe',keyFd]}); }
      finally { fs.closeSync(keyFd); }
    };
    crypt(['--symmetric','--cipher-algo','AES256','--output',encrypted,archive]);
    const wrongKey = path.join(dir,'wrong-key'); fs.writeFileSync(wrongKey,randomBytes(32).toString('hex'),{mode:0o600});
    assert.throws(()=>crypt(['--output',path.join(dir,'wrong-key.tar'),'--decrypt',encrypted],wrongKey),'Wrong recovery key must fail');
    const corrupt = path.join(dir,'tampered.gpg'), corruptedBytes = fs.readFileSync(encrypted);
    corruptedBytes[Math.floor(corruptedBytes.length/2)] ^= 1; fs.writeFileSync(corrupt,corruptedBytes,{mode:0o600});
    assert.throws(()=>crypt(['--output',path.join(dir,'tampered.tar'),'--decrypt',corrupt]),'Tampered encrypted package must fail');
    const decrypted = path.join(dir,'recovered.tar'); crypt(['--output',decrypted,'--decrypt',encrypted]);
    const packageRestore = path.join(dir,'recovered-package'); fs.mkdirSync(packageRestore,{mode:0o700});
    execFileSync('tar',['-xf',decrypted,'-C',packageRestore]);
    for(const [name,hash] of Object.entries(manifest)) assert.equal(digest(path.join(packageRestore,name)),hash);
    assert.deepEqual(fs.readFileSync(path.join(packageRestore,'external-image.fixture')),externalBytes);
    assert.deepEqual(fs.readFileSync(path.join(packageRestore,'environment.fixture.json')),configBytes);
    phase = 'create isolated restore database';
    execFileSync('docker', ['exec', container, 'createdb', '-U', 'postgres', restoredName]);
    phase = 'native restore';
    const input = fs.openSync(path.join(packageRestore,'database.dump'), 'r');
    try {
      execFileSync('docker', ['exec', '-i', container, 'pg_restore', '-U', 'postgres', '-d', restoredName, '--exit-on-error', '--no-owner', '--no-acl'], { stdio: [input, 'ignore', 'pipe'] });
    } finally { fs.closeSync(input); }
    const recoveryMs = performance.now() - started;
    ({ prisma: recovered } = await openGuardedPrismaClient({ url: target.toString() }));
    phase = 'restored discount constraint behaviour';
    await verifyDiscountConstraints(recovered, business.id);
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
    console.log('OPERATIONAL_PACKAGE_RECOVERY '+JSON.stringify({passed:true,encryption:'GnuPG AES256',manifestFiles:3,wrongKeyRejected:true,tamperRejected:true,externalFixtureRestored:true,fictionalEnvironmentRestored:true,liveBlobAndSecretBackup:false}));
    phase = 'restored authentication';
    for (const key of ['owner', 'cashier1', 'cashier2']) {
      const user = await recovered.user.findUniqueOrThrow({ where: { id: fixture.users[key].id } });
      assert.equal(await bcrypt.compare(fixture.password, user.passwordHash), true, `${key} restored password must authenticate`);
      assert.equal(user.active, true);
      assert.equal(user.role, fixture.users[key].role);
    }
    console.log('FULL_DATABASE_RECOVERY ' + JSON.stringify({ passed: true, fictional: true, tableCount: Object.keys(after.rows).length, nonEmptyTables: Object.values(after.rows).filter(row => row.count).length, rowCount: Object.values(after.rows).reduce((sum, row) => sum + row.count, 0), recoveryMs: Math.round(recoveryMs), ledger: after.ledger, controls: Object.fromEntries(Object.entries(after.rows).map(([name, row]) => [name, row.count])), credentialsVerified: ['owner', 'cashier1', 'cashier2'], schemaAndAuditHistoryMatch: true, sourceUnchanged: true, schemaObjectCount: after.schema.length, columnCount: after.columns.length, discountConstraintChecks: 20 }));
  } finally {
    await original.$disconnect();
    if (recovered) await recovered.$disconnect();
    fs.rmSync(dir, { recursive: true, force: true });
    // Both databases/container are ephemeral CI resources. No production drop or cleanup command exists.
  }
}
module.exports = { controls, normalizeConstraintDefinition };
if (require.main === module) main().catch(error => { console.error('Full isolated database recovery failed', { phase, code: error.code, databaseCode: error.meta?.code, assertion: error.code === 'ERR_ASSERTION' ? error.message.split('\n')[0] : undefined }); process.exitCode = 1; });
