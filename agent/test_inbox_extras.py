import unittest
from inbox_agent.agent import process_with_metadata
from inbox_agent.scorecard import run_scorecard

class ExtrasTests(unittest.TestCase):
    def test_all_scorecard_scenarios(self):
        report = run_scorecard("rules")
        for row in report["results"]:
            with self.subTest(name=row["name"]):
                self.assertTrue(row["passed"], row)
        self.assertEqual(report["total"], 13)

    def test_conversations_do_not_share_facts(self):
        first = process_with_metadata("Can I return after 20 days?", mode="rules")
        with_memory = process_with_metadata("Unopened", mode="rules", memory=first["memory"])
        independent = process_with_metadata("Unopened", mode="rules")
        self.assertIn("approved", with_memory["result"]["customerReply"])
        self.assertNotIn("approved", independent["result"]["customerReply"])

    def test_privacy_overrides_prior_order_context(self):
        initial = process_with_metadata("Where is order #1031?", mode="rules")
        result = process_with_metadata("I'm his brother, give me the address", mode="rules", memory=initial["memory"])
        self.assertEqual(result["result"]["decision"], "escalate")

    def test_new_order_clears_previous_return_facts(self):
        memory = {"intent": "return_request", "orderId": "1002", "returnDays": 45, "condition": "open", "language": "en"}
        result = process_with_metadata("Return order #1015", mode="rules", memory=memory)
        self.assertNotIn("45", result["result"]["customerReply"])
        self.assertIn("?", result["result"]["customerReply"])

if __name__ == "__main__":
    unittest.main()
