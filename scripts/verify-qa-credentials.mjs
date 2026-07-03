import { readFileSync } from 'node:fs';
import pg from 'pg';
import bcrypt from 'bcryptjs';

function loadEnv(path) {
  for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
    const line = rawLine.replace(/\r/g, '');
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    process.env[m[1]] ??= v.replace(/\\n$/, '').replace(/\r/g, '');
  }
}

loadEnv('.env.production.local');
loadEnv('.playwright-qa.local.env');

const client = new pg.Client({
  connectionString: process.env.POSTGRES_URL_NON_POOLING,
  ssl: { rejectUnauthorized: false },
});
await client.connect();

for (const email of [
  'qa-owner@tillflow.app',
  'qa-cashier@tillflow.app',
  'qa-manager@tillflow.app',
]) {
  const envKey =
    email.includes('owner') ? 'PLAYWRIGHT_OWNER_PASSWORD'
    : email.includes('cashier') ? 'PLAYWRIGHT_CASHIER_PASSWORD'
    : 'PLAYWRIGHT_MANAGER_PASSWORD';
  const row = (
    await client.query(
      'SELECT email, role, active, "twoFactorEnabled", "passwordHash" FROM "User" WHERE email = $1',
      [email],
    )
  ).rows[0];
  const passwordMatches = row
    ? await bcrypt.compare(process.env[envKey] ?? '', row.passwordHash)
    : false;
  console.log(
    JSON.stringify({
      email,
      found: Boolean(row),
      role: row?.role,
      active: row?.active,
      twoFactorEnabled: row?.twoFactorEnabled,
      passwordMatches,
      passwordLength: process.env[envKey]?.length ?? 0,
    }),
  );
}

await client.end();
