export interface TemplateRecord {
	id?: string;
	name?: string;
	language?: unknown;
	category?: string;
	status?: string;
	namespace?: string;
	components?: unknown;
}

export interface TemplateField {
	id: string;
	displayName: string;
	description: string;
}

export class TemplateError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'TemplateError';
	}
}

interface ButtonRecord {
	type?: string;
	text?: string;
	url?: string;
}

interface ComponentRecord {
	type?: string;
	format?: string;
	subType?: string;
	text?: string;
	buttons?: ButtonRecord[];
	cards?: unknown[];
	card_components?: unknown[];
	components?: unknown[];
	header?: { format?: string; type?: string; subType?: string };
	body?: string;
}

function asRecord(value: unknown): ComponentRecord | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	return value as ComponentRecord;
}

function componentList(components: unknown): ComponentRecord[] {
	const parsed = normalizeComponents(components);
	if (!Array.isArray(parsed)) return [];
	return parsed.map(asRecord).filter((item): item is ComponentRecord => Boolean(item));
}

/** 1MSG sometimes returns template components as a JSON string. */
export function normalizeComponents(components: unknown): unknown {
	if (typeof components !== 'string') return components;
	const trimmed = components.trim();
	if (!trimmed) return [];
	try {
		return JSON.parse(trimmed) as unknown;
	} catch {
		return [];
	}
}

function upper(value: unknown): string {
	return String(value || '').toUpperCase();
}

export function languageCode(language: unknown): string {
	if (typeof language === 'string') return language;
	if (language && typeof language === 'object' && !Array.isArray(language)) {
		const code = (language as { code?: unknown }).code;
		if (typeof code === 'string') return code;
	}
	return '';
}

function placeholders(text: string): string[] {
	const found = text.match(/\{\{\s*([^{}]+?)\s*\}\}/g) || [];
	const keys: string[] = [];
	const seen = new Set<string>();
	for (const raw of found) {
		const inner = raw.slice(2, -2).trim();
		if (!inner || seen.has(inner)) continue;
		seen.add(inner);
		keys.push(inner);
	}
	keys.sort((left, right) => {
		const leftNumber = /^\d+$/.test(left) ? Number(left) : Number.MAX_SAFE_INTEGER;
		const rightNumber = /^\d+$/.test(right) ? Number(right) : Number.MAX_SAFE_INTEGER;
		if (leftNumber !== rightNumber) return leftNumber - rightNumber;
		return 0;
	});
	return keys;
}

function variableLabel(token: string, where: string): string {
	if (/^\d+$/.test(token)) {
		if (where === 'text') return `Variable ${token} in the text`;
		if (where === 'header') return Number(token) === 1 ? 'Variable in the header' : `Variable ${token} in the header`;
		return `Variable ${token} in the link button`;
	}
	if (where === 'text') return `Variable ${token} in the text`;
	if (where === 'header') return `Variable ${token} in the header`;
	return `Variable ${token} in the link button`;
}

function fieldId(prefix: string, token: string): string {
	const safe = token.replace(/[^A-Za-z0-9_]/g, '_');
	return `${prefix}${safe}`;
}

function mediaFormat(component: ComponentRecord): string {
	return upper(component.format || component.subType || component.header?.format || component.header?.type);
}

function isMedia(format: string): boolean {
	return format === 'IMAGE' || format === 'VIDEO' || format === 'DOCUMENT';
}

function mediaNoun(format: string): string {
	if (format === 'VIDEO') return 'video';
	if (format === 'DOCUMENT') return 'document';
	return 'image';
}

function pushTextFields(
	fields: TemplateField[],
	text: string,
	prefix: string,
	where: 'text' | 'header',
	labelPrefix: string,
): void {
	for (const token of placeholders(text)) {
		const name = variableLabel(token, where);
		fields.push({
			id: fieldId(prefix, token),
			displayName: labelPrefix ? `${labelPrefix}, ${name.charAt(0).toLowerCase()}${name.slice(1)}` : name,
			description: text,
		});
	}
}

function cardComponents(card: ComponentRecord): ComponentRecord[] {
	if (Array.isArray(card.components)) return componentList(card.components);
	return [];
}

export function templateFields(components: unknown): TemplateField[] {
	const fields: TemplateField[] = [];
	for (const component of componentList(components)) {
		const type = upper(component.type);
		if (type === 'HEADER') {
			const format = mediaFormat(component);
			if (isMedia(format)) {
				fields.push({
					id: 'header_media_url',
					displayName: 'File link',
					description: `Public URL of the ${mediaNoun(format)} in the header.`,
				});
			} else if (component.text) {
				pushTextFields(fields, component.text, 'header_', 'header', '');
			}
		}
		if (type === 'BODY' && component.text) {
			pushTextFields(fields, component.text, 'body_', 'text', '');
		}
		if (type === 'BUTTONS' && Array.isArray(component.buttons)) {
			component.buttons.forEach((button, index) => {
				if (upper(button?.type) === 'URL' && String(button?.url || '').includes('{{')) {
					const label = button.text
						? `Variable in the link button “${button.text}”`
						: 'Variable in the link button';
					fields.push({
						id: `button_url_${index}`,
						displayName: label,
						description: String(button.url || ''),
					});
				}
			});
		}
		if (type === 'CAROUSEL') {
			const cards = component.cards || component.card_components || [];
			cards.forEach((rawCard, cardIndex) => {
				const card = asRecord(rawCard);
				if (!card) return;
				const cardNumber = cardIndex + 1;
				const prefix = `card_${cardNumber}_`;
				const nested = cardComponents(card);
				const header =
					nested.find((item) => upper(item.type) === 'HEADER') || asRecord(card.header) || card;
				const format = mediaFormat(header);
				if (isMedia(format)) {
					fields.push({
						id: `${prefix}header_media_url`,
						displayName: `Card ${cardNumber} file link`,
						description: `Public URL of the ${mediaNoun(format)} on card ${cardNumber}.`,
					});
				}
				const bodyComponent = nested.find((item) => upper(item.type) === 'BODY');
				const bodyText = bodyComponent?.text || (typeof card.body === 'string' ? card.body : '');
				if (bodyText) {
					pushTextFields(fields, bodyText, `${prefix}body_`, 'text', `Card ${cardNumber}`);
				}
				const buttons = Array.isArray(card.buttons) ? card.buttons : [];
				buttons.forEach((button, buttonIndex) => {
					if (upper(button?.type).includes('URL') && String(button?.url || '').includes('{{')) {
						fields.push({
							id: `${prefix}button_url_${buttonIndex}`,
							displayName: `Card ${cardNumber}, variable in the link button`,
							description: String(button.url),
						});
					}
				});
			});
		}
	}
	return fields;
}

function requireValue(values: Record<string, string>, id: string, label: string): string {
	const value = values[id];
	if (typeof value !== 'string' || !value.trim()) {
		throw new TemplateError(`Fill in “${label}”.`);
	}
	return value.trim();
}

function textParameters(tokens: string[], values: Record<string, string>, prefix: string, labels: Map<string, string>) {
	return tokens.map((token) => {
		const id = fieldId(prefix, token);
		return {
			type: 'text',
			text: requireValue(values, id, labels.get(id) || id),
		};
	});
}

function mediaParameter(format: string, link: string): Record<string, unknown> {
	if (format === 'VIDEO') return { type: 'video', video: { link } };
	if (format === 'DOCUMENT') return { type: 'document', document: { link } };
	return { type: 'image', image: { link } };
}

function labelsById(components: unknown): Map<string, string> {
	return new Map(templateFields(components).map((field) => [field.id, field.displayName]));
}

export function buildTemplateParams(components: unknown, values: Record<string, string>): unknown[] {
	const labels = labelsById(components);
	const params: unknown[] = [];
	const list = componentList(components);

	for (const component of list) {
		const type = upper(component.type);
		if (type === 'HEADER') {
			const format = mediaFormat(component);
			if (isMedia(format)) {
				const link = requireValue(values, 'header_media_url', 'File link');
				params.push({ type: 'header', parameters: [mediaParameter(format, link)] });
			} else if (component.text) {
				const tokens = placeholders(component.text);
				if (tokens.length) {
					params.push({
						type: 'header',
						parameters: textParameters(tokens, values, 'header_', labels),
					});
				}
			}
		}
		if (type === 'BODY' && component.text) {
			const tokens = placeholders(component.text);
			if (tokens.length) {
				params.push({
					type: 'body',
					parameters: textParameters(tokens, values, 'body_', labels),
				});
			}
		}
		if (type === 'BUTTONS' && Array.isArray(component.buttons)) {
			component.buttons.forEach((button, index) => {
				if (upper(button?.type) !== 'URL' || !String(button?.url || '').includes('{{')) return;
				const id = `button_url_${index}`;
				params.push({
					type: 'button',
					sub_type: 'url',
					index,
					parameters: [{ type: 'text', text: requireValue(values, id, labels.get(id) || 'Variable in the link button') }],
				});
			});
		}
	}

	const carousel = list.find((component) => upper(component.type) === 'CAROUSEL');
	if (carousel) {
		const cards = carousel.cards || carousel.card_components || [];
		const built = cards.map((rawCard, cardIndex) => {
			const card = asRecord(rawCard) || {};
			const cardNumber = cardIndex + 1;
			const prefix = `card_${cardNumber}_`;
			const nested = cardComponents(card);
			const cardParams: unknown[] = [];
			const header = nested.find((item) => upper(item.type) === 'HEADER') || asRecord(card.header) || {};
			const format = mediaFormat(header);
			if (isMedia(format)) {
				const link = requireValue(values, `${prefix}header_media_url`, `Card ${cardNumber} file link`);
				cardParams.push({ type: 'header', parameters: [mediaParameter(format, link)] });
			}
			const bodyComponent = nested.find((item) => upper(item.type) === 'BODY');
			const bodyText = bodyComponent?.text || (typeof card.body === 'string' ? card.body : '');
			const tokens = placeholders(bodyText);
			if (tokens.length) {
				cardParams.push({
					type: 'body',
					parameters: textParameters(tokens, values, `${prefix}body_`, labels),
				});
			}
			const buttons = Array.isArray(card.buttons) ? card.buttons : [];
			buttons.forEach((button, buttonIndex) => {
				if (!upper(button?.type).includes('URL') || !String(button?.url || '').includes('{{')) return;
				const id = `${prefix}button_url_${buttonIndex}`;
				cardParams.push({
					type: 'button',
					sub_type: 'url',
					index: buttonIndex,
					parameters: [
						{
							type: 'text',
							text: requireValue(values, id, labels.get(id) || `Card ${cardNumber}, variable in the link button`),
						},
					],
				});
			});
			return { card_index: cardIndex, components: cardParams };
		});
		if (built.length) params.push({ type: 'carousel', cards: built });
	}

	return params;
}

export function templateKey(template: TemplateRecord): string {
	if (template.id) return String(template.id);
	return `${template.name || ''}|${languageCode(template.language)}`;
}

export function templateLabel(template: TemplateRecord): string {
	const name = template.name || template.id || 'template';
	const language = languageCode(template.language) || 'unknown language';
	const category = template.category ? upper(template.category) : 'TEMPLATE';
	return `${name} · ${language} · ${category}`;
}

export function isApproved(template: TemplateRecord): boolean {
	return upper(template.status) === 'APPROVED';
}

export function findTemplate(templates: TemplateRecord[], key: string): TemplateRecord {
	const trimmed = key.trim();
	if (!trimmed) {
		throw new TemplateError('Choose a template, or enter its name or ID.');
	}
	const byKey = templates.find((template) => templateKey(template) === trimmed);
	if (byKey) return byKey;
	const byId = templates.find((template) => template.id && String(template.id) === trimmed);
	if (byId) return byId;
	const byName = templates.filter(
		(template) => template.name === trimmed || `${template.name}|${languageCode(template.language)}` === trimmed,
	);
	if (byName.length === 1) return byName[0];
	if (byName.length > 1) {
		throw new TemplateError(
			`Several approved templates are named “${trimmed}”. Pick one from the list so the language is clear.`,
		);
	}
	throw new TemplateError(
		'No approved template matches this name or ID. Refresh the list, and check that Meta has approved the template.',
	);
}

export function templatesFromResponse(response: unknown): TemplateRecord[] {
	if (Array.isArray(response)) return response as TemplateRecord[];
	if (response && typeof response === 'object' && Array.isArray((response as { templates?: unknown }).templates)) {
		return (response as { templates: TemplateRecord[] }).templates;
	}
	return [];
}

const NAMESPACE_KEYS = ['namespace', 'message_template_namespace', 'messageTemplateNamespace'] as const;

export function readNamespace(template: TemplateRecord): string {
	const record = template as unknown as Record<string, unknown>;
	for (const key of NAMESPACE_KEYS) {
		const value = record[key];
		if (typeof value === 'string' && value.trim()) return value.trim();
	}
	return '';
}

/**
 * Namespace is required by 1MSG sendTemplate. It is usually on the template.
 * On some channels it is only present on other templates of the same account,
 * and then only when every listed namespace is the same.
 */
export function resolveNamespace(template: TemplateRecord, siblings: TemplateRecord[] = []): string {
	const own = readNamespace(template);
	if (own) return own;
	const found = new Set<string>();
	for (const sibling of siblings) {
		const namespace = readNamespace(sibling);
		if (namespace) found.add(namespace);
	}
	if (found.size === 1) return [...found][0];
	return '';
}

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
		throw new TemplateError('The selected template has no name. Refresh the list and choose it again.');
	}
	if (!code) {
		throw new TemplateError(`Template “${name}” has no language. Refresh the list and choose it again.`);
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
