export interface ButtonRecord {
	type?: string;
	text?: string;
	url?: string;
}

export interface ComponentRecord {
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
	limited_time_offer?: { has_expiration?: boolean; text?: string };
}

/** Accept object-shaped template components while rejecting arrays, primitives and absent values. */
export function asRecord(value: unknown): ComponentRecord | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	return value as ComponentRecord;
}

/** Normalize optional discriminator values before comparing template component kinds. */
export function upper(value: unknown): string {
	return String(value || '').toUpperCase();
}

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
	required?: boolean;
}

export class TemplateError extends Error {
	/** Preserve a distinct validation error type for node-facing template diagnostics. */
	constructor(message: string) {
		super(message);
		this.name = 'TemplateError';
	}
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

/** Read the language code from either its string form or the API object representation. */
export function languageCode(language: unknown): string {
	if (typeof language === 'string') return language;
	if (language && typeof language === 'object' && !Array.isArray(language)) {
		const code = (language as { code?: unknown }).code;
		if (typeof code === 'string') return code;
	}
	return '';
}
