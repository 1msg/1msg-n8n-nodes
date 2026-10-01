import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	ResourceMapperFields,
} from 'n8n-workflow';

import { listApprovedTemplates } from './listTemplates';
import {
	findTemplate,
	templateFields,
	templateKey,
	templateLabel,
} from '../../utils/templates';

function selectedTemplateKey(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && 'value' in value) {
		return String((value as { value?: unknown }).value || '');
	}
	return '';
}

export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const templates = await listApprovedTemplates.call(this);
	const query = (filter || '').trim().toLowerCase();
	const results = templates
		.filter((template) => !query || templateLabel(template).toLowerCase().includes(query))
		.slice(0, 200)
		.map((template) => ({
			name: templateLabel(template),
			value: templateKey(template),
		}));
	return { results };
}

export async function getTemplateVariables(this: ILoadOptionsFunctions): Promise<ResourceMapperFields> {
	const key = selectedTemplateKey(this.getCurrentNodeParameter('template'));
	if (!key.trim()) {
		return {
			fields: [],
			emptyFieldsNotice: 'Choose a template to see its variables.',
		};
	}

	const templates = await listApprovedTemplates.call(this);
	let template;
	try {
		template = findTemplate(templates, key);
	} catch (error) {
		return {
			fields: [],
			emptyFieldsNotice: error instanceof Error ? error.message : 'Template was not found.',
		};
	}

	const fields = templateFields(template.components);
	if (!fields.length) {
		return {
			fields: [],
			emptyFieldsNotice: 'This template has no variables. You can send it as it is.',
		};
	}

	return {
		fields: fields.map((field) => ({
			id: field.id,
			displayName: field.displayName,
			description: field.description,
			required: field.required !== false,
			defaultMatch: false,
			display: true,
			type: 'string' as const,
			canBeUsedToMatch: false,
		})),
	};
}
