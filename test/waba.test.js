const test = require('node:test');
const assert = require('node:assert/strict');
const { recipientBody } = require('../dist/utils/recipient');
const { resolveInstanceId } = require('../dist/utils/channel');
const { channelRequestUrl } = require('../dist/utils/api-path');
const { humanizeMessage, assertSendSucceeded, messageFromFailure } = require('../dist/utils/errors');
const { addWebhookUrl, removeWebhookUrl, webhookUrls } = require('../dist/utils/webhooks');
const { selectEvents } = require('../dist/utils/events');
const { templateFields, buildTemplateParams, findTemplate, templateSendIdentity, isApproved } = require('../dist/utils/templates');

function jwt(payload) {
	const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
	return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.sig`;
}

test('recipient accepts a phone in everyday formats', () => {
	assert.deepEqual(recipientBody('+1 (415) 555-2671'), { phone: '14155552671' });
	assert.deepEqual(recipientBody('1.415.555.2671'), { phone: '14155552671' });
});

test('recipient detects BSUID, username, and chat ids', () => {
	assert.deepEqual(recipientBody('AB.954395553956302'), { bsuid: 'AB.954395553956302' });
	assert.deepEqual(recipientBody('@shop'), { username: 'shop' });
	assert.deepEqual(recipientBody('14155552671@c.us'), { chatId: '14155552671@c.us' });
	assert.deepEqual(recipientBody('AB.1@lid'), { chatId: 'AB.1@lid' });
});

test('recipient rejects an empty or unknown value', () => {
	assert.throws(() => recipientBody('   '), /Enter a recipient/);
	assert.throws(() => recipientBody('hello world'), /Could not tell/);
	assert.throws(() => recipientBody('123'), /country code/);
});

test('channel id comes from the API key', () => {
	const key = jwt({ instanceId: 'instance371267300', token: 'inner' });
	assert.equal(resolveInstanceId(key), '371267300');
	assert.equal(resolveInstanceId('plain-key', 'HEI1'), 'HEI1');
	assert.throws(() => resolveInstanceId('plain-key'), /not tied to a channel/);
});

test('API path stays on the 1MSG host and does not repeat the channel', () => {
	assert.equal(
		channelRequestUrl('https://api.1msg.io/', 'ch1', 'templates'),
		'https://api.1msg.io/ch1/templates',
	);
	assert.equal(
		channelRequestUrl('https://api.1msg.io', 'ch1', '/ch1/messages?limit=1'),
		'https://api.1msg.io/ch1/messages?limit=1',
	);
	assert.throws(
		() => channelRequestUrl('https://api.1msg.io', 'ch1', 'https://evil.example/hook'),
		/not sent to other websites/,
	);
	assert.throws(
		() => channelRequestUrl('https://api.1msg.io', 'ch1', '/templates?token=secret'),
		/Remove the API key/,
	);
});

test('errors explain a closed 24-hour window and a rejected key', () => {
	assert.match(humanizeMessage('Dialog window is closed', 400), /Send Template/);
	assert.match(humanizeMessage('invalid token', 401), /API key was rejected/);
	assert.throws(() => assertSendSucceeded({ sent: false, message: 'empty body' }), /empty body/);
	assert.doesNotThrow(() => assertSendSucceeded({ sent: true, id: 'wamid.1' }));
});

test('webhook list keeps existing addresses and stops at five', () => {
	const current = ['https://crm.example/hook', 'https://inbox.example/hook'];
	const added = addWebhookUrl(current, 'https://n8n.example/webhook/waba/');
	assert.equal(added.added, true);
	assert.deepEqual(added.urls, [...current, 'https://n8n.example/webhook/waba/']);
	assert.equal(addWebhookUrl(added.urls, 'https://n8n.example/webhook/waba').added, false);
	assert.deepEqual(webhookUrls('https://a.example, https://b.example'), [
		'https://a.example',
		'https://b.example',
	]);
	assert.deepEqual(removeWebhookUrl(added.urls, 'https://n8n.example/webhook/waba'), current);
	assert.throws(
		() =>
			addWebhookUrl(
				['https://a', 'https://b', 'https://c', 'https://d', 'https://e'],
				'https://n8n.example/hook',
			),
		/maximum/,
	);
});

test('events keep incoming messages and delivery statuses that were selected', () => {
	const body = {
		instanceId: 'ch1',
		messages: [
			{ id: 'in', fromMe: false, chatId: '1@c.us', body: 'Hi', type: 'chat' },
			{ id: 'out', fromMe: true, chatId: '1@c.us', body: 'Reply', type: 'chat' },
		],
		ack: [{ id: 'out', status: 'delivered', chatId: '1@c.us' }],
	};
	const selected = selectEvents(body, ['incomingMessages', 'deliveryStatus']);
	assert.deepEqual(
		selected.map((event) => event.kind),
		['incoming', 'status'],
	);
	assert.equal(selected[0].json.body, 'Hi');
	assert.equal(selected[1].json.status, 'delivered');
});

test('raw provider payloads are classified when the channel uses them', () => {
	const selected = selectEvents(
		{
			entry: [
				{
					changes: [
						{
							value: {
								messages: [{ id: 'm1', text: { body: 'Hi' } }],
								statuses: [{ id: 'm0', status: 'read' }],
							},
						},
					],
				},
			],
		},
		['incomingMessages', 'deliveryStatus'],
	);
	assert.deepEqual(
		selected.map((event) => event.kind),
		['incoming', 'status'],
	);
});

test('template form follows the inbox variable layout', () => {
	const components = [
		{ type: 'HEADER', format: 'IMAGE' },
		{ type: 'BODY', text: 'Hello {{1}}, order {{2}}' },
		{
			type: 'BUTTONS',
			buttons: [
				{ type: 'QUICK_REPLY', text: 'Stop' },
				{ type: 'URL', text: 'Track', url: 'https://shop.example/{{1}}' },
			],
		},
	];
	const fields = templateFields(components);
	assert.deepEqual(
		fields.map((field) => field.displayName),
		['File link', 'Variable 1 in the text', 'Variable 2 in the text', 'Variable in the link button “Track”'],
	);
	assert.equal(fields[1].description, 'Hello {{1}}, order {{2}}');
	assert.deepEqual(
		buildTemplateParams(components, {
			header_media_url: 'https://cdn.example/a.jpg',
			body_1: 'Ada',
			body_2: '100',
			button_url_1: '100',
		}),
		[
			{ type: 'header', parameters: [{ type: 'image', image: { link: 'https://cdn.example/a.jpg' } }] },
			{
				type: 'body',
				parameters: [
					{ type: 'text', text: 'Ada' },
					{ type: 'text', text: '100' },
				],
			},
			{
				type: 'button',
				sub_type: 'url',
				index: 1,
				parameters: [{ type: 'text', text: '100' }],
			},
		],
	);
	assert.deepEqual(buildTemplateParams([{ type: 'BODY', text: 'No variables' }], {}), []);
	assert.throws(() => buildTemplateParams(components, { body_1: 'Ada' }), /File link/);
});

test('duplicate template names must be chosen from the list', () => {
	const templates = [
		{ id: '1', name: 'hello', language: 'en', status: 'APPROVED', namespace: 'ns' },
		{ id: '2', name: 'hello', language: 'ru', status: 'APPROVED', namespace: 'ns' },
	];
	assert.equal(findTemplate(templates, '1').language, 'en');
	assert.throws(() => findTemplate(templates, 'hello'), /Several approved templates/);
	assert.throws(() => findTemplate([{ ...templates[0], status: 'PENDING' }], 'missing'), /No approved/);
});

test('lowercase approved status and string components still build a template', () => {
	assert.equal(isApproved({ status: 'approved', name: 'hello' }), true);
	const components = JSON.stringify([{ type: 'BODY', text: 'Hi {{1}}' }]);
	assert.deepEqual(
		templateFields(components).map((field) => field.id),
		['body_1'],
	);
	const sent = templateSendIdentity(
		{ name: 'hello', language: 'en', status: 'approved', message_template_namespace: 'ns-1' },
		[],
	);
	assert.equal(sent.namespace, 'ns-1');
	assert.equal(
		templateSendIdentity({ name: 'hello', language: 'en' }, [
			{ name: 'other', language: 'en', namespace: 'shared-ns' },
		]).namespace,
		'shared-ns',
	);
	assert.throws(
		() =>
			templateSendIdentity({ name: 'hello', language: 'en' }, [
				{ name: 'a', namespace: 'one' },
				{ name: 'b', namespace: 'two' },
			]),
		/no namespace/,
	);
});

test('API failures keep the readable 1MSG message', () => {
	assert.match(
		messageFromFailure({
			statusCode: 400,
			error: { message: 'Dialog window is closed' },
		}),
		/Send Template/,
	);
	assert.match(
		messageFromFailure({ message: '400 - {"message":"template is not defined"}' }),
		/name, language, or namespace/,
	);
});
