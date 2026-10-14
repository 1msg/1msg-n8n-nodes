export class ChannelKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChannelKeyError';
	}
}

export function stripAuthPrefix(raw: string): string {
	return raw.replace(/^(Bearer|Basic)\s+/i, '').trim();
}

/** Decode the JWT payload locally to infer channel metadata; malformed or non-object payloads return null without authentication claims. */
export function decodeJwtPayload(token: string): Record<string, unknown> | null {
	const stripped = stripAuthPrefix(token);
	const parts = stripped.split('.');
	if (parts.length !== 3 || parts[1] === undefined) return null;
	try {
		const padded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
		const json = Buffer.from(padded, 'base64').toString('utf8');
		const payload = JSON.parse(json) as unknown;
		if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
		return payload as Record<string, unknown>;
	} catch {
		return null;
	}
}

export function normalizeInstanceId(instanceId: string): string {
	const trimmed = instanceId.trim();
	return trimmed.startsWith('instance') ? trimmed.slice('instance'.length) : trimmed;
}

/**
 * Channel API keys are JWTs that already contain the channel id.
 * An older plain key needs Channel ID filled in on the credential.
 */
export function resolveInstanceId(apiKey: string, channelId?: string): string {
	const explicit = normalizeInstanceId(channelId || '');
	if (explicit) return explicit;

	const payload = decodeJwtPayload(apiKey);
	const raw = payload?.instanceId;
	if (typeof raw === 'string' && raw.trim()) {
		const id = normalizeInstanceId(raw);
		if (id) return id;
	}

	throw new ChannelKeyError(
		'This API key is not tied to a channel. Paste the channel API key from 1MSG channel settings, or fill in Channel ID. A sandbox channel needs Channel ID, and API URL set to Sandbox.',
	);
}

export function normalizeBaseUrl(baseUrl: string): string {
	const value = (baseUrl || 'https://api.1msg.io').trim().replace(/\/$/, '');
	if (!/^https?:\/\//i.test(value)) {
		throw new ChannelKeyError(
			'API URL must start with https://. Production is https://api.1msg.io. Sandbox is https://sandbox.1msg.io.',
		);
	}
	return value;
}

/**
 * Production and Custom use the host stored on the credential.
 * A credential saved before the API URL field existed has no environment, so its Base URL is kept.
 */
export function resolveBaseUrl(
	environment: string | undefined,
	baseUrl: string | undefined,
): string {
	const env = (environment || '').trim().toLowerCase();
	if (env === 'sandbox') return 'https://sandbox.1msg.io';
	if (env === 'custom') return normalizeBaseUrl(baseUrl || '');
	if (env === 'production') return 'https://api.1msg.io';
	return normalizeBaseUrl(baseUrl || '');
}

export function isSandboxHost(value: string): boolean {
	const raw = value.trim();
	if (!raw) return false;
	try {
		const host = new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase();
		return host === 'sandbox.1msg.io' || (host.startsWith('sandbox.') && host.endsWith('.1msg.io'));
	} catch {
		return false;
	}
}

/** Sandbox accepts the channel key as ?token=, not as a Bearer header. */
export function sandboxQuery(baseUrl: string, apiKey: string): Record<string, string> {
	const key = stripAuthPrefix(apiKey);
	if (!key || !isSandboxHost(baseUrl)) return {};
	return { token: key };
}
