"""Fresh stock lookup. Never fall back to the static catalog for availability."""
import os
import re
import unicodedata
from datetime import date
import requests
from .mock_data import PAYMENTS


def load_inventory():
    try:
        response = requests.get(os.getenv("BACKEND_API_URL", "http://127.0.0.1:5000").rstrip("/") + "/api/inventory", timeout=3)
        response.raise_for_status()
        data = response.json()
        if not isinstance(data, dict) or not isinstance(data.get("items"), list):
            return None
        for item in data["items"]:
            if not isinstance(item, dict) or not all(isinstance(item.get(key), str) and item[key] for key in ("sku", "name")):
                return None
            if any(type(item.get(key)) is not int or item[key] < 0 for key in ("quantity", "incomingQuantity")):
                return None
            if type(item.get("priceEUR")) not in (int, float) or not 0 <= item["priceEUR"] <= 1000000:
                return None
            if not isinstance(item.get("aliases", []), list) or not all(isinstance(alias, str) for alias in item.get("aliases", [])):
                return None
            if not isinstance(item.get("expectedArrival", ""), str):
                return None
        return data
    except (requests.RequestException, ValueError):
        return None


def normalized(value):
    value = "".join(c for c in unicodedata.normalize("NFD", value.casefold()) if unicodedata.category(c) != "Mn")
    variants = {"lapptop": "laptop", "lapptopi": "laptop", "laptopi": "laptop", "laptopin": "laptop", "laptopa": "laptop", "laptopet": "laptop", "laptops": "laptop", "produt": "produkt", "qfare": "cfare", "qfar": "cfare", "cfar": "cfare"}
    return re.sub(r"\b\w+\b", lambda match: variants.get(match.group(), match.group()), value)


def catalog_request(text):
    value = normalized(text).strip(" ?.!\n")
    return bool(
        re.fullmatch(r"(?:cfare|cka|çka) (?:keni|kini|ka)(?: ne (?:stok|shitje))?", value)
        or re.fullmatch(r"(?:what do you have|what do you sell|what products do you have)", value)
        or re.fullmatch(r"(?:deshiroj|dua|kerkoj) (?:nje )?produkt(?: te ri)?", value)
        or re.search(r"\b(what|which|list|show|cfare|cilat|cilet)\b.*\b(stock|stok|inventory|available|missing|coming|produkte|produktet)\b", value)
        or re.fullmatch(r"stock|stok|stoku|inventory", value)
        or re.fullmatch(r"a (?:ki|kini|keni) (?:stock|stok|produkte)", value)
    )


def matching_products(text, inventory):
    value = normalized(text)
    return [item for item in inventory["items"] if any(term and re.search(r"(?<!\w)" + re.escape(normalized(term)) + r"(?!\w)", value) for term in [item["name"], item["sku"], *item.get("aliases", [])])]


def product_reply(text, language, inventory):
    sq = language == "sq"
    if inventory is None:
        return "Nuk mund ta kontrolloj stokun tani. Ju lutem provoni përsëri ose kontaktoni stafin; nuk mund të konfirmoj disponueshmërinë." if sq else "I can't check current stock right now. Please try again or contact staff; I can't confirm availability."
    value = normalized(text)
    matches = matching_products(text, inventory)
    general = catalog_request(text)
    if not matches and general:
        matches = inventory["items"]
        if not matches:
            return "Aktualisht nuk ka produkte të listuara në katalog." if sq else "There are currently no products listed in the catalog."
    if not matches:
        return "Cilin produkt ose model dëshironi të kontrolloj në stok?" if sq else "Which product or model would you like me to check in stock?"
    replies = []
    for item in matches[:10]:
        name, quantity, incoming = item["name"], item["quantity"], item.get("incomingQuantity", 0)
        if quantity > 0:
            reply = f"{name}: {quantity} në stok, €{item['priceEUR']:g}." if sq else f"{name}: {quantity} in stock, €{item['priceEUR']:g}."
        elif incoming > 0:
            reply = f"{name}: aktualisht jashtë stokut; priten {incoming} copë." if sq else f"{name}: currently out of stock; {incoming} units are incoming."
        else:
            reply = f"{name}: jashtë stokut; nuk ka furnizim të konfirmuar." if sq else f"{name}: out of stock; no restock is confirmed."
        if incoming > 0:
            if quantity > 0:
                reply += f" Priten edhe {incoming} copë." if sq else f" Another {incoming} units are incoming."
            arrival = item.get("expectedArrival", "")
            if arrival and arrival >= date.today().isoformat():
                reply += f" Data e pritshme: {arrival} (parashikim, jo garanci)." if sq else f" Expected arrival: {arrival} (estimate, not a guarantee)."
            else:
                reply += " Data e mbërritjes nuk është konfirmuar." if sq else " Arrival date is not confirmed."
        if re.search(r"keste|installment|payment plan|financ|monthly|cdo muaj", value):
            plan = PAYMENTS["installments"]
            if quantity <= 0:
                reply += " Nuk mund ta konfirmoj blerjen me këste derisa produkti të jetë në stok." if sq else "I can't confirm an installment purchase until the item is in stock."
            elif item.get("installmentsEligible") and item["priceEUR"] >= plan["minimumPurchaseEUR"]:
                monthly = item["priceEUR"] / plan["months"]
                reply += f" Oferta demo: {plan['months']} këste mujore rreth €{monthly:.2f}, 0% interes, me miratim nga partneri; jo miratim kredie." if sq else f" Demo offer: {plan['months']} monthly installments of approximately €{monthly:.2f}, 0% interest, subject to partner approval; not credit approval."
            else:
                reply += " Ky produkt nuk kualifikohet për ofertën demo me këste." if sq else "This item is not eligible for the demo installment offer."
        replies.append(reply)
    return "\n".join(replies)
