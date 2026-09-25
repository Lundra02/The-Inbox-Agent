import unittest
from unittest.mock import patch, Mock
from inbox_agent.agent import process_with_metadata
from inbox_agent.inventory import load_inventory


def snapshot(quantity=4, incoming=0, arrival=""):
    return {"checkedAt": "2026-09-25T10:00:00Z", "items": [{"sku": "laptop-14", "name": "NovaBook laptop", "aliases": ["laptop", "laptopin"], "quantity": quantity, "incomingQuantity": incoming, "expectedArrival": arrival, "priceEUR": 720, "installmentsEligible": True}]}


class InventoryTests(unittest.TestCase):
    def test_reported_albanian_conversation(self):
        memory = {}
        for text in ["A kini lapptop", "Qfare kini", "Deshiroj nje produt te ri", "Qfar laptopi kini"]:
            with self.subTest(text=text):
                output = process_with_metadata(text, mode="rules", inventory=snapshot(), memory=memory)
                memory = output["memory"]
                self.assertEqual(output["result"]["language"], "sq")
                self.assertIn("NovaBook laptop", output["result"]["customerReply"])
                self.assertIn("4 në stok", output["result"]["customerReply"])

    def test_category_does_not_list_unrelated_products(self):
        stock = snapshot()
        stock["items"].append({**stock["items"][0], "sku": "charger", "name": "USB Charger", "aliases": ["charger"]})
        self.assertNotIn("USB Charger", self.reply(stock, "Qfar laptopi kini"))
        self.assertIn("USB Charger", self.reply(stock, "Qfare kini"))

    def test_browsing_empty_or_unavailable_catalog(self):
        self.assertIn("nuk ka produkte", self.reply({"items": []}, "Qfare kini"))
        self.assertIn("Nuk mund ta kontrolloj", self.reply(None, "Qfare kini"))

    def reply(self, inventory, text="Is the laptop available?"):
        return process_with_metadata(text, mode="rules", inventory=inventory)["result"]["customerReply"]

    def test_available(self):
        self.assertIn("4 in stock", self.reply(snapshot()))

    def test_missing(self):
        self.assertIn("out of stock; no restock", self.reply(snapshot(0)))

    def test_incoming(self):
        reply = self.reply(snapshot(0, 12, "2099-10-01"))
        self.assertIn("12 units are incoming", reply)
        self.assertIn("2099-10-01", reply)
        self.assertIn("not a guarantee", reply)

    def test_unavailable_never_claims_static_stock(self):
        self.assertIn("can't confirm availability", self.reply(None))

    def test_lookup_is_fresh_for_every_product_question(self):
        with patch("inbox_agent.agent.load_inventory", side_effect=[snapshot(4), snapshot(0)]) as lookup:
            first = process_with_metadata("laptop", mode="rules")
            second = process_with_metadata("laptop", mode="rules", memory=first["memory"])
        self.assertEqual(lookup.call_count, 2)
        self.assertIn("4 in stock", first["result"]["customerReply"])
        self.assertIn("out of stock", second["result"]["customerReply"])

    def test_albanian_installments_respect_stock(self):
        text = "A mund ta blej laptopin me këste?"
        self.assertIn("6 këste", self.reply(snapshot(), text))
        self.assertIn("Nuk mund ta konfirmoj", self.reply(snapshot(0), text))

    def test_unknown_product_does_not_claim_other_product_stock(self):
        self.assertIn("Which product", self.reply(snapshot(), "Is iPhone available?"))

    def test_malformed_stock_fails_closed(self):
        response = Mock()
        response.json.return_value = snapshot(-1)
        with patch("inbox_agent.inventory.requests.get", return_value=response):
            self.assertIsNone(load_inventory())

    def test_non_product_policy_does_not_need_stock(self):
        with patch("inbox_agent.agent.load_inventory") as lookup:
            result = process_with_metadata("Can I return headphones after 45 days? Box is open.", mode="rules")
        lookup.assert_not_called()
        self.assertIn("denied", result["result"]["customerReply"])


if __name__ == "__main__":
    unittest.main()
