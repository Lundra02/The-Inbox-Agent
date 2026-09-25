import inspect
import json
import os
import time
from pathlib import Path
from typing import Any
from datetime import datetime
from zoneinfo import ZoneInfo

from dotenv import load_dotenv
from openai import OpenAI, BadRequestError, RateLimitError

import tools

load_dotenv()

DEFAULT_MODEL_NAME = "openai/gpt-oss-120b"
DEFAULT_GROQ_BASE_URL = "https://api.groq.com/openai/v1"
MAX_TOOL_ROUNDS = 5
MAX_SEARCH_PARTS_CALLS = 2
SYSTEM_PROMPT_PATH = Path(__file__).parent / "prompts" / "system_prompt.md"

TOOL_DEFINITIONS = [
    {
        "type": "function",
        "function": {
            "name": "get_intake_overview",
            "description": "Preferred first tool for a new vehicle concern. Returns vehicle, history, parts, diagnostic fee and future appointment slots in one call. Do not call the individual research tools again after this succeeds.",
            "parameters": {"type": "object", "properties": {
                "make": {"type": "string"}, "model": {"type": "string"},
                "year": {"type": "integer"}, "issue_category": {"type": "string"}
            }, "required": ["make", "model", "year", "issue_category"]},
        },
    },
    {
        "type": "function",
        "function": {
            "name": "lookup_vehicle",
            "description": "Look up vehicle specifications and engine options by make, model, and year.",
            "parameters": {
                "type": "object",
                "properties": {
                    "make": {"type": "string", "description": "Vehicle make (e.g., 'Volkswagen', 'BMW', 'Toyota')"},
                    "model": {"type": "string", "description": "Vehicle model (e.g., 'Golf 7', '3 Series')"},
                    "year": {"type": "integer", "description": "Year of manufacture (e.g., 2016)"},
                },
                "required": ["make", "model", "year"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "get_vehicle_history",
            "description": "Retrieve service and repair history for a vehicle. Pass the 'vehicleId' value returned by lookup_vehicle as the vehicle_id argument.",
            "parameters": {
                "type": "object",
                "properties": {
                    "vehicle_id": {"type": "string", "description": "The vehicleId returned by lookup_vehicle"},
                },
                "required": ["vehicle_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "search_parts",
            "description": "Search available parts and prices by issue category (e.g., 'engine', 'brakes', 'suspension', 'exhaust').",
            "parameters": {
                "type": "object",
                "properties": {
                    "issue_category": {"type": "string", "description": "Issue or component category"},
                },
                "required": ["issue_category"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "estimate_repair",
            "description": "Calculate repair cost estimate range (low, high) and labor hours based on issue category and labor task type.",
            "parameters": {
                "type": "object",
                "properties": {
                    "issue_category": {"type": "string", "description": "Category of the repair issue"},
                    "labor_task_type": {"type": "string", "description": "Labor task type (e.g., 'inspection', 'replacement', 'diagnostics')"},
                },
                "required": ["issue_category", "labor_task_type"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "check_schedule",
            "description": "Check available mechanic appointment slots between two dates.",
            "parameters": {
                "type": "object",
                "properties": {
                    "from_date": {"type": "string", "description": "Start date in ISO format YYYY-MM-DD"},
                    "to_date": {"type": "string", "description": "End date in ISO format YYYY-MM-DD"},
                },
                "required": ["from_date", "to_date"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_appointment",
            "description": "Book a service appointment for a customer and vehicle into a specific slot.",
            "parameters": {
                "type": "object",
                "properties": {
                    "customer_id": {"type": "string", "description": "Customer ID"},
                    "vehicle_id": {"type": "string", "description": "Vehicle ID"},
                    "slot_id": {"type": "string", "description": "Slot ID from available schedule"},
                    "notes": {"type": "string", "description": "Optional notes or reason for visit"},
                },
                "required": ["customer_id", "vehicle_id", "slot_id"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "create_work_order",
            "description": "Create a formal work order with issue categories, cost estimates, and parts needed.",
            "parameters": {
                "type": "object",
                "properties": {
                    "appointment_id": {"type": "string", "description": "Associated appointment ID"},
                    "vehicle_id": {"type": "string", "description": "Vehicle ID"},
                    "issue_categories": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "List of issue categories diagnosed",
                    },
                    "estimate_low": {"type": "number", "description": "Estimated minimum cost"},
                    "estimate_high": {"type": "number", "description": "Estimated maximum cost"},
                    "parts_needed": {
                        "type": "array",
                        "items": {"type": "string"},
                        "description": "Optional list of parts needed",
                    },
                },
                "required": ["appointment_id", "vehicle_id", "issue_categories", "estimate_low", "estimate_high"],
            },
        },
    },
]


def _system_prompt() -> str:
    if SYSTEM_PROMPT_PATH.exists():
        content = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8").strip()
        if content:
            return content
    return (
        "You are AutoShop Agent, an expert automotive repair-shop intake assistant. "
        "Help customers diagnose vehicle issues, look up specifications, estimate repair costs, "
        "and schedule appointments using the available tools."
    )


def to_history_message(item: Any) -> dict[str, str] | None:
    if not isinstance(item, dict):
        return None
    role = item.get("role")
    content = item.get("content", item.get("message"))
    if role not in {"assistant", "model", "user", "system"} or not isinstance(content, str) or not content.strip():
        return None
    return {"role": "assistant" if role in {"assistant", "model"} else role, "content": content}


def dispatch_tool(name: str, args: dict[str, Any], backend_api_url: str | None = None) -> Any:
    handler = getattr(tools, name, None)
    if not callable(handler):
        return {"error": f"Tool '{name}' is not implemented"}
    try:
        sig = inspect.signature(handler)
        if "backend_api_url" in sig.parameters:
            return handler(**args, backend_api_url=backend_api_url)
        return handler(**args)
    except TypeError as error:
        return {"error": f"Invalid arguments for tool '{name}': {error}"}
    except Exception as error:
        return {"error": f"Tool '{name}' execution failed: {error}"}


def _tool_succeeded(result: Any) -> bool:
    return not isinstance(result, dict) or "error" not in result


def _normalized_text(value: Any) -> str:
    return "".join(char for char in str(value).casefold() if char.isalnum())


def _has_similar_args(name: str, previous_args: dict[str, Any], args: dict[str, Any]) -> bool:
    """Treat abbreviated vehicle model names as the same lookup; otherwise require exact arguments."""
    if name != "lookup_vehicle":
        return previous_args == args

    if previous_args.get("year") != args.get("year"):
        return False
    if _normalized_text(previous_args.get("make")) != _normalized_text(args.get("make")):
        return False

    previous_model = _normalized_text(previous_args.get("model"))
    model = _normalized_text(args.get("model"))
    return bool(previous_model and model and (previous_model in model or model in previous_model))


def _cached_tool_result(
    successful_calls: dict[str, list[tuple[dict[str, Any], Any]]],
    name: str,
    args: dict[str, Any],
) -> Any | None:
    for previous_args, previous_result in successful_calls.get(name, []):
        if _has_similar_args(name, previous_args, args):
            return previous_result
    return None


def _final_reply_messages(customer_phone: str, user_message: str, tool_results: list[dict[str, Any]]) -> list[dict[str, str]]:
    """Create a clean text-only context that cannot inherit the prior tool-calling transcript."""
    return [
        {
            "role": "system",
            "content": (
                "You are AutoShop Agent writing the final Messenger reply. Summarize only confirmed results. "
                "Return only a concise, friendly plain-text message under 600 characters. "
                "Do not call, request, mention, or imply any tools."
            ),
        },
        {
            "role": "user",
            "content": (
                f"Customer phone: {customer_phone}\n"
                f"Customer message: {user_message}\n"
                f"Completed research: {json.dumps(tool_results, default=str)}\n"
                "Write the final message now."
            ),
        },
    ]


def _extract_symptoms(user_message: str, mileage_hint: str | None = None) -> dict[str, Any]:
    """Best-effort extraction of symptom fields from the raw customer message."""
    import re
    symptoms: dict[str, Any] = {}

    # Mileage
    mileage_match = re.search(r"(\d[\d\s,\.]*)(\s*km|\s*miles?|\s*mi)", user_message, re.I)
    if mileage_match:
        raw = re.sub(r"[\s,\.]", "", mileage_match.group(1))
        try:
            symptoms["mileage"] = int(raw)
        except ValueError:
            pass
    elif mileage_hint:
        try:
            symptoms["mileage"] = int(str(mileage_hint).replace(",", ""))
        except ValueError:
            pass

    # Warning light
    if re.search(r"no warning|without warning|no light|no indicator", user_message, re.I):
        symptoms["warningLight"] = False
    elif re.search(r"warning light|check engine|engine light|indicator", user_message, re.I):
        symptoms["warningLight"] = True

    # Key symptom phrases
    symptom_keywords = [
        r"noise", r"vibrat", r"shake", r"rattle", r"squeal", r"clunk", r"knock",
        r"smoke", r"leak", r"overheat", r"stall", r"hesitat", r"rough", r"pull",
    ]
    found = []
    for kw in symptom_keywords:
        m = re.search(rf"[\w\s]{{0,20}}{kw}[\w\s]{{0,20}}", user_message, re.I)
        if m:
            found.append(m.group(0).strip())
    if found:
        symptoms["describedSymptoms"] = found[:4]

    # Condition trigger
    for trigger in ["accelerat", "braking", "turning", "idle", "cold start", "highway", "parking"]:
        if re.search(trigger, user_message, re.I):
            symptoms["conditionTrigger"] = trigger
            break

    return symptoms


def _build_structured_output(
    tool_results: list[dict[str, Any]],
    final_reply: str,
    user_message: str = "",
) -> dict[str, Any] | None:
    """Build the clean summary object from raw tool_results."""
    if not tool_results:
        return None

    # ── gather named results ────────────────────────────────────────────────
    vehicle_res: dict[str, Any] | None = None
    history_entries: list[Any] = []
    parts_by_category: dict[str, list[Any]] = {}
    diagnostic_estimate: dict[str, Any] | None = None
    schedule_slots: list[Any] = []

    for tr in tool_results:
        name = tr.get("name")
        res = tr.get("result")
        args = tr.get("args", {})

        if name == "lookup_vehicle" and isinstance(res, dict) and "error" not in res:
            vehicle_res = res
        elif name == "get_vehicle_history" and isinstance(res, list):
            history_entries = res
        elif name == "search_parts" and isinstance(res, list):
            cat = args.get("issue_category", "unknown")
            parts_by_category[cat] = res
        elif name == "estimate_repair" and isinstance(res, dict) and "error" not in res:
            if diagnostic_estimate is None:          # keep first (Diagnostics) estimate
                diagnostic_estimate = res
        elif name == "check_schedule" and isinstance(res, list) and res:
            schedule_slots.extend(res)               # accumulate across multiple calls

    # ── vehicle section ─────────────────────────────────────────────────────
    vehicle_section: dict[str, Any] | None = None
    if vehicle_res:
        engine_opts = vehicle_res.get("engineOptions", [])
        vehicle_section = {
            "make": vehicle_res.get("make"),
            "model": vehicle_res.get("model"),
            "year": vehicle_res.get("year"),
            "engine": engine_opts[0] if len(engine_opts) == 1 else engine_opts or None,
        }

    # ── symptoms section ────────────────────────────────────────────────────
    symptoms = _extract_symptoms(user_message)
    # cross-reference seeded mileage if available
    if vehicle_res and not symptoms.get("mileage"):
        symptoms["mileage"] = vehicle_res.get("mileage")

    # ── inspection areas ────────────────────────────────────────────────────
    possible_areas: list[str] = list(parts_by_category.keys())

    # ── diagnostic time ─────────────────────────────────────────────────────
    recommended_diagnostic_time: str = "1 hour"
    if diagnostic_estimate:
        low = diagnostic_estimate.get("estimateLow")
        if low and isinstance(low, (int, float)) and low > 0:
            hours = max(1, round(low / 60))
            recommended_diagnostic_time = f"{hours} hour" if hours == 1 else f"{hours} hours"

    # ── proposed appointment ────────────────────────────────────────────────
    proposed_appointment: dict[str, Any] | None = None
    if schedule_slots:
        seen_ids: set[str] = set()
        unique_slots: list[dict[str, Any]] = []
        for slot in schedule_slots:
            sid = str(slot.get("_id", id(slot)))
            if sid not in seen_ids:
                seen_ids.add(sid)
                unique_slots.append(slot)
        unique_slots.sort(key=lambda s: (s.get("date", ""), s.get("startTime", "")))
        first = unique_slots[0]
        raw_date = str(first.get("date", ""))
        appointment_date = raw_date[:10] if len(raw_date) >= 10 else raw_date
        try:
            import datetime
            if "T" in raw_date:
                dt = datetime.datetime.fromisoformat(raw_date.replace("Z", "+00:00"))
                dt_local = dt + datetime.timedelta(hours=2)
                appointment_date = dt_local.strftime("%Y-%m-%d")
        except Exception:
            pass

        proposed_appointment = {
            "date": appointment_date,
            "time": f"{first.get('startTime')}–{first.get('endTime')}",
            "slotId": str(first.get("_id", "")),
        }

    # ── assemble output matching requested clean summary shape ──────────────
    output: dict[str, Any] = {
        "vehicle": vehicle_section,
        "symptomsCollected": symptoms if symptoms else None,
        "possibleInspectionAreas": possible_areas if possible_areas else None,
        "recommendedDiagnosticTime": recommended_diagnostic_time,
        "proposedAppointment": proposed_appointment,
        "toolResults": tool_results,
    }
    return output


def process_message(
    customer_phone: str | None,
    message: str,
    conversation_history: list[Any],
    backend_api_url: str | None = None,
    customer_id: str | None = None,
    intake_context: dict[str, Any] | None = None,
) -> tuple[str, dict[str, Any] | None]:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY is not configured in agent/.env")

    base_url = os.getenv("GROQ_BASE_URL", DEFAULT_GROQ_BASE_URL)
    model_name = os.getenv("GROQ_MODEL", DEFAULT_MODEL_NAME)
    backend_url = backend_api_url or os.getenv("BACKEND_API_URL", "http://localhost:5000")

    client = OpenAI(base_url=base_url, api_key=api_key, timeout=30.0, max_retries=0)
    model_options = {"reasoning_effort": os.getenv("GROQ_REASONING_EFFORT", "low")} if model_name.startswith("openai/gpt-oss-") else {}

    messages: list[dict[str, Any]] = [
        {"role": "system", "content": _system_prompt()}
    ]
    messages.append({"role": "system", "content": (
        f"Current shop time: {datetime.now(ZoneInfo(os.getenv('SHOP_TIMEZONE', 'Europe/Tirane'))).isoformat()}. "
        f"Current customer ID: {customer_id or 'unknown'}. "
        f"Phone on file: {customer_phone or 'not collected'}. "
        "For greetings or general questions, answer directly without intake tools. "
        "Never invent missing vehicle details. Collect a phone only when booking is requested; "
        "ask the customer to send just their international number starting with +. "
        "Do not book until a phone is on file and the customer confirms the slot. "
        "Use only the current customer ID for booking."
    )})
    if intake_context:
        messages.append({"role": "system", "content": (
            "Previous structured intake results (may contain stale availability): " + json.dumps(intake_context, default=str) +
            " Reuse known vehicle and symptom details; do not ask for them again. "
            "For a phone number or confirmation, continue the booking conversation, not the initial intake. "
            "Refresh availability before offering a slot from earlier context."
        )})

    for item in conversation_history:
        history_msg = to_history_message(item)
        if history_msg:
            messages.append(history_msg)

    messages.append({
        "role": "user",
        "content": f"Customer phone: {customer_phone}\nCustomer message: {message}",
    })

    tool_results: list[dict[str, Any]] = []
    successful_tool_calls: dict[str, list[tuple[dict[str, Any], Any]]] = {}
    tool_call_counts: dict[str, int] = {}

    for round_idx in range(1, MAX_TOOL_ROUNDS + 1):
        call_start = time.time()
        lookup_results = successful_tool_calls.get("lookup_vehicle", [])
        lookup_results = lookup_results + [(args, result.get("vehicle", {})) for args, result in successful_tool_calls.get("get_intake_overview", []) if isinstance(result, dict)]
        missing_vehicle = bool(lookup_results) and not any(
            isinstance(result, dict) and result.get("vehicleId") for _, result in lookup_results
        )
        available_tools = [tool for tool in TOOL_DEFINITIONS if not (
            missing_vehicle and tool["function"]["name"] in {"get_vehicle_history", "create_appointment", "create_work_order"}
        )]
        if customer_id:
            # Only the current customer's registered vehicle may be booked.
            available_tools = [tool for tool in available_tools if tool["function"]["name"] in {"get_intake_overview", "check_schedule", "create_appointment"}]
        try:
            completion = client.chat.completions.create(
            model=model_name,
            messages=messages,
            tools=available_tools,
            tool_choice="auto",
            temperature=0.2,
            max_tokens=1024,
            **model_options,
            )
        except RateLimitError:
            has_booking = bool(successful_tool_calls.get("create_appointment"))
            reply = (
                "The AI service is temporarily at its usage limit. Please contact the shop to confirm the booking already recorded."
                if has_booking else
                "The AI service is temporarily at its usage limit. Please try again later or contact the shop directly. No booking was made in response to this message."
            )
            output = _build_structured_output(tool_results, reply, user_message=message) or {}
            overview = next((item["result"] for item in reversed(tool_results) if item["name"] == "get_intake_overview" and _tool_succeeded(item["result"])), None)
            output["intakeContext"] = overview or intake_context
            output["temporarilyUnavailable"] = True
            return reply, output
        except BadRequestError as error:
            body = error.body if isinstance(error.body, dict) else {}
            details = body.get("error", body)
            if not isinstance(details, dict) or details.get("code") != "tool_use_failed":
                raise
            # The provider rejected generation before any of this round's tools ran.
            # Retain earlier results; never rerun successful side effects here.
            messages.append({"role": "system", "content": (
                "The previous generated tool call was invalid and was not executed. "
                "Use only available tools with valid non-null arguments. "
                "If lookup returned no vehicleId, skip repair history and booking; "
                "continue estimates and availability and explain that vehicle registration is needed."
            )})
            continue
        call_elapsed = time.time() - call_start

        choice = completion.choices[0]
        assistant_message = choice.message
        finish_reason = getattr(choice, "finish_reason", None)
        tool_calls = getattr(assistant_message, "tool_calls", None)

        tool_names = [getattr(getattr(tc, "function", None), "name", "unknown") for tc in tool_calls] if tool_calls else []
        print(f"[Groq API] Call #{round_idx}: {call_elapsed:.2f}s | finish_reason: {finish_reason} | max_tokens: 1024 | requested tools ({len(tool_names)}): {tool_names if tool_names else 'none'}")

        # If model did not request tool calls (finish_reason is stop or no tool calls)
        if finish_reason != "tool_calls" and not tool_calls:
            reply = getattr(assistant_message, "content", None) or "I am sorry, I could not generate a response."
            structured_output = _build_structured_output(tool_results, reply, user_message=message)
            if structured_output is None and intake_context:
                structured_output = {"intakeContext": intake_context}
            elif structured_output is not None:
                overview = next((item["result"] for item in reversed(tool_results) if item["name"] == "get_intake_overview" and _tool_succeeded(item["result"])), None)
                structured_output["intakeContext"] = overview or intake_context
            return reply, structured_output

        # Format assistant tool_calls message to append to conversation
        tool_calls_data = [
            {
                "id": getattr(tc, "id", ""),
                "type": "function",
                "function": {
                    "name": getattr(getattr(tc, "function", None), "name", ""),
                    "arguments": getattr(getattr(tc, "function", None), "arguments", "{}"),
                },
            }
            for tc in tool_calls
        ]
        messages.append({
            "role": "assistant",
            "content": getattr(assistant_message, "content", "") or "",
            "tool_calls": tool_calls_data,
        })

        # Execute each tool call and feed results back to the model
        for tc in tool_calls:
            func = getattr(tc, "function", None)
            func_name = getattr(func, "name", "")
            raw_args = getattr(func, "arguments", "{}")
            call_id = getattr(tc, "id", "")
            metadata: dict[str, bool] = {}
            tool_call_counts[func_name] = tool_call_counts.get(func_name, 0) + 1
            try:
                args = json.loads(raw_args) if isinstance(raw_args, str) else raw_args
                if not isinstance(args, dict):
                    args = {}
            except Exception as parse_err:
                args = {}
                result = {"error": f"Invalid JSON arguments for {func_name}: {parse_err}"}
            else:
                if customer_id and func_name in {"lookup_vehicle", "get_intake_overview"}:
                    args["customer_id"] = customer_id
                if customer_id and func_name == "create_appointment":
                    args["customer_id"] = customer_id
                    cached_result = _cached_tool_result(successful_tool_calls, func_name, args)
                    if cached_result is not None:
                        result = cached_result
                    else:
                        result = dispatch_tool(func_name, args, backend_url) if customer_phone else {"error": "Collect a phone number before booking."}
                        if _tool_succeeded(result):
                            successful_tool_calls.setdefault(func_name, []).append((args, result))
                elif func_name == "search_parts" and tool_call_counts[func_name] > MAX_SEARCH_PARTS_CALLS:
                    result = {"message": "no further parts search needed"}
                    metadata["limited"] = True
                else:
                    cached_result = _cached_tool_result(successful_tool_calls, func_name, args)
                    if cached_result is not None:
                        result = cached_result
                        metadata["cached"] = True
                    else:
                        result = dispatch_tool(func_name, args, backend_url)
                        if _tool_succeeded(result):
                            successful_tool_calls.setdefault(func_name, []).append((args, result))

            tool_results.append({"name": func_name, "args": args, "result": result, **metadata})

            messages.append({
                "role": "tool",
                "tool_call_id": call_id,
                "content": json.dumps(result, default=str),
            })

    # The tool loop is exhausted, so ask for the final SMS without exposing any tools to the model.
    try:
        final_start = time.time()
        final_completion = client.chat.completions.create(
            model=model_name,
            messages=_final_reply_messages(customer_phone, message, tool_results),
            temperature=0.2,
            max_tokens=300,
            **model_options,
        )
        final_elapsed = time.time() - final_start
        print(f"[Groq API] Final fallback call: {final_elapsed:.2f}s (max_tokens: 300)")
        reply = getattr(final_completion.choices[0].message, "content", None) or "I have processed your vehicle inquiry."
    except Exception as error:
        print(f"[Groq API] Final fallback failed: {error}")
        reply = "I have gathered the information regarding your vehicle and diagnostic details."

    structured_output = _build_structured_output(tool_results, reply, user_message=message)
    if structured_output is not None:
        overview = next((item["result"] for item in reversed(tool_results) if item["name"] == "get_intake_overview" and _tool_succeeded(item["result"])), None)
        structured_output["intakeContext"] = overview or intake_context
    return reply, structured_output
