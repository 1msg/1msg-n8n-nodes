const MAX_WEBHOOKS = 5;

export class WebhookListError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'WebhookListError';
	}
}

export function normalizeWebhookUrl(url: string): string {
	return url.trim().replace(/\/$/, '');
}

export function sameWebhookUrl(left: string, right: string): boolean {
	return normalizeWebhookUrl(left) === normalizeWebhookUrl(right);
}

/** GET /webhook returns one URL, an array, or a legacy comma-separated string. */
export function webhookUrls(value: unknown): string[] {
	if (!value) return [];
	if (Array.isArray(value)) {
		return value.map((item) => String(item).trim()).filter(Boolean);
	}
	if (typeof value === 'string') {
		return value
			.split(',')
			.map((item) => item.trim())
			.filter(Boolean);
	}
	return [];
}

export function addWebhookUrl(current: unknown, url: string): { urls: string[]; added: boolean } {
	const urls = webhookUrls(current);
	if (urls.some((item) => sameWebhookUrl(item, url))) {
		return { urls, added: false };
	}
	if (urls.length >= MAX_WEBHOOKS) {
		throw new WebhookListError(
			`This channel already has ${MAX_WEBHOOKS} webhook addresses, which is the maximum. Remove one in 1MSG channel settings, then activate the workflow again. You can also copy this n8n URL into the channel yourself: ${url}`,
		);
	}
	return { urls: [...urls, url], added: true };
}

export function removeWebhookUrl(current: unknown, url: string): string[] {
	return webhookUrls(current).filter((item) => !sameWebhookUrl(item, url));
}

export function webhookWriteBody(urls: string[]): { webhookUrl: string | string[] } | undefined {
	if (urls.length === 0) return undefined;
	if (urls.length === 1) return { webhookUrl: urls[0] };
	return { webhookUrl: urls };
}
