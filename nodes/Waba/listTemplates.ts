import type { IExecuteFunctions, ILoadOptionsFunctions } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { oneMsgRequest } from '../transport';
import { extractMessage, humanizeMessage } from '../../utils/errors';
import {
	isApproved,
	templatesFromResponse,
	type TemplateRecord,
} from '../../utils/templates';

type TemplateContext = IExecuteFunctions | ILoadOptionsFunctions;

export async function listApprovedTemplates(this: TemplateContext): Promise<TemplateRecord[]> {
	const collected: TemplateRecord[] = [];
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
		collected.push(...pageItems);
		const total =
			response && typeof response === 'object'
				? Number((response as { total?: unknown }).total)
				: Number.NaN;
		if (pageItems.length < limit) break;
		if (Number.isFinite(total) && collected.length >= total) break;
	}

	return collected.filter(isApproved);
}
