import { existsSync } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const repoRoot = process.cwd();
const nodeDir = path.dirname(process.execPath);
const npmBinDir = path.join(nodeDir, 'node_modules', 'npm', 'bin');
const clientDir = path.join(repoRoot, 'node_modules', '.prisma', 'client');
const clientIndexPath = path.join(clientDir, 'index.js');
const enginePath = path.join(clientDir, 'query_engine-windows.dll.node');

function runPrismaGenerate() {
	return new Promise((resolve) => {
		const command = process.platform === 'win32' ? process.execPath : 'npx';
		const args = process.platform === 'win32'
			? [path.join(npmBinDir, 'npx-cli.js'), 'prisma', 'generate', '--schema=prisma/schema.prisma']
			: ['prisma', 'generate', '--schema=prisma/schema.prisma'];

		const child = spawn(command, args, {
			cwd: repoRoot,
			stdio: ['inherit', 'pipe', 'pipe'],
			shell: false,
		});

		let stdout = '';
		let stderr = '';

		child.stdout.on('data', (chunk) => {
			const text = chunk.toString();
			stdout += text;
			process.stdout.write(text);
		});

		child.stderr.on('data', (chunk) => {
			const text = chunk.toString();
			stderr += text;
			process.stderr.write(text);
		});

		child.on('error', (error) => {
			const message = error instanceof Error ? error.message : String(error);
			stderr += `\n${message}`;
			process.stderr.write(`\n[local-prisma-generate] ${message}\n`);
			resolve({ code: 1, stdout, stderr });
		});

		child.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
	});
}

const { code, stdout, stderr } = await runPrismaGenerate();

if (code === 0) {
	process.exit(0);
}

const combinedOutput = `${stdout}\n${stderr}`;
const hasExistingClient = existsSync(clientIndexPath) && existsSync(enginePath);
const isWindowsRenameLockError =
	process.platform === 'win32' &&
	combinedOutput.includes('EPERM: operation not permitted, rename') &&
	combinedOutput.includes('query_engine-windows.dll.node');

if (isWindowsRenameLockError && hasExistingClient) {
	console.warn(
		'\n[local-prisma-generate] Prisma client refresh was blocked by a locked Windows engine DLL. Continuing with the existing generated client for local dev.\n'
	);
	process.exit(0);
}

process.exit(code);