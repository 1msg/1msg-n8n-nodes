#!/usr/bin/env bash
# Install the tarball as a real consumer, without checkout dependencies or dev tools.
set -euo pipefail
artifact=$(realpath "$1")
consumer=$(mktemp -d)
trap 'rm -rf "$consumer"' EXIT
cd "$consumer"
printf '{"private":true}' > package.json
npm install --engine-strict --ignore-scripts --no-audit --no-fund "$artifact"
# Resolve every public executable or n8n registration from the installed package.
node - "$2" <<'NODE'
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { resolve } = require('node:path');
const name = process.argv[2];
const root = resolve('node_modules', name);
const manifest = require(resolve(root, 'package.json'));
if (manifest.n8n) {
  for (const entry of [...manifest.n8n.nodes, ...manifest.n8n.credentials]) {
    assert.ok(Object.values(require(resolve(root, entry))).some(value => typeof value === 'function'));
  }
} else {
  const entry = typeof manifest.bin === 'string' ? manifest.bin : Object.values(manifest.bin)[0];
  const result = spawnSync(process.execPath, [resolve(root, entry), '--help'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /1msg/i);
}
console.log(`${name}: fresh consumer installation and entrypoints passed on ${process.version}`);
NODE
