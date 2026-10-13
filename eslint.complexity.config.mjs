import { maintainabilityConfig, tseslint } from './tools/quality/eslint.mjs';
export default [
	{ files: ['**/*.jsx'], languageOptions: { parserOptions: { ecmaFeatures: { jsx: true } } } },
	{ linterOptions: { reportUnusedDisableDirectives: 'off' } },
	{ ignores: ['**/node_modules/**', '**/dist/**', '**/tools/quality/**', '**/quality/reports/**'] },
	{
		files: ['**/*.{ts,tsx,cts,mts}'],
		languageOptions: { parser: tseslint.parser },
		plugins: { '@typescript-eslint': tseslint.plugin },
	},
	...maintainabilityConfig(),
];
