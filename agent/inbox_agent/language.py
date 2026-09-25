"""Conservative chat-language understanding; never rewrite stored business values."""
import re
import unicodedata


def fold(text):
    return "".join(c for c in unicodedata.normalize("NFD", text.casefold()) if unicodedata.category(c) != "Mn")


def understanding_text(text):
    # Only known whole-word variants, not fuzzy edits to names, IDs or numbers.
    aliases = {"porosin": "porosine", "porosinn": "porosine", "porsoia": "porosia",
               "orderin": "order", "orderi": "order", "kthy": "kthej", "kthyme": "kthim",
               "kthym": "kthim", "hap": "hapur", "qel": "hapur", "qelur": "hapur",
               "mshel": "mbyllur", "mbyllun": "mbyllur", "prisht": "prishur"}
    value = fold(text)
    value = re.sub(r"\b(?:nuk e (?:kom|kam)|s['’]?e (?:kom|kam)) (?:hap|qel|hapur|qelur)\b", "pa hapur", value)
    return re.sub(r"\b[a-z]+\b", lambda m: aliases.get(m.group(), m.group()), value)


SQ = set("ki kini keni ket kete kjo qet qita sa kushton bon rezervu neser kom kam porosin porosine porosia jem ska ardh osht eshte spo muj gjet orderin orderi du dua deshiroj bo nje ni produkt produt produkte stok stoku kufje karikues ende ardhur kalu kaluar dite mund blej keste pershendetje tung flm faleminderit kthim kthej kthy hapur hap qel mbyllur vella vellai adresa prishur prisht qfare qfar cfare cfar cka laptopi laptopin porsoia cmimi qmimi qysh nese persh".split())
EN = set("can could you i we have has is are it this that the my please how much what which want need would like buy return refund order available stock tomorrow thanks hello hi help with where when not unopened opened days price reserve book reservation appointment".split())


def language_evidence(text):
    words = re.findall(r"[a-z]+", fold(text))
    sq = sum(word in SQ or word in {"ju", "lutem"} for word in words)
    en = sum(word in EN for word in words)
    # Kosovo grammatical frames remain Albanian with borrowed commerce words.
    value = fold(text)
    if re.search(r"\b(?:a (?:ki|kini|keni|osht|bon)|(?:du|dua) me bo|spo muj|kom problem|sa kushton)\b", value):
        sq += 2
    return sq, en


def chat_language(text, previous=None):
    sq, en = language_evidence(text)
    if sq > en:
        return "sq"
    if en > sq:
        return "en"
    return previous if previous in {"sq", "en"} else ("sq" if sq else "en")


def reservation_request(text):
    return bool(re.search(r"\b(?:rezerv\w*|reserv\w*|book(?:ing)?|appointment)\b", fold(text)))


def product_reference(text):
    return bool(re.fullmatch(r"\s*(?:sa (?:kushton|kushtojn)(?: (?:kjo|ky|qekjo))?|a (?:osht|eshte) (?:available|ne stok)|a (?:ki|keni) (?:ket|kete|qet) produkt)\s*[?!.]*", fold(text)))
