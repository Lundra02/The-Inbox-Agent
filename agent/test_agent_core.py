import os
import sys
import unittest
from types import SimpleNamespace
from unittest.mock import patch

sys.path.insert(0, os.path.dirname(__file__))

import agent_core


class ToolCallingLoopTests(unittest.TestCase):
    def test_tool_result_is_sent_back_before_final_reply(self):
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="lookup_vehicle",
                arguments='{"make":"Volkswagen","model":"Golf 7","year":2016}',
            ),
        )
        first_message = SimpleNamespace(
            tool_calls=[tool_call],
            model_dump=lambda **_kwargs: {"role": "assistant", "tool_calls": []},
        )
        second_message = SimpleNamespace(tool_calls=None, content="The 1.6 TDI is available.")
        completions = [
            SimpleNamespace(choices=[SimpleNamespace(message=first_message)]),
            SimpleNamespace(choices=[SimpleNamespace(message=second_message)]),
        ]
        create = unittest.mock.Mock(side_effect=completions)
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}), patch.object(agent_core, "OpenAI", return_value=client), patch.object(agent_core.tools, "lookup_vehicle", return_value={"engineOptions": ["1.6 TDI"]}):
            reply, structured_output = agent_core.process_message(
                customer_phone="+15555550123",
                message="Which engine is in my Golf?",
                conversation_history=[],
                backend_api_url="http://localhost:5000",
            )

        self.assertEqual(reply, "The 1.6 TDI is available.")
        self.assertEqual(structured_output["toolResults"][0]["name"], "lookup_vehicle")
        messages = create.call_args_list[1].kwargs["messages"]
        self.assertEqual(messages[-1]["role"], "tool")
        self.assertEqual(messages[-1]["tool_call_id"], "call_1")

    def test_final_fallback_has_no_tools(self):
        tool_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(
                name="lookup_vehicle",
                arguments='{"make":"Volkswagen","model":"Golf 7","year":2016}',
            ),
        )
        first_message = SimpleNamespace(tool_calls=[tool_call])
        final_message = SimpleNamespace(tool_calls=None, content="Your Golf is booked for diagnostics.")
        completions = [
            SimpleNamespace(choices=[SimpleNamespace(message=first_message, finish_reason="tool_calls")]),
            SimpleNamespace(choices=[SimpleNamespace(message=final_message)]),
        ]
        create = unittest.mock.Mock(side_effect=completions)
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}), patch.object(agent_core, "MAX_TOOL_ROUNDS", 1), patch.object(agent_core, "OpenAI", return_value=client), patch.object(agent_core.tools, "lookup_vehicle", return_value={"engineOptions": ["1.6 TDI"]}):
            reply, _ = agent_core.process_message(
                customer_phone="+15555550123",
                message="Which engine is in my Golf?",
                conversation_history=[],
                backend_api_url="http://localhost:5000",
            )

        self.assertEqual(reply, "Your Golf is booked for diagnostics.")
        final_request = create.call_args_list[1].kwargs
        self.assertNotIn("tools", final_request)
        self.assertNotIn("tool_choice", final_request)
        self.assertEqual(final_request["max_tokens"], 300)
        self.assertEqual(len(final_request["messages"]), 2)
        self.assertTrue(all("tool_calls" not in message for message in final_request["messages"]))

    def test_duplicate_vehicle_lookup_uses_cached_result(self):
        first_call = SimpleNamespace(
            id="call_1",
            function=SimpleNamespace(name="lookup_vehicle", arguments='{"make":"Volkswagen","model":"Golf 7","year":2016}'),
        )
        duplicate_call = SimpleNamespace(
            id="call_2",
            function=SimpleNamespace(name="lookup_vehicle", arguments='{"make":"Volkswagen","model":"Golf","year":2016}'),
        )
        completions = [
            SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=[first_call]), finish_reason="tool_calls")]),
            SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=[duplicate_call]), finish_reason="tool_calls")]),
            SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=None, content="Done."))]),
        ]
        create = unittest.mock.Mock(side_effect=completions)
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}), patch.object(agent_core, "MAX_TOOL_ROUNDS", 2), patch.object(agent_core, "OpenAI", return_value=client), patch.object(agent_core.tools, "lookup_vehicle", return_value={"engineOptions": ["1.6 TDI"]}) as lookup_vehicle:
            _, output = agent_core.process_message("+15555550123", "Golf noise", [], "http://localhost:5000")

        self.assertEqual(lookup_vehicle.call_count, 1)
        self.assertTrue(output["toolResults"][1]["cached"])

    def test_third_parts_search_is_limited_without_dispatch(self):
        tool_calls = [
            SimpleNamespace(id=f"call_{idx}", function=SimpleNamespace(name="search_parts", arguments=f'{{"issue_category":"category-{idx}"}}'))
            for idx in range(1, 4)
        ]
        completions = [
            SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=[tool_call]), finish_reason="tool_calls")])
            for tool_call in tool_calls
        ]
        completions.append(SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(tool_calls=None, content="Done."))]))
        create = unittest.mock.Mock(side_effect=completions)
        client = SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

        with patch.dict(os.environ, {"GROQ_API_KEY": "test-key"}), patch.object(agent_core, "MAX_TOOL_ROUNDS", 3), patch.object(agent_core, "OpenAI", return_value=client), patch.object(agent_core.tools, "search_parts", return_value=[] ) as search_parts:
            _, output = agent_core.process_message("+15555550123", "Golf noise", [], "http://localhost:5000")

        self.assertEqual(search_parts.call_count, 2)
        limited_result = output["toolResults"][2]
        self.assertTrue(limited_result["limited"])
        self.assertEqual(limited_result["result"]["message"], "no further parts search needed")


if __name__ == "__main__":
    unittest.main()
