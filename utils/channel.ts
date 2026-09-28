export class ChannelKeyError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'ChannelKeyError';
	}
}

export function stripAuthPrefix(raw: string): string {
	return raw.replace(/^(Bearer|Basic)\s+/i, '').trim();
}

export function decodeJwtPayload(token: string): Record<string, unknown> | null {
	const stripped = stripAuthPrefix(token);
	const parts = stripped.split('.');
	if (parts.length !== 3) return null;
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
		'This API key is not tied to a channel. Paste the channel API key from 1MSG channel settings. If you have an older key, also fill in Channel ID.',
	);
}

export function normalizeBaseUrl(baseUrl: string): string {
	const value = (baseUrl || 'https://api.1msg.io').trim().replace(/\/$/, '');
	if (!/^https?:\/\//i.test(value)) {
		throw new ChannelKeyError('Base URL must start with https://. The usual value is https://api.1msg.io.');
	}
	return value;
}
