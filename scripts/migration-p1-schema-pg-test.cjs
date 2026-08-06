/**
 * Disposable PostgreSQL constraint tests for Migration P1 Slice 1 schema.
 *
 * Requires:
 *   POSTGRES_PRISMA_URL / POSTGRES_URL_NON_POOLING (or DATABASE_URL)
 *
 * Applies prisma migrate deploy against a disposable database, asserts real
 * PostgreSQL constraints, then exits non-zero on failure.
 *
 * Not a substitute: SQLite / mocked Prisma unit tests.
 */

const { Client } = require('pg');
const { execSync } = require('node:child_process');
const path = require('node:path');
const crypto = require('node:crypto');

const root = path.resolve(__dirname, '..');
const schema = path.join(root, 'prisma', 'schema.postgres.prisma');

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

async function expectReject(fn, label, match) {
  try {
    await fn();
    throw new Error(`EXPECTED_REJECT_MISSING: ${label}`);
  } catch (err) {
    const msg = String(err && err.message ? err.message : err);
    if (msg.startsWith('EXPECTED_REJECT_MISSING')) throw err;
    if (match && !match.test(msg)) {
      throw new Error(`${label}: rejected but unexpected message: ${msg}`);
    }
    console.log(`  OK reject: ${label}`);
  }
}

async function main() {
  const url = requireUrl();
  process.env.POSTGRES_PRISMA_URL = url;
  process.env.POSTGRES_URL_NON_POOLING = url;

  console.log('Deploying migrations…');
  execSync(`npx prisma migrate deploy --schema="${schema}"`, {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
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
    await client.query(`DELETE FROM "MigrationApprovalHistory"`);
    await client.query(`DELETE FROM "MigrationPackage"`); // cascades validation runs/files via FKs carefully
    // Order: clear latest pointers first
    await client.query(`UPDATE "MigrationPackage" SET "latestValidationRunId" = NULL`);
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

    // Minimal User insert — inspect required columns
    const userCols = await client.query(`
      SELECT column_name, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'User' AND table_schema = 'public'
      ORDER BY ordinal_position`);
    const requiredUser = userCols.rows
      .filter((c) => c.is_nullable === 'NO' && !c.column_default && c.column_name !== 'id')
      .map((c) => c.column_name);
    console.log('User required cols without default:', requiredUser.join(', '));

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
         "supersededByUserId", "createdAt", "updatedAt"
       ) VALUES (
         $1,$2,'1','src','biz','GHS','2026-08-01',$3,$4,
         NOW() + interval '14 days', 1, $5, $6,
         $7,$8,$9,$10,$11, NOW(), NOW()
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
      ],
    );
    return id;
  }

  const results = [];
  function pass(name) {
    results.push({ name, ok: true });
    console.log(`PASS ${name}`);
  }

  try {
    await seedTenant();

    // 7) Multiple NULL predecessors allowed
    const p1 = await insertPackage({ businessId: bizA, createdByUserId: userA });
    const p2 = await insertPackage({ businessId: bizA, createdByUserId: userA });
    pass('7 multiple NULL predecessorPackageId');

    // 1) Two packages cannot share same predecessor
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
      status: 'DRAFT',
    });
    await expectReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          predecessorPackageId: pred,
          lineageRootId: pred,
        }),
      '1 duplicate predecessor',
      /unique|duplicate/i,
    );
    pass('1 one-successor uniqueness');

    // 2) Cross-business predecessor rejected
    const predB = await insertPackage({ businessId: bizB, createdByUserId: userB, status: 'APPROVED' });
    await expectReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          predecessorPackageId: predB,
          lineageRootId: predB,
        }),
      '2 cross-business predecessor',
      /foreign key|violates/i,
    );
    pass('2 cross-business predecessor FK');

    // 3) Self-predecessor rejected
    const selfId = cuid();
    await expectReject(
      () =>
        insertPackage({
          id: selfId,
          businessId: bizA,
          createdByUserId: userA,
          predecessorPackageId: selfId,
          lineageRootId: selfId,
        }),
      '3 self-predecessor',
      /check|violates|foreign key/i,
    );
    pass('3 self-predecessor blocked');

    // 4) Actor from another business rejected for each actor relation
    await expectReject(
      () => insertPackage({ businessId: bizA, createdByUserId: userB }),
      '4a createdBy cross-tenant',
      /foreign key|violates/i,
    );
    await expectReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          validatedByUserId: userB,
        }),
      '4b validatedBy cross-tenant',
      /foreign key|violates/i,
    );
    await expectReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          approvedByUserId: userB,
        }),
      '4c approvedBy cross-tenant',
      /foreign key|violates/i,
    );
    await expectReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          cancelledByUserId: userB,
        }),
      '4d cancelledBy cross-tenant',
      /foreign key|violates/i,
    );
    await expectReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA,
          supersededByUserId: userB,
        }),
      '4e supersededBy cross-tenant',
      /foreign key|violates/i,
    );
    pass('4 actor tenant isolation');

    // 5) Deleting referenced actor blocked
    const held = await insertPackage({ businessId: bizA, createdByUserId: userA });
    await expectReject(
      () => client.query(`DELETE FROM "User" WHERE id = $1`, [userA]),
      '5 delete referenced creator',
      /foreign key|violates|restrict/i,
    );
    pass('5 actor deletion restricted');

    // 6) Deleting referenced predecessor blocked
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
    await expectReject(
      () => client.query(`DELETE FROM "MigrationPackage" WHERE id = $1`, [root]),
      '6 delete predecessor',
      /foreign key|violates|restrict/i,
    );
    pass('6 predecessor deletion restricted');

    // 8) Duplicate (packageId, entityType) rejected
    const filePkg = await insertPackage({ businessId: bizA, createdByUserId: userA2 });
    const fileId = cuid();
    await client.query(
      `INSERT INTO "MigrationFile" (
         id, "businessId", "packageId", "entityType", "storageStatus",
         "uploadChecksum", "byteLength", "createdAt", "updatedAt"
       ) VALUES ($1,$2,$3,'PRODUCTS','PENDING',$4,0,NOW(),NOW())`,
      [fileId, bizA, filePkg, 'a'.repeat(64)],
    );
    await expectReject(
      () =>
        client.query(
          `INSERT INTO "MigrationFile" (
             id, "businessId", "packageId", "entityType", "storageStatus",
             "uploadChecksum", "byteLength", "createdAt", "updatedAt"
           ) VALUES ($1,$2,$3,'PRODUCTS','PENDING',$4,0,NOW(),NOW())`,
          [cuid(), bizA, filePkg, 'b'.repeat(64)],
        ),
      '8 duplicate entityType',
      /unique|duplicate/i,
    );
    pass('8 duplicate packageId+entityType');

    // 9) Non-IMPORTED cannot leave NOT_STARTED recon
    await expectReject(
      () =>
        insertPackage({
          businessId: bizA,
          createdByUserId: userA2,
          status: 'DRAFT',
          reconciliationStatus: 'RECONCILING',
        }),
      '9 recon before imported',
      /check|violates/i,
    );
    pass('9 reconciliation invariant (non-IMPORTED)');

    // 10) IMPORTED can use recon states
    await insertPackage({
      businessId: bizA,
      createdByUserId: userA2,
      status: 'IMPORTED',
      reconciliationStatus: 'RECONCILING',
    });
    await insertPackage({
      businessId: bizA,
      createdByUserId: userA2,
      status: 'IMPORTED',
      reconciliationStatus: 'MATCHED',
    });
    pass('10 IMPORTED may leave NOT_STARTED');

    // 11) Approval-history actor deletion blocked (approver not used as package creator)
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
      [cuid(), bizA, apPkg, userApprover, 'c'.repeat(64)],
    );
    await expectReject(
      () => client.query(`DELETE FROM "User" WHERE id = $1`, [userApprover]),
      '11 delete approval history approver',
      /foreign key|violates|restrict/i,
    );
    pass('11 approval-history actor deletion restricted');

    // 12) Transaction rollback leaves no partial schema-domain records
    const rollId = cuid();
    try {
      await client.query('BEGIN');
      await client.query(
        `INSERT INTO "MigrationPackage" (
           id, "businessId", "contractVersion", "sourceSystemKey", "sourceBusinessKey",
           "reportingCurrency", "packageAsOfDate", status, "reconciliationStatus",
           "expiresAt", version, "lineageRootId", "createdByUserId", "createdAt", "updatedAt"
         ) VALUES ($1,$2,'1','src','biz','GHS','2026-08-01','DRAFT','NOT_STARTED',
           NOW()+interval '14 days',1,$1,$3,NOW(),NOW())`,
        [rollId, bizA, userA],
      );
      await client.query(
        `INSERT INTO "MigrationValidationRun" (
           id, "businessId", "packageId", status, "manifestChecksum", "createdAt"
         ) VALUES ($1,$2,$3,'SUCCESS',$4,NOW())`,
        [cuid(), bizA, rollId, 'd'.repeat(64)],
      );
      // Force failure: duplicate predecessor uniqueness using existing pred
      await client.query(
        `INSERT INTO "MigrationPackage" (
           id, "businessId", "contractVersion", "sourceSystemKey", "sourceBusinessKey",
           "reportingCurrency", "packageAsOfDate", status, "reconciliationStatus",
           "expiresAt", version, "lineageRootId", "predecessorPackageId",
           "createdByUserId", "createdAt", "updatedAt"
         ) VALUES ($1,$2,'1','src','biz','GHS','2026-08-01','DRAFT','NOT_STARTED',
           NOW()+interval '14 days',1,$3,$3,$4,NOW(),NOW())`,
        [cuid(), bizA, pred, userA],
      );
      await client.query('COMMIT');
      throw new Error('rollback test should have failed before commit');
    } catch (err) {
      await client.query('ROLLBACK');
      const msg = String(err.message || err);
      if (msg.includes('rollback test should have failed')) throw err;
    }
    const leftover = await client.query(`SELECT id FROM "MigrationPackage" WHERE id = $1`, [rollId]);
    if (leftover.rowCount !== 0) {
      throw new Error('rollback left MigrationPackage row');
    }
    pass('12 transaction rollback');

    // 13) migrate applied cleanly (deploy at start + history row present)
    const mig = await client.query(
      `SELECT migration_name, finished_at FROM "_prisma_migrations"
       WHERE migration_name = '20260806170000_migration_framework_p1_slice1_schema'
         AND finished_at IS NOT NULL`,
    );
    if (mig.rowCount !== 1) {
      throw new Error('P1 slice1 migration not recorded as finished');
    }
    const p0 = await client.query(
      `SELECT migration_name FROM "_prisma_migrations"
       WHERE migration_name = '20260806130000_migration_framework_p0'
         AND finished_at IS NOT NULL`,
    );
    if (p0.rowCount !== 1) {
      throw new Error('P0 migration missing from history');
    }
    pass('13 migrate deploy/status from P0+P1');

    console.log(`\nAll ${results.length} PostgreSQL schema gates passed.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
