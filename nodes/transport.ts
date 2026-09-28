import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	ILoadOptionsFunctions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { channelRequestUrl } from '../utils/api-path';
import { normalizeBaseUrl, resolveInstanceId, stripAuthPrefix } from '../utils/channel';
import { extractMessage, humanizeMessage, messageFromFailure } from '../utils/errors';

type OneMsgContext = IExecuteFunctions | ILoadOptionsFunctions | IHookFunctions;

export async function oneMsgRequest(
	this: OneMsgContext,
	method: IHttpRequestMethods,
	path: string,
	body?: IDataObject | unknown[] | undefined,
	qs?: IDataObject,
): Promise<unknown> {
	const credentials = await this.getCredentials('oneMsgApi');
	const apiKey = stripAuthPrefix(String(credentials.apiKey || ''));
	if (!apiKey) {
		throw new NodeOperationError(
			this.getNode(),
			'Add a 1MSG credential and paste the channel API key.',
		);
	}

	let url = '';
	try {
		const baseUrl = normalizeBaseUrl(String(credentials.baseUrl || ''));
		const instanceId = resolveInstanceId(apiKey, String(credentials.channelId || ''));
		url = channelRequestUrl(baseUrl, instanceId, path);
	} catch (error) {
		throw new NodeOperationError(this.getNode(), error instanceof Error ? error : new Error(String(error)));
	}

	let full: unknown;
	try {
		full = await this.helpers.httpRequestWithAuthentication.call(this, 'oneMsgApi', {
			method,
			url,
			body: body === undefined ? undefined : body,
			qs,
			json: true,
			returnFullResponse: true,
			ignoreHttpStatusErrors: true,
			timeout: 30000,
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		});
	} catch (error) {
		throw new NodeOperationError(this.getNode(), messageFromFailure(error));
	}

	const unwrapped = unwrapResponse(full);
	if (unwrapped.statusCode !== undefined && unwrapped.statusCode >= 400) {
		throw new NodeOperationError(
			this.getNode(),
			humanizeMessage(extractMessage(unwrapped.body), unwrapped.statusCode),
		);
	}
	return unwrapped.body;
}

function unwrapResponse(full: unknown): { statusCode?: number; body: unknown } {
	if (!full || typeof full !== 'object' || !('statusCode' in full) || !('body' in full) || !('headers' in full)) {
		return { body: full };
	}
	const record = full as { statusCode?: unknown; body?: unknown };
	const statusCode = Number(record.statusCode);
	return {
		statusCode: Number.isFinite(statusCode) ? statusCode : undefined,
		body: record.body,
	};
}
