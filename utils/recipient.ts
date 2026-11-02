const PHONE_MIN = 6;
const PHONE_MAX = 15;
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

/**
 * One recipient field. Phone, then a BSUID such as US.13491208655302741918, then a username.
 * A value like john.doe is a username. Usernames may also start with @.
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

	const phoneDigits = value.replace(/[\s()\-+.]/g, '');
	if (/^\d+$/.test(phoneDigits)) {
		if (phoneDigits.length < PHONE_MIN || phoneDigits.length > PHONE_MAX) {
			throw new RecipientError(
				'This looks like a phone number, but it needs a country code and 6 to 15 digits. Example: +1 415 555 2671.',
			);
		}
		return { phone: phoneDigits };
	}

	if (/^[A-Za-z]{2}\.\d{8,}$/.test(value)) return { bsuid: value };

	if (USERNAME_RE.test(value)) return { username: value };

	throw new RecipientError(
		'Could not tell if this recipient is a phone, BSUID, or username. Use a phone with country code, a BSUID such as US.13491208655302741918, or a username such as @john.doe.',
	);
}
