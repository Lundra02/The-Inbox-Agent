# Instagram DM setup (Instagram Login)

Instagram is an additional channel in the existing Express/FastAPI inbox. This implementation matches **Instagram > API setup with Instagram login** in your screenshot. Messenger keeps its existing callback, Page token, app secret and database queue. No Facebook Page link is required for this Instagram Login integration.

## Backend environment

Append the following to `backend/.env` (also supplied in `backend/.env.instagram.example`):

```dotenv
INSTAGRAM_ACCOUNT_ID=your_instagram_professional_account_id
INSTAGRAM_ACCESS_TOKEN=your_instagram_user_access_token
INSTAGRAM_APP_SECRET=your_instagram_app_secret
INSTAGRAM_VERIFY_TOKEN=your_own_random_verification_string
INSTAGRAM_GRAPH_API_VERSION=v25.0
```

- `INSTAGRAM_ACCOUNT_ID`: the professional **account/user ID** returned for the account you add in Instagram API setup. This is neither the Facebook App ID nor the Instagram App ID displayed at the top of your screenshot, nor your username or Facebook Page ID.
- `INSTAGRAM_ACCESS_TOKEN`: the token generated for that Instagram professional account using Instagram Login, with `instagram_business_basic` and `instagram_business_manage_messages`. Do not use the Messenger Page token.
- `INSTAGRAM_APP_SECRET`: the **Instagram app secret** in the Instagram Login setup panel shown in your screenshot. Kept separate from `META_APP_SECRET`.
- `INSTAGRAM_VERIFY_TOKEN`: a random string you choose, copied exactly into Meta's webhook Verify token box. It is separate from the access token.
- `INSTAGRAM_GRAPH_API_VERSION`: optional; defaults to `v25.0`. Select the same supported version for the Instagram webhook subscription. Changing it does not change Messenger's version.

Keep `AGENT_SERVICE_URL`, `MONGO_URI`, and all existing Messenger settings. No frontend or Python secrets/variables are needed. The backend leaves Instagram disabled until its required configuration is present. `/health` reports `instagramConfigured` (configuration completeness, not proof of valid tokens).

## Meta dashboard checklist

1. Use an Instagram **Business or Creator** account. In the same Meta app, open **Instagram > API setup with Instagram login**, as shown in your screenshot.
2. Under **App roles**, add the account as an **Instagram Tester** and accept the invitation while signed into that Instagram account. Return to **Generate access tokens > Add account**, authorize the professional account and messaging access, and generate its token. Store the account ID and token in the backend variables above.
3. Ensure the grant includes `instagram_business_basic` and `instagram_business_manage_messages`. If the Instagram account exposes **Allow access to messages** under its connected-tools/message settings, enable it.
4. Under **Configure webhooks**, enter:
   - Callback URL: `https://YOUR_PUBLIC_HOST/api/webhooks/instagram`
   - Verify token: exactly `INSTAGRAM_VERIFY_TOKEN`.
   - Save/verify after the updated backend and webhook proxy are running.
5. Subscribe the Instagram webhook to **messages** and **messaging_postbacks**. Receipts, reactions, comments and other event types are not required by this text-message adapter. Keep the existing Messenger/Page subscriptions unchanged.
6. Enable webhook subscriptions for the **added Instagram account** as well as the app-level callback. Use the subscription control alongside the added account in Instagram setup. If needed, the account-level API is `POST https://graph.instagram.com/v25.0/INSTAGRAM_ACCOUNT_ID/subscribed_apps` with Bearer `INSTAGRAM_ACCESS_TOKEN` and `subscribed_fields=messages,messaging_postbacks`. Check subscriptions with GET on the same endpoint. A successful dashboard test alone does not establish account subscription.
7. Your screenshot explicitly says **Live** mode is required for webhook delivery. Complete the dashboard's required app settings and switch to Live when ready. For accounts outside the app's permitted test/owned-account scope, complete the permissions' required Advanced Access/App Review and any business verification the dashboard requests. Live mode alone does not grant permissions. Follow the access requirements shown for your specific app/account.
8. Send a real **text DM from a different eligible Instagram account** to the connected professional account. The user initiates the conversation. Check the shared inbox for channel `instagram`, confirm the reply in Instagram, and send a follow-up to exercise conversation memory. Also send a Messenger test message to confirm both channels work side by side.

The app does not implement OAuth onboarding or automatic token refresh. Renew/rotate the Instagram token before its reported expiry, update `backend/.env`, and restart the backend. Keep tokens and app secrets out of frontend code and screenshots.

## Local services and tunnel

Restart the existing backend and `backend/src/messengerTunnelProxy.js` processes after configuring; keep only one backend worker process. The same proxy on port 5001 now allows both `/api/webhooks/messenger` and `/api/webhooks/instagram` (GET/POST only). Keep the tunnel pointing at this proxy. The staff APIs are not exposed through it.

You may use the same public tunnel hostname for both callbacks. If the temporary tunnel URL changes, update both callbacks in Meta. Instagram uses the existing Python service; no second AI service is needed.

## Behavior and limits

- Shared raw-body HMAC validation, verification challenge, durable insertion before acknowledgement and duplicate-event handling.
- Separate `InstagramEvent` collection uses the same event schema and worker. Its `pageId` field stores the receiving Instagram account ID; `psid` stores the Instagram-scoped sender ID.
- Conversation IDs start with `instagram:`; source-event IDs are also namespaced. Messenger IDs and records are unchanged.
- Same AI agent, inventory lookup, Albanian/English policy replies, memory, escalation and paused-automation handling. Existing staff-reply backend supports Instagram through its own send adapter.
- Replies go to `graph.instagram.com`; the Messenger adapter still uses `graph.facebook.com`. Instagram text chunks are conservatively limited to 1,000 UTF-16 units without splitting emoji.
- Text DMs and text postback payloads are supported. Echoes, receipts, reactions and attachment-only messages are ignored; no image/audio understanding is added.
- The shared worker retains the existing conservative 23-hour local reply cutoff. Failed, partial or interrupted sends are held for review instead of automatically resent. Inspect the actual Instagram thread before manually handling uncertain delivery.
- No live Meta configuration, account subscription or external customer message was performed during implementation. End-to-end delivery still needs the manual configuration and real-DM check above.

## References

- [Meta: Instagram API with Instagram Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/)
- [Meta: Instagram webhooks](https://developers.facebook.com/docs/instagram-platform/webhooks/)
- [Meta's official Instagram Login API collection](https://www.postman.com/meta/instagram/folder/1z5vxzu/instagram-api-with-instagram-login)
- [Meta's Send API requirements](https://www.postman.com/meta/instagram/folder/uxudqu0/send-api)
- [Meta's text-message request](https://www.postman.com/meta/instagram/request/scob1z4/text-message)

Meta's developer documentation returned rate-limit/access errors during verification; the Send API shape and messaging requirements were checked against Meta's official Postman collection. Dashboard labels/access requirements can vary by app; the steps above follow the Instagram Login screen provided.
