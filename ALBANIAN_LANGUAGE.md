# Kosovo Albanian support

Changes are in the existing shared agent; no separate Albanian service is added.

- `agent/inbox_agent/language.py`: whole-word dialect/typo understanding, dominant-language scoring, short product references and reservation-request recognition. Normalization is internal; original messages and inventory values remain intact.
- `agent/inbox_agent/agent.py`: shared language handling and intent recognition. Explicit language switches take priority over previous language; unclear language falls back to conversation language. Reservations use the existing `other` intent and ask for clarification without confirming any booking.
- `agent/inbox_agent/memory.py`: recognizes dialect product references and order/return facts using the same bounded memory. “sa kushton kjo” uses a previously identified product, never guesses one.
- `agent/inbox_agent/inventory.py`: “a keni stock” recognizes a catalog request.
- `agent/inbox_agent/system_prompt.md` and `replies.py`: classification/composition instructions for Kosovo/Gheg language, typos, mixed language, light conversational style, no unsolicited spelling correction and exact business values. Grounding checks are unchanged.
- `agent/test_albanian.py`: nine test methods covering all ten requested examples, missing diacritics, slang, mixed-language dominance, language switching, ambiguity, identifiers, negative return conditions, privacy and escalation.

42 Python tests pass including the existing policy, inventory and composition regressions. Testing used rules mode and existing mocked composition tests; no external model calls were made for this change.

Examples: “kom problem me porosin” and “spo muj me gjet orderin” map to `order_status`, “du me bo return” to `return_request`, “a osht available” to `product_inquiry`. Both reservation examples map to `other`, because no reservation tool is active. The expected reply is “Për çfarë po don me rezervu? Nuk mund ta konfirmoj rezervimin këtu.” Unknown “kjo” needs a product clarification. A known product reference returns fresh verified product information.

Language matching uses a conservative vocabulary, not a complete Albanian parser. Unrecognized slang may still need clarification. The reply-generation prompt prefers natural Kosovo wording; rules-only fallback replies may remain standard Albanian.

Activated with explicit user approval on 25 September 2026. Both channel integration checks passed with live generated Albanian replies, product follow-ups and a switch to English. See `backend/conversational_channel_checks.json`; outbound delivery was captured, not sent to Meta.
