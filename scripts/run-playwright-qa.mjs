import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

function loadEnv(path) {
  try {
    for (const rawLine of readFileSync(path, 'utf8').split('\n')) {
      const line = rawLine.replace(/\r/g, '');
      const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      v = v.replace(/\\n$/, '').replace(/\r/g, '');
      process.env[m[1]] = v;
    }
  } catch {
    // optional
  }
}

loadEnv('.playwright-qa.local.env');

const QA_PROJECTS = [
  'setup-auth',
  'owner-chromium',
  'cashier-chromium',
  'manager-chromium',
  'owner-cold-boot-chromium',
];

const args = process.argv.slice(2);
const result = spawnSync(
  'npx',
  ['playwright', 'test', ...QA_PROJECTS.flatMap((project) => ['--project', project]), ...args], {
  stdio: 'inherit',
  shell: true,
  env: process.env,
});

process.exit(result.status ?? 1);
