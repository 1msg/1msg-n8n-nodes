import { TemplateError } from './template-shapes';

/** Map a template placeholder and component prefix to the stable node-input key used by builders and the editor. */
export function fieldId(prefix: string, token: string): string {
	const safe = token.replace(/[^A-Za-z0-9_]/g, '_');
	return `${prefix}${safe}`;
}

/** Require a nonblank text value and report its user-facing field label before payload construction. */
export function requireValue(values: Record<string, string>, id: string, label: string): string {
	const value = values[id];
	if (typeof value !== 'string' || !value.trim()) {
		throw new TemplateError(`Fill in “${label}”.`);
	}
	return value.trim();
}

/** Serialize template text placeholders in their declared order, validating each required value with its editor label. */
export function textParameters(
	tokens: string[],
	values: Record<string, string>,
	prefix: string,
	labels: Map<string, string>,
) {
	/** Preserve placeholder order while associating validation errors with the visible field name. */
	return tokens.map((token) => {
		const id = fieldId(prefix, token);
		return {
			type: 'text',
			text: requireValue(values, id, labels.get(id) || id),
		};
	});
}

/** Select the WhatsApp media parameter shape from the already validated header format and link. */
export function mediaParameter(format: string, link: string): Record<string, unknown> {
	if (format === 'VIDEO') return { type: 'video', video: { link } };
	if (format === 'DOCUMENT') return { type: 'document', document: { link } };
	return { type: 'image', image: { link } };
}
