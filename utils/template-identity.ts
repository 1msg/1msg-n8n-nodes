import type { TemplateRecord } from './template-shapes';

import { languageCode, readNamespace, TemplateError } from './template-shapes';

/**
 * Namespace is required by 1MSG sendTemplate. It is usually on the template.
 * On some channels it is only present on other templates of the same account,
 * and then only when every listed namespace is the same.
 */
function resolveNamespace(template: TemplateRecord, siblings: TemplateRecord[] = []): string {
	const own = readNamespace(template);
	if (own) return own;
	const found = new Set<string>();
	for (const sibling of siblings) {
		const namespace = readNamespace(sibling);
		if (namespace) found.add(namespace);
	}
	if (found.size === 1) return found.values().next().value ?? '';
	return '';
}

/** Return the template identifier and language required by the send endpoint, rejecting incomplete template metadata. */
export function templateSendIdentity(
	template: TemplateRecord,
	siblings: TemplateRecord[] = [],
): {
	template: string;
	namespace: string;
	language: { policy: 'deterministic'; code: string };
} {
	const name = template.name?.trim();
	const code = languageCode(template.language);
	if (!name) {
		throw new TemplateError(
			'The selected template has no name. Refresh the list and choose it again.',
		);
	}
	if (!code) {
		throw new TemplateError(
			`Template “${name}” has no language. Refresh the list and choose it again.`,
		);
	}
	const namespace = resolveNamespace(template, siblings);
	if (!namespace) {
		throw new TemplateError(
			`Template “${name}” has no namespace, so 1MSG cannot send it yet. Refresh the list. If it still has no namespace, open the template in 1MSG and check the channel connection.`,
		);
	}
	return {
		template: name,
		namespace,
		language: { policy: 'deterministic', code },
	};
}
