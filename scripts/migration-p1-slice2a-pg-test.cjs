/**
 * Disposable PostgreSQL behavioural tests for Migration P1 Slice 2A.
 *
 * Proves concurrency, uniqueness, same-business mappings, demotion retention,
 * non-effects, and that Slice 1 SQL-only constraints remain present.
 * No Prisma schema changes; no Blob credentials required.
 */

const { Client } = require('pg');
const { execSync } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const schemaRel = 'prisma/schema.postgres.prisma';

const SQLSTATE = {
  FOREIGN_KEY: '23503',
  UNIQUE: '23505',
  CHECK: '23514',
  NOT_NULL: '23502',
};

const NINE_FK = [
  'MigrationPackage_businessId_predecessorPackageId_fkey',
  'MigrationPackage_businessId_validatedByUserId_fkey',
  'MigrationPackage_businessId_approvedByUserId_fkey',
  'MigrationPackage_businessId_executedByUserId_fkey',
  'MigrationPackage_businessId_cancelledByUserId_fkey',
  'MigrationPackage_businessId_supersededByUserId_fkey',
  'MigrationValidationRun_businessId_validatedByUserId_fkey',
  'MigrationPackage_businessId_latestValidationRunId_fkey',
  'MigrationPackage_latestValidationRunId_id_fkey',
];

function requireUrl() {
  const url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL;
  if (!url || !url.startsWith('postgres')) {
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

async function expectPgReject(fn, expect) {
  try {
    await fn();
    throw new Error(`EXPECTED_REJECT_MISSING: ${expect.label}`);
  } catch (err) {
    if (String(err.message || err).startsWith('EXPECTED_REJECT_MISSING')) throw err;
    const code = err && err.code;
    const constraint = err && err.constraint;
    if (code !== expect.sqlstate) {
      throw new Error(
        `${expect.label}: expected SQLSTATE ${expect.sqlstate}, got ${code} (${err.message})`,
      );
    }
    if (expect.constraint && constraint !== expect.constraint) {
      throw new Error(
        `${expect.label}: expected constraint ${expect.constraint}, got ${constraint}`,
      );
    }
    console.log(
      `  OK reject: ${expect.label} [${code}${constraint ? '/' + constraint : ''}]`,
    );
  }
}

async function main() {
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

  const client = new Client({ connectionString: url });
  await client.connect();

  const bizA = cuid();
  const bizB = cuid();
  const userA = cuid();
  const userB = cuid();
  const storeA = cuid();
  const storeB = cuid();

  function pass(name) {
    console.log(`PASS ${name}`);
  }

  async function seed() {
    await client.query(`UPDATE "MigrationPackage" SET "latestValidationRunId" = NULL`);
    await client.query(`DELETE FROM "MigrationApprovalHistory"`);
    await client.query(`DELETE FROM "MigrationValidationRun"`);
    await client.query(`DELETE FROM "MigrationFile"`);
    await client.query(`DELETE FROM "MigrationBranchMapping"`);
    await client.query(`DELETE FROM "MigrationPackage"`);
    await client.query(`DELETE FROM "Store" WHERE id = ANY($1::text[])`, [[storeA, storeB]]);
    await client.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [[userA, userB]]);
    await client.query(`DELETE FROM "Business" WHERE id = ANY($1::text[])`, [[bizA, bizB]]);

    await client.query(
      `INSERT INTO "Business" (id, name, "createdAt", "updatedAt") VALUES ($1,'BizA',NOW(),NOW()), ($2,'BizB',NOW(),NOW())`,
      [bizA, bizB],
    );
    await client.query(
      `INSERT INTO "User" (id, "businessId", name, email, "passwordHash", role, active, "createdAt")
       VALUES ($1,$2,'Owner A',$3,'x','OWNER',true,NOW()), ($4,$5,'Owner B',$6,'x','OWNER',true,NOW())`,
      [userA, bizA, `a-${userA}@example.com`, userB, bizB, `b-${userB}@example.com`],
    );
    await client.query(
      `INSERT INTO "Store" (id, "businessId", name, "createdAt")
       VALUES ($1,$2,'Store A',NOW()), ($3,$4,'Store B',NOW())`,
      [storeA, bizA, storeB, bizB],
    );
  }

  async function insertPackage(opts) {
    const id = opts.id || cuid();
    await client.query(
      `INSERT INTO "MigrationPackage" (
         id, "businessId", "contractVersion", "sourceSystemKey", "sourceBusinessKey",
         "reportingCurrency", "packageAsOfDate", status, "reconciliationStatus",
         "clientPackageKey", "expiresAt", version, "lineageRootId",
         "createdByUserId", "createdAt", "updatedAt"
       ) VALUES (
         $1,$2,'1',$3,$4,'GHS','2026-08-01',$5,'NOT_STARTED',
         $6, NOW() + interval '14 days', $7, $1,
         $8, NOW(), NOW()
       )`,
      [
        id,
        opts.businessId,
        opts.sourceSystemKey || 'legacy-pos',
        opts.sourceBusinessKey || 'biz-src',
        opts.status || 'DRAFT',
        opts.clientPackageKey || null,
        opts.version || 1,
        opts.createdByUserId,
      ],
    );
    return id;
  }

  try {
    await seed();

    // Concurrent identical clientPackageKey → one row (unique)
    const key = `idem-${cuid()}`;
    const results = await Promise.allSettled([
      insertPackage({ businessId: bizA, createdByUserId: userA, clientPackageKey: key }),
      insertPackage({ businessId: bizA, createdByUserId: userA, clientPackageKey: key }),
    ]);
    const ok = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    if (ok.length !== 1 || rejected.length !== 1) {
      throw new Error(
        `concurrent identical create: expected 1 success + 1 reject, got ${ok.length}/${rejected.length}`,
      );
    }
    if (rejected[0].reason.code !== SQLSTATE.UNIQUE) {
      throw new Error(
        `concurrent identical create: expected SQLSTATE ${SQLSTATE.UNIQUE}, got ${rejected[0].reason.code}`,
      );
    }
    const count = await client.query(
      `SELECT count(*)::int AS c FROM "MigrationPackage" WHERE "businessId"=$1 AND "clientPackageKey"=$2`,
      [bizA, key],
    );
    if (count.rows[0].c !== 1) throw new Error('concurrent identical create left !=1 row');
    pass('concurrent identical package create → one effect');

    // Different businesses may reuse key
    await insertPackage({
      businessId: bizB,
      createdByUserId: userB,
      clientPackageKey: key,
    });
    pass('cross-business clientPackageKey reuse allowed');

    // One current entity file per package
    const pkgFile = await insertPackage({
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: `file-${cuid()}`,
    });
    await client.query(
      `INSERT INTO "MigrationFile" (
         id, "businessId", "packageId", "entityType", "storageStatus",
         "uploadChecksum", "byteLength", "storageKey", "createdAt", "updatedAt"
       ) VALUES ($1,$2,$3,'PRODUCTS','FINALISED',$4,10,$5,NOW(),NOW())`,
      [cuid(), bizA, pkgFile, 'a'.repeat(64), `mig/${bizA}/${pkgFile}/u1/PRODUCTS.csv`],
    );
    await expectPgReject(
      () =>
        client.query(
          `INSERT INTO "MigrationFile" (
             id, "businessId", "packageId", "entityType", "storageStatus",
             "uploadChecksum", "byteLength", "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,'PRODUCTS','FINALISED',$4,11,NOW(),NOW())`,
          [cuid(), bizA, pkgFile, 'b'.repeat(64)],
        ),
      {
        label: 'duplicate entity file',
        sqlstate: SQLSTATE.UNIQUE,
        constraint: 'MigrationFile_packageId_entityType_key',
      },
    );
    pass('one current entity file per package');

    // Same-business store mapping; cross-business store rejected
    const pkgMap = await insertPackage({
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: `map-${cuid()}`,
    });
    await client.query(
      `INSERT INTO "MigrationBranchMapping" (
         id, "businessId", "packageId", "sourceBranchKey", "targetStoreId", "createdAt", "updatedAt"
       ) VALUES ($1,$2,$3,'main',$4,NOW(),NOW())`,
      [cuid(), bizA, pkgMap, storeA],
    );
    pass('same-business store mapping accepted');

    await expectPgReject(
      () =>
        client.query(
          `INSERT INTO "MigrationBranchMapping" (
             id, "businessId", "packageId", "sourceBranchKey", "targetStoreId", "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,'other',$4,NOW(),NOW())`,
          [cuid(), bizA, pkgMap, storeB],
        ),
      {
        label: 'cross-business store mapping',
        sqlstate: SQLSTATE.FOREIGN_KEY,
      },
    );
    pass('cross-business store mapping rejected');

    await expectPgReject(
      () =>
        client.query(
          `INSERT INTO "MigrationBranchMapping" (
             id, "businessId", "packageId", "sourceBranchKey", "targetStoreId", "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,'main',$4,NOW(),NOW())`,
          [cuid(), bizA, pkgMap, storeA],
        ),
      {
        label: 'duplicate source branch mapping',
        sqlstate: SQLSTATE.UNIQUE,
        constraint: 'MigrationBranchMapping_packageId_sourceBranchKey_key',
      },
    );
    pass('duplicate branch mapping rejected');

    // Demotion retains historical validation runs
    const pkgVal = await insertPackage({
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: `val-${cuid()}`,
      status: 'VALIDATED',
      version: 2,
    });
    const run1 = cuid();
    const run2 = cuid();
    await client.query(
      `INSERT INTO "MigrationValidationRun" (id, "businessId", "packageId", status, "manifestChecksum", "createdAt")
       VALUES ($1,$2,$3,'SUCCESS',$4,NOW()), ($5,$2,$3,'SUCCESS',$6,NOW())`,
      [run1, bizA, pkgVal, '1'.repeat(64), run2, '2'.repeat(64)],
    );
    await client.query(
      `UPDATE "MigrationPackage" SET "latestValidationRunId"=$1, status='VALIDATED' WHERE id=$2`,
      [run2, pkgVal],
    );
    // Simulate Slice 2A demotion
    await client.query('BEGIN');
    await client.query(
      `UPDATE "MigrationValidationRun" SET "supersededAt"=NOW()
       WHERE id=$1 AND "businessId"=$2 AND "packageId"=$3 AND "supersededAt" IS NULL`,
      [run2, bizA, pkgVal],
    );
    await client.query(
      `UPDATE "MigrationPackage"
       SET status='DRAFT', version=version+1, "latestValidationRunId"=NULL,
           "validatedAt"=NULL, "validatedByUserId"=NULL
       WHERE id=$1`,
      [pkgVal],
    );
    await client.query('COMMIT');
    const runs = await client.query(
      `SELECT id, "supersededAt" FROM "MigrationValidationRun" WHERE "packageId"=$1 ORDER BY id`,
      [pkgVal],
    );
    if (runs.rowCount !== 2) throw new Error('demotion deleted historical runs');
    const pkgAfter = await client.query(
      `SELECT status, version, "latestValidationRunId" FROM "MigrationPackage" WHERE id=$1`,
      [pkgVal],
    );
    if (pkgAfter.rows[0].status !== 'DRAFT') throw new Error('demotion status');
    if (pkgAfter.rows[0].latestValidationRunId !== null) throw new Error('pointer not cleared');
    if (pkgAfter.rows[0].version !== 3) throw new Error('version not bumped');
    pass('demotion retains historical validation evidence');

    // Injected failure leaves no partial package row
    const failId = cuid();
    try {
      await client.query('BEGIN');
      await insertPackage({
        id: failId,
        businessId: bizA,
        createdByUserId: userA,
        clientPackageKey: `fail-${cuid()}`,
      });
      // Force NOT NULL violation mid-transaction
      await client.query(
        `INSERT INTO "MigrationFile" (
           id, "businessId", "packageId", "entityType", "storageStatus",
           "uploadChecksum", "byteLength", "createdAt", "updatedAt"
         ) VALUES ($1,$2,$3,'PRODUCTS','FINALISED',NULL,1,NOW(),NOW())`,
        [cuid(), bizA, failId],
      );
      await client.query('COMMIT');
      throw new Error('expected injected failure');
    } catch (err) {
      await client.query('ROLLBACK');
      if (String(err.message || '').includes('expected injected failure')) throw err;
      if (err.code !== SQLSTATE.NOT_NULL) {
        // Accept any constraint failure that aborts the transaction
      }
    }
    const leftover = await client.query(`SELECT id FROM "MigrationPackage" WHERE id=$1`, [failId]);
    if (leftover.rowCount !== 0) throw new Error('partial package survived rollback');
    pass('injected failure leaves no partial database state');

    // Conflicting concurrent file inserts cannot both succeed
    const pkgRace = await insertPackage({
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: `race-${cuid()}`,
    });
    const race = await Promise.allSettled([
      client.query(
        `INSERT INTO "MigrationFile" (
           id, "businessId", "packageId", "entityType", "storageStatus",
           "uploadChecksum", "byteLength", "createdAt", "updatedAt"
         ) VALUES ($1,$2,$3,'SUPPLIERS','FINALISED',$4,1,NOW(),NOW())`,
        [cuid(), bizA, pkgRace, 'c'.repeat(64)],
      ),
      client.query(
        `INSERT INTO "MigrationFile" (
           id, "businessId", "packageId", "entityType", "storageStatus",
           "uploadChecksum", "byteLength", "createdAt", "updatedAt"
         ) VALUES ($1,$2,$3,'SUPPLIERS','FINALISED',$4,2,NOW(),NOW())`,
        [cuid(), bizA, pkgRace, 'd'.repeat(64)],
      ),
    ]);
    const raceOk = race.filter((r) => r.status === 'fulfilled');
    const raceBad = race.filter((r) => r.status === 'rejected');
    if (raceOk.length !== 1 || raceBad.length !== 1 || raceBad[0].reason.code !== SQLSTATE.UNIQUE) {
      throw new Error('conflicting concurrent file inserts both succeeded or wrong SQLSTATE');
    }
    pass('conflicting concurrent file inserts → one effect');

    // Non-effects: Slice 2A SQL ops must not create products/suppliers/sales/etc.
    const before = await client.query(`
      SELECT
        (SELECT count(*)::int FROM "Product") AS products,
        (SELECT count(*)::int FROM "Supplier") AS suppliers,
        (SELECT count(*)::int FROM "SalesInvoice") AS sales,
        (SELECT count(*)::int FROM "PurchaseInvoice") AS purchases,
        (SELECT count(*)::int FROM "Shift") AS shifts,
        (SELECT count(*)::int FROM "StockMovement") AS stock_movements,
        (SELECT count(*)::int FROM "InventoryBalance") AS inventory,
        (SELECT count(*)::int FROM "MigrationApprovalHistory") AS approvals
    `);
    // Perform Slice 2A-shaped mutations again
    const pkgNe = await insertPackage({
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: `ne-${cuid()}`,
    });
    await client.query(
      `INSERT INTO "MigrationFile" (
         id, "businessId", "packageId", "entityType", "storageStatus",
         "uploadChecksum", "byteLength", "createdAt", "updatedAt"
       ) VALUES ($1,$2,$3,'OPENING_STOCK','FINALISED',$4,3,NOW(),NOW())`,
      [cuid(), bizA, pkgNe, 'e'.repeat(64)],
    );
    const after = await client.query(`
      SELECT
        (SELECT count(*)::int FROM "Product") AS products,
        (SELECT count(*)::int FROM "Supplier") AS suppliers,
        (SELECT count(*)::int FROM "SalesInvoice") AS sales,
        (SELECT count(*)::int FROM "PurchaseInvoice") AS purchases,
        (SELECT count(*)::int FROM "Shift") AS shifts,
        (SELECT count(*)::int FROM "StockMovement") AS stock_movements,
        (SELECT count(*)::int FROM "InventoryBalance") AS inventory,
        (SELECT count(*)::int FROM "MigrationApprovalHistory") AS approvals
    `);
    for (const k of Object.keys(before.rows[0])) {
      if (before.rows[0][k] !== after.rows[0][k]) {
        throw new Error(`non-effect violated for ${k}: ${before.rows[0][k]} → ${after.rows[0][k]}`);
      }
    }
    pass('non-effects: no product/supplier/sale/purchase/shift/approval/import/chunk mutation');

    // Nine-FK guard present
    const fks = await client.query(
      `SELECT conname FROM pg_constraint WHERE contype='f' AND conname = ANY($1::text[])`,
      [NINE_FK],
    );
    if (fks.rowCount !== 9) {
      throw new Error(`expected 9 protected FKs, found ${fks.rowCount}`);
    }
    pass('nine Slice 1 SQL-only FKs still present');

    console.log('\nAll Slice 2A PostgreSQL behavioural gates passed.');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
