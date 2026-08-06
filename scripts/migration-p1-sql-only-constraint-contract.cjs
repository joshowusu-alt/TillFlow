/**
 * Live PostgreSQL introspection guard for intentional SQL-only composite FKs.
 *
 * Runs AFTER `prisma migrate deploy` against disposable Postgres.
 * Fails if a protected constraint is missing, renamed, mistyped, mis-attached,
 * column-mismatched, or has the wrong ON DELETE action.
 *
 * See docs/migration/P1_SLICE1_SQL_ONLY_CONSTRAINTS.md.
 */

const { Client } = require('pg');
const { execSync } = require('node:child_process');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

/** @typedef {{ name: string, table: string, columns: string[], refTable: string, refColumns: string[], onDelete: string }} ExpectedFk */

/** @type {ExpectedFk[]} */
const PROTECTED_FOREIGN_KEYS = [
  {
    name: 'MigrationPackage_businessId_predecessorPackageId_fkey',
    table: 'MigrationPackage',
    columns: ['businessId', 'predecessorPackageId'],
    refTable: 'MigrationPackage',
    refColumns: ['businessId', 'id'],
    onDelete: 'restrict',
  },
  {
    name: 'MigrationPackage_businessId_validatedByUserId_fkey',
    table: 'MigrationPackage',
    columns: ['businessId', 'validatedByUserId'],
    refTable: 'User',
    refColumns: ['businessId', 'id'],
    onDelete: 'restrict',
  },
  {
    name: 'MigrationPackage_businessId_approvedByUserId_fkey',
    table: 'MigrationPackage',
    columns: ['businessId', 'approvedByUserId'],
    refTable: 'User',
    refColumns: ['businessId', 'id'],
    onDelete: 'restrict',
  },
  {
    name: 'MigrationPackage_businessId_executedByUserId_fkey',
    table: 'MigrationPackage',
    columns: ['businessId', 'executedByUserId'],
    refTable: 'User',
    refColumns: ['businessId', 'id'],
    onDelete: 'restrict',
  },
  {
    name: 'MigrationPackage_businessId_cancelledByUserId_fkey',
    table: 'MigrationPackage',
    columns: ['businessId', 'cancelledByUserId'],
    refTable: 'User',
    refColumns: ['businessId', 'id'],
    onDelete: 'restrict',
  },
  {
    name: 'MigrationPackage_businessId_supersededByUserId_fkey',
    table: 'MigrationPackage',
    columns: ['businessId', 'supersededByUserId'],
    refTable: 'User',
    refColumns: ['businessId', 'id'],
    onDelete: 'restrict',
  },
  {
    name: 'MigrationValidationRun_businessId_validatedByUserId_fkey',
    table: 'MigrationValidationRun',
    columns: ['businessId', 'validatedByUserId'],
    refTable: 'User',
    refColumns: ['businessId', 'id'],
    onDelete: 'restrict',
  },
  {
    name: 'MigrationPackage_businessId_latestValidationRunId_fkey',
    table: 'MigrationPackage',
    columns: ['businessId', 'latestValidationRunId'],
    refTable: 'MigrationValidationRun',
    refColumns: ['businessId', 'id'],
    onDelete: 'restrict',
  },
  {
    name: 'MigrationPackage_latestValidationRunId_id_fkey',
    table: 'MigrationPackage',
    columns: ['latestValidationRunId', 'id'],
    refTable: 'MigrationValidationRun',
    refColumns: ['id', 'packageId'],
    onDelete: 'restrict',
  },
];

function requireUrl() {
  const url =
    process.env.POSTGRES_URL_NON_POOLING ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.DATABASE_URL;
  if (!url || !url.startsWith('postgres')) {
    console.error(
      'FATAL: PostgreSQL URL required. SQL-only constraint contract did not execute.',
    );
    process.exit(2);
  }
  return url;
}

function confdelToAction(confdeltype) {
  // pg_constraint.confdeltype: a=no action, r=restrict, c=cascade, n=set null, d=set default
  switch (confdeltype) {
    case 'a':
      return 'no action';
    case 'r':
      return 'restrict';
    case 'c':
      return 'cascade';
    case 'n':
      return 'set null';
    case 'd':
      return 'set default';
    default:
      return `unknown(${confdeltype})`;
  }
}

async function loadFkDefinition(client, constraintName) {
  const result = await client.query(
    `
    SELECT
      c.conname AS name,
      c.contype AS contype,
      rel.relname AS table_name,
      frel.relname AS foreign_table_name,
      c.confdeltype AS confdeltype,
      (
        SELECT array_agg(att.attname ORDER BY u.ord)
        FROM unnest(c.conkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute att
          ON att.attrelid = c.conrelid AND att.attnum = u.attnum
      ) AS columns,
      (
        SELECT array_agg(att.attname ORDER BY u.ord)
        FROM unnest(c.confkey) WITH ORDINALITY AS u(attnum, ord)
        JOIN pg_attribute att
          ON att.attrelid = c.confrelid AND att.attnum = u.attnum
      ) AS foreign_columns
    FROM pg_constraint c
    JOIN pg_class rel ON rel.oid = c.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    JOIN pg_class frel ON frel.oid = c.confrelid
    WHERE nsp.nspname = 'public'
      AND c.contype = 'f'
      AND c.conname = $1
    `,
    [constraintName],
  );
  return result.rows[0] || null;
}

function sameStringArray(a, b) {
  const left = normalizePgTextArray(a);
  const right = normalizePgTextArray(b);
  if (left.length !== right.length) return false;
  return left.every((v, i) => v === right[i]);
}

function normalizePgTextArray(value) {
  if (Array.isArray(value)) return value.map(String);
  if (value == null) return [];
  if (typeof value === 'string') {
    // "{a,b}" or "{\"a\",\"b\"}"
    const trimmed = value.replace(/^\{|\}$/g, '');
    if (!trimmed) return [];
    return trimmed.split(',').map((part) => part.replace(/^"|"$/g, ''));
  }
  return [String(value)];
}

async function main() {
  const url = requireUrl();
  process.env.POSTGRES_PRISMA_URL = url;
  process.env.POSTGRES_URL_NON_POOLING = url;

  console.log('Ensuring migrations are deployed before constraint contract…');
  execSync('npx prisma migrate deploy --schema=prisma/schema.postgres.prisma', {
    cwd: root,
    stdio: 'inherit',
    env: process.env,
    shell: true,
  });

  const client = new Client({ connectionString: url });
  await client.connect();

  const failures = [];
  try {
    for (const expected of PROTECTED_FOREIGN_KEYS) {
      const live = await loadFkDefinition(client, expected.name);
      if (!live) {
        failures.push(`MISSING constraint ${expected.name}`);
        continue;
      }
      if (live.contype !== 'f') {
        failures.push(`${expected.name}: expected foreign key, got contype=${live.contype}`);
      }
      if (live.table_name !== expected.table) {
        failures.push(`${expected.name}: table ${live.table_name} !== ${expected.table}`);
      }
      if (live.foreign_table_name !== expected.refTable) {
        failures.push(
          `${expected.name}: ref table ${live.foreign_table_name} !== ${expected.refTable}`,
        );
      }
      if (!sameStringArray(live.columns, expected.columns)) {
        failures.push(
          `${expected.name}: columns [${(live.columns || []).join(',')}] !== [${expected.columns.join(',')}]`,
        );
      }
      if (!sameStringArray(live.foreign_columns, expected.refColumns)) {
        failures.push(
          `${expected.name}: ref columns [${(live.foreign_columns || []).join(',')}] !== [${expected.refColumns.join(',')}]`,
        );
      }
      const onDelete = confdelToAction(live.confdeltype);
      if (onDelete !== expected.onDelete) {
        failures.push(
          `${expected.name}: ON DELETE ${onDelete} !== ${expected.onDelete}`,
        );
      }

      const relatedFails = failures.filter((f) => f.includes(expected.name));
      if (relatedFails.length === 0) {
        console.log(`  OK ${expected.name}`);
      }
    }

    if (failures.length) {
      console.error('\nSQL-only constraint contract FAILED:');
      for (const f of failures) console.error(`  - ${f}`);
      process.exitCode = 1;
      return;
    }

    console.log(
      `\nSQL-only constraint contract passed (${PROTECTED_FOREIGN_KEYS.length} foreign keys).`,
    );
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
