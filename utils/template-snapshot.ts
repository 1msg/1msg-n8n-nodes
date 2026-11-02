import type { TemplateRecord } from './template-shapes';

import { languageCode, readNamespace } from './template-shapes';

export interface TemplateSpec {
	name: string;
	language: string;
	namespace: string;
	components: unknown;
	id: string;
}

/** Decode the stored dropdown snapshot or a mapped template name and language; malformed objects fall back to a plain identifier. */
export function readTemplateSpec(key: string): TemplateSpec {
	const raw = String(key || '').trim();
	const opened = raw.slice(0, 3) === 'v1:' ? raw.slice(3).split('{#1#').join('{{') : raw;
	const empty: TemplateSpec = { name: '', language: '', namespace: '', components: null, id: '' };
	if (!opened) return empty;
	if (opened.startsWith('{')) {
		try {
			const parsed = JSON.parse(opened) as Record<string, unknown>;
			if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
				return storedTemplateSpec(parsed);
			}
		} catch {
			// A mapped value that starts with { is handled as a plain name below.
		}
	}
	const parts = raw.split('|');
	const [mappedName = '', mappedLanguage = ''] = parts;
	if (
		parts.length >= 2 &&
		mappedName.trim() &&
		mappedLanguage.trim() &&
		!/\s/.test(mappedLanguage)
	) {
		return {
			name: mappedName.trim(),
			language: mappedLanguage.trim(),
			namespace: parts.length > 2 ? parts.slice(2).join('|').trim() : '',
			components: null,
			id: '',
		};
	}
	return { name: '', language: '', namespace: '', components: null, id: raw };
}

/** Store a bounded template snapshot, dropping oversized component metadata and escaping placeholder braces for the host. */
export function packTemplateValue(template: TemplateRecord): string {
	const packed: Record<string, unknown> = {
		id:
			template.id !== null && template.id !== undefined && String(template.id)
				? String(template.id)
				: '',
		name: template.name || '',
		language: languageCode(template.language),
		namespace: readNamespace(template),
	};
	if (template.components !== null && template.components !== undefined)
		packed.components = template.components;
	let json = JSON.stringify(packed);
	if (`v1:${json}`.length > 6000) {
		delete packed.components;
		json = JSON.stringify(packed);
	}
	return `v1:${json.split('{{').join('{#1#')}`;
}

/** Normalize a validated snapshot record without coercing optional text or inventing component metadata. */
function storedTemplateSpec(parsed: Record<string, unknown>): TemplateSpec {
	return {
		name: typeof parsed.name === 'string' ? parsed.name.trim() : '',
		language: typeof parsed.language === 'string' ? parsed.language.trim() : '',
		namespace: typeof parsed.namespace === 'string' ? parsed.namespace.trim() : '',
		components: Object.prototype.hasOwnProperty.call(parsed, 'components')
			? parsed.components
			: null,
		id: parsed.id === null || parsed.id === undefined ? '' : String(parsed.id).trim(),
	};
}
