# n8n node for 1MSG

Send WhatsApp messages and receive WhatsApp events in [n8n](https://n8n.io) through a [1MSG](https://1msg.io) channel.

The node is enough for three setups:

1. A customer writes on WhatsApp, 1MSG starts an n8n workflow, and the workflow updates a CRM.
2. A customer writes on WhatsApp, 1MSG starts an n8n workflow, and the workflow asks an AI tool for a reply.
3. A CRM event starts an n8n workflow, and the workflow sends a WhatsApp template through 1MSG.

## Install

In n8n, go to **Settings → Community nodes** and install:

```text
n8n-nodes-1msg
```

On a self-hosted n8n you can also add the package to `N8N_CUSTOM_EXTENSIONS` or install it with npm inside the n8n container. Restart n8n after installing.

## Credentials

Create a credential named **1MSG API**.

| Field | What to paste |
| --- | --- |
| API Key | The channel API key from 1MSG channel settings. The channel is read from this key. |
| Base URL | `https://api.1msg.io`, unless 1MSG gave you another host. |
| Channel ID | Leave empty. Fill it only for an older key that is not tied to one channel. |

Use **Test** on the credential. A successful test reads the channel status. The same credential is used by **WABA** and **WABA Events**. The key stays in the n8n credential and is not typed again on each node. If you edit or replace the credential, existing nodes use the credential that is selected on them.

API reference: [docs.1msg.io](https://docs.1msg.io/). Support: [help.1msg.io](https://help.1msg.io/) and support@1msg.io.

## WABA

### Send Message

**How to fill → Using the form** (the default):

- **Recipient** — a phone, BSUID, or username. The node decides which one it is. Phones can include spaces, brackets, dashes, dots, and a leading `+`. A chat ID from a webhook, such as `14155552671@c.us`, also works.
- **Message** — the text. Values from earlier steps can be inserted here.

A free-form message arrives only when that person wrote to the channel in the last 24 hours. Outside that window, use **Send Template**. The form says this under the message.

**How to fill → Custom request body** replaces the form with the full JSON body of `POST /sendMessage`. Do not put the API key in that JSON.

### Send Template

**Using the form**:

- **Recipient** — same field as Send Message.
- **Template** — approved templates from the channel. Each row shows the name, language, and category. Open the list again to refresh it. Switch the field to **ID** to type a template name or ID.
- **Variables** — appear after a template is chosen. They are labeled from the template, for example “Variable 1 in the text”, “Variable in the header”, and “Variable in the link button”. The template text is shown next to the field. A header image, video, or document asks for **File link**. A template with no variables shows no variable fields.

**Custom request body** still uses Recipient and Template, and adds **Parameters**: the WhatsApp component array, for example a body variable. Name, language, and namespace come from the selected template.

### Make API Call

Call any method on the same channel without typing the key again.

- **Method** — GET, POST, PUT, PATCH, or DELETE.
- **Path** — for example `templates` or `messages`. A full URL is accepted only on the credential’s 1MSG host.
- **Query parameters** and **Request body** — JSON. Leave `{}` when you do not need them.

The API response is returned as the n8n item. An HTTP error is shown in plain language.

## WABA Events

The trigger starts the workflow when 1MSG sends a webhook. In n8n it is named **WABA Events Trigger**. Choose any combination of:

- Incoming message webhooks
- Outgoing message webhooks
- Outgoing message delivery status (sent, delivered, read, or failed)

When the workflow is activated, n8n registers the production URL of this trigger on the channel. URLs that are already configured are kept. A channel can store 5 URLs. If the list is already full, activation stops and the error includes the n8n URL so you can copy it into the channel settings yourself. The n8n node also shows the webhook URL in its webhook panel.

If delivery status is selected, the node turns on `ackNotificationsOn` for the channel so status events are included. Deactivating the workflow removes only this trigger’s URL.

Each matching event becomes one item:

| `event` | When |
| --- | --- |
| `incoming` | Customer message (`fromMe` is false) |
| `outgoing` | Business message (`fromMe` is true) |
| `status` | Delivery receipt in `ack` |

A request that does not match the selected events is acknowledged and does not start the workflow.

## Examples

Reply to a new customer message with a template when the 24-hour window may be closed:

1. **WABA Events**, with incoming messages selected.
2. **WABA → Send Template**. Set Recipient to `{{$json.chatId}}` and choose the template.

Forward an incoming message to another system:

1. **WABA Events**.
2. An HTTP Request node that posts `{{$json.message}}` to the CRM.

Send a template when a CRM row is created:

1. The CRM trigger.
2. **WABA → Send Template**. Map the phone and the template variables from the CRM item.

## Development

```bash
npm install
npm test
npm run dev
```

`npm test` builds the package and runs the unit tests. `npm run dev` opens a local n8n with this node loaded.

Source: [github.com/1msg/1msg-n8n-nodes](https://github.com/1msg/1msg-n8n-nodes). The npm package name stays `n8n-nodes-1msg` because n8n only loads community nodes whose package name starts with `n8n-nodes-`.

Publishing to npm is done by GitHub Actions on a version tag, with a provenance attestation. See `.github/workflows/publish.yml`.

## License

MIT
