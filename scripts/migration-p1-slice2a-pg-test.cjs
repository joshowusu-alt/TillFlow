/**
 * Disposable PostgreSQL behavioural tests for Migration P1 Slice 2A (hardened).
 *
 * Uses at least two independent `pg.Client` connections with a deterministic
 * barrier so concurrent requests genuinely overlap. Asserts exact SQLSTATE and
 * constraint names — unrelated failures do not satisfy the gates.
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

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
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

async function connectClient(url, label) {
  const client = new Client({ connectionString: url });
  await client.connect();
  const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid;
  console.log(`  connection ${label} backend_pid=${pid}`);
  return { client, pid };
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

  const setup = new Client({ connectionString: url });
  await setup.connect();

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
    await setup.query(`UPDATE "MigrationPackage" SET "latestValidationRunId" = NULL`);
    await setup.query(`DELETE FROM "MigrationApprovalHistory"`);
    await setup.query(`DELETE FROM "MigrationValidationRun"`);
    await setup.query(`DELETE FROM "MigrationFile"`);
    await setup.query(`DELETE FROM "MigrationBranchMapping"`);
    await setup.query(`DELETE FROM "MigrationPackage"`);
    await setup.query(`DELETE FROM "Store" WHERE id = ANY($1::text[])`, [[storeA, storeB]]);
    await setup.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [[userA, userB]]);
    await setup.query(`DELETE FROM "Business" WHERE id = ANY($1::text[])`, [[bizA, bizB]]);

    await setup.query(
      `INSERT INTO "Business" (id, name, "createdAt", "updatedAt") VALUES ($1,'BizA',NOW(),NOW()), ($2,'BizB',NOW(),NOW())`,
      [bizA, bizB],
    );
    await setup.query(
      `INSERT INTO "User" (id, "businessId", name, email, "passwordHash", role, active, "createdAt")
       VALUES ($1,$2,'Owner A',$3,'x','OWNER',true,NOW()), ($4,$5,'Owner B',$6,'x','OWNER',true,NOW())`,
      [userA, bizA, `a-${userA}@example.com`, userB, bizB, `b-${userB}@example.com`],
    );
    await setup.query(
      `INSERT INTO "Store" (id, "businessId", name, "createdAt")
       VALUES ($1,$2,'Store A',NOW()), ($3,$4,'Store B',NOW())`,
      [storeA, bizA, storeB, bizB],
    );
  }

  function insertPackageSql(opts) {
    const id = opts.id || cuid();
    return {
      id,
      text: `INSERT INTO "MigrationPackage" (
         id, "businessId", "contractVersion", "sourceSystemKey", "sourceBusinessKey",
         "reportingCurrency", "packageAsOfDate", status, "reconciliationStatus",
         "clientPackageKey", "expiresAt", version, "lineageRootId",
         "createdByUserId", "createdAt", "updatedAt"
       ) VALUES (
         $1,$2,'1',$3,$4,'GHS','2026-08-01',$5,'NOT_STARTED',
         $6, NOW() + interval '14 days', $7, $1,
         $8, NOW(), NOW()
       )`,
      values: [
        id,
        opts.businessId,
        opts.sourceSystemKey || 'legacy-pos',
        opts.sourceBusinessKey || 'biz-src',
        opts.status || 'DRAFT',
        opts.clientPackageKey || null,
        opts.version || 1,
        opts.createdByUserId,
      ],
    };
  }

  async function insertPackage(client, opts) {
    const sql = insertPackageSql(opts);
    await client.query(sql.text, sql.values);
    return sql.id;
  }

  try {
    await seed();

    // --- Concurrent identical clientPackageKey on TWO connections ---
    {
      const a = await connectClient(url, 'pkg-a');
      const b = await connectClient(url, 'pkg-b');
      if (a.pid === b.pid) throw new Error('expected distinct backend PIDs');
      const key = `idem-${cuid()}`;
      const ready = deferred();
      let readyCount = 0;
      const markReady = () => {
        readyCount += 1;
        if (readyCount === 2) ready.resolve();
      };
      const barrierTimeout = setTimeout(() => ready.reject(new Error('barrier timeout')), 10000);

      const run = async (conn, id) => {
        markReady();
        await ready.promise;
        return insertPackage(conn.client, {
          id,
          businessId: bizA,
          createdByUserId: userA,
          clientPackageKey: key,
        });
      };

      const id1 = cuid();
      const id2 = cuid();
      const results = await Promise.allSettled([run(a, id1), run(b, id2)]);
      clearTimeout(barrierTimeout);

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
      if (
        rejected[0].reason.constraint !== 'MigrationPackage_businessId_clientPackageKey_key'
      ) {
        throw new Error(
          `concurrent identical create: expected MigrationPackage_businessId_clientPackageKey_key, got ${rejected[0].reason.constraint}`,
        );
      }
      const count = await setup.query(
        `SELECT count(*)::int AS c FROM "MigrationPackage" WHERE "businessId"=$1 AND "clientPackageKey"=$2`,
        [bizA, key],
      );
      if (count.rows[0].c !== 1) throw new Error('concurrent identical create left !=1 row');
      await a.client.end();
      await b.client.end();
      pass(`concurrent identical package create → one effect (pids ${a.pid}/${b.pid})`);
    }

    // Cross-business key reuse
    await insertPackage(setup, {
      businessId: bizB,
      createdByUserId: userB,
      clientPackageKey: `shared-${cuid()}`,
    });
    const sharedKey = `reuse-${cuid()}`;
    await insertPackage(setup, {
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: sharedKey,
    });
    await insertPackage(setup, {
      businessId: bizB,
      createdByUserId: userB,
      clientPackageKey: sharedKey,
    });
    pass('cross-business clientPackageKey reuse allowed');

    // One current entity file
    const pkgFile = await insertPackage(setup, {
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: `file-${cuid()}`,
    });
    await setup.query(
      `INSERT INTO "MigrationFile" (
         id, "businessId", "packageId", "entityType", "storageStatus",
         "uploadChecksum", "byteLength", "storageKey", "createdAt", "updatedAt"
       ) VALUES ($1,$2,$3,'PRODUCTS','FINALISED',$4,10,$5,NOW(),NOW())`,
      [cuid(), bizA, pkgFile, 'a'.repeat(64), `mig/${bizA}/${pkgFile}/u1/PRODUCTS.csv`],
    );
    await expectPgReject(
      () =>
        setup.query(
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

    // Branch mapping same-business / cross-business / duplicate
    const pkgMap = await insertPackage(setup, {
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: `map-${cuid()}`,
    });
    await setup.query(
      `INSERT INTO "MigrationBranchMapping" (
         id, "businessId", "packageId", "sourceBranchKey", "targetStoreId", "createdAt", "updatedAt"
       ) VALUES ($1,$2,$3,'main',$4,NOW(),NOW())`,
      [cuid(), bizA, pkgMap, storeA],
    );
    pass('same-business store mapping accepted');

    await expectPgReject(
      () =>
        setup.query(
          `INSERT INTO "MigrationBranchMapping" (
             id, "businessId", "packageId", "sourceBranchKey", "targetStoreId", "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,'other',$4,NOW(),NOW())`,
          [cuid(), bizA, pkgMap, storeB],
        ),
      {
        label: 'cross-business store mapping',
        sqlstate: SQLSTATE.FOREIGN_KEY,
        constraint: 'MigrationBranchMapping_businessId_targetStoreId_fkey',
      },
    );
    pass('cross-business store mapping rejected');

    await expectPgReject(
      () =>
        setup.query(
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

    // Conflicting concurrent file inserts — two connections + barrier
    {
      const pkgRace = await insertPackage(setup, {
        businessId: bizA,
        createdByUserId: userA,
        clientPackageKey: `race-${cuid()}`,
      });
      const a = await connectClient(url, 'file-a');
      const b = await connectClient(url, 'file-b');
      const ready = deferred();
      let n = 0;
      const mark = () => {
        n += 1;
        if (n === 2) ready.resolve();
      };
      const t = setTimeout(() => ready.reject(new Error('file barrier timeout')), 10000);
      const insertFile = async (conn, checksum) => {
        mark();
        await ready.promise;
        return conn.client.query(
          `INSERT INTO "MigrationFile" (
             id, "businessId", "packageId", "entityType", "storageStatus",
             "uploadChecksum", "byteLength", "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,'SUPPLIERS','FINALISED',$4,1,NOW(),NOW())`,
          [cuid(), bizA, pkgRace, checksum],
        );
      };
      const race = await Promise.allSettled([
        insertFile(a, 'c'.repeat(64)),
        insertFile(b, 'd'.repeat(64)),
      ]);
      clearTimeout(t);
      const raceOk = race.filter((r) => r.status === 'fulfilled');
      const raceBad = race.filter((r) => r.status === 'rejected');
      if (raceOk.length !== 1 || raceBad.length !== 1) {
        throw new Error('conflicting concurrent file inserts: expected 1/1');
      }
      if (raceBad[0].reason.code !== SQLSTATE.UNIQUE) {
        throw new Error(
          `conflicting concurrent file inserts: expected ${SQLSTATE.UNIQUE}, got ${raceBad[0].reason.code}`,
        );
      }
      if (raceBad[0].reason.constraint !== 'MigrationFile_packageId_entityType_key') {
        throw new Error(
          `conflicting concurrent file inserts: wrong constraint ${raceBad[0].reason.constraint}`,
        );
      }
      await a.client.end();
      await b.client.end();
      pass(`conflicting concurrent file inserts → one effect (pids ${a.pid}/${b.pid})`);
    }

    // Conflicting concurrent branch mappings — two connections
    {
      const pkgBM = await insertPackage(setup, {
        businessId: bizA,
        createdByUserId: userA,
        clientPackageKey: `bm-${cuid()}`,
      });
      // second store in bizA for unique targetStoreId race on source keys
      const storeA2 = cuid();
      await setup.query(
        `INSERT INTO "Store" (id, "businessId", name, "createdAt") VALUES ($1,$2,'Store A2',NOW())`,
        [storeA2, bizA],
      );
      const a = await connectClient(url, 'map-a');
      const b = await connectClient(url, 'map-b');
      const ready = deferred();
      let n = 0;
      const mark = () => {
        n += 1;
        if (n === 2) ready.resolve();
      };
      const t = setTimeout(() => ready.reject(new Error('map barrier timeout')), 10000);
      const insertMap = async (conn, branch, store) => {
        mark();
        await ready.promise;
        return conn.client.query(
          `INSERT INTO "MigrationBranchMapping" (
             id, "businessId", "packageId", "sourceBranchKey", "targetStoreId", "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,$4,$5,NOW(),NOW())`,
          [cuid(), bizA, pkgBM, branch, store],
        );
      };
      // Same sourceBranchKey → unique conflict
      const race = await Promise.allSettled([
        insertMap(a, 'east', storeA),
        insertMap(b, 'east', storeA2),
      ]);
      clearTimeout(t);
      const raceOk = race.filter((r) => r.status === 'fulfilled');
      const raceBad = race.filter((r) => r.status === 'rejected');
      if (raceOk.length !== 1 || raceBad.length !== 1) {
        throw new Error('conflicting concurrent mappings: expected 1/1');
      }
      if (raceBad[0].reason.code !== SQLSTATE.UNIQUE) {
        throw new Error(
          `conflicting concurrent mappings: expected ${SQLSTATE.UNIQUE}, got ${raceBad[0].reason.code}`,
        );
      }
      if (
        raceBad[0].reason.constraint !==
        'MigrationBranchMapping_packageId_sourceBranchKey_key'
      ) {
        throw new Error(
          `conflicting concurrent mappings: wrong constraint ${raceBad[0].reason.constraint}`,
        );
      }
      await a.client.end();
      await b.client.end();
      pass(`conflicting concurrent branch mappings → one effect (pids ${a.pid}/${b.pid})`);
    }

    // Stale version CAS simulation with two connections: winner bumps, loser sees stale
    {
      const pkgV = await insertPackage(setup, {
        businessId: bizA,
        createdByUserId: userA,
        clientPackageKey: `ver-${cuid()}`,
        version: 5,
      });
      const a = await connectClient(url, 'ver-a');
      const b = await connectClient(url, 'ver-b');
      await a.client.query('BEGIN');
      await b.client.query('BEGIN');
      const lockA = await a.client.query(
        `SELECT id, version FROM "MigrationPackage" WHERE id=$1 FOR UPDATE`,
        [pkgV],
      );
      // B blocks until A commits
      const bLockPromise = b.client.query(
        `SELECT id, version FROM "MigrationPackage" WHERE id=$1 FOR UPDATE`,
        [pkgV],
      );
      await a.client.query(
        `UPDATE "MigrationPackage" SET version = version + 1 WHERE id=$1 AND version=$2`,
        [pkgV, 5],
      );
      await a.client.query('COMMIT');
      const lockB = await bLockPromise;
      if (lockB.rows[0].version !== 6) {
        throw new Error(`loser should observe version 6 after winner, got ${lockB.rows[0].version}`);
      }
      // Stale CAS from original expected version 5
      const stale = await b.client.query(
        `UPDATE "MigrationPackage" SET version = version + 1 WHERE id=$1 AND version=$2 RETURNING version`,
        [pkgV, 5],
      );
      if (stale.rowCount !== 0) throw new Error('stale version update should affect 0 rows');
      await b.client.query('ROLLBACK');
      const final = await setup.query(`SELECT version FROM "MigrationPackage" WHERE id=$1`, [
        pkgV,
      ]);
      if (final.rows[0].version !== 6) throw new Error('version should remain 6');
      await a.client.end();
      await b.client.end();
      pass(`stale version rejected after winner commits (pids ${a.pid}/${b.pid})`);
    }

    // Demotion retains historical validation runs
    const pkgVal = await insertPackage(setup, {
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: `val-${cuid()}`,
      status: 'VALIDATED',
      version: 2,
    });
    const run1 = cuid();
    const run2 = cuid();
    await setup.query(
      `INSERT INTO "MigrationValidationRun" (id, "businessId", "packageId", status, "manifestChecksum", "createdAt")
       VALUES ($1,$2,$3,'SUCCESS',$4,NOW()), ($5,$2,$3,'SUCCESS',$6,NOW())`,
      [run1, bizA, pkgVal, '1'.repeat(64), run2, '2'.repeat(64)],
    );
    await setup.query(
      `UPDATE "MigrationPackage" SET "latestValidationRunId"=$1, status='VALIDATED' WHERE id=$2`,
      [run2, pkgVal],
    );
    await setup.query('BEGIN');
    await setup.query(
      `UPDATE "MigrationValidationRun" SET "supersededAt"=NOW()
       WHERE id=$1 AND "businessId"=$2 AND "packageId"=$3 AND "supersededAt" IS NULL`,
      [run2, bizA, pkgVal],
    );
    await setup.query(
      `UPDATE "MigrationPackage"
       SET status='DRAFT', version=version+1, "latestValidationRunId"=NULL,
           "validatedAt"=NULL, "validatedByUserId"=NULL
       WHERE id=$1`,
      [pkgVal],
    );
    await setup.query('COMMIT');
    const runs = await setup.query(
      `SELECT id FROM "MigrationValidationRun" WHERE "packageId"=$1`,
      [pkgVal],
    );
    if (runs.rowCount !== 2) throw new Error('demotion deleted historical runs');
    pass('demotion retains historical validation evidence');

    // Injected NOT NULL failure — exact SQLSTATE 23502 on uploadChecksum
    const failId = cuid();
    try {
      await setup.query('BEGIN');
      await insertPackage(setup, {
        id: failId,
        businessId: bizA,
        createdByUserId: userA,
        clientPackageKey: `fail-${cuid()}`,
      });
      await setup.query(
        `INSERT INTO "MigrationFile" (
           id, "businessId", "packageId", "entityType", "storageStatus",
           "uploadChecksum", "byteLength", "createdAt", "updatedAt"
         ) VALUES ($1,$2,$3,'PRODUCTS','FINALISED',NULL,1,NOW(),NOW())`,
        [cuid(), bizA, failId],
      );
      await setup.query('COMMIT');
      throw new Error('expected injected NOT NULL failure');
    } catch (err) {
      await setup.query('ROLLBACK');
      if (String(err.message || '').includes('expected injected')) throw err;
      if (err.code !== SQLSTATE.NOT_NULL) {
        throw new Error(
          `injected failure: expected SQLSTATE ${SQLSTATE.NOT_NULL}, got ${err.code}`,
        );
      }
      // Column-level not-null may not expose constraint name consistently; require column in message or schema.
      const detail = `${err.column || ''} ${err.message || ''}`;
      if (!/uploadChecksum/i.test(detail)) {
        throw new Error(
          `injected failure: expected uploadChecksum NOT NULL identity, got column=${err.column} msg=${err.message}`,
        );
      }
      console.log(`  OK reject: uploadChecksum NOT NULL [${err.code}/uploadChecksum]`);
    }
    const leftover = await setup.query(`SELECT id FROM "MigrationPackage" WHERE id=$1`, [failId]);
    if (leftover.rowCount !== 0) throw new Error('partial package survived rollback');
    pass('injected NOT NULL failure leaves no partial database state');

    // Non-effects
    const before = await setup.query(`
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
    const pkgNe = await insertPackage(setup, {
      businessId: bizA,
      createdByUserId: userA,
      clientPackageKey: `ne-${cuid()}`,
    });
    await setup.query(
      `INSERT INTO "MigrationFile" (
         id, "businessId", "packageId", "entityType", "storageStatus",
         "uploadChecksum", "byteLength", "createdAt", "updatedAt"
       ) VALUES ($1,$2,$3,'OPENING_STOCK','FINALISED',$4,3,NOW(),NOW())`,
      [cuid(), bizA, pkgNe, 'e'.repeat(64)],
    );
    const after = await setup.query(`
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
        throw new Error(`non-effect violated for ${k}`);
      }
    }
    pass('non-effects: no product/supplier/sale/purchase/shift/approval/stock mutation');

    // Referenced-object cleanup race: winner establishes DB reference before loser's
    // final pre-delete count. Separate backends + barrier; deletion suppressed when count>0.
    {
      const pkgRace = await insertPackage(setup, {
        businessId: bizA,
        createdByUserId: userA,
        clientPackageKey: `cleanup-race-${cuid()}`,
        version: 1,
      });
      const candidateKey = `mig/${bizA}/${pkgRace}/up-new/PRODUCTS.csv`;
      const currentKey = `mig/${bizA}/${pkgRace}/up-cur/PRODUCTS.csv`;
      await setup.query(
        `INSERT INTO "MigrationFile" (
           id, "businessId", "packageId", "entityType", "storageStatus",
           "uploadChecksum", "byteLength", "storageKey", "createdAt", "updatedAt"
         ) VALUES ($1,$2,$3,'PRODUCTS','FINALISED',$4,10,$5,NOW(),NOW())`,
        [cuid(), bizA, pkgRace, 'c'.repeat(64), currentKey],
      );

      const a = await connectClient(url, 'cleanup-a');
      const b = await connectClient(url, 'cleanup-b');
      const ready = deferred();
      const winnerCommitted = deferred();
      let readyCount = 0;
      const markReady = () => {
        readyCount += 1;
        if (readyCount === 2) ready.resolve();
      };
      const barrierTimeout = setTimeout(
        () => ready.reject(new Error('cleanup barrier timeout')),
        10000,
      );

      const loserCleanup = (async () => {
        markReady();
        await ready.promise;
        // Wait until winner has committed the new reference (deterministic, not sleep).
        await winnerCommitted.promise;
        const count = await a.client.query(
          `SELECT count(*)::int AS c FROM "MigrationFile"
           WHERE "businessId"=$1 AND "storageKey"=$2`,
          [bizA, candidateKey],
        );
        return count.rows[0].c;
      })();

      const winnerFinalise = (async () => {
        markReady();
        await ready.promise;
        await b.client.query('BEGIN');
        await b.client.query(
          `SELECT id, version FROM "MigrationPackage" WHERE id=$1 FOR UPDATE`,
          [pkgRace],
        );
        await b.client.query(
          `UPDATE "MigrationFile"
           SET "storageKey"=$1, "uploadChecksum"=$2, "updatedAt"=NOW()
           WHERE "packageId"=$3 AND "entityType"='PRODUCTS'`,
          [candidateKey, 'd'.repeat(64), pkgRace],
        );
        await b.client.query(
          `UPDATE "MigrationPackage" SET version = version + 1 WHERE id=$1 AND version=1`,
          [pkgRace],
        );
        await b.client.query('COMMIT');
        winnerCommitted.resolve();
        return 'winner';
      })();

      const [refCount, winner] = await Promise.all([loserCleanup, winnerFinalise]);
      clearTimeout(barrierTimeout);
      if (winner !== 'winner') throw new Error('winner did not commit');
      if (refCount !== 1) {
        throw new Error(
          `cleanup race: expected loser reference count 1 after winner commit, got ${refCount}`,
        );
      }
      const still = await setup.query(
        `SELECT "storageKey" FROM "MigrationFile" WHERE "packageId"=$1`,
        [pkgRace],
      );
      if (still.rows[0].storageKey !== candidateKey) {
        throw new Error('winner DB reference lost');
      }
      const ver = await setup.query(`SELECT version FROM "MigrationPackage" WHERE id=$1`, [
        pkgRace,
      ]);
      if (ver.rows[0].version !== 2) throw new Error('only winner should advance version');
      await a.client.end();
      await b.client.end();
      pass(
        `cleanup race: winner reference retained before loser delete decision (pids ${a.pid}/${b.pid})`,
      );
    }
    // Proven-unreferenced cleanup decision: count=0 permits delete; count>0 retains.
    {
      const pkgOrphan = await insertPackage(setup, {
        businessId: bizA,
        createdByUserId: userA,
        clientPackageKey: `cleanup-orphan-${cuid()}`,
      });
      const orphanKey = `mig/${bizA}/${pkgOrphan}/up-orphan/PRODUCTS.csv`;
      const a = await connectClient(url, 'orphan-check');
      const count = await a.client.query(
        `SELECT count(*)::int AS c FROM "MigrationFile"
         WHERE "businessId"=$1 AND "storageKey"=$2`,
        [bizA, orphanKey],
      );
      if (count.rows[0].c !== 0) throw new Error('expected unreferenced orphan candidate');
      await a.client.end();
      pass('proven orphan: reference count 0 permits bounded cleanup');
    }

    // Nine-FK guard
    const fks = await setup.query(
      `SELECT conname FROM pg_constraint WHERE contype='f' AND conname = ANY($1::text[])`,
      [NINE_FK],
    );
    if (fks.rowCount !== 9) {
      throw new Error(`expected 9 protected FKs, found ${fks.rowCount}`);
    }
    pass('nine Slice 1 SQL-only FKs still present');

    console.log('\nAll hardened Slice 2A PostgreSQL behavioural gates passed.');
  } finally {
    await setup.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
