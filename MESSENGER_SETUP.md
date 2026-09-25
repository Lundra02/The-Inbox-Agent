# Messenger setup and implementation

## Current local setup (24 September 2026)

> The active project is now **The Inbox Agent**. Messenger is retained, but the mechanic, phone-collection and booking instructions below are historical. Read `README.md` and `PROJECT_PROGRESS.md` for the current electronics-support setup. The webhook path and Meta credentials remain applicable.

The customer phone-index migration has succeeded. The credentials in `backend/.env` were used to validate the Page Access Token, register the callback, and subscribe the Page to `messages` and `messaging_postbacks`. Meta reports the callback active with both fields.

Current callback:

```text
https://communicate-cartoon-projection-beam.trycloudflare.com/api/webhooks/messenger
```

Running locally: backend on port 5000, agent on port 8000, frontend at http://127.0.0.1:4173, webhook-only proxy on port 5001. Cloudflare forwards only the webhook through that proxy; other URL paths return 404.

This is a temporary tunnel. Keep the processes and computer running. Restarting the tunnel may produce a different hostname. To register a replacement URL, from `backend` run `node src/config/configureMessenger.js https://NEW-HOST/api/webhooks/messenger`. It reads credentials from `.env` without printing them. The configured app defaults to `2273254266783610`; set `META_APP_ID` to use another app.

The remaining live check is to send a message to the Page from your own development-role Facebook account and confirm the reply. No customer messages were sent by this setup task.

To restart the webhook-only proxy: from `backend`, run `node src/messengerTunnelProxy.js`. From the project root, run `tools/cloudflared.exe tunnel --url http://127.0.0.1:5001 --no-autoupdate` to start a replacement tunnel.

The instructions below also cover future setup. Twilio has been removed.

## 1. Configure the backend

Add these settings to `backend/.env` (see `backend/.env.example`):

```dotenv
MESSENGER_PAGE_ID=1290531860817953
MESSENGER_PAGE_ACCESS_TOKEN=YOUR_PAGE_ACCESS_TOKEN
MESSENGER_VERIFY_TOKEN=YOUR_RANDOM_SECRET
META_APP_SECRET=YOUR_APP_SECRET
META_GRAPH_API_VERSION=v25.0
AGENT_SERVICE_URL=http://localhost:8000
```

Keep your existing `MONGO_URI` and `PORT`. Obtain the Page Access Token from Messenger API Settings and the App Secret from App settings > Basic. Choose your own verify token. Never put these secrets in frontend code or share them in chat. The Graph API version is configurable; confirm it is supported for your app before deployment.

Messenger POST processing is disabled with HTTP 503 when its required configuration is incomplete. GET verification only needs the verify token. `/health` reports `messengerConfigured` without exposing secrets; this indicates configuration presence, not that Meta has accepted the token.

## 2. Install and migrate

Start MongoDB. Stop the backend before the migration.

```powershell
cd C:\genpact\autoshop-agent\backend
npm install
npm run migrate:messenger
```

The migration replaces the unique phone index with a sparse unique index so customers can exist without a phone. It does not delete customer records. Explicit null phone fields or duplicate phone values may require inspection if migration fails. The migration has already succeeded for the current local database.

## 3. Run the three services

Open separate terminals:

```powershell
cd C:\genpact\autoshop-agent\backend
npm run dev
```

```powershell
cd C:\genpact\autoshop-agent\agent
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
cd C:\genpact\autoshop-agent\frontend
npm run dev
```

The agent needs its existing `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL`, and `BACKEND_API_URL` settings in `agent/.env`. Keep the Python service private. The backend defaults to port 5000 unless `PORT` overrides it.

## 4. Expose the webhook through HTTPS

Use a deployed backend or a tunnel pointing to the backend port. Meta cannot reach localhost directly.

For example, if ngrok is already installed and configured:

```powershell
ngrok http 5000
```

Use the HTTPS hostname it gives you. For public deployment, restrict external access to the Messenger webhook; the existing customer and agent-tool APIs do not have authentication and should remain private or behind authenticated access. Do not expose the Python agent directly.

Exact webhook paths:

```text
GET  /api/webhooks/messenger
POST /api/webhooks/messenger
```

Meta callback URL:

```text
https://YOUR-PUBLIC-BACKEND/api/webhooks/messenger
```

## 5. Configure Meta manually

1. Open https://developers.facebook.com/apps/2273254266783610/messenger/messenger_api_settings/
2. Confirm that the connected Page has ID `1290531860817953` (change configuration and the frontend link if using another Page).
3. Generate its Page Access Token and save it in `backend/.env`.
4. Copy the App Secret from App settings > Basic into `META_APP_SECRET`.
5. Choose `MESSENGER_VERIFY_TOKEN` and restart the backend after setting all environment variables.
6. Enter your public HTTPS callback URL.
7. Enter exactly the same verify token.
8. Click **Verify and save**.
9. Click **Add Subscriptions** beside your Page.
10. Subscribe to **messages** and **messaging_postbacks**.
11. Test using a Facebook account with an appropriate role on your development app/Page.

Keep the backend, agent, database, and tunnel running. Update Meta's callback if your tunnel hostname changes.

## 6. Test the conversation

1. Click **Chat on Messenger** in the website sidebar.
2. Send “Hello” to the Page and confirm a reply arrives.
3. Describe your vehicle and symptoms, then send a follow-up to check history.
4. Test another Messenger account to verify its conversation is separate.
5. When booking requires a phone, send only the international phone number, such as `+355...`, as a separate message. Syntax is validated; ownership is not verified.
6. Confirm a proposed appointment before booking.

The Messenger sender ID is never used as a phone number. A new customer is created for the Page/sender pair. Existing accounts with a matching phone are not automatically merged; the shop must verify ownership before linking them.

## 7. Automated checks

```powershell
cd C:\genpact\autoshop-agent\backend
npm test
```

```powershell
cd C:\genpact\autoshop-agent\agent
python -m unittest test_agent_core.py test_messenger.py
```

```powershell
cd C:\genpact\autoshop-agent\frontend
npx vite build
```

The automated tests mock Meta, the agent HTTP client, and MongoDB model operations. They do not send real messages, run a real model, or validate the migration against a live MongoDB instance. Six backend and six Python tests passed; the production frontend build passed with React Router directive warnings.

## Implemented files

Created:

- `backend/src/routes/messengerWebhook.js`: GET verification, raw-body HMAC signature validation, durable receipt and duplicate handling.
- `backend/src/services/messengerService.js`: configuration, event normalization, Send API, Unicode-safe reply splitting and agent HTTP timeout.
- `backend/src/services/messengerWorker.js`: persistent inbox processing, identity mapping, phone collection, conversation history and review states.
- `backend/src/models/MessengerEvent.js`: unique event IDs, status, messages, replies and timestamps.
- `backend/src/models/MessengerConversation.js`: Page/sender identity mapped to a customer.
- `backend/src/config/migrateMessenger.js`: phone index migration.
- `backend/test/messenger.test.js`: mocked webhook/service/worker tests.
- `agent/test_messenger.py`: optional phone and booking guard tests.

Updated:

- `backend/src/server.js`, `backend/src/models/Customer.js`, `backend/package.json`, `backend/.env.example`.
- `agent/main.py`, `agent/agent_core.py`, `agent/prompts/system_prompt.md`.
- `frontend/src/components/Layout.jsx`.
- `MESSENGER_SETUP.md`, `README.md`.

## Worker behavior and limitations

Run **one backend instance only**. It processes one persisted event at a time across all customers, using a one-second polling interval. This favors simple ordering over throughput. Add distributed per-conversation locking before running multiple replicas.

Events are inserted with a unique event ID before HTTP 200 is returned. Meta retries do not rerun existing events. Pending events survive restart. Interrupted processing, uncertain agent failures and failed sends become `review` events rather than being replayed automatically. Further messages from that conversation also require review. Messages older than 23 hours are not automatically sent.

Inspect the `messengerevents` collection for `status: "review"`. Check appointments and Meta delivery before taking manual action. Do not blindly reset these records to pending: an appointment or reply may already exist. After resolving an event, mark it sent only when its recorded reply and side effects have been confirmed, or keep the conversation blocked until staff resolves it. There is no staff review UI yet.

This is not a transactional exactly-once guarantee across MongoDB, the AI service and Meta. A crash or ambiguous network timeout can leave work undelivered or partly completed. Automatic replay is intentionally avoided to reduce duplicate side effects. The agent can still make mistakes about booking intent; human confirmation is instructed in the prompt, not implemented as a separate approval state machine.

History uses the last 20 successfully completed events for the same Page/sender. Full records remain in MongoDB; configure retention and deletion procedures for production. A global sequential queue can become slow with many customers.

## Before public launch

Complete the requirements shown in your Meta dashboard for `pages_messaging`, App Review, Advanced Access, business verification where required, privacy policy, data deletion and Live mode. Follow Meta's messaging-window and automation policies. Test a non-role customer after approvals. Review authentication on the existing business APIs before publishing the backend.

References:

- https://developers.facebook.com/docs/messenger-platform/webhooks/
- https://www.postman.com/meta/messenger-platform-api/folder/vilwbh4/send-api
- https://developers.facebook.com/docs/graph-api/changelog/
