import { typedConfig } from './tools/quality/eslint.mjs';
export default [
	{ ignores: ['**/node_modules/**', '**/dist/**', '**/tools/quality/**', '**/quality/reports/**'] },
	...typedConfig({ project: './tsconfig.quality.json', tsconfigRootDir: import.meta.dirname }),
];
