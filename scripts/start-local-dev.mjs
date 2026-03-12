import net from 'node:net';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const requestedPort = Number.parseInt(process.env.PORT ?? '6200', 10);
const portWindowSize = 5;
const candidatePorts = Number.isFinite(requestedPort)
	? Array.from({ length: portWindowSize }, (_, index) => requestedPort + index)
	: [6200, 6201, 6202, 6203, 6204];

function getNpmCommand() {
	return process.platform === 'win32' ? 'npm.cmd' : 'npm';
}

function logOpenUrl(port, reason) {
	const url = `http://127.0.0.1:${port}`;
	console.log(`[local-dev] ${reason}`);
	console.log(`[local-dev] Open TillFlow at ${url}`);
}

function runCommand(command, args) {
	return new Promise((resolve) => {
		const child = spawn(command, args, {
			cwd: repoRoot,
			stdio: 'inherit',
			env: process.env,
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
	const prepareExitCode = await runCommand(npmCommand, ['run', 'dev:prepare']);

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

async function main() {
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
	const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(port)], {
		cwd: repoRoot,
		stdio: 'inherit',
		env: {
			...process.env,
			PORT: String(port),
		},
	});

	child.on('exit', (code, signal) => {
		if (signal) {
			process.kill(process.pid, signal);
			return;
		}

		process.exit(code ?? 0);
	});
}

try {
	await main();
} catch (error) {
	console.error(error instanceof Error ? error.message : error);
	process.exit(1);
}
