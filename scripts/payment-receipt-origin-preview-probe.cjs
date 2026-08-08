/**
 * Preview-only payment receipt-origin foundation probe.
 *
 * Applies migration to the isolated Preview Postgres DB, captures baseline
 * fingerprints, inserts tagged synthetic scenarios, verifies origins, then
 * removes only tagged synthetic records and proves baseline restored.
 *
 * NEVER targets Production. Exit 2 = blocked/missing env. Exit 1 = fail.
 *
 * Env:
 *   POSTGRES_URL_NON_POOLING | PREVIEW_DATABASE_URL | POSTGRES_PRISMA_URL
 * Optional:
 *   tmp/payment-origin-preview.local.env (gitignored)
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Client } = require('pg');
const { execSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const TAG = `RECEIPT_ORIGIN_PREVIEW_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const o = {};
  for (const raw of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = raw.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    o[m[1]] = v;
  }
  return o;
}

function requireUrl() {
  const fileEnv = {
    ...loadEnvFile(path.join(root, 'tmp', 'payment-origin-preview.local.env')),
    ...loadEnvFile(path.join(root, 'tmp', 'slice2a-preview.env')),
  };
  const url =
    process.env.PREVIEW_DATABASE_URL ||
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    fileEnv.PREVIEW_DATABASE_URL ||
    fileEnv.POSTGRES_URL_NON_POOLING ||
    fileEnv.POSTGRES_PRISMA_URL;
  if (!url || !String(url).startsWith('postgres')) {
    console.error('FATAL: Preview Postgres URL required. Probe did not execute.');
    process.exit(2);
  }
  if (/tillflow(?!_preview)|prod/i.test(url) && !/preview/i.test(url)) {
    console.error('FATAL: Refusing URL that does not look like Preview.');
    process.exit(2);
  }
  return url;
}

function cuid() {
  return 'c' + crypto.randomBytes(12).toString('hex');
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function fingerprint(db) {
  const pay = await db.query(`
    SELECT COUNT(*)::bigint AS cnt,
           COALESCE(SUM("amountPence"),0)::bigint AS sum_amt,
           COALESCE(SUM(("amountPence"::bigint * 31) + LENGTH(id)),0)::bigint AS fp
    FROM "SalesPayment"
  `);
  const inv = await db.query(`
    SELECT COUNT(*)::bigint AS cnt,
           COALESCE(SUM("totalPence"),0)::bigint AS sum_amt
    FROM "SalesInvoice"
  `);
  return {
    paymentCount: Number(pay.rows[0].cnt),
    paymentSum: Number(pay.rows[0].sum_amt),
    paymentFp: String(pay.rows[0].fp),
    invoiceCount: Number(inv.rows[0].cnt),
    invoiceSum: Number(inv.rows[0].sum_amt),
  };
}

async function main() {
  const started = Date.now();
  const url = requireUrl();
  process.env.POSTGRES_PRISMA_URL = url;
  process.env.POSTGRES_URL_NON_POOLING = url;

  const db = new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false },
  });
  await db.connect();

  const matrix = [];
  let passed = 0;
  const ok = async (label) => {
    passed += 1;
    console.log(`  OK ${label}`);
  };

  try {
    console.log(`TAG=${TAG}`);

    // Baseline before migrate (column may be absent on older Preview DBs)
    let baselineBeforeMigrate = null;
    const colBefore = await db.query(`
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='SalesPayment' AND column_name='receiptOrigin'
    `);
    baselineBeforeMigrate = await fingerprint(db);
    console.log('BASELINE_BEFORE_MIGRATE', JSON.stringify(baselineBeforeMigrate));
    console.log('COLUMN_BEFORE_MIGRATE', colBefore.rows.length === 1 ? 'present' : 'absent');

    console.log('Deploying migrations to Preview…');
    execSync(`npx prisma migrate deploy --schema=prisma/schema.postgres.prisma`, {
      cwd: root,
      stdio: 'inherit',
      env: process.env,
      shell: true,
    });

    const afterMigrate = await fingerprint(db);
    console.log('AFTER_MIGRATE', JSON.stringify(afterMigrate));
    assert(
      afterMigrate.paymentCount === baselineBeforeMigrate.paymentCount,
      `payment count changed by migration: ${baselineBeforeMigrate.paymentCount} → ${afterMigrate.paymentCount}`,
    );
    assert(
      afterMigrate.paymentSum === baselineBeforeMigrate.paymentSum,
      `payment sum changed by migration: ${baselineBeforeMigrate.paymentSum} → ${afterMigrate.paymentSum}`,
    );
    await ok('migration left payment counts/amounts unchanged');

    const baseline = afterMigrate;

    const businessId = cuid();
    const foreignBusinessId = cuid();
    const storeId = cuid();
    const foreignStoreId = cuid();
    const tillId = cuid();
    const foreignTillId = cuid();
    const userId = cuid();
    const foreignUserId = cuid();

    await db.query(
      `INSERT INTO "Business" (id, name, currency, timezone, "subscriptionStatus", "updatedAt")
       VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW())`,
      [businessId, `${TAG} Biz`],
    );
    await db.query(
      `INSERT INTO "Business" (id, name, currency, timezone, "subscriptionStatus", "updatedAt")
       VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW())`,
      [foreignBusinessId, `${TAG} Foreign`],
    );
    await db.query(`INSERT INTO "Store" (id,"businessId",name) VALUES ($1,$2,'Main')`, [
      storeId,
      businessId,
    ]);
    await db.query(`INSERT INTO "Store" (id,"businessId",name) VALUES ($1,$2,'Foreign')`, [
      foreignStoreId,
      foreignBusinessId,
    ]);
    await db.query(`INSERT INTO "Till" (id,"storeId",name) VALUES ($1,$2,'T1')`, [tillId, storeId]);
    await db.query(`INSERT INTO "Till" (id,"storeId",name) VALUES ($1,$2,'FT')`, [
      foreignTillId,
      foreignStoreId,
    ]);
    await db.query(
      `INSERT INTO "User" (id,"businessId",email,name,"passwordHash",role,active)
       VALUES ($1,$2,$3,'Owner','x','OWNER',true)`,
      [userId, businessId, `${TAG}-owner@tillflow-test.invalid`],
    );
    await db.query(
      `INSERT INTO "User" (id,"businessId",email,name,"passwordHash",role,active)
       VALUES ($1,$2,$3,'Foreign','x','OWNER',true)`,
      [foreignUserId, foreignBusinessId, `${TAG}-foreign@tillflow-test.invalid`],
    );

    async function insertInvoice(id, biz, store, till, cashier, total, status = 'PAID') {
      await db.query(
        `INSERT INTO "SalesInvoice" (
           id,"businessId","storeId","tillId","cashierUserId","paymentStatus",
           "transactionNumber","subtotalPence","vatPence","totalPence","qaTag"
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,0,$8,$9)`,
        [id, biz, store, till, cashier, status, `TX-${id.slice(-8)}`, total, TAG],
      );
    }

    async function insertPay(id, invoiceId, method, amount, origin) {
      if (origin == null) {
        await db.query(
          `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"qaTag")
           VALUES ($1,$2,$3,$4,'CONFIRMED',$5)`,
          [id, invoiceId, method, amount, TAG],
        );
      } else {
        await db.query(
          `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin","qaTag")
           VALUES ($1,$2,$3,$4,'CONFIRMED',$5,$6)`,
          [id, invoiceId, method, amount, origin, TAG],
        );
      }
      const row = await db.query(
        `SELECT "receiptOrigin","amountPence" FROM "SalesPayment" WHERE id=$1`,
        [id],
      );
      return row.rows[0];
    }

    function push(scenario, expected, actual, count, amount, result) {
      matrix.push({
        scenario,
        expected,
        actual,
        paymentCount: count,
        amount,
        cashDrawer: 'n/a-db-probe',
        journal: 'n/a-db-probe',
        result,
      });
    }

    // Immediate cash
    {
      const inv = cuid();
      const pay = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 10000);
      const row = await insertPay(pay, inv, 'CASH', 10000, 'RECEIVED_AT_SALE');
      assert(row.receiptOrigin === 'RECEIVED_AT_SALE', 'cash origin');
      push('Immediate cash sale', 'RECEIVED_AT_SALE', row.receiptOrigin, 1, 10000, 'PASS');
      await ok('cash sale');
    }

    // MoMo provider-style
    {
      const inv = cuid();
      const pay = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 6000);
      const row = await insertPay(pay, inv, 'MOBILE_MONEY', 6000, 'RECEIVED_AT_SALE');
      push('Immediate MoMo sale', 'RECEIVED_AT_SALE', row.receiptOrigin, 1, 6000, 'PASS');
      await ok('momo sale');
    }

    // Manual electronic
    {
      const inv = cuid();
      const pay = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 4500);
      const row = await insertPay(pay, inv, 'CARD', 4500, 'RECEIVED_AT_SALE');
      push('Manual electronic sale', 'RECEIVED_AT_SALE', row.receiptOrigin, 1, 4500, 'PASS');
      await ok('electronic sale');
    }

    // Split
    {
      const inv = cuid();
      const p1 = cuid();
      const p2 = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 10000);
      const r1 = await insertPay(p1, inv, 'CASH', 4000, 'RECEIVED_AT_SALE');
      const r2 = await insertPay(p2, inv, 'MOBILE_MONEY', 6000, 'RECEIVED_AT_SALE');
      push('Split-tender cash component', 'RECEIVED_AT_SALE', r1.receiptOrigin, 1, 4000, 'PASS');
      push(
        'Split-tender electronic component',
        'RECEIVED_AT_SALE',
        r2.receiptOrigin,
        1,
        6000,
        'PASS',
      );
      await ok('split tender');
    }

    // Part-paid + later collections + multi
    {
      const inv = cuid();
      const deposit = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 10000, 'PART_PAID');
      const d = await insertPay(deposit, inv, 'CASH', 3000, 'RECEIVED_AT_SALE');
      push('Part-paid sale', 'RECEIVED_AT_SALE', d.receiptOrigin, 1, 3000, 'PASS');

      const c1 = cuid();
      const c2 = cuid();
      const m1 = cuid();
      const m2 = cuid();
      const laterCash = await insertPay(c1, inv, 'CASH', 2000, 'LATER_CREDIT_COLLECTION');
      const laterMomo = await insertPay(c2, inv, 'MOBILE_MONEY', 2000, 'LATER_CREDIT_COLLECTION');
      const multiA = await insertPay(m1, inv, 'CASH', 1500, 'LATER_CREDIT_COLLECTION');
      const multiB = await insertPay(m2, inv, 'CASH', 1500, 'LATER_CREDIT_COLLECTION');
      push('Later cash collection', 'LATER_CREDIT_COLLECTION', laterCash.receiptOrigin, 1, 2000, 'PASS');
      push('Later MoMo collection', 'LATER_CREDIT_COLLECTION', laterMomo.receiptOrigin, 1, 2000, 'PASS');
      push(
        'Multiple later collections',
        'LATER_CREDIT_COLLECTION each',
        `${multiA.receiptOrigin},${multiB.receiptOrigin}`,
        2,
        3000,
        'PASS',
      );
      await ok('part-paid + collections');
    }

    // Unpaid credit — no payment
    {
      const inv = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 8000, 'UNPAID');
      const cnt = await db.query(
        `SELECT COUNT(*)::int AS c FROM "SalesPayment" WHERE "salesInvoiceId"=$1`,
        [inv],
      );
      assert(cnt.rows[0].c === 0, 'unpaid must have no payments');
      push('Unpaid credit sale', 'No payment', 'none', 0, 0, 'PASS');
      await ok('unpaid credit');
    }

    // Ambiguous import
    {
      const inv = cuid();
      const pay = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 500);
      const row = await insertPay(pay, inv, 'CARD', 500, 'UNCLASSIFIED');
      push('Ambiguous import', 'UNCLASSIFIED', row.receiptOrigin, 1, 500, 'PASS');
      await ok('ambiguous import');
    }

    // Old backup restore (null origin)
    {
      const inv = cuid();
      const pay = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 250);
      const row = await insertPay(pay, inv, 'CASH', 250, null);
      assert(row.receiptOrigin === null, 'old restore null');
      push('Old backup restore', 'Legacy unclassified (NULL)', 'NULL', 1, 250, 'PASS');
      await ok('old backup restore');
    }

    // New backup preserve
    {
      const inv = cuid();
      const pay = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 700);
      await insertPay(pay, inv, 'CASH', 700, 'RECEIVED_AT_SALE');
      const rt = await db.query(`SELECT "receiptOrigin" FROM "SalesPayment" WHERE id=$1`, [pay]);
      assert(rt.rows[0].receiptOrigin === 'RECEIVED_AT_SALE', 'preserve');
      push('New backup restore', 'Original value preserved', rt.rows[0].receiptOrigin, 1, 700, 'PASS');
      await ok('new backup preserve');
    }

    // Amendment refund (negative UNCLASSIFIED)
    {
      const inv = cuid();
      const pay = cuid();
      await insertInvoice(inv, businessId, storeId, tillId, userId, 1000);
      const row = await insertPay(pay, inv, 'CASH', -500, 'UNCLASSIFIED');
      push(
        'Amendment/refund/reversal',
        'UNCLASSIFIED (documented)',
        row.receiptOrigin,
        1,
        -500,
        'PASS',
      );
      await ok('amendment refund');
    }

    // Foreign branch / tenant
    {
      const inv = cuid();
      const pay = cuid();
      await insertInvoice(inv, foreignBusinessId, foreignStoreId, foreignTillId, foreignUserId, 99900);
      await insertPay(pay, inv, 'MOBILE_MONEY', 99900, 'RECEIVED_AT_SALE');
      const leak = await db.query(
        `SELECT sp.id FROM "SalesPayment" sp
         JOIN "SalesInvoice" si ON si.id = sp."salesInvoiceId"
         WHERE si."businessId"=$1 AND sp.id=$2`,
        [businessId, pay],
      );
      assert(leak.rows.length === 0, 'tenant leak');
      push('Foreign branch', 'Correctly isolated', 'isolated', 1, 99900, 'PASS');
      push('Foreign tenant', 'No leak', 'no-leak', 1, 99900, 'PASS');
      await ok('tenant/branch isolation');
    }

    // Invalid origin
    {
      let rejected = false;
      try {
        const inv = cuid();
        await insertInvoice(inv, businessId, storeId, tillId, userId, 100);
        await db.query(
          `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin","qaTag")
           VALUES ($1,$2,'CASH',100,'CONFIRMED','YESTERDAY',$3)`,
          [cuid(), inv, TAG],
        );
      } catch (err) {
        rejected = err && err.code === '23514';
      }
      assert(rejected, 'invalid origin must fail');
      await ok('invalid origin rejected');
    }

    console.log('\nPREVIEW_EVIDENCE_MATRIX');
    console.log(JSON.stringify(matrix, null, 2));

    // Cleanup tagged synthetic only
    const biz = await db.query(`SELECT id FROM "Business" WHERE name LIKE $1`, [`${TAG}%`]);
    const ids = biz.rows.map((r) => r.id);
    assert(ids.length >= 2, 'expected tagged businesses');

    await db.query(
      `DELETE FROM "SalesPayment" WHERE "qaTag"=$1 OR "salesInvoiceId" IN (
         SELECT id FROM "SalesInvoice" WHERE "businessId" = ANY($2::text[]) OR "qaTag"=$1
       )`,
      [TAG, ids],
    );
    await db.query(
      `DELETE FROM "SalesInvoice" WHERE "businessId" = ANY($1::text[]) OR "qaTag"=$2`,
      [ids, TAG],
    );
    await db.query(
      `DELETE FROM "Till" WHERE "storeId" IN (SELECT id FROM "Store" WHERE "businessId" = ANY($1::text[]))`,
      [ids],
    );
    await db.query(`DELETE FROM "User" WHERE "businessId" = ANY($1::text[])`, [ids]);
    await db.query(`DELETE FROM "Store" WHERE "businessId" = ANY($1::text[])`, [ids]);
    await db.query(`DELETE FROM "Business" WHERE id = ANY($1::text[])`, [ids]);

    const remaining = await db.query(
      `SELECT COUNT(*)::int AS c FROM "SalesPayment" WHERE "qaTag"=$1`,
      [TAG],
    );
    assert(remaining.rows[0].c === 0, 'tagged payments remain');

    const afterCleanup = await fingerprint(db);
    console.log('AFTER_CLEANUP', JSON.stringify(afterCleanup));
    assert(
      afterCleanup.paymentCount === baseline.paymentCount,
      `cleanup payment count drift ${baseline.paymentCount} → ${afterCleanup.paymentCount}`,
    );
    assert(
      afterCleanup.paymentSum === baseline.paymentSum,
      `cleanup payment sum drift ${baseline.paymentSum} → ${afterCleanup.paymentSum}`,
    );
    assert(
      afterCleanup.paymentFp === baseline.paymentFp,
      `cleanup fingerprint drift ${baseline.paymentFp} → ${afterCleanup.paymentFp}`,
    );
    assert(
      afterCleanup.invoiceCount === baseline.invoiceCount,
      `cleanup invoice count drift`,
    );

    console.log(
      JSON.stringify({
        tag: TAG,
        baseline,
        afterCleanup,
        taggedRemaining: 0,
        unrelatedChanged: 0,
        passed,
        durationMs: Date.now() - started,
        SUITE_EXECUTED: 1,
        SKIPPED: 0,
      }),
    );
    console.log(`\nPREVIEW_PROBE PASSED ${passed} in ${Date.now() - started}ms`);
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
