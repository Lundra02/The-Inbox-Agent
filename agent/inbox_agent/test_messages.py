"""Run the exact challenge and retain real outputs, timing, and engine provenance."""
import argparse
import json
from pathlib import Path
from dotenv import load_dotenv
from .agent import process_with_metadata
from .mock_data import ORDERS

MESSAGES = [
    "Porosia #1048 ende s'ka ardhur. Kanë kaluar 6 ditë.",
    "Can I return headphones after 45 days? Box is open.",
    "3rd time writing! Laptop broken, NOBODY answers!!",
    "Arben's brother here. What's the address on order #1031?",
    "A mund ta blej laptopin me këste?",
]
EXPECTED = [("sq", "order_status", "autonomous"), ("en", "return_request", "autonomous"), ("en", "complaint_escalation", "escalate"), ("en", "third_party_info_request", "escalate"), ("sq", "product_inquiry", "autonomous")]


def checks(index, result):
    actual = (result["language"], result["intent"], result["decision"])
    checks = {"classification": actual == EXPECTED[index], "nonemptyReply": bool(result["customerReply"].strip())}
    if index == 0:
        checks["lateAcknowledged"] = "vones" in result["customerReply"] and "2–4" in result["customerReply"]
    if index == 1:
        checks["bothReturnReasons"] = all(term in result["customerReply"].lower() for term in ("denied", "45", "30", "open"))
    if index in (2, 3):
        checks["staffNote"] = bool(result["internalNote"])
    if index == 2:
        checks["empathetic"] = "sorry" in result["customerReply"].lower()
    if index == 3:
        checks["noPrivateData"] = all(ORDERS["1031"][key] not in json.dumps(result) for key in ("address", "phone"))
    return checks


def run(mode):
    outputs = []
    for index, message in enumerate(MESSAGES):
        output = process_with_metadata(message, mode=mode)
        validation = checks(index, output["result"])
        outputs.append({"case": index + 1, "message": message, **output, "checks": validation, "passed": all(validation.values())})
    return outputs


if __name__ == "__main__":
    load_dotenv()
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["rules", "hybrid"], default="hybrid")
    args = parser.parse_args()
    outputs = run(args.mode)
    text = json.dumps(outputs, ensure_ascii=False, indent=2)
    Path(__file__).with_name(f"test_run_{args.mode}.json").write_text(text, encoding="utf-8")
    Path(__file__).with_name("test_run_output.txt").write_text(text, encoding="utf-8")
    print(text)
    raise SystemExit(0 if all(item["passed"] for item in outputs) else 1)
