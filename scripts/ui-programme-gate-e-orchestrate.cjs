/**
 * Gate E isolation orchestrator.
 * Separate git worktrees, .next outputs, ports, and SQLite copies.
 * Does not merge, does not touch Production.
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.join(ROOT, 'tmp', 'gate-e');
const WORKTREE_ROOT = process.env.GATE_E_WORKTREE_ROOT || path.join(os.homedir(), '.cursor', 'worktrees');
const NPX = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const NPM = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const useShell = process.platform === 'win32';

const TARGETS = [
  { label: 'production', sha: '8bd7d54e061aafae251100cff0e91c05bb666e77', port: 6202 },
  { label: 'phase1', sha: 'a344a233a83dc62a36be894d308c0f81dedbbf99', port: 6203 },
  { label: 'final', sha: 'fd7b32ac3a02c6c781c895f6f0bb4d1e4283e624', port: 6204 },
];

function log(message) {
  const line = `[gate-e] ${new Date().toISOString()} ${message}`;
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.appendFileSync(path.join(OUT_DIR, 'orchestrate.log'), `${line}\n`);
  process.stdout.write(`${line}\n`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || ROOT,
    env: { ...process.env, ...(options.env || {}) },
    encoding: 'utf8',
    shell: options.shell ?? false,
    stdio: options.stdio || 'pipe',
    timeout: options.timeout,
    windowsHide: true,
  });
  if (result.status !== 0 && options.allowFail !== true) {
    const output = `${result.stdout || ''}\n${result.stderr || ''}`;
    throw new Error(`${command} ${args.join(' ')} failed (${result.status}): ${output.slice(-4000)}`);
  }
  return result;
}

function worktreePath(label) {
  return path.join(WORKTREE_ROOT, `gate-e-${label}`);
}

function ensureWorktree(target) {
  const dest = worktreePath(target.label);
  fs.mkdirSync(WORKTREE_ROOT, { recursive: true });
  if (fs.existsSync(path.join(dest, '.git')) || fs.existsSync(dest)) {
    const head = spawnSync('git', ['-C', dest, 'rev-parse', 'HEAD'], { encoding: 'utf8' });
    if (head.status === 0 && head.stdout.trim() === target.sha) {
      log(`worktree reuse ${target.label} @ ${target.sha}`);
      return dest;
    }
    log(`removing mismatched worktree ${dest}`);
    spawnSync('git', ['worktree', 'remove', '--force', dest], { cwd: ROOT, encoding: 'utf8' });
    try {
      fs.rmSync(dest, { recursive: true, force: true });
    } catch {
      // Windows file lock; continue
    }
  }
  log(`creating worktree ${target.label} -> ${dest}`);
  run('git', ['worktree', 'add', '--detach', dest, target.sha], { cwd: ROOT });
  return dest;
}

function copyNodeModules(dest) {
  const target = path.join(dest, 'node_modules');
  // Do not copy from the OneDrive checkout: those files are often cloud
  // reparse points and robocopy hydrates the whole tree. Install from npm cache.
  if (fs.existsSync(target)) {
    log(`removing incomplete node_modules in ${dest}`);
    fs.rmSync(target, { recursive: true, force: true });
  }
  log(`npm ci --prefer-offline in ${dest}`);
  const result = spawnSync(NPM, ['ci', '--prefer-offline', '--no-audit', '--no-fund'], {
    cwd: dest,
    encoding: 'utf8',
    timeout: 15 * 60 * 1000,
    windowsHide: true,
    shell: useShell,
  });
  if (result.status !== 0) {
    throw new Error(`npm ci failed in ${dest}: ${(result.stderr || result.stdout || '').slice(-4000)}`);
  }
  fs.writeFileSync(path.join(dest, 'node_modules', '.gate-e-npm-ci-ok'), 'ok');
}

function envFor(target, dest, extra = {}) {
  return {
    ...process.env,
    DATABASE_URL: 'file:./gate-e.db',
    NEXT_TELEMETRY_DISABLED: '1',
    TILLFLOW_REQUIRE_WHATSAPP: 'false',
    PORT: String(target.port),
    BASE_URL: `http://127.0.0.1:${target.port}`,
    NEXT_PUBLIC_APP_URL: `http://127.0.0.1:${target.port}`,
    VERCEL: '',
    VERCEL_ENV: '',
    VERCEL_URL: '',
    GATE_E_WORKTREE: dest,
    ...extra,
  };
}

function prepareDatabase(target, dest) {
  const env = envFor(target, dest, { NODE_ENV: 'development', ALLOW_SEED: 'true' });
  log(`prisma sqlite generate + seed ${target.label}`);
  run(NPX, ['prisma', 'generate', '--schema=prisma/schema.prisma'], { cwd: dest, env, timeout: 180_000, shell: useShell });
  run(NPX, ['prisma', 'db', 'push', '--schema=prisma/schema.prisma', '--accept-data-loss'], { cwd: dest, env, timeout: 180_000, shell: useShell });
  run(NPX, ['prisma', 'db', 'seed'], { cwd: dest, env, timeout: 180_000, shell: useShell });
  const stamp = run(process.execPath, [path.join(ROOT, 'scripts', 'gate-e-stamp-fixture.cjs')], { cwd: dest, env, timeout: 60_000 });
  fs.writeFileSync(path.join(OUT_DIR, `fixture-${target.label}.json`), stamp.stdout);
  log(`fixture ${target.label}: ${stamp.stdout.trim().slice(0, 200)}`);
}

function collectBundles(target, dest) {
  const chunksDir = path.join(dest, '.next', 'static', 'chunks');
  const files = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith('.js')) {
        const rel = path.relative(chunksDir, full).replace(/\\/g, '/');
        files.push({ file: rel, bytes: fs.statSync(full).size });
      }
    }
  }
  walk(chunksDir);
  files.sort((a, b) => b.bytes - a.bytes);
  const interesting = files.filter((file) =>
    /layout|page|main-app|framework|webpack|polyfill|pos|onboarding|TopNav|app\/\(protected\)/i.test(file.file),
  );
  const totalJs = files.reduce((sum, file) => sum + file.bytes, 0);
  const report = {
    label: target.label,
    sha: target.sha,
    chunkCount: files.length,
    totalJsBytes: totalJs,
    top20: files.slice(0, 20),
    interesting: interesting.slice(0, 40),
  };
  fs.writeFileSync(path.join(OUT_DIR, `bundles-${target.label}.json`), JSON.stringify(report, null, 2));
  return report;
}

function buildApp(target, dest) {
  const marker = path.join(dest, '.next', '.gate-e-built');
  if (fs.existsSync(marker) && fs.readFileSync(marker, 'utf8').trim() === target.sha) {
    log(`reusing production next build ${target.label}`);
    return collectBundles(target, dest);
  }
  const env = envFor(target, dest, { NODE_ENV: 'production' });
  log(`production next build ${target.label}`);
  const logFile = path.join(OUT_DIR, `build-${target.label}.log`);
  const result = spawnSync(NPX, ['next', 'build'], {
    cwd: dest,
    env,
    encoding: 'utf8',
    timeout: 20 * 60 * 1000,
    windowsHide: true,
    shell: useShell,
  });
  fs.writeFileSync(logFile, `${result.stdout || ''}\n${result.stderr || ''}`);
  if (result.status !== 0) {
    throw new Error(`next build failed for ${target.label}; see ${logFile}`);
  }
  fs.writeFileSync(marker, target.sha);
  return collectBundles(target, dest);
}

function startServer(target, dest) {
  const env = envFor(target, dest, { NODE_ENV: 'production' });
  const logFile = path.join(OUT_DIR, `server-${target.label}.log`);
  const out = fs.openSync(logFile, 'w');
  log(`starting next start ${target.label} :${target.port}`);
  const child = spawn(NPX, ['next', 'start', '-p', String(target.port), '-H', '127.0.0.1'], {
    cwd: dest,
    env,
    stdio: ['ignore', out, out],
    windowsHide: true,
    detached: false,
    shell: useShell,
  });
  return { child, logFile, pid: child.pid };
}

async function waitHealthy(target, timeoutMs = 120_000) {
  const started = Date.now();
  const url = `http://127.0.0.1:${target.port}/login`;
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { redirect: 'manual' });
      if (res.status >= 200 && res.status < 500) {
        log(`healthy ${target.label} ${res.status}`);
        return;
      }
    } catch {
      // not up yet
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`${target.label} did not become healthy on ${url}`);
}

async function snapshotDb(target, dest) {
  const env = envFor(target, dest);
  const script = `
    const { PrismaClient } = require(require('path').join(process.cwd(), 'node_modules/@prisma/client'));
    const prisma = new PrismaClient();
    (async () => {
      const snap = {
        salesInvoices: await prisma.salesInvoice.count(),
        products: await prisma.product.count(),
        shifts: await prisma.shift.count(),
        shiftsOpen: await prisma.shift.count({ where: { status: 'OPEN' } }),
        purchaseInvoices: await prisma.purchaseInvoice.count(),
        stockMovements: await prisma.stockMovement.count(),
      };
      process.stdout.write(JSON.stringify(snap));
      await prisma.$disconnect();
    })().catch((e) => { console.error(e); process.exit(1); });
  `;
  const result = run(process.execPath, ['-e', script], { cwd: dest, env, timeout: 30_000 });
  return JSON.parse(result.stdout.trim());
}

function stopServer(proc) {
  if (!proc?.child) return;
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { encoding: 'utf8', windowsHide: true });
    } else {
      proc.child.kill('SIGTERM');
    }
  } catch (error) {
    log(`stop warning: ${error.message}`);
  }
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_DIR, 'orchestrate.log'), '');
  log(`node ${process.version} os ${os.platform()} ${os.release()}`);
  log(`root ${ROOT}`);

  const servers = [];
  const bundles = [];
  const before = {};
  try {
    for (const target of TARGETS) {
      const dest = ensureWorktree(target);
      target.dest = dest;
      if (process.env.GATE_E_SKIP_SETUP === '1') {
        log(`skip setup ${target.label} (reuse install/build/db)`);
        bundles.push(collectBundles(target, dest));
        continue;
      }
      if (!fs.existsSync(path.join(dest, 'node_modules', '.gate-e-npm-ci-ok'))) {
        copyNodeModules(dest);
      } else {
        log(`npm ci already complete for ${target.label}`);
      }
      prepareDatabase(target, dest);
      bundles.push(buildApp(target, dest));
    }

    for (const target of TARGETS) {
      before[target.label] = await snapshotDb(target, target.dest);
      servers.push({ target, proc: startServer(target, target.dest) });
    }
    for (const target of TARGETS) {
      await waitHealthy(target);
    }

    fs.writeFileSync(path.join(OUT_DIR, 'db-before.json'), JSON.stringify(before, null, 2));
    fs.writeFileSync(path.join(OUT_DIR, 'bundles.json'), JSON.stringify(bundles, null, 2));

    const gateTargets = TARGETS.map((target) => ({
      label: target.label,
      sha: target.sha,
      baseUrl: `http://127.0.0.1:${target.port}`,
    }));
    log('running identical bench against all three SHAs');
    const bench = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'ui-programme-gate-e-bench.cjs')], {
      cwd: ROOT,
      env: {
        ...process.env,
        GATE_E_TARGETS: JSON.stringify(gateTargets),
        OUT_DIR,
        SAMPLES: process.env.SAMPLES || '5',
      },
      encoding: 'utf8',
      timeout: undefined,
      windowsHide: true,
    });
    fs.writeFileSync(path.join(OUT_DIR, 'bench-run.log'), `${bench.stdout || ''}\n${bench.stderr || ''}`);
    if (bench.status !== 0) {
      throw new Error(`bench failed: ${(bench.stderr || bench.stdout || '').slice(-4000)}`);
    }
    log(bench.stdout.trim().slice(0, 500));

    const after = {};
    for (const target of TARGETS) {
      after[target.label] = await snapshotDb(target, target.dest);
    }
    fs.writeFileSync(path.join(OUT_DIR, 'db-after.json'), JSON.stringify(after, null, 2));
    const financialKeys = ['salesInvoices', 'products', 'shifts', 'shiftsOpen', 'purchaseInvoices', 'stockMovements'];
    const writeViolations = [];
    for (const target of TARGETS) {
      for (const key of financialKeys) {
        if (before[target.label][key] !== after[target.label][key]) {
          writeViolations.push({ label: target.label, key, before: before[target.label][key], after: after[target.label][key] });
        }
      }
    }
    fs.writeFileSync(path.join(OUT_DIR, 'write-proof.json'), JSON.stringify({ writeViolations, before, after }, null, 2));
    if (writeViolations.length) {
      throw new Error(`financial/stock/shift write detected: ${JSON.stringify(writeViolations)}`);
    }
    log('zero financial/stock/shift writes confirmed');
  } finally {
    for (const entry of servers) stopServer(entry.proc);
  }
}

main().catch((error) => {
  log(error.stack || error.message);
  process.exit(1);
});
