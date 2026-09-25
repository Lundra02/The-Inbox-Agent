"""Bounded, non-sensitive dialogue facts; no inferred identity or verification."""
import re
import unicodedata
from .language import understanding_text, product_reference


def clean(text):
    return understanding_text(text)


def contextualize(message, memory, intent, language):
    memory = memory if isinstance(memory, dict) else {}
    value = clean(message)
    order = re.search(r"(?:#|\border\s*|\bporosi\w*\s*)(\d+)", value)
    days = re.search(r"\b(\d+)\s*(?:days?|dite)\b", value)
    condition = None
    if re.search(r"\b(unopened|sealed|not open(?:ed)?|never opened|pa hapur|pahapur|mbyllur)\b", value):
        condition = "unopened"
    elif re.search(r"\b(open|opened|hapur)\b", value):
        condition = "open"
    # Only recognizable short answers inherit the pending topic, never arbitrary text.
    short_answer = bool(days or condition or order or re.fullmatch(r"\s*\d{3,8}\s*", value))
    previous = memory.get("intent")
    topic = intent
    product_followup = bool(re.fullmatch(r"\s*(when (?:will|does) (?:it|that|this) (?:arrive|come|come back)|(?:can i|could i|can we) pay (?:monthly|in installments)|(?:is it|is that) (?:available|in stock)|how much (?:is it|does it cost)|kur (?:vjen|mberrin|do te vije)|a mund (?:ta paguaj|te paguaj) (?:me keste|cdo muaj))\s*[?!.]*", value))
    product_followup = product_followup or product_reference(message)
    if previous == "product_inquiry" and memory.get("productSku") and product_followup and intent not in {"third_party_info_request", "complaint_escalation", "return_request"}:
        topic = "product_inquiry"
    if short_answer and previous == "return_request" and intent in {"other", "order_status"}:
        topic = previous
    elif short_answer and previous == "order_status" and intent == "other":
        topic = previous
    facts = dict(memory) if topic == previous and topic in {"return_request", "order_status", "product_inquiry"} else {}
    facts = {key: val for key, val in facts.items() if key in {"intent", "language", "orderId", "returnDays", "condition", "productSku"}}
    if order:
        # A different order begins a different return assessment.
        if facts.get("orderId") and facts["orderId"] != order.group(1):
            facts.pop("returnDays", None); facts.pop("condition", None)
        facts["orderId"] = order.group(1)
    elif topic == "order_status" and re.fullmatch(r"\s*\d{3,8}\s*", value):
        facts["orderId"] = value.strip()
    if days and topic == "return_request":
        facts["returnDays"] = min(int(days.group(1)), 100000)
    if condition and topic == "return_request":
        facts["condition"] = condition
    if short_answer and not re.search(r"[a-z]", value):
        language = memory.get("language", language)
    facts.update(intent=topic, language=language)
    effective = message
    if topic == "product_inquiry" and product_followup and facts.get("productSku"):
        effective += f" {facts['productSku']}"
    if topic == "order_status" and facts.get("orderId") and not order:
        effective += f" order #{facts['orderId']}"
    if topic == "return_request":
        # Normalize only established facts; current answers replace previous conditions.
        effective = "return " + (f"{facts['returnDays']} days " if "returnDays" in facts else "") + facts.get("condition", "")
    return effective, topic, language, facts
