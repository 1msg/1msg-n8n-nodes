import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';

import { NodeOperationError } from 'n8n-workflow';

import { extractMessage, humanizeMessage } from '../../utils/errors';
import {
	isApproved,
	languageCode,
	templatesFromResponse,
	type TemplateRecord,
} from '../../utils/templates';
import { oneMsgRequest } from '../transport';

type TemplateContext = IExecuteFunctions | ILoadOptionsFunctions;

/** Fetch at most three pages of unique templates, report an empty error response, and return approved templates only. */
export async function listApprovedTemplates(this: TemplateContext): Promise<TemplateRecord[]> {
	const collected: TemplateRecord[] = [];
	const seen = new Set<string>();
	const limit = 100;

	for (let page = 0; page < 3; page++) {
		const response = await oneMsgRequest.call(this, 'GET', '/templates', undefined, {
			qs: { limit, offset: page * limit, sort: 'name' },
		});
		const pageItems = templatesFromResponse(response);
		if (page === 0 && pageItems.length === 0) {
			const message = extractMessage(response);
			if (message) {
				throw new NodeOperationError(this.getNode(), humanizeMessage(message));
			}
		}
		let added = 0;
		for (const template of pageItems) {
			const key = `${template.id || ''}::${template.name || ''}::${languageCode(template.language)}`;
			if (seen.has(key)) continue;
			seen.add(key);
			collected.push(template);
			added += 1;
		}
		const total =
			response && typeof response === 'object'
				? Number((response as { total?: unknown }).total)
				: Number.NaN;
		// Meta's list ignores offset and returns the full page set again.
		if (!hasAnotherTemplatePage(collected.length, added, pageItems.length, total)) break;
	}

	return collected.filter(isApproved);
}

/** Stop on a duplicate or short page, the provider total, or the documented 300-template limit. */
function hasAnotherTemplatePage(
	collected: number,
	added: number,
	pageSize: number,
	total: number,
): boolean {
	return (
		collected < 300 &&
		added > 0 &&
		pageSize >= 100 &&
		(!Number.isFinite(total) || collected < total)
	);
}
