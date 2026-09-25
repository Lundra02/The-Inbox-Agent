"""Active Inbox Agent /chat contract; mechanic-specific contract is retired."""
import unittest
from unittest.mock import patch
from pydantic import ValidationError
import main

class InboxChatContractTests(unittest.TestCase):
    def test_result_and_compatible_reply_match(self):
        result = {"language": "en", "intent": "complaint_escalation", "decision": "escalate", "customerReply": "Sorry about this.", "internalNote": "Staff review needed"}
        output = {"result": result, "engine": "rules", "fallbackReason": None, "elapsedMs": 1}
        with patch.object(main, "process_with_metadata", return_value=output) as process:
            reply = main.chat(main.ChatRequest(message="Complaint", channel="messenger"))
        self.assertEqual(reply.reply, result["customerReply"])
        self.assertEqual(reply.result, result)
        self.assertNotIn("Staff review", reply.reply)
        process.assert_called_once_with("Complaint", memory={})

    def test_blank_message_rejected(self):
        with self.assertRaises(ValidationError):
            main.ChatRequest(message="   ")

if __name__ == "__main__":
    unittest.main()
