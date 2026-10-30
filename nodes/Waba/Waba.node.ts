import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { getTemplateVariables, searchTemplates } from './loadOptions';
import { bindWabaExecute, toItemJson } from './execute';

export class Waba implements INodeType {
	description: INodeTypeDescription = {
		displayName: '1MSG for WhatsApp Business API',
		name: 'waba',
		icon: { light: 'file:1msg.svg', dark: 'file:1msg.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description:
			'Send WhatsApp messages, receive webhooks, and make any API request using the official WhatsApp API through 1MSG.',
		defaults: {
			name: '1MSG for WhatsApp Business API',
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
				displayName:
					'Docs <a href="https://docs.1msg.io/" target="_blank">https://docs.1msg.io/</a>',
				name: 'docsNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						operation: ['sendMessage', 'apiCall'],
					},
				},
			},
			{
				displayName: 'How to Fill',
				name: 'fillMode',
				type: 'options',
				noDataExpression: true,
				default: 'form',
				displayOptions: {
					show: {
						operation: ['sendTemplate'],
					},
				},
				options: [
					{
						name: 'Using the Form',
						value: 'form',
						description: 'Fill in the fields below',
					},
					{
						name: 'Parameters',
						value: 'custom',
						description: 'Paste the WhatsApp component array',
					},
				],
			},
			{
				displayName:
					'A free-form message is delivered only if this person wrote to you in the last 24 hours. Otherwise use Send a template.',
				name: 'sessionNotice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
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
					'Phone, BSUID, or username. A username may contain dots: john.doe and @john.doe are the same. A BSUID looks like US.13491208655302741918. You can also paste a chat ID from a webhook. For any other JSON body, use Make an API call.',
				displayOptions: {
					show: {
						operation: ['sendMessage'],
					},
				},
			},
			{
				displayName: 'Recipient',
				name: 'templateRecipient',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'Phone, BSUID, or username',
				description:
					'Phone, BSUID, or username. A username may contain dots: john.doe and @john.doe are the same. A BSUID looks like US.13491208655302741918. You can also paste a chat ID from a webhook.',
				displayOptions: {
					show: {
						operation: ['sendTemplate'],
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
					'Approved templates on this channel. Each row shows the name, language, and category. To map a template, switch to ID and enter name|language, for example hello|en, then fill Variable values.',
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
						hint: 'name|language, for example hello|en',
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
				displayName: 'Variable Values',
				name: 'bodyVariables',
				type: 'string',
				default: '',
				description:
					'Use this when Template is mapped as name|language. Enter one value per body placeholder, separated by commas, or a JSON array. Leave empty when you pick a template from the list and fill Variables. A header file, a button, or a carousel uses Parameters.',
				displayOptions: {
					show: {
						operation: ['sendTemplate'],
						fillMode: ['form'],
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
					'Path on this channel. Production is https://api.1msg.io and Sandbox is https://sandbox.1msg.io. Examples: templates or sendMessage. A full https URL is accepted only on that same host.',
				displayOptions: {
					show: {
						operation: ['apiCall'],
					},
				},
			},
			{
				displayName: 'Query String',
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
