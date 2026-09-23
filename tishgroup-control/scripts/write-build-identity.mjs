import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const output = join(root, 'public', 'build-identity.json');
const INCLUDE_DIRS = ['app', 'components', 'lib', 'prisma', 'scripts'];
const INCLUDE_FILES = ['middleware.ts', 'package.json', 'next.config.js', 'next.config.mjs'];

function walk(dir, acc = []) {
  if (!existsSync(dir)) return acc;
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '.next' || entry.endsWith('.generated.json')) continue;
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function gitSha() {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: join(root, '..'), stdio: ['ignore', 'pipe', 'ignore'] })
      .toString('utf8')
      .trim();
  } catch {
    return process.env.VERCEL_GIT_COMMIT_SHA || process.env.CONTROL_BUILD_SHA || null;
  }
}

const files = [
  ...INCLUDE_FILES.map((name) => join(root, name)).filter((path) => existsSync(path)),
  ...INCLUDE_DIRS.flatMap((dir) => walk(join(root, dir))),
].sort();

const hash = createHash('sha256');
for (const file of files) {
  hash.update(relative(root, file).replaceAll('\\', '/'));
  hash.update('\0');
  hash.update(readFileSync(file));
  hash.update('\0');
}

const identity = {
  sourceHash: hash.digest('hex'),
  gitSha: gitSha(),
  fileCount: files.length,
  builtAt: new Date().toISOString(),
};

writeFileSync(output, `${JSON.stringify(identity, null, 2)}\n`);
console.log(JSON.stringify({ ok: true, sourceHash: identity.sourceHash, gitSha: identity.gitSha, fileCount: identity.fileCount }));
