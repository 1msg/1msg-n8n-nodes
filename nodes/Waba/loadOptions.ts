import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	ResourceMapperFields,
} from 'n8n-workflow';

import {
	findTemplate,
	packTemplateValue,
	readTemplateSpec,
	templateFields,
	templateLabel,
} from '../../utils/templates';
import { listApprovedTemplates } from './listTemplates';

function selectedTemplateKey(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object' && 'value' in value) {
		return String((value as { value?: unknown }).value || '');
	}
	return '';
}

/** Search approved templates and store their metadata in bounded dropdown values for later execution. */
export async function searchTemplates(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const templates = await listApprovedTemplates.call(this);
	const query = (filter || '').trim().toLowerCase();
	/** Filter the approved list before creating at most 300 named dropdown snapshots. */
	const results = templates
		.filter((template) => !query || templateLabel(template).toLowerCase().includes(query))
		.slice(0, 300)
		.map((template) => ({
			name: templateLabel(template),
			value: packTemplateValue(template),
		}));
	return { results };
}

/** Derive resource-mapper fields from stored components or a refreshed selection, with useful empty-state diagnostics. */
export async function getTemplateVariables(
	this: ILoadOptionsFunctions,
): Promise<ResourceMapperFields> {
	const key = selectedTemplateKey(this.getCurrentNodeParameter('template'));
	if (!key.trim()) {
		return {
			fields: [],
			emptyFieldsNotice: 'Choose a template to see its variables.',
		};
	}

	const spec = readTemplateSpec(key);
	let components = spec.components;
	if (components === null || components === undefined) {
		const templates = await listApprovedTemplates.call(this);
		try {
			components = findTemplate(templates, key).components;
		} catch (error) {
			return {
				fields: [],
				emptyFieldsNotice: error instanceof Error ? error.message : 'Template was not found.',
			};
		}
	}

	const fields = templateFields(components);
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
