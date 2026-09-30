import type {
	ICredentialDataDecryptedObject,
	ICredentialTestRequest,
	ICredentialType,
	IHttpRequestOptions,
	INodeProperties,
	Icon,
} from 'n8n-workflow';

import { channelRequestUrl } from '../utils/api-path';
import { normalizeBaseUrl, resolveInstanceId, stripAuthPrefix } from '../utils/channel';

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
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.1msg.io',
			description: '1MSG API host. Keep https://api.1msg.io unless you were given another host.',
		},
		{
			displayName: 'Channel ID',
			name: 'channelId',
			type: 'string',
			default: '',
			description:
				'Leave empty when the API key already belongs to one channel. Fill this only for an older key that is not tied to a channel.',
		},
	];

	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		requestOptions: IHttpRequestOptions,
	): Promise<IHttpRequestOptions> {
		const apiKey = stripAuthPrefix(String(credentials.apiKey || ''));
		const baseUrl = normalizeBaseUrl(String(credentials.baseUrl || ''));
		const instanceId = resolveInstanceId(apiKey, String(credentials.channelId || ''));
		const headers = {
			...requestOptions.headers,
			Authorization: `Bearer ${apiKey}`,
		};
		let url = requestOptions.url ?? '';
		if (url.startsWith('/')) {
			url = channelRequestUrl(baseUrl, instanceId, url);
		}
		return {
			...requestOptions,
			url,
			headers,
		};
	}

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/status',
			method: 'GET',
		},
	};
}
