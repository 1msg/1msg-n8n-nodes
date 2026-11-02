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
		'This API key is not tied to a channel. Paste the channel API key from 1MSG channel settings, or fill in Channel ID. A sandbox channel needs Channel ID, and Environment set to Sandbox.',
	);
}

/** Resolve the selected or previously saved public API origin; custom and staging hosts cannot receive connection credentials. */
export function resolveBaseUrl(environment: string | undefined, baseUrl?: string): string {
	const env = (environment || '').trim().toLowerCase();
	if (env === 'sandbox') return 'https://sandbox.1msg.io';
	if (env === 'production') return 'https://api.1msg.io';
	if (!env) {
		const saved = (baseUrl || '').trim().replace(/\/$/, '');
		if (!saved || saved === 'https://api.1msg.io') return 'https://api.1msg.io';
		if (saved === 'https://sandbox.1msg.io') return 'https://sandbox.1msg.io';
	}
	throw new ChannelKeyError(
		'Choose Production (https://api.1msg.io) or Sandbox (https://sandbox.1msg.io). Other hosts are not allowed.',
	);
}

/** Recognize first-party sandbox hosts; malformed or unrelated URLs never receive sandbox query credentials. */
function isSandboxHost(value: string): boolean {
	const raw = value.trim();
	if (!raw) return false;
	try {
		return (
			new URL(raw.includes('://') ? raw : `https://${raw}`).hostname.toLowerCase() ===
			'sandbox.1msg.io'
		);
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

/** Resolve one credential snapshot consistently for authentication and custom-request URL validation; invalid channels or URL schemes fail before I/O. */
export function resolveChannelCredentials(credentials: Record<string, unknown>): {
	apiKey: string;
	baseUrl: string;
	instanceId: string;
} {
	const apiKey = stripAuthPrefix(String(credentials.apiKey || ''));
	const baseUrl = resolveBaseUrl(
		String(credentials.environment || ''),
		String(credentials.baseUrl || ''),
	);
	return {
		apiKey,
		baseUrl,
		instanceId: resolveInstanceId(apiKey, String(credentials.channelId || '')),
	};
}
