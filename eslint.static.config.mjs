import { staticConfig, globals } from './tools/quality/eslint.mjs';

export default [
	{ files: ['**/*.jsx'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },
	{ ignores: ['**/node_modules/**', '**/dist/**', '**/tools/quality/**', '**/quality/reports/**'] },
	...staticConfig({ globals: { ...globals.node, ...globals.jest } }),
	{
		settings: {
			'import/resolver': {
				typescript: { project: './tsconfig.quality.json' },
				node: { extensions: ['.js', '.json', '.ts', '.mjs', '.cjs'] },
			},
		},
	},
];
