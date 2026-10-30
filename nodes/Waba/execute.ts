import type { IDataObject, IExecuteFunctions, IHttpRequestMethods } from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

import { listApprovedTemplates } from './listTemplates';
import { oneMsgRequest } from '../transport';
import { channelRequestUrl } from '../../utils/api-path';
import { resolveBaseUrl, resolveInstanceId, stripAuthPrefix } from '../../utils/channel';
import { assertSendSucceeded } from '../../utils/errors';
import { recipientBody } from '../../utils/recipient';
import {
	buildTemplateParams,
	findTemplate,
	readTemplateSpec,
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

function bodyParamsFromValues(raw: string): unknown[] | string {
	const trimmed = raw.trim();
	if (!trimmed || trimmed === '[]') return [];
	let values: string[];
	if (trimmed.startsWith('[')) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(trimmed) as unknown;
		} catch {
			return 'Variable values must be a list of text values, in the same order as the template placeholders.';
		}
		if (!Array.isArray(parsed)) {
			return 'Variable values must be a list of text values, in the same order as the template placeholders.';
		}
		values = parsed.map((item) => String(item ?? '').trim()).filter(Boolean);
	} else {
		values = trimmed.split(',').map((item) => item.trim()).filter(Boolean);
	}
	if (!values.length) return [];
	return [{ type: 'body', parameters: values.map((text) => ({ type: 'text', text })) }];
}

async function sendTemplate(
	this: IExecuteFunctions,
	itemIndex: number,
	templates: TemplateRecord[] | undefined,
): Promise<unknown> {
	const selected = this.getNodeParameter('template', itemIndex) as { value?: string };
	const key = String(selected?.value || '');
	const spec = readTemplateSpec(key);
	const fillMode = this.getNodeParameter('fillMode', itemIndex, 'form') as string;
	const mapped =
		fillMode === 'form' ? mappingValues(this.getNodeParameter('variables', itemIndex, {})) : {};
	const variableText =
		fillMode === 'form' ? String(this.getNodeParameter('bodyVariables', itemIndex, '') || '') : '';
	const selfContained = Boolean(
		spec.name &&
			spec.language &&
			spec.namespace &&
			(spec.components != null || fillMode === 'custom' || variableText.trim()),
	);
	const template = selfContained ? findTemplate([], key) : findTemplate(templates || [], key);
	const siblings = selfContained ? [] : templates || [];
	const recipient = recipientBody(this.getNodeParameter('templateRecipient', itemIndex) as string);
	let params: unknown[] = [];
	if (fillMode === 'custom') {
		params = jsonArray(this.getNodeParameter('customParams', itemIndex), 'Parameters');
	} else if (Object.keys(mapped).length && template.components != null) {
		params = buildTemplateParams(template.components, mapped);
	} else if (variableText.trim()) {
		const parsed = bodyParamsFromValues(variableText);
		if (typeof parsed === 'string') throw new NodeOperationError(this.getNode(), parsed);
		params = parsed;
	} else if (template.components != null) {
		params = buildTemplateParams(template.components, mapped);
	}

	const payload: IDataObject = {
		...templateSendIdentity(template, siblings),
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
	const baseUrl = resolveBaseUrl(String(credentials.environment || ''), String(credentials.baseUrl || ''));
	const instanceId = resolveInstanceId(apiKey, String(credentials.channelId || ''));
	// Validate the path before the request so a foreign URL never receives the key.
	channelRequestUrl(baseUrl, instanceId, path);

	return await oneMsgRequest.call(
		this,
		method,
		path,
		body,
		Object.keys(query).length ? query : undefined,
		'api',
	);
}

export function bindWabaExecute(): (this: IExecuteFunctions, itemIndex: number) => Promise<unknown> {
	let approved: TemplateRecord[] | undefined;
	return async function executeOne(this: IExecuteFunctions, itemIndex: number): Promise<unknown> {
		const operation = this.getNodeParameter('operation', itemIndex) as string;
		if (operation === 'sendMessage') return await sendMessage.call(this, itemIndex);
		if (operation === 'sendTemplate') {
			const selected = this.getNodeParameter('template', itemIndex) as { value?: string };
			const spec = readTemplateSpec(String(selected?.value || ''));
			const fillMode = this.getNodeParameter('fillMode', itemIndex, 'form') as string;
			const variableText =
				fillMode === 'form' ? String(this.getNodeParameter('bodyVariables', itemIndex, '') || '') : '';
			const selfContained = Boolean(
				spec.name &&
					spec.language &&
					spec.namespace &&
					(spec.components != null || fillMode === 'custom' || variableText.trim()),
			);
			if (!selfContained && !approved) approved = await listApprovedTemplates.call(this);
			return await sendTemplate.call(this, itemIndex, selfContained ? undefined : approved);
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
