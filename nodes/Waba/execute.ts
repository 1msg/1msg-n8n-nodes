import type { IDataObject, IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';

import { listApprovedTemplates } from './listTemplates';
import { oneMsgRequest } from '../transport';
import { channelRequestUrl } from '../../utils/api-path';
import { normalizeBaseUrl, resolveInstanceId, stripAuthPrefix } from '../../utils/channel';
import { assertSendSucceeded } from '../../utils/errors';
import { recipientBody } from '../../utils/recipient';
import {
	buildTemplateParams,
	findTemplate,
	templateSendIdentity,
	type TemplateRecord,
} from '../../utils/templates';

function jsonValue(value: unknown, label: string): unknown {
	if (typeof value !== 'string') return value;
	const trimmed = value.trim();
	if (!trimmed) return undefined;
	let parsed: unknown;
	let invalid = false;
	try {
		parsed = JSON.parse(trimmed) as unknown;
	} catch {
		invalid = true;
	}
	if (invalid) {
		throw new Error(`${label} is not valid JSON.`);
	}
	return parsed;
}

function jsonObject(value: unknown, label: string): IDataObject {
	const parsed = jsonValue(value, label);
	if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON object.`);
	}
	return parsed as IDataObject;
}

function jsonArray(value: unknown, label: string): unknown[] {
	const parsed = jsonValue(value, label);
	if (!Array.isArray(parsed)) {
		throw new Error(`${label} must be a JSON array of template components.`);
	}
	return parsed;
}

function mappingValues(raw: unknown): Record<string, string> {
	const value =
		raw && typeof raw === 'object' && !Array.isArray(raw) && 'value' in raw
			? (raw as { value?: unknown }).value
			: raw;
	if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
	const result: Record<string, string> = {};
	for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
		if (item === undefined || item === null) continue;
		result[key] = String(item);
	}
	return result;
}

async function sendMessage(this: IExecuteFunctions, itemIndex: number): Promise<unknown> {
	const fillMode = this.getNodeParameter('fillMode', itemIndex) as string;
	if (fillMode === 'custom') {
		const body = jsonObject(this.getNodeParameter('customBody', itemIndex), 'Request body');
		const response = await oneMsgRequest.call(this, 'POST', '/sendMessage', body);
		assertSendSucceeded(response);
		return response;
	}

	const recipient = recipientBody(this.getNodeParameter('recipient', itemIndex) as string);
	const text = String(this.getNodeParameter('body', itemIndex) as string);
	if (!text.trim()) {
		throw new Error('Enter the message text.');
	}
	const response = await oneMsgRequest.call(this, 'POST', '/sendMessage', {
		...recipient,
		body: text,
	});
	assertSendSucceeded(response);
	return response;
}

async function sendTemplate(
	this: IExecuteFunctions,
	itemIndex: number,
	templates: TemplateRecord[],
): Promise<unknown> {
	const selected = this.getNodeParameter('template', itemIndex) as { value?: string };
	const template = findTemplate(templates, String(selected?.value || ''));
	const recipient = recipientBody(this.getNodeParameter('recipient', itemIndex) as string);
	const fillMode = this.getNodeParameter('fillMode', itemIndex) as string;
	const params =
		fillMode === 'custom'
			? jsonArray(this.getNodeParameter('customParams', itemIndex), 'Parameters')
			: buildTemplateParams(
					template.components,
					mappingValues(this.getNodeParameter('variables', itemIndex, {})),
				);

	const payload: IDataObject = {
		...templateSendIdentity(template),
		...recipient,
	};
	if (params.length) payload.params = params;
	const response = await oneMsgRequest.call(this, 'POST', '/sendTemplate', payload);
	assertSendSucceeded(response);
	return response;
}

async function apiCall(this: IExecuteFunctions, itemIndex: number): Promise<unknown> {
	const method = this.getNodeParameter('method', itemIndex) as IHttpRequestMethods;
	const path = this.getNodeParameter('path', itemIndex) as string;
	const query = jsonObject(this.getNodeParameter('query', itemIndex, {}), 'Query parameters');
	let body: IDataObject | unknown[] | undefined;
	if (method !== 'GET') {
		const parsed = jsonValue(this.getNodeParameter('requestBody', itemIndex, {}), 'Request body');
		if (Array.isArray(parsed)) {
			body = parsed.length ? parsed : undefined;
		} else if (parsed && typeof parsed === 'object') {
			body = Object.keys(parsed as IDataObject).length ? (parsed as IDataObject) : undefined;
		} else if (parsed !== undefined) {
			throw new Error('Request body must be a JSON object or array.');
		}
	}

	const credentials = await this.getCredentials('oneMsgApi');
	const apiKey = stripAuthPrefix(String(credentials.apiKey || ''));
	const baseUrl = normalizeBaseUrl(String(credentials.baseUrl || ''));
	const instanceId = resolveInstanceId(apiKey, String(credentials.channelId || ''));
	// Validate the path before the request so a foreign URL never receives the key.
	channelRequestUrl(baseUrl, instanceId, path);

	return await oneMsgRequest.call(
		this,
		method,
		path,
		body,
		Object.keys(query).length ? query : undefined,
	);
}

export function bindWabaExecute(): (this: IExecuteFunctions, itemIndex: number) => Promise<unknown> {
	let approved: TemplateRecord[] | undefined;
	return async function executeOne(this: IExecuteFunctions, itemIndex: number): Promise<unknown> {
		const operation = this.getNodeParameter('operation', itemIndex) as string;
		if (operation === 'sendMessage') return await sendMessage.call(this, itemIndex);
		if (operation === 'sendTemplate') {
			if (!approved) approved = await listApprovedTemplates.call(this);
			return await sendTemplate.call(this, itemIndex, approved);
		}
		if (operation === 'apiCall') return await apiCall.call(this, itemIndex);
		throw new Error(`Unknown action “${operation}”.`);
	};
}

export function toItemJson(response: unknown): IDataObject {
	if (response && typeof response === 'object' && !Array.isArray(response)) {
		return response as IDataObject;
	}
	return { data: response as IDataObject['data'] };
}
