# Conversational replies

## Implementation and activation

Activated with explicit user approval on 25 September 2026. The agent, backend and proxy were restarted. Live Groq examples are saved in `agent/inbox_agent/conversational_examples.json`.

43 Python tests pass. The two channel integration checks passed with signed HTTP intake, isolated MongoDB storage, the live FastAPI/Groq agent, follow-up memory, language switching and captured send adapters. Evidence: `backend/conversational_channel_checks.json`. Public webhook challenges also pass. Outbound test messages were captured locally; these checks do not prove Meta-to-phone delivery. A human-sent DM on each platform remains the final external verification.

The existing Groq configuration is reused. `INBOX_AGENT_MODE=rules` remains an offline fallback. Both classification and composition mask known environment secrets, common labeled credentials, token patterns, card/bank details, emails and phone patterns. This is best-effort masking, not complete anonymization. Conversation context remains bounded to six messages (three turns).

## Existing flow extended

`agent/inbox_agent/agent.py` still classifies, contextualizes, fetches live inventory, and calls `apply_policy`. `inventory.py` still supplies current stock/price/arrival facts. These functions now supply the authoritative response and fallback rather than always being the final wording. Product answers, returns, order answers, complaint acknowledgments, greetings and clarification wording can be generated. Privacy refusals and failures retain fixed safe responses.

`replies.py` composes the reply using the current message, language, unchanged decision, authoritative response and up to six history messages (three turns). It receives no internal notes, raw customer/order database records or account identity. Past replies cannot override current facts. The history is kept in the existing per-conversation memory, so channel isolation, serialization and reset-on-resolution continue to apply. Known private fixture data and common email/phone patterns are redacted; arbitrary personal data in free text may still be present. No cross-user training is performed.

The active electronics app has no appointment tools. The prompt explicitly says appointment availability is unavailable and forbids booking times/promises. Legacy appointment logic is untouched. No new database action is delegated to the model.

## Grounding and fallback

- Model output can set only `reply`; it cannot change escalation, intent, inventory, staff notes, or execute refunds/bookings.
- Strict schema/length, new-number, URL/email and known-private-value checks run locally.
- A separate model review checks semantic support, language, preserved conditions, denial reasons and unexecuted-action claims. This is an additional safeguard, not a mathematical guarantee against hallucination; semantic checks remain probabilistic.
- Any timeout, malformed output or failed review returns the original policy reply, labeled `replyEngine=fallback`. Strict privacy is `strict_policy`; successful composition is `generated`; offline mode is `rules`.
- Each call has a timeout and no SDK retries. The backend timeout is 45 seconds for up to three model calls; this increases latency and token cost relative to classification-only mode.

No output is allowed merely because it sounds plausible. A catalog answer can remain longer than three sentences to preserve all material stock facts. Numerical formatting is deliberately strict and may cause otherwise acceptable rewordings to fall back.

## Illustrative before/after (not live model evidence)

- Customer: “A kini lapptop”
  - Before: “NovaBook 14 laptop: 8 në stok, €720.”
  - Possible after: “Po, kemi NovaBook 14! Kushton €720 dhe aktualisht kemi 8 në stok.”
- Customer: “Can I return headphones after 45 days? Box is open.”
  - Before: “The return is denied under our policy: 45 days exceeds the 30-day return window; the box is open and returns require an unopened product.”
  - Possible after: “Sorry, these wouldn't qualify for a return: 45 days is beyond our 30-day window, and the box needs to be unopened.”
- Customer: “Hello!”
  - Before: “Could you tell us whether you need help with an order, return or product?”
  - Possible after: “Hi! What can I help you with today?”

Actual wording varies, and fallback wording remains unchanged. Stock numbers above are example fixture values, never promises of future availability.

## Checks

33 Python tests pass, covering existing policies, Albanian inventory questions, generation success with mocked outputs, invented numbers, semantic review rejection, malformed output, privacy, isolated bounded history, and rules-only mode. 26 backend tests pass, including both channel adapters and human handoff. Live synthetic generation and both channel integration checks now pass.
