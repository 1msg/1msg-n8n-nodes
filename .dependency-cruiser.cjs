// Owners and constraints for this repository's actual runtime roots.
module.exports = {
	forbidden: [
		{
			name: 'no-runtime-cycles',
			severity: 'error',
			from: {},
			to: {
				circular: true,
				dependencyTypesNot: ['type-only'],
			},
		},
		{
			name: 'no-unresolved-dependencies',
			severity: 'error',
			from: {},
			to: {
				couldNotResolve: true,
			},
		},
		{
			name: 'no-runtime-test-dependencies',
			severity: 'error',
			from: {
				path: '^(?:nodes|utils|credentials)/',
				pathNot: '(?:__tests__|test|tests)/|\\.(?:test|spec)\\.',
			},
			to: {
				path: '(?:^|/)(?:__tests__|tests|test)/|(?:^|node_modules/)(?:jest|vitest|ts-jest)',
			},
		},
		{
			name: 'pure-utils-no-node-delivery',
			severity: 'error',
			from: {
				path: '^utils/',
			},
			to: {
				path: '^(?:nodes|credentials)/|node_modules/(?:axios|@1msg)/',
			},
		},
	],
	options: {
		doNotFollow: {
			path: 'node_modules',
		},
		tsConfig: {
			fileName: 'tsconfig.quality.json',
		},
		tsPreCompilationDeps: true,
		enhancedResolveOptions: {
			exportsFields: ['exports'],
			conditionNames: ['types', 'require', 'node', 'default'],
			extensions: ['.js', '.jsx', '.mjs', '.cjs', '.ts', '.tsx', '.mts', '.cts', '.json'],
		},
		exclude: '(?:^|/)node_modules/',
	},
};
