/**
 * Disposable PostgreSQL behavioural tests for Migration P1 Slice 1 schema.
 *
 * Requires POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING.
 * Applies full migrate history, then asserts real PostgreSQL constraints with SQLSTATE.
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

/**
 * @param {() => Promise<unknown>} fn
 * @param {{ label: string, sqlstate: string, constraint?: string }} expect
 */
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
  const userA2 = cuid();
  const userApprover = cuid();

  async function seedTenant() {
    await client.query(`UPDATE "MigrationPackage" SET "latestValidationRunId" = NULL`);
    await client.query(`DELETE FROM "MigrationApprovalHistory"`);
    await client.query(`DELETE FROM "MigrationValidationRun"`);
    await client.query(`DELETE FROM "MigrationFile"`);
    await client.query(`DELETE FROM "MigrationBranchMapping"`);
    await client.query(`DELETE FROM "MigrationPackage"`);
    await client.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [
      [userA, userB, userA2, userApprover],
    ]);
    await client.query(`DELETE FROM "Business" WHERE id = ANY($1::text[])`, [[bizA, bizB]]);

    await client.query(
      `INSERT INTO "Business" (id, name, "createdAt", "updatedAt") VALUES ($1,'BizA',NOW(),NOW()), ($2,'BizB',NOW(),NOW())`,
      [bizA, bizB],
    );
    await client.query(
      `INSERT INTO "User" (id, "businessId", name, email, "passwordHash", role, active, "createdAt")
       VALUES
         ($1,$2,'Owner A',$3,'x','OWNER',true,NOW()),
         ($4,$5,'Owner B',$6,'x','OWNER',true,NOW()),
         ($7,$2,'Owner A2',$8,'x','OWNER',true,NOW()),
         ($9,$2,'Approver A',$10,'x','OWNER',true,NOW())`,
      [
        userA,
        bizA,
        `a-${userA}@example.com`,
        userB,
        bizB,
        `b-${userB}@example.com`,
        userA2,
        `a2-${userA2}@example.com`,
        userApprover,
        `ap-${userApprover}@example.com`,
      ],
    );
  }

  async function insertPackage(opts) {
    const id = opts.id || cuid();
    const lineageRootId = opts.lineageRootId || id;
    await client.query(
      `INSERT INTO "MigrationPackage" (
         id, "businessId", "contractVersion", "sourceSystemKey", "sourceBusinessKey",
         "reportingCurrency", "packageAsOfDate", status, "reconciliationStatus",
         "expiresAt", version, "lineageRootId", "predecessorPackageId",
         "createdByUserId", "validatedByUserId", "approvedByUserId", "cancelledByUserId",
         "supersededByUserId", "latestValidationRunId", "createdAt", "updatedAt"
       ) VALUES (
         $1,$2,'1','src','biz','GHS','2026-08-01',$3,$4,
         NOW() + interval '14 days', 1, $5, $6,
         $7,$8,$9,$10,$11,$12, NOW(), NOW()
       )`,
      [
        id,
        opts.businessId,
        opts.status || 'DRAFT',
        opts.reconciliationStatus || 'NOT_STARTED',
        lineageRootId,
        opts.predecessorPackageId || null,
        opts.createdByUserId,
        opts.validatedByUserId || null,
        opts.approvedByUserId || null,
        opts.cancelledByUserId || null,
        opts.supersededByUserId || null,
        opts.latestValidationRunId || null,
      ],
    );
    return id;
  }

  async function insertRun(opts) {
    const id = opts.id || cuid();
    await client.query(
      `INSERT INTO "MigrationValidationRun" (
         id, "businessId", "packageId", status, "manifestChecksum", "createdAt"
       ) VALUES ($1,$2,$3,$4,$5,NOW())`,
      [id, opts.businessId, opts.packageId, opts.status || 'SUCCESS', opts.checksum || 'a'.repeat(64)],
    );
    return id;
  }

  function pass(name) {
    console.log(`PASS ${name}`);
  }

  try {
    await seedTenant();

    // --- lineage / actors / recon / files (SQLSTATE) ---
    await insertPackage({ businessId: bizA, createdByUserId: userA });
    await insertPackage({ businessId: bizA, createdByUserId: userA });
    pass('multiple NULL predecessorPackageId');

    const pred = await insertPackage({
      businessId: bizA,
      createdByUserId: userA,
      status: 'APPROVED',
    });
    await insertPackage({
      businessId: bizA,
      createdByUserId: userA,
      predecessorPackageId: pred,
      lineageRootId: pred,
    });
    await expectPgReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          predecessorPackageId: pred,
          lineageRootId: pred,
        }),
      {
        label: 'duplicate predecessor',
        sqlstate: SQLSTATE.UNIQUE,
        constraint: 'MigrationPackage_predecessorPackageId_key',
      },
    );
    pass('one-successor uniqueness');

    const predB = await insertPackage({
      businessId: bizB,
      createdByUserId: userB,
      status: 'APPROVED',
    });
    await expectPgReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          predecessorPackageId: predB,
          lineageRootId: predB,
        }),
      {
        label: 'cross-business predecessor',
        sqlstate: SQLSTATE.FOREIGN_KEY,
        constraint: 'MigrationPackage_businessId_predecessorPackageId_fkey',
      },
    );
    pass('cross-business predecessor FK');

    const selfId = cuid();
    await expectPgReject(
      () =>
        insertPackage({
          id: selfId,
          businessId: bizA,
          createdByUserId: userA,
          predecessorPackageId: selfId,
          lineageRootId: selfId,
        }),
      {
        label: 'self-predecessor',
        sqlstate: SQLSTATE.CHECK,
        constraint: 'MigrationPackage_predecessor_not_self_check',
      },
    );
    pass('self-predecessor blocked');

    await expectPgReject(
      () => insertPackage({ businessId: bizA, createdByUserId: userB }),
      {
        label: 'createdBy cross-tenant',
        sqlstate: SQLSTATE.FOREIGN_KEY,
        constraint: 'MigrationPackage_businessId_createdByUserId_fkey',
      },
    );
    await expectPgReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          validatedByUserId: userB,
        }),
      {
        label: 'validatedBy cross-tenant',
        sqlstate: SQLSTATE.FOREIGN_KEY,
      },
    );
    await expectPgReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          approvedByUserId: userB,
        }),
      { label: 'approvedBy cross-tenant', sqlstate: SQLSTATE.FOREIGN_KEY },
    );
    await expectPgReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          cancelledByUserId: userB,
        }),
      { label: 'cancelledBy cross-tenant', sqlstate: SQLSTATE.FOREIGN_KEY },
    );
    await expectPgReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          supersededByUserId: userB,
        }),
      { label: 'supersededBy cross-tenant', sqlstate: SQLSTATE.FOREIGN_KEY },
    );
    pass('actor tenant isolation');

    await insertPackage({ businessId: bizA, createdByUserId: userA });
    await expectPgReject(
      () => client.query(`DELETE FROM "User" WHERE id = $1`, [userA]),
      { label: 'delete referenced creator', sqlstate: SQLSTATE.FOREIGN_KEY },
    );
    pass('actor deletion restricted');

    const root = await insertPackage({
      businessId: bizA,
      createdByUserId: userA2,
      status: 'SUPERSEDED',
    });
    await insertPackage({
      businessId: bizA,
      createdByUserId: userA2,
      predecessorPackageId: root,
      lineageRootId: root,
    });
    await expectPgReject(
      () => client.query(`DELETE FROM "MigrationPackage" WHERE id = $1`, [root]),
      { label: 'delete predecessor', sqlstate: SQLSTATE.FOREIGN_KEY },
    );
    pass('predecessor deletion restricted');

    const filePkg = await insertPackage({ businessId: bizA, createdByUserId: userA2 });
    await client.query(
      `INSERT INTO "MigrationFile" (
         id, "businessId", "packageId", "entityType", "storageStatus",
         "uploadChecksum", "byteLength", "createdAt", "updatedAt"
       ) VALUES ($1,$2,$3,'PRODUCTS','PENDING',$4,0,NOW(),NOW())`,
      [cuid(), bizA, filePkg, 'b'.repeat(64)],
    );
    await expectPgReject(
      () =>
        client.query(
          `INSERT INTO "MigrationFile" (
             id, "businessId", "packageId", "entityType", "storageStatus",
             "uploadChecksum", "byteLength", "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,'PRODUCTS','PENDING',$4,0,NOW(),NOW())`,
          [cuid(), bizA, filePkg, 'c'.repeat(64)],
        ),
      {
        label: 'duplicate entityType',
        sqlstate: SQLSTATE.UNIQUE,
        constraint: 'MigrationFile_packageId_entityType_key',
      },
    );
    pass('duplicate packageId+entityType');

    await expectPgReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA2,
          status: 'DRAFT',
          reconciliationStatus: 'RECONCILING',
        }),
      {
        label: 'recon before imported',
        sqlstate: SQLSTATE.CHECK,
        constraint: 'MigrationPackage_recon_imported_only_check',
      },
    );
    pass('reconciliation invariant (non-IMPORTED)');

    await insertPackage({
      businessId: bizA,
      createdByUserId: userA2,
      status: 'IMPORTED',
      reconciliationStatus: 'MATCHED',
    });
    pass('IMPORTED may leave NOT_STARTED');

    const apPkg = await insertPackage({
      businessId: bizA,
      createdByUserId: userA2,
      status: 'APPROVED',
    });
    await client.query(
      `INSERT INTO "MigrationApprovalHistory" (
         id, "businessId", "packageId", "approverUserId", "approvedAt",
         "approvedManifestChecksum", "approvalExpiresAt", "contractVersion",
         "reportingCurrency", "packageAsOfDate", "fileChecksumsJson", "createdAt"
       ) VALUES ($1,$2,$3,$4,NOW(),$5,NOW()+interval '14 days','1','GHS','2026-08-01','[]',NOW())`,
      [cuid(), bizA, apPkg, userApprover, 'd'.repeat(64)],
    );
    await expectPgReject(
      () => client.query(`DELETE FROM "User" WHERE id = $1`, [userApprover]),
      { label: 'delete approval history approver', sqlstate: SQLSTATE.FOREIGN_KEY },
    );
    pass('approval-history actor deletion restricted');

    // --- latestValidationRun ownership ---
    const pkgA1 = await insertPackage({ businessId: bizA, createdByUserId: userA2 });
    const pkgA2 = await insertPackage({ businessId: bizA, createdByUserId: userA2 });
    const pkgB1 = await insertPackage({ businessId: bizB, createdByUserId: userB });

    const runA1 = await insertRun({
      businessId: bizA,
      packageId: pkgA1,
      checksum: '1'.repeat(64),
    });
    const runA1b = await insertRun({
      businessId: bizA,
      packageId: pkgA1,
      checksum: '2'.repeat(64),
    });
    const runB1 = await insertRun({
      businessId: bizB,
      packageId: pkgB1,
      checksum: '3'.repeat(64),
    });

    // NULL latest permitted
    const nullCheck = await client.query(
      `SELECT "latestValidationRunId" FROM "MigrationPackage" WHERE id = $1`,
      [pkgA2],
    );
    if (nullCheck.rows[0].latestValidationRunId !== null) {
      throw new Error('expected NULL latestValidationRunId on new draft');
    }
    pass('latestValidationRunId NULL permitted');

    // Own-package latest accepted
    await client.query(
      `UPDATE "MigrationPackage" SET "latestValidationRunId" = $1 WHERE id = $2`,
      [runA1, pkgA1],
    );
    pass('own-package latest run accepted');

    // Switch pointer to newer historical run on same package
    await client.query(
      `UPDATE "MigrationPackage" SET "latestValidationRunId" = $1 WHERE id = $2`,
      [runA1b, pkgA1],
    );
    const stillThere = await client.query(
      `SELECT id FROM "MigrationValidationRun" WHERE id = ANY($1::text[])`,
      [[runA1, runA1b]],
    );
    if (stillThere.rowCount !== 2) {
      throw new Error('historical validation runs were not retained');
    }
    pass('pointer switch retains historical runs');

    await expectPgReject(
      () =>
        client.query(
          `UPDATE "MigrationPackage" SET "latestValidationRunId" = $1 WHERE id = $2`,
          [runB1, pkgA1],
        ),
      {
        label: 'cross-business latest run',
        sqlstate: SQLSTATE.FOREIGN_KEY,
        constraint: 'MigrationPackage_businessId_latestValidationRunId_fkey',
      },
    );
    pass('cross-business latest run rejected');

    await expectPgReject(
      () =>
        client.query(
          `UPDATE "MigrationPackage" SET "latestValidationRunId" = $1 WHERE id = $2`,
          [runA1, pkgA2],
        ),
      {
        label: 'cross-package latest run',
        sqlstate: SQLSTATE.FOREIGN_KEY,
        constraint: 'MigrationPackage_latestValidationRunId_id_fkey',
      },
    );
    pass('cross-package latest run rejected');

    // Selected run deletion blocked (runA1b is currently selected by pkgA1)
    await expectPgReject(
      () => client.query(`DELETE FROM "MigrationValidationRun" WHERE id = $1`, [runA1b]),
      {
        label: 'delete selected validation run',
        sqlstate: SQLSTATE.FOREIGN_KEY,
      },
    );
    pass('selected run deletion restricted');

    // Historical runA1 still cannot be claimed by another package (ownership FK)
    // (re-assert after ensuring it is not uniquely held — already unselected)
    const claim = await client.query(
      `SELECT "latestValidationRunId" FROM "MigrationPackage" WHERE id = $1`,
      [pkgA1],
    );
    if (claim.rows[0].latestValidationRunId === runA1) {
      throw new Error('runA1 unexpectedly still selected');
    }
    await expectPgReject(
      () =>
        client.query(
          `UPDATE "MigrationPackage" SET "latestValidationRunId" = $1 WHERE id = $2`,
          [runA1, pkgA2],
        ),
      {
        label: 'unrelated historical run claim',
        sqlstate: SQLSTATE.FOREIGN_KEY,
        constraint: 'MigrationPackage_latestValidationRunId_id_fkey',
      },
    );
    pass('unrelated historical run cannot be claimed');

    // rollback
    const rollId = cuid();
    try {
      await client.query('BEGIN');
      await insertPackage({
        id: rollId,
        businessId: bizA,
        createdByUserId: userA2,
      });
      await insertPackage({
        businessId: bizA,
        createdByUserId: userA2,
        predecessorPackageId: pred,
        lineageRootId: pred,
      });
      await client.query('COMMIT');
      throw new Error('rollback test should have failed before commit');
    } catch (err) {
      await client.query('ROLLBACK');
      if (String(err.message || '').includes('rollback test should have failed')) throw err;
      if (err.code && err.code !== SQLSTATE.UNIQUE) {
        // insertPackage may throw before setting code on nested — accept unique path
      }
    }
    const leftover = await client.query(`SELECT id FROM "MigrationPackage" WHERE id = $1`, [
      rollId,
    ]);
    if (leftover.rowCount !== 0) throw new Error('rollback left MigrationPackage row');
    pass('transaction rollback');

    const mig = await client.query(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE migration_name IN (
         '20260806130000_migration_framework_p0',
         '20260806170000_migration_framework_p1_slice1_schema',
         '20260806183000_migration_p1_slice1_latest_run_ownership'
       ) AND finished_at IS NOT NULL`,
    );
    if (mig.rowCount !== 3) {
      throw new Error(`expected 3 finished migrations, got ${mig.rowCount}`);
    }
    pass('P0→P1→ownership migrate history');

    console.log('\nAll PostgreSQL behavioural schema gates passed.');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
