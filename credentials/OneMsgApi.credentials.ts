import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

import { channelRequestUrl } from '../utils/api-path';
import { resolveBaseUrl, resolveInstanceId, sandboxQuery, stripAuthPrefix } from '../utils/channel';

export class OneMsgApi implements ICredentialType {
	name = 'oneMsgApi';

	displayName = '1MSG API';

	icon: Icon = { light: 'file:../icons/1msg.svg', dark: 'file:../icons/1msg.dark.svg' };

	documentationUrl = 'https://docs.1msg.io/';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			required: true,
			description:
				'Channel API key from 1MSG. The channel is taken from this key, so you do not pick a channel on each node.',
		},
		{
			displayName: 'API URL',
			name: 'environment',
			type: 'options',
			default: 'production',
			description:
				'Production is a live channel. Sandbox is a test channel at https://sandbox.1msg.io. Custom is another host 1MSG gave you.',
			options: [
				{
					name: 'Production — https://api.1msg.io',
					value: 'production',
				},
				{
					name: 'Sandbox — https://sandbox.1msg.io',
					value: 'sandbox',
				},
				{
					name: 'Custom',
					value: 'custom',
				},
			],
		},
		{
			displayName: 'API URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://sandbox.stage.1msg.io',
			description: 'Host 1MSG gave you, for example https://sandbox.stage.1msg.io.',
			displayOptions: {
				show: {
					environment: ['custom'],
				},
			},
		},
		{
			displayName: 'Channel ID',
			name: 'channelId',
			type: 'string',
			default: '',
			description:
				'Required for a sandbox channel and for an older key that is not tied to one channel. Leave empty when a production API key already belongs to one channel.',
		},
	];

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const apiKey = stripAuthPrefix(String(credentials.apiKey || ''));
		const baseUrl = resolveBaseUrl(
			String(credentials.environment || ''),
			String(credentials.baseUrl || ''),
		);
		const instanceId = resolveInstanceId(apiKey, String(credentials.channelId || ''));
		const headers = {
			...requestOptions.headers,
			Authorization: `Bearer ${apiKey}`,
		};
		let url = requestOptions.url ?? '';
		if (!url || url.startsWith('/')) {
			url = channelRequestUrl(baseUrl, instanceId, url || '/status');
		}
		const qs = {
			...(requestOptions.qs ?? {}),
			...sandboxQuery(baseUrl, apiKey),
			...sandboxQuery(url, apiKey),
		};
		const next: IHttpRequestOptions = {
			...requestOptions,
			url,
			headers,
			qs,
		};
		delete next.baseURL;
		return next;
	}

	test: ICredentialTestRequest = {
		request: {
			url: '/status',
			method: 'GET',
		},
	};
}
