import net from 'node:net';
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const nodeDir = path.dirname(process.execPath);
const npmCliPath = path.join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js');
const requestedPort = Number.parseInt(process.env.PORT ?? '6200', 10);
const portWindowSize = 5;
const candidatePorts = Number.isFinite(requestedPort)
	? Array.from({ length: portWindowSize }, (_, index) => requestedPort + index)
	: [6200, 6201, 6202, 6203, 6204];

function getNpmCommand() {
	return process.platform === 'win32'
		? { command: process.execPath, prefixArgs: [npmCliPath] }
		: { command: 'npm', prefixArgs: [] };
}

function logOpenUrl(port, reason) {
	const url = `http://127.0.0.1:${port}`;
	console.log(`[local-dev] ${reason}`);
	console.log(`[local-dev] Open TillFlow at ${url}`);
}

async function clearNextArtifacts(reason) {
	const nextDir = path.join(repoRoot, '.next');
	console.warn(`[local-dev] ${reason}`);
	console.warn(`[local-dev] Clearing stale .next artifacts and retrying once...`);
	await rm(nextDir, { recursive: true, force: true });
}

function shouldRetryAfterNextFailure({ code, stderr, durationMs, attempt }) {
	if (attempt > 1 || code === 0 || durationMs > 20000) {
		return false;
	}

	if (process.platform !== 'win32' || !/onedrive/i.test(repoRoot)) {
		return false;
	}

	return /EINVAL: invalid argument, readlink/i.test(stderr) && /\.next/i.test(stderr);
}

function runCommand(command, args) {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: repoRoot,
			stdio: 'inherit',
			env: process.env,
		});

		child.on('error', (error) => {
			console.error(`[local-dev] Failed to start ${command}: ${error instanceof Error ? error.message : error}`);
			resolve(1);
		});

		child.on('exit', (code, signal) => {
			if (signal) {
				process.kill(process.pid, signal);
				return;
			}

			resolve(code ?? 1);
		});
	});
}

async function prepareLocalDev() {
	const npmCommand = getNpmCommand();
	const prepareExitCode = await runCommand(npmCommand.command, [...npmCommand.prefixArgs, 'run', 'dev:prepare']);

	if (prepareExitCode !== 0) {
		throw new Error(`Local dev preparation failed with exit code ${prepareExitCode}.`);
	}
}

async function isTillFlowServer(port) {
	try {
		const response = await fetch(`http://127.0.0.1:${port}/welcome`, {
			redirect: 'follow',
			signal: AbortSignal.timeout(1500),
		});

		if (!response.ok) {
			return false;
		}

		const body = await response.text();
		return body.includes('TillFlow');
	} catch {
		return false;
	}
}

async function findRunningTillFlowPort() {
	for (const port of candidatePorts) {
		if (await isPortAvailable(port)) {
			continue;
		}

		if (await isTillFlowServer(port)) {
			return port;
		}
	}

	return null;
}

function isPortAvailable(port) {
	return new Promise((resolve) => {
		const server = net.createServer();
		server.unref();

		server.on('error', (error) => {
			if (error && typeof error === 'object' && 'code' in error && error.code === 'EADDRINUSE') {
				resolve(false);
				return;
			}

			resolve(false);
		});

		server.listen(
			{
				port,
				exclusive: true,
			},
			() => {
				server.close(() => resolve(true));
			}
		);
	});
}

async function findOpenPort() {
	for (const port of candidatePorts) {
		if (await isPortAvailable(port)) {
			return port;
		}

		console.warn(`[local-dev] Port ${port} is already in use. Trying the next local dev port...`);
	}

	return null;
}

async function maybeReuseRunningServer() {
	const runningPort = await findRunningTillFlowPort();

	if (runningPort == null) {
		return null;
	}

	logOpenUrl(runningPort, `TillFlow is already running on port ${runningPort} — reusing the existing dev server.`);
	return runningPort;
}

function warnIfInOneDrive() {
	if (process.platform !== 'win32') return;
	if (!/onedrive/i.test(repoRoot)) return;
	if (process.env.TILLFLOW_SUPPRESS_ONEDRIVE_WARNING === '1') return;

	console.warn('');
	console.warn('[33m[local-dev] WARNING: repo is running from a OneDrive-synced folder.[0m');
	console.warn(`[local-dev]   Path: ${repoRoot}`);
	console.warn('[local-dev]   OneDrive\'s files-on-demand can cause intermittent');
	console.warn('[local-dev]   "UNKNOWN: unknown error, read" and "EINVAL: readlink"');
	console.warn('[local-dev]   failures in ESLint, Vitest, and Next.js. If you hit');
	console.warn('[local-dev]   random build errors, move the repo to a plain local path');
	console.warn('[local-dev]   such as C:\\dev\\supermarket-pos.');
	console.warn('[local-dev]   Suppress with TILLFLOW_SUPPRESS_ONEDRIVE_WARNING=1.');
	console.warn('');
}

async function main() {
	warnIfInOneDrive();

	if ((await maybeReuseRunningServer()) != null) {
		return;
	}

	await prepareLocalDev();

	if ((await maybeReuseRunningServer()) != null) {
		return;
	}

	const port = await findOpenPort();

	if (port == null) {
		throw new Error(
			`[local-dev] Could not find a free port in the local dev range ${candidatePorts[0]}-${candidatePorts.at(-1)}.`
		);
	}

	logOpenUrl(port, `Starting TillFlow on port ${port}.`);

	const nextBin = path.join(repoRoot, 'node_modules', 'next', 'dist', 'bin', 'next');

	for (let attempt = 1; attempt <= 2; attempt += 1) {
		const startedAt = Date.now();
		const result = await new Promise((resolve) => {
			let stderr = '';
			const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
				cwd: repoRoot,
				stdio: ['inherit', 'inherit', 'pipe'],
				env: {
					...process.env,
					PORT: String(port),
				},
			});

			child.stderr?.on('data', (chunk) => {
				stderr += chunk.toString();
				process.stderr.write(chunk);
			});

			child.on('error', (error) => {
				console.error(`[local-dev] Failed to start Next.js dev server: ${error instanceof Error ? error.message : error}`);
				resolve({ code: 1, signal: null, stderr, durationMs: Date.now() - startedAt, attempt });
			});

			child.on('exit', (code, signal) => {
				resolve({ code: code ?? 0, signal, stderr, durationMs: Date.now() - startedAt, attempt });
			});
		});

		if (result.signal) {
			process.kill(process.pid, result.signal);
			return;
		}

		if (shouldRetryAfterNextFailure(result)) {
			await clearNextArtifacts('Detected a stale OneDrive .next readlink failure during startup.');
			continue;
		}

		process.exit(result.code ?? 0);
	}
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
