/**
 * Safety gate: load Preview DB credentials and refuse anything that is not
 * the isolated tillflow_preview_qa database.
 */
import { readFileSync, existsSync } from 'node:fs';

export function loadEnvFile(filePath) {
  const out = {};
  for (const line of readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[m[1]] = v;
  }
  return out;
}

export function assertIsolatedPreviewDb(filePath = 'tmp/preview-db-restricted.env') {
  if (!existsSync(filePath)) {
    throw new Error(`Missing ${filePath}. Cannot prove Preview isolation.`);
  }
  const fileEnv = loadEnvFile(filePath);
  for (const key of ['POSTGRES_PRISMA_URL', 'POSTGRES_URL_NON_POOLING']) {
    if (!fileEnv[key]) throw new Error(`Missing ${key} in ${filePath}`);
    const u = new URL(fileEnv[key]);
    if (u.pathname !== '/tillflow_preview_qa') {
      throw new Error(
        `${key} database is ${u.pathname}, expected /tillflow_preview_qa. Aborting to protect production.`,
      );
    }
  }
  return {
    ...fileEnv,
    DATABASE_URL: fileEnv.POSTGRES_URL_NON_POOLING,
    summary: {
      database: 'tillflow_preview_qa',
      hostHint: new URL(fileEnv.POSTGRES_URL_NON_POOLING).hostname.split('.')[0],
    },
  };
}

const isDirect =
  process.argv[1] &&
  (process.argv[1].endsWith('assert-preview-db.mjs') || process.argv[1].endsWith('assert-preview-db.js'));
if (isDirect) {
  const env = assertIsolatedPreviewDb();
  console.log(JSON.stringify({ ok: true, ...env.summary }, null, 2));
}
