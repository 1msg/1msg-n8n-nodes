const assert = require('node:assert/strict');
const test = require('node:test');

const { bindWabaExecute } = require('../dist/nodes/Waba/execute');
const { listApprovedTemplates } = require('../dist/nodes/Waba/listTemplates');
const { packTemplateValue } = require('../dist/utils/templates');

/** Supply only inert host adapters and record every authenticated request; unexpected network calls have no implementation. */
function executionContext(parameters, replies) {
	const requests = [];
	return {
		requests,
		/** Use an explicit channel ID and a synthetic key so tests never consult user credentials. */
		async getCredentials() {
			return { apiKey: 'offline-test-key', channelId: 'channel', environment: 'production' };
		},
		/** Match n8n's parameter-default behavior for the configured operation. */
		getNodeParameter(name, _itemIndex, fallback) {
			return Object.hasOwn(parameters, name) ? parameters[name] : fallback;
		},
		/** Provide the node metadata required by real NodeOperationError construction. */
		getNode() {
			return { name: 'Offline 1MSG', type: '1msg', typeVersion: 1, position: [0, 0], parameters };
		},
		helpers: {
			/** Capture the actual transport options and reject calls beyond the planned provider responses. */
			async httpRequestWithAuthentication(credential, options) {
				assert.equal(credential, 'oneMsgApi');
				requests.push(options);
				assert.ok(replies.length, 'Unexpected additional HTTP request');
				return replies.shift();
			},
		},
	};
}

/** The real operation must preserve query values and API-method error scope across the grouped transport options. */
test('custom API execution keeps query parameters and method-specific errors', async () => {
	const context = executionContext(
		{ operation: 'apiCall', method: 'GET', path: '/missing', query: { limit: 5 } },
		[{ statusCode: 404, headers: {}, body: {} }],
	);
	await assert.rejects(bindWabaExecute().call(context, 0), /could not find that method/);
	assert.equal(context.requests.length, 1);
	assert.equal(context.requests[0].url, 'https://api.1msg.io/channel/missing');
	assert.deepEqual(context.requests[0].qs, { limit: 5 });
	assert.equal(context.requests[0].headers.Authorization, 'Bearer offline-test-key');
});

/** A repeated full page terminates pagination while retaining approved rows and the exact next-page offset. */
test('template pagination preserves offsets and stops when the provider repeats a page', async () => {
	/** Generate distinct provider rows so the second response exercises duplicate-page detection. */
	const page = Array.from({ length: 100 }, (_, index) => ({
		id: String(index),
		name: `template-${index}`,
		language: 'en',
		status: index === 0 ? 'PENDING' : 'APPROVED',
	}));
	const context = executionContext({}, [{ templates: page }, { templates: page }]);
	const templates = await listApprovedTemplates.call(context);
	assert.equal(templates.length, 99);
	assert.equal(context.requests.length, 2);
	assert.deepEqual(context.requests[0].qs, { limit: 100, offset: 0, sort: 'name' });
	assert.deepEqual(context.requests[1].qs, { limit: 100, offset: 100, sort: 'name' });
});

/** A complete dropdown snapshot must send directly and retain mapped body parameters without listing templates. */
test('stored template execution sends its identity and variables without an extra list request', async () => {
	const template = packTemplateValue({
		name: 'hello',
		language: 'en',
		namespace: 'account',
		components: [],
	});
	const context = executionContext(
		{
			operation: 'sendTemplate',
			template: { value: template },
			templateRecipient: '14155552671',
			bodyVariables: '["Ada"]',
		},
		[{ sent: true }],
	);
	assert.deepEqual(await bindWabaExecute().call(context, 0), { sent: true });
	assert.equal(context.requests.length, 1);
	assert.equal(context.requests[0].url, 'https://api.1msg.io/channel/sendTemplate');
	assert.deepEqual(context.requests[0].body, {
		template: 'hello',
		namespace: 'account',
		language: { policy: 'deterministic', code: 'en' },
		phone: '14155552671',
		params: [{ type: 'body', parameters: [{ type: 'text', text: 'Ada' }] }],
	});
});
