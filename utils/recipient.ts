const PHONE_MIN = 6;
const PHONE_MAX = 15;
const BSUID_RE = /^[A-Za-z0-9_-]{2,16}\.[A-Za-z0-9._:-]+$/;
const USERNAME_RE = /^[A-Za-z0-9._-]{1,128}$/;
const CHAT_SUFFIXES = ['@c.us', '@lid', '@username', '@g.us', '@broadcast'];

export type RecipientBody = {
	phone?: string;
	bsuid?: string;
	username?: string;
	chatId?: string;
};

export class RecipientError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'RecipientError';
	}
}

function normalizeBsuid(value: string): string | null {
	const normalized = value.endsWith('@lid') ? value.slice(0, -4) : value;
	if (!BSUID_RE.test(normalized)) return null;
	return normalized;
}

/**
 * One recipient field. Phone, BSUID, username, or a chat id from a webhook.
 * Same detection order as the 1MSG API: BSUID, then phone, then username.
 */
export function recipientBody(raw: string): RecipientBody {
	const value = String(raw ?? '').trim();
	if (!value) {
		throw new RecipientError('Enter a recipient: a phone number, BSUID, or username.');
	}

	const lower = value.toLowerCase();
	if (CHAT_SUFFIXES.some((suffix) => lower.endsWith(suffix))) {
		return { chatId: value };
	}

	if (value.startsWith('@')) {
		const username = value.slice(1);
		if (username && USERNAME_RE.test(username)) return { username };
	}

	if (value.includes('@')) {
		throw new RecipientError(
			'This chat ID is not recognized. Use phone@c.us, a BSUID ending in @lid, username@username, or a group id ending in @g.us.',
		);
	}

	const bsuid = normalizeBsuid(value);
	if (bsuid) return { bsuid };

	const phoneDigits = value.replace(/[\s()\-+.]/g, '');
	if (/^\d+$/.test(phoneDigits)) {
		if (phoneDigits.length < PHONE_MIN || phoneDigits.length > PHONE_MAX) {
			throw new RecipientError(
				'This looks like a phone number, but it needs a country code and 6 to 15 digits. Example: +1 415 555 2671.',
			);
		}
		return { phone: phoneDigits };
	}

	const username = value.startsWith('@') ? value.slice(1) : value;
	if (username && USERNAME_RE.test(username)) {
		return { username };
	}

	throw new RecipientError(
		'Could not tell if this recipient is a phone, BSUID, or username. Use a phone with country code, a BSUID such as AB.123, or a username.',
	);
}
