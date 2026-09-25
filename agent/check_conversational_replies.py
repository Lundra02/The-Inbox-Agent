"""Live synthetic examples; calls Groq but never sends customer messages."""
import json
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).with_name(".env"))
from inbox_agent.agent import process_with_metadata


if __name__ == "__main__":
    rows = []
    memory = {}
    for message in ["A kini lapptop", "Qfar laptopi kini",
                    "Can I return headphones after 45 days? Box is open.", "Hello!"]:
        before = process_with_metadata(message, mode="rules", memory=memory)
        after = process_with_metadata(message, mode="hybrid", memory=memory)
        memory = after["memory"]
        row = {"message": message, "before": before["result"]["customerReply"],
               "after": after["result"]["customerReply"], "replyEngine": after["replyEngine"],
               "fallback": after["replyFallbackReason"], "elapsedMs": after["elapsedMs"]}
        rows.append(row)
        print(json.dumps(row, ensure_ascii=False), flush=True)
    Path(__file__).with_name("inbox_agent").joinpath("conversational_examples.json").write_text(
        json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")
