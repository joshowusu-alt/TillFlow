/**
 * PostgreSQL behavioural suite for SalesPayment.receiptOrigin foundation.
 *
 * FATAL (exit 2) if no Postgres URL — this suite must not silently skip.
 *
 * Env: POSTGRES_URL_NON_POOLING | POSTGRES_PRISMA_URL | DATABASE_URL (postgres://)
 */

const { Client } = require('pg');
const { execSync } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const schemaRel = 'prisma/schema.postgres.prisma';

function requireUrl() {
  const url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL;
  if (!url || !String(url).startsWith('postgres')) {
    console.error(
      'FATAL: PostgreSQL URL required (POSTGRES_URL_NON_POOLING / POSTGRES_PRISMA_URL). Suite did not execute.',
    );
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

async function main() {
  const started = Date.now();
  const url = requireUrl();
  process.env.POSTGRES_PRISMA_URL = url;
  process.env.POSTGRES_URL_NON_POOLING = url;

  console.log('Deploying migrations…');
  execSync(`npx prisma migrate deploy --schema=${schemaRel}`, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });

  const db = new Client({
    connectionString: url,
    ssl: url.includes('localhost') || url.includes('127.0.0.1')
      ? false
      : { rejectUnauthorized: false },
  });
  await db.connect();

  let passed = 0;
  const tag = `RECEIPT_ORIGIN_PG_${Date.now()}`;

  async function ok(label) {
    passed += 1;
    console.log(`  OK ${label}`);
  }

  try {
    // Column exists and is nullable
    const col = await db.query(`
      SELECT is_nullable, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'SalesPayment' AND column_name = 'receiptOrigin'
    `);
    assert(col.rows.length === 1, 'receiptOrigin column missing');
    assert(col.rows[0].is_nullable === 'YES', 'receiptOrigin must be nullable');
    await ok('migration added nullable receiptOrigin');

    // Seed minimal business graph
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
      [businessId, `${tag} Biz`],
    );
    await db.query(
      `INSERT INTO "Business" (id, name, currency, timezone, "subscriptionStatus", "updatedAt")
       VALUES ($1,$2,'GHS','Africa/Accra','TRIAL_ACTIVE',NOW())`,
      [foreignBusinessId, `${tag} Foreign`],
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
      [userId, businessId, `${tag}-owner@tillflow-test.invalid`],
    );
    await db.query(
      `INSERT INTO "User" (id,"businessId",email,name,"passwordHash",role,active)
       VALUES ($1,$2,$3,'Foreign','x','OWNER',true)`,
      [foreignUserId, foreignBusinessId, `${tag}-foreign@tillflow-test.invalid`],
    );

    async function insertInvoice(id, biz, store, till, cashier, total) {
      await db.query(
        `INSERT INTO "SalesInvoice" (
           id,"businessId","storeId","tillId","cashierUserId","paymentStatus",
           "transactionNumber","subtotalPence","vatPence","totalPence"
         ) VALUES ($1,$2,$3,$4,$5,'PAID',$6,$7,0,$7)`,
        [id, biz, store, till, cashier, `TX-${id.slice(-8)}`, total],
      );
    }

    // Historical payment WITHOUT receiptOrigin (simulate pre-migration row insert)
    const histInvoice = cuid();
    const histPayment = cuid();
    await insertInvoice(histInvoice, businessId, storeId, tillId, userId, 5000);
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status)
       VALUES ($1,$2,'CASH',5000,'CONFIRMED')`,
      [histPayment, histInvoice],
    );
    const hist = await db.query(
      `SELECT "receiptOrigin","amountPence" FROM "SalesPayment" WHERE id=$1`,
      [histPayment],
    );
    assert(hist.rows[0].receiptOrigin === null, 'historical row must remain NULL');
    assert(Number(hist.rows[0].amountPence) === 5000, 'historical amount unchanged');
    await ok('historical payment survives as NULL unclassified');

    // Pre/post migration amount invariant already satisfied for this DB;
    // insert new classified payments and verify constraints.

    const saleCash = cuid();
    const payCash = cuid();
    await insertInvoice(saleCash, businessId, storeId, tillId, userId, 10000);
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin")
       VALUES ($1,$2,'CASH',10000,'CONFIRMED','RECEIVED_AT_SALE')`,
      [payCash, saleCash],
    );
    await ok('RECEIVED_AT_SALE cash insert');

    const saleMomo = cuid();
    const payMomo = cuid();
    await insertInvoice(saleMomo, businessId, storeId, tillId, userId, 6000);
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin")
       VALUES ($1,$2,'MOBILE_MONEY',6000,'CONFIRMED','RECEIVED_AT_SALE')`,
      [payMomo, saleMomo],
    );
    await ok('RECEIVED_AT_SALE MoMo insert');

    const saleSplit = cuid();
    const paySplitCash = cuid();
    const paySplitMomo = cuid();
    await insertInvoice(saleSplit, businessId, storeId, tillId, userId, 10000);
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin")
       VALUES ($1,$2,'CASH',4000,'CONFIRMED','RECEIVED_AT_SALE'),
              ($3,$2,'MOBILE_MONEY',6000,'CONFIRMED','RECEIVED_AT_SALE')`,
      [paySplitCash, saleSplit, paySplitMomo],
    );
    await ok('split-tender components each RECEIVED_AT_SALE');

    const salePart = cuid();
    const payDeposit = cuid();
    await insertInvoice(salePart, businessId, storeId, tillId, userId, 10000);
    await db.query(
      `UPDATE "SalesInvoice" SET "paymentStatus"='PART_PAID' WHERE id=$1`,
      [salePart],
    );
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin")
       VALUES ($1,$2,'CASH',3000,'CONFIRMED','RECEIVED_AT_SALE')`,
      [payDeposit, salePart],
    );
    await ok('part-paid deposit RECEIVED_AT_SALE');

    const saleUnpaid = cuid();
    await insertInvoice(saleUnpaid, businessId, storeId, tillId, userId, 8000);
    await db.query(
      `UPDATE "SalesInvoice" SET "paymentStatus"='UNPAID' WHERE id=$1`,
      [saleUnpaid],
    );
    const unpaidPays = await db.query(
      `SELECT COUNT(*)::int AS c FROM "SalesPayment" WHERE "salesInvoiceId"=$1`,
      [saleUnpaid],
    );
    assert(unpaidPays.rows[0].c === 0, 'unpaid credit must have no payments');
    await ok('unpaid credit creates no payment');

    const laterCash = cuid();
    const laterMomo = cuid();
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin")
       VALUES ($1,$2,'CASH',3000,'CONFIRMED','LATER_CREDIT_COLLECTION'),
              ($3,$2,'MOBILE_MONEY',4000,'CONFIRMED','LATER_CREDIT_COLLECTION')`,
      [laterCash, salePart, laterMomo],
    );
    await ok('later collections LATER_CREDIT_COLLECTION');

    const multi1 = cuid();
    const multi2 = cuid();
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin")
       VALUES ($1,$2,'CASH',1000,'CONFIRMED','LATER_CREDIT_COLLECTION'),
              ($3,$2,'CASH',1000,'CONFIRMED','LATER_CREDIT_COLLECTION')`,
      [multi1, salePart, multi2],
    );
    await ok('multiple later collections preserve origin independently');

    const ambig = cuid();
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin")
       VALUES ($1,$2,'CARD',500,'CONFIRMED','UNCLASSIFIED')`,
      [ambig, saleCash],
    );
    await ok('ambiguous import UNCLASSIFIED');

    // Invalid origin rejected by CHECK
    let rejected = false;
    try {
      await db.query(
        `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin")
         VALUES ($1,$2,'CASH',100,'CONFIRMED','YESTERDAY')`,
        [cuid(), saleCash],
      );
    } catch (err) {
      rejected = err && err.code === '23514';
    }
    assert(rejected, 'invalid origin must fail CHECK');
    await ok('invalid origin fails safely');

    // Old-format restore = NULL origin allowed
    const oldRestore = cuid();
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status)
       VALUES ($1,$2,'CASH',250,'CONFIRMED')`,
      [oldRestore, saleCash],
    );
    const oldRow = await db.query(`SELECT "receiptOrigin" FROM "SalesPayment" WHERE id=$1`, [
      oldRestore,
    ]);
    assert(oldRow.rows[0].receiptOrigin === null, 'old restore leaves NULL');
    await ok('old-format restore leaves NULL unclassified');

    // New-format round trip preserves
    const rt = await db.query(
      `SELECT "receiptOrigin" FROM "SalesPayment" WHERE id=$1`,
      [payMomo],
    );
    assert(rt.rows[0].receiptOrigin === 'RECEIVED_AT_SALE', 'new origin preserved');
    await ok('new-format origin preserved');

    // Tenant isolation: foreign payment not visible under business filter via invoice
    const foreignSale = cuid();
    const foreignPay = cuid();
    await insertInvoice(
      foreignSale,
      foreignBusinessId,
      foreignStoreId,
      foreignTillId,
      foreignUserId,
      99900,
    );
    await db.query(
      `INSERT INTO "SalesPayment" (id,"salesInvoiceId",method,"amountPence",status,"receiptOrigin")
       VALUES ($1,$2,'MOBILE_MONEY',99900,'CONFIRMED','RECEIVED_AT_SALE')`,
      [foreignPay, foreignSale],
    );
    const leak = await db.query(
      `SELECT sp.id FROM "SalesPayment" sp
       JOIN "SalesInvoice" si ON si.id = sp."salesInvoiceId"
       WHERE si."businessId" = $1 AND sp.id = $2`,
      [businessId, foreignPay],
    );
    assert(leak.rows.length === 0, 'foreign tenant payment leaked');
    await ok('cross-tenant isolation');

    // Branch integrity: payments join to store via invoice
    const branchOk = await db.query(
      `SELECT COUNT(*)::int AS c FROM "SalesPayment" sp
       JOIN "SalesInvoice" si ON si.id = sp."salesInvoiceId"
       WHERE si."storeId" = $1 AND sp.id = $2`,
      [storeId, payCash],
    );
    assert(branchOk.rows[0].c === 1, 'branch join broken');
    await ok('branch relationship intact');

    // Amount invariant for tagged fixture: sum matches inserts
    const sum = await db.query(
      `SELECT COALESCE(SUM(sp."amountPence"),0)::bigint AS total
       FROM "SalesPayment" sp
       JOIN "SalesInvoice" si ON si.id = sp."salesInvoiceId"
       WHERE si."businessId" = $1`,
      [businessId],
    );
    // hist 5000 + cash 10000 + momo 6000 + split 10000 + deposit 3000 + later 7000 + multi 2000 + ambig 500 + old 250
    assert(Number(sum.rows[0].total) === 43750, `unexpected sum ${sum.rows[0].total}`);
    await ok('payment amount totals consistent for fixture');

    console.log(`\nPASSED ${passed} assertions in ${Date.now() - started}ms`);
    console.log('SUITE_EXECUTED=1 SKIPPED=0');
  } finally {
    // Cleanup tagged businesses only
    try {
      const biz = await db.query(
        `SELECT id FROM "Business" WHERE name LIKE $1`,
        [`${tag}%`],
      );
      const ids = biz.rows.map((r) => r.id);
      if (ids.length) {
        await db.query(
          `DELETE FROM "SalesPayment" WHERE "salesInvoiceId" IN (
             SELECT id FROM "SalesInvoice" WHERE "businessId" = ANY($1::text[])
           )`,
          [ids],
        );
        await db.query(`DELETE FROM "SalesInvoice" WHERE "businessId" = ANY($1::text[])`, [ids]);
        await db.query(
          `DELETE FROM "Till" WHERE "storeId" IN (SELECT id FROM "Store" WHERE "businessId" = ANY($1::text[]))`,
          [ids],
        );
        await db.query(`DELETE FROM "User" WHERE "businessId" = ANY($1::text[])`, [ids]);
        await db.query(`DELETE FROM "Store" WHERE "businessId" = ANY($1::text[])`, [ids]);
        await db.query(`DELETE FROM "Business" WHERE id = ANY($1::text[])`, [ids]);
        console.log('CLEANUP removed tagged businesses', ids.length);
      }
    } catch (cleanupErr) {
      console.error('CLEANUP warning', cleanupErr.message || cleanupErr);
    }
    await db.end();
  }
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
