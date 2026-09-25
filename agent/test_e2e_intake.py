import json
import sys
import time
from pathlib import Path
from dotenv import load_dotenv

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8")
    except Exception:
        pass

load_dotenv(Path(__file__).parent / ".env")

from agent_core import process_message

customer_phone = "+15555550123"
user_message = "Golf 7 2016, weird noise when I accelerate, no warning light, 186000 km"

print("=" * 60)
print(f"Customer Phone: {customer_phone}")
print(f"User Message:   {user_message}")
print("=" * 60)
print("Calling process_message()...\n")

start_time = time.time()
reply, structured_output = process_message(
    customer_phone=customer_phone,
    message=user_message,
    conversation_history=[],
)
elapsed = time.time() - start_time

print(f"Elapsed time: {elapsed:.2f} seconds\n")

print("=" * 60)
print("TOOL CALLS & RESULTS:")
print("=" * 60)
if structured_output and "toolResults" in structured_output:
    for idx, tr in enumerate(structured_output["toolResults"], 1):
        print(f"\n[{idx}] Tool Called: {tr.get('name')}")
        print(f"    Arguments:   {json.dumps(tr.get('args'))}")
        print(f"    Result:      {json.dumps(tr.get('result'), indent=2)}")
else:
    print("No tool calls recorded.")

print("\n" + "=" * 60)
print("STRUCTURED OUTPUT:")
print("=" * 60)
print(json.dumps(structured_output, indent=2))

print("\n" + "=" * 60)
print("FINAL ASSISTANT REPLY:")
print("=" * 60)
print(reply)
