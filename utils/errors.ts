export function extractMessage(body: unknown): string {
	if (!body) return '';
	if (typeof body === 'string') return body.trim();
	if (typeof body !== 'object') return '';
	const record = body as Record<string, unknown>;
	if (typeof record.message === 'string' && record.message.trim()) return record.message.trim();
	if (typeof record.error === 'string' && record.error.trim()) return record.error.trim();
	if (record.error && typeof record.error === 'object' && !Array.isArray(record.error)) {
		const error = record.error as Record<string, unknown>;
		const title = typeof error.error_user_title === 'string' ? error.error_user_title.trim() : '';
		const detail = typeof error.error_user_msg === 'string' ? error.error_user_msg.trim() : '';
		if (title && detail) return `${title}: ${detail}`;
		if (detail) return detail;
		if (title) return title;
		if (typeof error.message === 'string' && error.message.trim()) return error.message.trim();
	}
	return '';
}

/** Explain provider failures with their HTTP status and action-specific guidance while preserving unknown diagnostic text. */
export function humanizeMessage(message: string, statusCode?: number, scope?: string): string {
	const explanation = explainFailure(message.trim(), statusCode, scope);
	return statusCode ? `[${statusCode}] ${explanation}` : explanation;
}

/** Classify provider failures in precedence order while retaining unknown diagnostic text. */
function explainFailure(text: string, statusCode?: number, scope?: string): string {
	const lower = text.toLowerCase();
	if (statusCode === 401 || lower.includes('invalid token') || lower === 'unauthorized') {
		return 'The API key was rejected. Open the 1MSG credential and paste the channel API key again.';
	}
	if (statusCode === 403) {
		return text
			? `This API key cannot access that channel. (${text})`
			: 'This API key cannot access that channel.';
	}
	if (statusCode === 429 || lower.includes('too many request') || lower.includes('rate limit')) {
		return '1MSG is limiting requests for this channel. Wait a moment, then run the step again.';
	}
	if (isClosedWindow(lower)) {
		const detail = text ? ` (${text})` : '';
		return `WhatsApp did not accept this free-form message because the 24-hour conversation window is closed. Use Send a template, or wait until this person writes to you again.${detail}`;
	}
	const specific = routingExplanation(lower, text) || templateExplanation(lower, text);
	if (specific) return specific;
	if (statusCode === 404) return missingResource(text, scope);
	if (text) return text;
	if (statusCode && statusCode >= 500)
		return '1MSG could not complete the request. Try again in a moment.';
	if (statusCode) return '1MSG rejected the request.';
	return '1MSG returned an error.';
}

/** Recognize provider responses that prohibit free-form sends outside the conversation window. */
function isClosedWindow(message: string): boolean {
	for (const fragment of [
		'outside the allowed window',
		'dialog window is closed',
		're-engagement',
		'131047',
	]) {
		if (message.includes(fragment)) return true;
	}
	return false;
}

/** Explain recipient routing failures while retaining the provider's diagnostic details. */
function routingExplanation(lower: string, text: string): string {
	if (lower.includes('username is not found') || lower.includes('not linked with bsuid')) {
		return `This username is not linked to a WhatsApp user on this channel yet. Use the phone number or BSUID from an incoming message. (${text})`;
	}
	if (lower.includes('bsuid routing is disabled')) {
		return `Sending by BSUID is turned off for this channel. Use a phone number, or ask 1MSG to enable BSUID routing. (${text})`;
	}
	if (lower.includes('username routing is disabled')) {
		return `Sending by username is turned off for this channel. Use a phone number or BSUID. (${text})`;
	}
	return '';
}

/** Explain missing template metadata and templates unavailable on the selected channel. */
function templateExplanation(lower: string, text: string): string {
	if (lower.includes('template is not defined')) {
		return '1MSG did not send the template because its name, language, or namespace is missing. Refresh the template list and choose the template again.';
	}
	if (
		lower.includes('template') &&
		(lower.includes('not found') || lower.includes('does not exist'))
	) {
		return `That template is not available on this channel. Pick an approved template from the list. (${text})`;
	}
	return '';
}

/** Distinguish a missing custom API method from a missing recipient, channel, or template. */
function missingResource(text: string, scope?: string): string {
	if (scope === 'api') {
		return text
			? `1MSG could not find that method. Check the path. (${text})`
			: '1MSG could not find that method. Check the path, for example templates or sendMessage.';
	}
	return text
		? `1MSG could not find that. (${text})`
		: '1MSG could not find that. Check the channel, the recipient, or the template.';
}

function textFromUnknown(value: unknown): string {
	if (typeof value !== 'string') return extractMessage(value);
	const trimmed = value.trim();
	const jsonAt = trimmed.indexOf('{');
	if (jsonAt >= 0) {
		try {
			const extracted = extractMessage(JSON.parse(trimmed.slice(jsonAt)) as unknown);
			if (extracted) return extracted;
		} catch {
			// The text is not JSON. Fall through to the raw message.
		}
	}
	return trimmed.replace(/^\d{3}\s*-\s*/, '');
}

export function messageFromFailure(error: unknown): string {
	if (!error || typeof error !== 'object') {
		return humanizeMessage(error instanceof Error ? error.message : textFromUnknown(error));
	}
	const record = error as {
		message?: unknown;
		statusCode?: unknown;
		httpCode?: unknown;
		status?: unknown;
		error?: unknown;
		body?: unknown;
		response?: { body?: unknown; statusCode?: unknown };
		cause?: { response?: { body?: unknown }; statusCode?: unknown; message?: unknown };
	};
	const body = record.response?.body ?? record.cause?.response?.body ?? record.body ?? record.error;
	const extracted =
		extractMessage(body) ||
		textFromUnknown(record.message) ||
		textFromUnknown(record.cause?.message);
	const status = Number(
		record.statusCode ||
			record.httpCode ||
			record.status ||
			record.response?.statusCode ||
			record.cause?.statusCode,
	);
	return humanizeMessage(extracted, Number.isFinite(status) && status > 0 ? status : undefined);
}

/** 1MSG often answers HTTP 200 with sent:false and a plain message. */
export function assertSendSucceeded(response: unknown): void {
	if (!response || typeof response !== 'object' || Array.isArray(response)) return;
	const body = response as Record<string, unknown>;
	if (body.sent === false || body.sent === 'false') {
		throw new Error(humanizeMessage(extractMessage(body) || 'The message was not sent.'));
	}
}
