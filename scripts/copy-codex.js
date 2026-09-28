const fs = require('node:fs');
const path = require('node:path');

function walk(dir) {
	for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
		if (entry.name === 'node_modules' || entry.name === 'dist') continue;
		const full = path.join(dir, entry.name);
		if (entry.isDirectory()) {
			walk(full);
			continue;
		}
		if (!entry.name.endsWith('.node.json')) continue;
		const dest = path.join('dist', full);
		fs.mkdirSync(path.dirname(dest), { recursive: true });
		fs.copyFileSync(full, dest);
	}
}

walk('nodes');
