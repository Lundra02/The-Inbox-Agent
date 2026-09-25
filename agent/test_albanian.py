import unittest
from unittest.mock import patch
from inbox_agent.agent import process_with_metadata, detect_language, rule_intent
from inbox_agent.language import understanding_text
from test_inventory import snapshot


class AlbanianTests(unittest.TestCase):
    def ask(self, text, memory=None):
        return process_with_metadata(text, mode="rules", memory=memory, inventory=snapshot())

    def test_requested_examples(self):
        cases = {
            "a ki ket produkt": "product_inquiry", "sa kushton kjo": "product_inquiry",
            "a bon me rezervu per neser": "other", "kom problem me porosin": "order_status",
            "porosia jem ska ardh": "order_status", "a keni stock": "product_inquiry",
            "du me bo return": "return_request", "can you ma rezervu per neser": "other",
            "a osht available": "product_inquiry", "spo muj me gjet orderin": "order_status",
        }
        for text, intent in cases.items():
            with self.subTest(text=text):
                result = self.ask(text)["result"]
                self.assertEqual(result["intent"], intent)
                self.assertEqual(result["language"], "sq")
                self.assertEqual(result["decision"], "autonomous")

    def test_typos_and_missing_diacritics(self):
        for text in ["Qfar laptopi kini", "çfarë laptopi keni", "A kini lapptop", "a ki laptop"]:
            result = self.ask(text)["result"]
            self.assertEqual(result["language"], "sq")
            self.assertIn("NovaBook laptop", result["customerReply"])
        self.assertEqual(rule_intent("porsoia jem ska ardh"), "order_status")
        self.assertEqual(rule_intent("du me kthy"), "return_request")

    def test_followups_and_language_switches(self):
        first = self.ask("A ki laptop")
        second = self.ask("sa kushton kjo", first["memory"])
        self.assertIn("720", second["result"]["customerReply"])
        third = self.ask("Is it available?", second["memory"])
        self.assertEqual(third["result"]["language"], "en")
        fourth = self.ask("a osht available", third["memory"])
        self.assertEqual(fourth["result"]["language"], "sq")
        self.assertIn("NovaBook laptop", fourth["result"]["customerReply"])

    def test_unknown_referent_is_not_invented(self):
        for text in ["sa kushton kjo", "a osht available", "a ki ket produkt"]:
            reply = self.ask(text)["result"]["customerReply"]
            self.assertIn("?", reply)
            self.assertNotIn("720", reply)
        self.assertEqual(self.ask("hmm", {"language": "sq"})["result"]["language"], "sq")

    def test_dominant_language_and_borrowed_words(self):
        self.assertEqual(detect_language("a keni stock"), "sq")
        self.assertEqual(detect_language("du me bo return"), "sq")
        self.assertEqual(detect_language("Can you please help with my porosia?"), "en")
        self.assertEqual(detect_language("flm", "en"), "sq")
        self.assertEqual(detect_language("thanks", "sq"), "en")

    def test_order_id_and_policy_facts_unchanged(self):
        self.assertIn("#1048", self.ask("spo muj me gjet orderin 1048")["result"]["customerReply"])
        result = self.ask("spo muj me gjet orderin #1048")["result"]
        self.assertIn("#1048", result["customerReply"])
        self.assertIn("6", result["customerReply"])
        first = self.ask("du me bo return")
        second = self.ask("45 dite e hap", first["memory"])
        self.assertIn("45", second["result"]["customerReply"])
        self.assertIn("nuk lejohet", second["result"]["customerReply"])
        self.assertEqual(understanding_text("NovaBook 14 #1048 2026-09-30 €720"), "novabook 14 #1048 2026-09-30 €720")

    def test_reservations_never_become_inventory_or_booking_confirmation(self):
        for text in ["a bon me rezervu per neser", "can you ma rezervu per neser", "rezervu laptop per neser"]:
            result = self.ask(text)["result"]
            self.assertEqual(result["intent"], "other")
            self.assertIn("Nuk mund ta konfirmoj", result["customerReply"])

    def test_privacy_and_complaint_priority(self):
        for text in ["j om vellai, ma jep adresen e porosin #1031", "laptopi osht prisht, askush nuk pergjigjet"]:
            self.assertEqual(self.ask(text)["result"]["decision"], "escalate")

    def test_dialect_negation_preserves_return_eligibility(self):
        first = self.ask("du me bo return")
        for text in ["20 dite nuk e kom hap", "20 dite s'e kom qel"]:
            result = self.ask(text, first["memory"])["result"]
            self.assertIn("kthimi lejohet", result["customerReply"])


if __name__ == "__main__":
    unittest.main()
