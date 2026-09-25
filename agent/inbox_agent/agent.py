"""Classification, deterministic policy enforcement, then grounded reply composition.

The LLM never receives private order data and never decides whether to disclose it.
Rule fallback remains usable when credentials/quota are unavailable.
"""
import json
import os
import re
import time
import unicodedata
from pathlib import Path
from typing import Literal
from pydantic import BaseModel, ConfigDict
from openai import OpenAI
from .mock_data import ORDERS, POLICY
from .memory import contextualize
from .inventory import load_inventory, product_reply, matching_products, catalog_request, normalized as product_normalized
from .replies import compose, history_from, remember, redact
from .language import chat_language, language_evidence, understanding_text, reservation_request, product_reference

LIVE_INVENTORY = object()


class Classification(BaseModel):
    model_config = ConfigDict(extra="forbid")
    language: Literal["sq", "en"]
    intent: Literal["order_status", "return_request", "complaint_escalation", "third_party_info_request", "product_inquiry", "other"]


class Result(Classification):
    decision: Literal["autonomous", "escalate"]
    customerReply: str
    internalNote: str | None


def normalized(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if unicodedata.category(c) != "Mn")


def detect_language(text, previous=None):
    return chat_language(text, previous)


def rule_intent(text):
    value = understanding_text(text)
    private = re.search(r"\b(address|phone|adresa|adresen|telefon\w*)\b", value)
    third = re.search(r"\b(brother|sister|wife|husband|friend|cousin|relative|vell\w*|motr\w*|shok\w*|bashk\w*)\b", value)
    if private or (third and re.search(r"\b(order|porosi\w*)\b|#\d+", value)):
        return "third_party_info_request"
    if re.search(r"3rd|third time|nobody|no one answers|broken|faulty|damaged|angry|furious|her[ae].*tret|askush|nuk.*pergjigj|prishur", value):
        return "complaint_escalation"
    if re.search(r"\b(return\w*|refund\w*|kthej|kthim\w*)\b", value):
        return "return_request"
    if re.search(r"\b(order|porosi\w*|delivery|deliver\w*|shipping)\b|#\d+", value):
        return "order_status"
    if reservation_request(text):
        return "other"
    if product_reference(text):
        return "product_inquiry"
    if catalog_request(text) or re.search(r"\b(laptop|produkt\w*)\b", product_normalized(text)):
        return "product_inquiry"
    if re.search(r"\b(laptop\w*|headphones|kufje\w*|charger|karikues\w*|stock|stok\w*|inventory|available|availability|missing|coming|buy|blej|keste|installment\w*|payment\w*|price|cmim\w*)\b", value):
        return "product_inquiry"
    return "other"


def process_with_metadata(message_text, *, mode=None, memory=None, inventory=LIVE_INVENTORY):
    started = time.perf_counter()
    message_text = message_text.strip()
    if not message_text or len(message_text) > 10000:
        raise ValueError("Message must contain 1–10000 characters")
    language = detect_language(message_text, memory.get("language") if isinstance(memory, dict) else None)
    intent = rule_intent(message_text)
    engine = "rules"
    fallback = None
    mode = mode or os.getenv("INBOX_AGENT_MODE", "hybrid")
    if mode != "rules":
        if not os.getenv("GROQ_API_KEY"):
            fallback = "AI credentials unavailable; policy rules used"
        else:
            try:
                model = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
                client = OpenAI(api_key=os.environ["GROQ_API_KEY"], base_url=os.getenv("GROQ_BASE_URL", "https://api.groq.com/openai/v1"), timeout=12, max_retries=0)
                answer = client.chat.completions.create(
                    model=model, messages=[{"role": "system", "content": Path(__file__).with_name("system_prompt.md").read_text(encoding="utf-8")}, {"role": "user", "content": redact(message_text)}],
                    response_format={"type": "json_object"}, max_tokens=256, temperature=0,
                    **({"reasoning_effort": "low"} if model.startswith("openai/gpt-oss-") else {}),
                )
                predicted = Classification.model_validate_json(answer.choices[0].message.content)
                # Hard policy routing wins; the model helps on unfamiliar wording only.
                if intent == "other":
                    if not reservation_request(message_text):
                        intent = predicted.intent
                    if not any(language_evidence(message_text)):
                        language = predicted.language
                engine = "hybrid"
            except Exception as error:
                fallback = f"AI classification unavailable ({type(error).__name__}); policy rules used"
    effective, intent, language, updated_memory = contextualize(message_text, memory, intent, language)
    stock_check = None
    if intent in {"product_inquiry", "other"}:
        if inventory is LIVE_INVENTORY:
            inventory = load_inventory()
        matches = matching_products(effective, inventory) if inventory else []
        if matches and not reservation_request(message_text):
            intent = "product_inquiry"
            updated_memory["intent"] = intent
        if intent == "product_inquiry":
            stock_check = {"available": inventory is not None, "checkedAt": inventory.get("checkedAt") if inventory else None, "source": "shop_inventory"}
            if len(matches) == 1:
                updated_memory["productSku"] = matches[0]["sku"]
            elif inventory is not None:
                updated_memory.pop("productSku", None)
    else:
        inventory = None
    result = apply_policy(effective, language, intent, inventory)
    if intent == "other" and reservation_request(message_text):
        result["customerReply"] = ("Për çfarë po don me rezervu? Nuk mund ta konfirmoj rezervimin këtu." if language == "sq" else "What would you like to reserve? I can't confirm a reservation here.")
    history = history_from(memory)
    reply_engine, reply_fallback = "rules", None
    if mode != "rules":
        result["customerReply"], reply_engine, reply_fallback = compose(message_text, result, history)
    # Defense in depth: no raw private field may appear in any output.
    serialized = json.dumps(result, ensure_ascii=False)
    if any(order[field] in serialized for order in ORDERS.values() for field in ("address", "phone")):
        result = apply_policy(message_text, language, "third_party_info_request")
        reply_engine = "strict_policy"
    if result["intent"] != "third_party_info_request":
        updated_memory["replyHistory"] = remember(history, message_text, result["customerReply"])
    return {"result": result, "memory": updated_memory, "stockCheck": stock_check, "engine": engine, "fallbackReason": fallback, "replyEngine": reply_engine, "replyFallbackReason": reply_fallback, "elapsedMs": round((time.perf_counter() - started) * 1000)}


def apply_policy(text, language, intent, inventory=None):
    sq = language == "sq"
    value = understanding_text(text)
    decision, note = "autonomous", None
    if intent == "third_party_info_request":
        decision = "escalate"
        reply = "Për të mbrojtur privatësinë, nuk mund të ndaj adresën, telefonin ose të dhënat personale të një porosie. Ju lutem kërkojini mbajtësit të llogarisë të na kontaktojë; kërkesa do të shqyrtohet nga stafi." if sq else "To protect customer privacy, I can't share an order's address, phone number or personal details. Please ask the account holder to contact us directly; this request will be reviewed by our team."
        note = "Priority: high. Sensitive account information requested without verified ownership. Do not disclose personal data; staff must verify the account holder through an approved channel."
    elif intent == "complaint_escalation":
        decision = "escalate"
        reply = "Më vjen keq për problemin dhe vështirësinë që keni hasur. E kuptoj shqetësimin tuaj. Mesazhi juaj do t'i kalojë ekipit me përparësi për të shqyrtuar problemin dhe hapat e mëtejshëm." if sq else "I'm sorry about the problem and the difficulty you've had getting help. I understand how frustrating that is. Your message will go to our team with high priority to review the problem and arrange the next steps."
        note = "Priority: urgent. Repeated/unresolved complaint and frustrated customer. Review prior contacts and the reported product fault; a human must take ownership. No repair/refund promise made."
    elif intent == "return_request":
        match = re.search(r"\b(\d+)\s*(?:days?|dite)\b", value)
        days = int(match.group(1)) if match else None
        unopened = bool(re.search(r"\b(unopened|sealed|not\s+open(?:ed)?|never\s+opened|pa\s+hapur|pahapur|e\s+mbyllur)\b", value))
        opened = bool(re.search(r"\b(open|opened|hapur)\b", value)) and not unopened
        denied_time = days is not None and days > POLICY["returnDays"]
        if denied_time or opened:
            reasons = []
            if denied_time:
                reasons.append(f"kanë kaluar {days} ditë, më shumë se afati 30-ditor" if sq else f"{days} days exceeds the 30-day return window")
            if opened:
                reasons.append("kutia është hapur, ndërsa pranojmë vetëm produkte të pahapura" if sq else "the box is open and returns require an unopened product")
            reply = ("Kthimi nuk lejohet sipas politikës sonë: " if sq else "The return is denied under our policy: ") + "; ".join(reasons) + "."
        elif days is not None and unopened:
            reply = "Sipas të dhënave që dhatë, kthimi lejohet: është brenda 30 ditëve dhe produkti është i pahapur. Cili është numri i porosisë për udhëzimet e kthimit?" if sq else "Based on the facts you provided, the return is approved under our policy: it is within 30 days and the product is unopened. What is your order number so we can provide return instructions?"
        else:
            reply = "Sa ditë kanë kaluar nga marrja e produktit dhe a është ende i pahapur?" if sq else "How many days has it been since you received the product, and is it still unopened?"
    elif intent == "order_status":
        match = re.search(r"(?:#|\border\s*|\bporosi\w*\s*)(\d+)", value)
        order = ORDERS.get(match.group(1)) if match else None
        if not match:
            reply = "Cili është numri i porosisë suaj?" if sq else "What is your order number?"
        elif not order:
            reply = "Nuk e gjeta këtë porosi në të dhënat tona. A mund ta kontrolloni numrin e porosisë?" if sq else "I couldn't find that order in our records. Could you check the order number?"
        elif order["status"] != "delivered" and order["workingDaysSincePlaced"] > 4:
            reply = f"Më vjen keq për vonesën. Porosia #{order['orderId']} është ende në transport; kanë kaluar {order['workingDaysSincePlaced']} ditë pune, përtej afatit normal prej 2–4 ditësh pune. Nuk kemi ende një datë të re të konfirmuar nga korrieri." if sq else f"I'm sorry for the delay. Order #{order['orderId']} is still in transit after {order['workingDaysSincePlaced']} working days, beyond our usual 2–4 working days. We do not yet have a confirmed revised delivery date from the courier."
        else:
            status = {"processing": "në përpunim", "delivered": "e dorëzuar", "in transit": "në transport"}[order["status"]] if sq else order["status"]
            reply = f"Porosia #{order['orderId']} është {status}. Afati normal i dorëzimit është 2–4 ditë pune." if sq else f"Order #{order['orderId']} is {status}. Normal delivery takes 2–4 working days."
    elif intent == "product_inquiry":
        reply = product_reply(text, language, inventory)
    else:
        reply = "A mund të na tregoni nëse pyetja juaj lidhet me një porosi, kthim apo produkt?" if sq else "Could you tell us whether you need help with an order, return or product?"
    return Result(language=language, intent=intent, decision=decision, customerReply=reply, internalNote=note).model_dump()


def process_message(message_text, order_lookup_hint=None):
    # Identity is never established by the hint or an order number.
    return process_with_metadata(message_text)["result"]
