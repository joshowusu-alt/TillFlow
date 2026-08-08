/**
 * Disposable PostgreSQL behavioural gate for Migration P1 Slice 2B.
 * Exercises tenant-scoped package/validation-run queries and CAS version bumps
 * with two real businesses. Companion to vitest service integration tests.
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
  if (!url || !url.startsWith('postgres')) {
    console.error('FATAL: PostgreSQL URL required. Suite did not execute.');
    process.exit(2);
  }
  return url;
}

function cuid() {
  return 'c' + crypto.randomBytes(12).toString('hex');
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

  const db = new Client({ connectionString: url });
  await db.connect();

  const bizA = cuid();
  const bizB = cuid();
  const userA = cuid();
  const userB = cuid();
  const pkgB = cuid();
  const runB = cuid();

  function pass(name) {
    console.log(`PASS ${name}`);
  }

  try {
    await db.query(`DELETE FROM "MigrationValidationRun" WHERE "businessId" = ANY($1::text[])`, [
      [bizA, bizB],
    ]);
    await db.query(`DELETE FROM "MigrationFile" WHERE "businessId" = ANY($1::text[])`, [[bizA, bizB]]);
    await db.query(`DELETE FROM "MigrationBranchMapping" WHERE "businessId" = ANY($1::text[])`, [
      [bizA, bizB],
    ]);
    await db.query(`UPDATE "MigrationPackage" SET "latestValidationRunId" = NULL WHERE id = $1`, [
      pkgB,
    ]);
    await db.query(`DELETE FROM "MigrationPackage" WHERE id = ANY($1::text[])`, [[pkgB]]);
    await db.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [[userA, userB]]);
    await db.query(`DELETE FROM "Business" WHERE id = ANY($1::text[])`, [[bizA, bizB]]);

    await db.query(
      `INSERT INTO "Business" (id, name, "createdAt", "updatedAt") VALUES ($1,'S2B-A',NOW(),NOW()), ($2,'S2B-B',NOW(),NOW())`,
      [bizA, bizB],
    );
    await db.query(
      `INSERT INTO "User" (id, "businessId", name, email, "passwordHash", role, active, "createdAt")
       VALUES ($1,$2,'OwnerA',$3,'x','OWNER',true,NOW()), ($4,$5,'OwnerB',$6,'x','OWNER',true,NOW())`,
      [userA, bizA, `a-${userA}@ex.com`, userB, bizB, `b-${userB}@ex.com`],
    );

    const expires = new Date(Date.now() + 14 * 86400000).toISOString();
    await db.query(
      `INSERT INTO "MigrationPackage"
        (id, "businessId", "contractVersion", "sourceSystemKey", "sourceBusinessKey",
         "reportingCurrency", "packageAsOfDate", status, "reconciliationStatus",
         "expiresAt", version, "lineageRootId", "createdByUserId", "createdAt", "updatedAt")
       VALUES ($1,$2,'1','synthetic','src-b','GHS','2026-01-15','DRAFT','NOT_STARTED',$3,1,$1,$4,NOW(),NOW())`,
      [pkgB, bizB, expires, userB],
    );

    // Session-derived tenancy: query with bizA must not see pkgB
    const foreign = await db.query(
      `SELECT id, status, version FROM "MigrationPackage" WHERE id = $1 AND "businessId" = $2`,
      [pkgB, bizA],
    );
    if (foreign.rowCount !== 0) throw new Error('foreign package visible to business A');
    pass('session-derived package query hides foreign package');

    const own = await db.query(
      `SELECT id, status, version FROM "MigrationPackage" WHERE id = $1 AND "businessId" = $2`,
      [pkgB, bizB],
    );
    if (own.rowCount !== 1) throw new Error('owner B cannot see own package');
    pass('own-tenant package visible');

    // CAS: expected version update
    const casOk = await db.query(
      `UPDATE "MigrationPackage" SET status = 'VALIDATED', version = version + 1, "updatedAt" = NOW()
       WHERE id = $1 AND "businessId" = $2 AND version = 1
       RETURNING version, status`,
      [pkgB, bizB],
    );
    if (casOk.rowCount !== 1 || casOk.rows[0].version !== 2) {
      throw new Error('CAS update failed');
    }
    pass('tenant-scoped CAS version bump');

    const casStale = await db.query(
      `UPDATE "MigrationPackage" SET status = 'VALIDATION_FAILED', version = version + 1
       WHERE id = $1 AND "businessId" = $2 AND version = 1
       RETURNING id`,
      [pkgB, bizB],
    );
    if (casStale.rowCount !== 0) throw new Error('stale CAS unexpectedly succeeded');
    pass('stale expectedVersion CAS no-op');

    // Foreign CAS must not mutate
    const foreignCas = await db.query(
      `UPDATE "MigrationPackage" SET status = 'VALIDATION_FAILED', version = version + 1
       WHERE id = $1 AND "businessId" = $2 AND version = 2
       RETURNING id`,
      [pkgB, bizA],
    );
    if (foreignCas.rowCount !== 0) throw new Error('foreign CAS mutated package');
    const still = await db.query(`SELECT status, version FROM "MigrationPackage" WHERE id = $1`, [
      pkgB,
    ]);
    if (still.rows[0].status !== 'VALIDATED' || still.rows[0].version !== 2) {
      throw new Error('package mutated by foreign actor');
    }
    pass('foreign CAS cannot mutate');

    await db.query(
      `INSERT INTO "MigrationValidationRun"
        (id, "businessId", "packageId", status, "manifestChecksum", "exceptionCount", "exceptionsTruncated", "validatedByUserId", "createdAt")
       VALUES ($1,$2,$3,'SUCCESS',$4,0,0,$5,NOW())`,
      [runB, bizB, pkgB, 'a'.repeat(64), userB],
    );

    const runForeign = await db.query(
      `SELECT id FROM "MigrationValidationRun" WHERE id = $1 AND "businessId" = $2`,
      [runB, bizA],
    );
    if (runForeign.rowCount !== 0) throw new Error('foreign validation run visible');
    pass('validation-run tenant scope');

    // Nonexistent vs foreign equivalence at query layer
    const miss = await db.query(
      `SELECT id FROM "MigrationPackage" WHERE id = $1 AND "businessId" = $2`,
      ['missing-id', bizA],
    );
    if (foreign.rowCount !== miss.rowCount) {
      throw new Error('foreign/nonexistent rowCount divergence');
    }
    pass('foreign/nonexistent response equivalence at query layer');

    console.log('ALL Slice 2B PostgreSQL behavioural gates passed.');
  } finally {
    await db.query(`UPDATE "MigrationPackage" SET "latestValidationRunId" = NULL WHERE id = $1`, [
      pkgB,
    ]);
    await db.query(`DELETE FROM "MigrationValidationRun" WHERE id = $1`, [runB]);
    await db.query(`DELETE FROM "MigrationPackage" WHERE id = $1`, [pkgB]);
    await db.query(`DELETE FROM "User" WHERE id = ANY($1::text[])`, [[userA, userB]]);
    await db.query(`DELETE FROM "Business" WHERE id = ANY($1::text[])`, [[bizA, bizB]]);
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
