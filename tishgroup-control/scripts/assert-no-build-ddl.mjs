import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const packageJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const build = String(packageJson.scripts?.build ?? '');
const forbidden = ['ensure-control-schema', 'ALTER TABLE', 'CREATE TABLE', 'prisma migrate', 'prisma db push'];

if (forbidden.some((token) => build.includes(token))) {
  console.error('TishGroup build must not mutate schema. Current build script:', build);
  process.exit(1);
}

console.log('assert-no-build-ddl: pass');
