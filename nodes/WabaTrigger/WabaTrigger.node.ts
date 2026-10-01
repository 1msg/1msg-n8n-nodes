import type {
	IDataObject,
	IHookFunctions,
	INodeType,
	INodeTypeDescription,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { oneMsgRequest } from '../transport';
import { selectEvents } from '../../utils/events';
import { addWebhookUrl, removeWebhookUrl, sameWebhookUrl, webhookUrls } from '../../utils/webhooks';

async function writeWebhookList(this: IHookFunctions, urls: string[]): Promise<void> {
	if (urls.length === 0) {
		await oneMsgRequest.call(this, 'POST', '/settings', { webhookUrl: '' });
		return;
	}
	await oneMsgRequest.call(this, 'POST', '/webhook', {
		webhookUrl: urls.length === 1 ? urls[0] : urls,
	});
}

async function currentWebhookUrls(this: IHookFunctions): Promise<string[]> {
	const response = await oneMsgRequest.call(this, 'GET', '/webhook');
	const webhookUrl =
		response && typeof response === 'object' ? (response as { webhookUrl?: unknown }).webhookUrl : undefined;
	return webhookUrls(webhookUrl);
}

async function enableDeliveryStatuses(this: IHookFunctions): Promise<void> {
	const events = this.getNodeParameter('events', []) as string[];
	if (!events.includes('deliveryStatus')) return;
	await oneMsgRequest.call(this, 'POST', '/settings', { ackNotificationsOn: true });
}

export class WabaTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: '1MSG for WhatsApp Business API Trigger',
		name: 'wabaTrigger',
		icon: { light: 'file:1msg.svg', dark: 'file:1msg.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: 'WhatsApp events',
		description:
			'Receive WhatsApp messages and delivery statuses through 1MSG.',
		defaults: {
			name: '1MSG for WhatsApp Business API Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'oneMsgApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'waba',
			},
		],
		properties: [
			{
				displayName:
					'Activating the workflow adds the production URL of this trigger to the channel. Addresses already configured stay in place. A channel can store 5 URLs. The URL is also shown below as Webhook URLs, with a copy button, if it has to be pasted into 1MSG by hand. Selecting delivery status turns delivery receipts on for the channel.',
				name: 'webhookNotice',
				type: 'notice',
				default: '',
			},
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				default: ['incomingMessages', 'outgoingMessages', 'deliveryStatus'],
				required: true,
				options: [
					{
						name: 'Incoming Message Webhooks',
						value: 'incomingMessages',
						description: 'Messages sent by the customer',
					},
					{
						name: 'Outgoing Message Webhooks',
						value: 'outgoingMessages',
						description: 'Messages sent by the business',
					},
					{
						name: 'Outgoing Message Delivery Status',
						value: 'deliveryStatus',
						description: 'Sent, delivered, read, or failed',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				if (!url) return false;
				const urls = await currentWebhookUrls.call(this);
				const exists = urls.some((item) => sameWebhookUrl(item, url));
				if (exists) await enableDeliveryStatuses.call(this);
				return exists;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				if (!url) {
					throw new NodeOperationError(this.getNode(), 'n8n did not provide a webhook URL for this trigger.');
				}
				const urls = await currentWebhookUrls.call(this);
				const next = addWebhookUrl(urls, url);
				if (next.added) await writeWebhookList.call(this, next.urls);
				await enableDeliveryStatuses.call(this);
				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				const url = this.getNodeWebhookUrl('default');
				if (!url) return true;
				const urls = await currentWebhookUrls.call(this);
				await writeWebhookList.call(this, removeWebhookUrl(urls, url));
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const events = this.getNodeParameter('events', []) as string[];
		if (!events.length) return {};
		const matched = selectEvents(this.getBodyData(), events);
		if (!matched.length) return {};
		return {
			workflowData: [matched.map((event) => ({ json: event.json as IDataObject }))],
		};
	}
}
