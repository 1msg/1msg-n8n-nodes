import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { oneMsgRequest } from '../transport';
import { extractMessage, humanizeMessage } from '../../utils/errors';
import {
	isApproved,
	languageCode,
	templatesFromResponse,
	type TemplateRecord,
} from '../../utils/templates';

type TemplateContext = IExecuteFunctions | ILoadOptionsFunctions;

export async function listApprovedTemplates(this: TemplateContext): Promise<TemplateRecord[]> {
	const collected: TemplateRecord[] = [];
	const seen = new Set<string>();
	const limit = 100;

	for (let page = 0; page < 20; page++) {
		const response = await oneMsgRequest.call(this, 'GET', '/templates', undefined, {
			limit,
			offset: page * limit,
			sort: 'name',
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
		if (added === 0) break;
		if (pageItems.length < limit) break;
		if (Number.isFinite(total) && collected.length >= total) break;
	}

	return collected.filter(isApproved);
}
