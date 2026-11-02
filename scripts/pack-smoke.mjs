import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), '1msg-packed-'));
/** Run the artifact consumer and propagate both command failure and unexpected hangs. */
function run(command, args, cwd = root) {
	const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 30000 });
	if (result.status !== 0)
		throw new Error(`${command} failed: ${result.stderr || result.stdout || result.error}`);
	return result.stdout;
}
try {
	const [packed] = JSON.parse(
		run('npm', ['pack', '--json', '--ignore-scripts', '--pack-destination', temporary]),
	);
	assert.ok(
		packed.files.some((file) => file.path.startsWith('dist/')),
		'packed build output missing',
	);
	run('tar', ['-xzf', join(temporary, packed.filename), '-C', temporary]);
	const artifact = join(temporary, 'package');
	// The artifact is isolated from source; dependencies come from the frozen checkout install.
	symlinkSync(resolve('node_modules'), join(artifact, 'node_modules'), 'dir');
	const manifest = JSON.parse(readFileSync(join(artifact, 'package.json'), 'utf8'));
	if (manifest.n8n) {
		for (const entry of [...manifest.n8n.nodes, ...manifest.n8n.credentials]) {
			run(
				process.execPath,
				[
					'-e',
					`const value=require(${JSON.stringify(join(artifact, entry))}); if(!Object.values(value).some(item=>typeof item==='function')) throw new Error('Missing registered node/credential export')`,
				],
				artifact,
			);
		}
	} else if (manifest.bin) {
		const entry = typeof manifest.bin === 'string' ? manifest.bin : Object.values(manifest.bin)[0];
		assert.match(run(process.execPath, [join(artifact, entry), '--help'], artifact), /1msg/i);
	} else {
		run(
			process.execPath,
			['-e', `require(${JSON.stringify(join(artifact, manifest.main))})`],
			artifact,
		);
	}
	console.log(
		'Packed artifact resolves and its public entrypoints load without source files or external services',
	);
} finally {
	rmSync(temporary, { recursive: true, force: true });
}
