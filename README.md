# The Inbox Agent

An Albanian/English customer-support inbox for a fictional electronics shop. The project combines a React/Vite staff UI, an Express/MongoDB backend, and a private FastAPI agent. Messenger and Instagram are optional inbound channels.

## Prerequisites

- Node.js 20 or newer
- Python 3.11 or newer
- MongoDB running locally or a MongoDB deployment
- A Groq-compatible API key for hybrid mode (optional; rules mode is offline)

## Configuration

Copy the example files and fill them with local values. Never commit the resulting files.

```powershell
Copy-Item agent/.env.example agent/.env
Copy-Item backend/.env.example backend/.env
```

Agent variables are documented in `agent/.env.example`: `BACKEND_API_URL`, `GROQ_API_KEY`, `GROQ_MODEL`, `GROQ_BASE_URL`, `GROQ_REASONING_EFFORT`, `SHOP_TIMEZONE`, and `INBOX_AGENT_MODE`. Use `rules` for deterministic offline replies or `hybrid` for optional model-assisted wording.

Backend variables are documented in `backend/.env.example`: `MONGO_URI`, `PORT`, `AGENT_SERVICE_URL`, `SHOP_TIMEZONE`, and optional Messenger settings. Instagram variables are in `backend/.env.instagram.example`; append them to the backend environment only when enabling Instagram.

Secrets belong only in local environment files. The frontend does not require secrets.

## Local dashboard credentials

Use these credentials for the local staff dashboard:

```text
Display name: auralith
Username: auralith
Password: Auralith12345
```

Create this account on the first local dashboard visit when the setup screen appears. Do not reuse these demo credentials in production.

## Run locally

Install dependencies once, then use separate terminals. Start MongoDB before the backend and run one backend worker.

```powershell
cd backend
npm install
npm start
```

```powershell
cd agent
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python -m uvicorn main:app --host 127.0.0.1 --port 8000
```

```powershell
cd frontend
npm install
npm run dev
```

Open the Vite URL shown in the frontend terminal, normally `http://localhost:5173`.

## Architecture

The staff UI sends inbox messages to Express. Express calls the private FastAPI agent, which applies language detection, mock business data, inventory checks, privacy rules, escalation policy, and optional Groq wording. Cases and inventory are stored in MongoDB.

Messenger and Instagram webhooks enter the same inbox service and worker. Keep the backend and agent private; expose only the webhook paths through a properly secured HTTPS deployment or tunnel.

Important endpoints include `POST /api/inbox/messages`, `GET /api/inbox/cases`, `PATCH /api/inbox/cases/:id/resolve`, `GET /api/inventory`, `GET /api/webhooks/messenger`, `POST /api/webhooks/messenger`, `GET /api/webhooks/instagram`, `POST /api/webhooks/instagram`, and FastAPI `POST /chat`.

## Messenger and Instagram

Messenger setup, webhook verification, Meta subscriptions, and local tunnel guidance are in [MESSENGER_SETUP.md](MESSENGER_SETUP.md). Instagram Login configuration is in [INSTAGRAM_SETUP.md](INSTAGRAM_SETUP.md). Both integrations require real Meta credentials in `backend/.env`, HTTPS webhook callbacks, and appropriate Meta permissions. No credentials are included in this repository.

## Tests

```powershell
cd backend
npm test
```

```powershell
cd agent
python -m unittest test_agent_core.py test_inbox.py test_inbox_extras.py test_messenger.py test_replies.py
python -X utf8 -m inbox_agent.test_messages --mode rules
```

```powershell
cd frontend
npx vite build
```

The fixtures in `agent/inbox_agent/mock_data.py` are fictional. The application is a local demonstration and does not provide production staff authentication, distributed worker coordination, or a live inventory supplier connection.
