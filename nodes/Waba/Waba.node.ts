import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { getTemplateVariables, searchTemplates } from './loadOptions';
import { bindWabaExecute, toItemJson } from './execute';

const sendOperations = ['sendMessage', 'sendTemplate'];

export class Waba implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WABA',
		name: 'waba',
		icon: { light: 'file:1msg.svg', dark: 'file:1msg.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Send WhatsApp messages through 1MSG',
		defaults: {
			name: 'WABA',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'oneMsgApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Action',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				default: 'sendMessage',
				options: [
					{
						name: 'Send Message',
						value: 'sendMessage',
						action: 'Send a message',
						description: 'Send a free-form text message inside the 24-hour window',
					},
					{
						name: 'Send Template',
						value: 'sendTemplate',
						action: 'Send a template',
						description: 'Send an approved WhatsApp template',
					},
					{
						name: 'Make API Call',
						value: 'apiCall',
						action: 'Make an API call',
						description: 'Call any 1MSG API method with the saved credential',
					},
				],
			},
			{
				displayName: 'How to Fill',
				name: 'fillMode',
				type: 'options',
				noDataExpression: true,
				default: 'form',
				displayOptions: {
					show: {
						operation: sendOperations,
					},
				},
				options: [
					{
						name: 'Using the Form',
						value: 'form',
						description: 'Fill in the fields below',
					},
					{
						name: 'Custom Request Body',
						value: 'custom',
						description: 'Paste the JSON yourself',
					},
				],
			},
			{
				displayName:
					'A free-form message is delivered only if this person wrote to you in the last 24 hours. Otherwise use Send Template.',
				name: 'sessionNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						fillMode: ['form'],
					},
				},
			},
			{
				displayName: 'Recipient',
				name: 'recipient',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Phone, BSUID, or username',
				description:
					'Phone, BSUID, or username. Spaces, brackets, dashes, dots, and a leading plus are removed from phone numbers. You can also paste a chat ID from a webhook.',
				displayOptions: {
					show: {
						operation: ['sendMessage', 'sendTemplate'],
					},
					hide: {
						operation: ['sendMessage'],
						fillMode: ['custom'],
					},
				},
			},
			{
				displayName: 'Message',
				name: 'body',
				type: 'string',
				default: '',
				required: true,
				typeOptions: {
					rows: 4,
				},
				description: 'Text to send. You can insert data from earlier steps.',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						fillMode: ['form'],
					},
				},
			},
			{
				displayName: 'Request Body',
				name: 'customBody',
				type: 'json',
				default: '{\n  "phone": "14155552671",\n  "body": "Hello"\n}',
				description:
					'Full JSON body for sendMessage. Do not put the API key here. The credential adds it.',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
						fillMode: ['custom'],
					},
				},
			},
			{
				displayName: 'Template',
				name: 'template',
				type: 'resourceLocator',
				default: { mode: 'list', value: '' },
				required: true,
				description:
					'Approved templates on this channel. Each row shows the name, language, and category. Use the refresh icon on the list to reload it, or switch to ID and type a name or ID.',
				displayOptions: {
					show: {
						operation: ['sendTemplate'],
					},
				},
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						placeholder: 'Select a template',
						typeOptions: {
							searchListMethod: 'searchTemplates',
							searchable: true,
						},
					},
					{
						displayName: 'ID',
						name: 'id',
						type: 'string',
						placeholder: 'hello_world',
						hint: 'Template name or ID',
					},
				],
			},
			{
				displayName: 'Variables',
				name: 'variables',
				type: 'resourceMapper',
				default: {
					mappingMode: 'defineBelow',
					value: null,
				},
				displayOptions: {
					show: {
						operation: ['sendTemplate'],
						fillMode: ['form'],
					},
				},
				typeOptions: {
					loadOptionsDependsOn: ['template.value'],
					resourceMapper: {
						resourceMapperMethod: 'getTemplateVariables',
						mode: 'add',
						fieldWords: {
							singular: 'variable',
							plural: 'variables',
						},
						addAllFields: true,
						multiKeyMatch: false,
						supportAutoMap: false,
					},
				},
			},
			{
				displayName: 'Parameters',
				name: 'customParams',
				type: 'json',
				default:
					'[\n  {\n    "type": "body",\n    "parameters": [{ "type": "text", "text": "Ivan" }]\n  }\n]',
				description:
					'Template components in WhatsApp Cloud API format. Recipient, template name, language, and namespace still come from the fields above.',
				displayOptions: {
					show: {
						operation: ['sendTemplate'],
						fillMode: ['custom'],
					},
				},
			},
			{
				displayName: 'Method',
				name: 'method',
				type: 'options',
				default: 'GET',
				noDataExpression: true,
				options: [
					{ name: 'DELETE', value: 'DELETE' },
					{ name: 'GET', value: 'GET' },
					{ name: 'PATCH', value: 'PATCH' },
					{ name: 'POST', value: 'POST' },
					{ name: 'PUT', value: 'PUT' },
				],
				displayOptions: {
					show: {
						operation: ['apiCall'],
					},
				},
			},
			{
				displayName: 'Path',
				name: 'path',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'templates',
				description:
					'API path on this channel, for example templates or messages. The API key is added from the credential.',
				displayOptions: {
					show: {
						operation: ['apiCall'],
					},
				},
			},
			{
				displayName: 'Query Parameters',
				name: 'query',
				type: 'json',
				default: '{}',
				description: 'Optional query string as JSON. Leave {} when you do not need one.',
				displayOptions: {
					show: {
						operation: ['apiCall'],
					},
				},
			},
			{
				displayName: 'Request Body',
				name: 'requestBody',
				type: 'json',
				default: '{}',
				description: 'JSON body. Leave {} for requests that do not need one. Do not put the API key here.',
				displayOptions: {
					show: {
						operation: ['apiCall'],
						method: ['POST', 'PUT', 'PATCH', 'DELETE'],
					},
				},
			},
		],
	};

	methods = {
		listSearch: {
			searchTemplates,
		},
		resourceMapping: {
			getTemplateVariables,
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const run = bindWabaExecute();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const response = await run.call(this, itemIndex);
				returnData.push({
					json: toItemJson(response),
					pairedItem: { item: itemIndex },
				});
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: message },
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw new NodeOperationError(this.getNode(), message, { itemIndex });
			}
		}

		return [returnData];
	}
}
