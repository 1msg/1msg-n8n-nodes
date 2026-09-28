export type WabaEventKind = 'incoming' | 'outgoing' | 'status';

export interface WabaEvent {
	kind: WabaEventKind;
	json: Record<string, unknown>;
}

const SELECTED_KIND: Record<string, WabaEventKind> = {
	incomingMessages: 'incoming',
	outgoingMessages: 'outgoing',
	deliveryStatus: 'status',
};

function isFromMe(value: unknown): boolean {
	return value === true || value === 1 || value === '1' || value === 'true';
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
	return value as Record<string, unknown>;
}

function messageEvent(message: Record<string, unknown>, instanceId: unknown): WabaEvent {
	const outgoing = isFromMe(message.fromMe);
	return {
		kind: outgoing ? 'outgoing' : 'incoming',
		json: {
			event: outgoing ? 'outgoing' : 'incoming',
			instanceId: instanceId ?? null,
			id: message.id ?? null,
			chatId: message.chatId ?? null,
			fromMe: outgoing,
			type: message.type ?? null,
			body: message.body ?? null,
			message,
		},
	};
}

function statusEvent(ack: Record<string, unknown>, instanceId: unknown): WabaEvent {
	return {
		kind: 'status',
		json: {
			event: 'status',
			instanceId: instanceId ?? null,
			id: ack.id ?? null,
			chatId: ack.chatId ?? null,
			status: ack.status ?? null,
			ack,
		},
	};
}

function rawMetaEvents(root: Record<string, unknown>): WabaEvent[] {
	const events: WabaEvent[] = [];
	const entries = Array.isArray(root.entry) ? root.entry : [];
	for (const entry of entries) {
		const entryRecord = asRecord(entry);
		if (!entryRecord) continue;
		const changes = Array.isArray(entryRecord.changes) ? entryRecord.changes : [];
		for (const change of changes) {
			const value = asRecord(asRecord(change)?.value);
			if (!value) continue;
			const messages = Array.isArray(value.messages) ? value.messages : [];
			for (const message of messages) {
				const record = asRecord(message);
				if (record) events.push(messageEvent({ ...record, fromMe: false }, root.instanceId));
			}
			const echoes = Array.isArray(value.message_echoes) ? value.message_echoes : [];
			for (const echo of echoes) {
				const record = asRecord(echo);
				if (record) events.push(messageEvent({ ...record, fromMe: true }, root.instanceId));
			}
			const statuses = Array.isArray(value.statuses) ? value.statuses : [];
			for (const status of statuses) {
				const record = asRecord(status);
				if (record) events.push(statusEvent(record, root.instanceId));
			}
		}
	}
	return events;
}

export function extractEvents(body: unknown): WabaEvent[] {
	const root = asRecord(body);
	if (!root) return [];

	const events: WabaEvent[] = [];
	const messages = Array.isArray(root.messages) ? root.messages : [];
	for (const message of messages) {
		const record = asRecord(message);
		if (record) events.push(messageEvent(record, root.instanceId));
	}
	const acks = Array.isArray(root.ack) ? root.ack : [];
	for (const ack of acks) {
		const record = asRecord(ack);
		if (record) events.push(statusEvent(record, root.instanceId));
	}
	if (events.length) return events;
	return rawMetaEvents(root);
}

export function selectEvents(body: unknown, selected: string[]): WabaEvent[] {
	const allowed = new Set(
		selected.map((name) => SELECTED_KIND[name]).filter((kind): kind is WabaEventKind => Boolean(kind)),
	);
	return extractEvents(body).filter((event) => allowed.has(event.kind));
}
