import json
import os
import sys
import time
from pathlib import Path

from dotenv import load_dotenv
from openai import OpenAI


DEFAULT_MODEL_NAME = "openai/gpt-oss-120b"
DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1"

ECHO_TOOL = [
    {
        "type": "function",
        "function": {
            "name": "echo",
            "description": "Echo a short value.",
            "parameters": {
                "type": "object",
                "properties": {"value": {"type": "string"}},
                "required": ["value"],
            },
        },
    }
]


def get_client_and_config() -> tuple[OpenAI, str]:
    load_dotenv(Path(__file__).parent / ".env")
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        print("FAILURE: GROQ_API_KEY is missing or empty in agent/.env")
        sys.exit(1)
    model_name = os.getenv("GROQ_MODEL", DEFAULT_MODEL_NAME)
    base_url = os.getenv("GROQ_BASE_URL", DEFAULT_GROQ_BASE_URL)
    client = OpenAI(
        base_url=base_url,
        api_key=api_key,
        timeout=90.0,
        max_retries=0,
    )
    return client, model_name


def test_plain(client: OpenAI, model_name: str) -> int:
    print("=== Step 1: Plain (No-Tools) Test ===")
    request_started_at = time.time()
    try:
        completion = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": "Reply with exactly the word: OK"}],
            max_tokens=512,
        )
    except Exception as error:
        print(f"FAILURE: Groq API plain request failed ({type(error).__name__}): {error}")
        print(f"Elapsed seconds: {time.time() - request_started_at:.2f}")
        return 1

    print(f"Model: {model_name}")
    print(completion.model_dump_json(indent=2))
    assistant_message = completion.choices[0].message
    print(f"Finish reason: {completion.choices[0].finish_reason}")
    print(f"Reply: {assistant_message.content}")
    print(f"Tool calls returned: {len(assistant_message.tool_calls or [])}")
    print(f"Elapsed seconds: {time.time() - request_started_at:.2f}")
    print("SUCCESS: Groq API key and model both responded.")
    return 0


def test_tool_trigger(client: OpenAI, model_name: str) -> int:
    print("=== Step 2: Tool Calling Trigger Test (Echo Tool) ===")
    user_prompt = "Please echo the value: hello world"
    print(f"Prompt: {user_prompt}")
    request_started_at = time.time()
    try:
        completion = client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": user_prompt}],
            tools=ECHO_TOOL,
            tool_choice="auto",
            max_tokens=512,
        )
    except Exception as error:
        print(f"FAILURE: Groq API tool request failed ({type(error).__name__}): {error}")
        print(f"Elapsed seconds: {time.time() - request_started_at:.2f}")
        return 1

    print(f"Model: {model_name}")
    print(completion.model_dump_json(indent=2))
    assistant_message = completion.choices[0].message
    tool_calls = assistant_message.tool_calls or []
    print(f"Finish reason: {completion.choices[0].finish_reason}")
    print(f"Reply: {assistant_message.content}")
    print(f"Tool calls returned: {len(tool_calls)}")
    print(f"Elapsed seconds: {time.time() - request_started_at:.2f}")

    if not tool_calls:
        print("FAILURE: Expected tool_calls to be non-empty, but got none.")
        return 1

    first_call = tool_calls[0]
    func_name = first_call.function.name
    raw_args = first_call.function.arguments
    print(f"Called tool name: {func_name}")
    print(f"Arguments: {raw_args}")

    try:
        parsed_args = json.loads(raw_args)
    except Exception as e:
        print(f"FAILURE: Failed to parse tool arguments as JSON: {e}")
        return 1

    if func_name != "echo":
        print(f"FAILURE: Expected tool 'echo', got '{func_name}'")
        return 1

    if parsed_args.get("value") != "hello world":
        print(f"FAILURE: Expected value 'hello world', got '{parsed_args.get('value')}'")
        return 1

    print("SUCCESS: tool_calls returned non-empty with correct 'echo' function and arguments {'value': 'hello world'}.")
    return 0


def main() -> int:
    client, model_name = get_client_and_config()
    if "--plain" in sys.argv or "--no-tools" in sys.argv:
        return test_plain(client, model_name)
    if "--echo" in sys.argv or "--tool-trigger" in sys.argv:
        return test_tool_trigger(client, model_name)

    # Run plain test first, then tool trigger test
    code = test_plain(client, model_name)
    if code != 0:
        return code
    print()
    return test_tool_trigger(client, model_name)


if __name__ == "__main__":
    sys.exit(main())
