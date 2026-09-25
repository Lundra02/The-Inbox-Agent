"""HTTP wrappers for the backend agent-tool endpoints."""

import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from typing import Any

import requests


REQUEST_TIMEOUT_SECONDS = 15


def _backend_url(backend_api_url: str | None) -> str:
    url = backend_api_url or os.getenv("BACKEND_API_URL")
    if not url:
        raise ValueError("BACKEND_API_URL is not configured")
    return url.rstrip("/")


def _request(
    method: str,
    path: str,
    *,
    backend_api_url: str | None,
    params: dict[str, Any] | None = None,
    body: dict[str, Any] | None = None,
) -> Any:
    try:
        response = requests.request(
            method,
            f"{_backend_url(backend_api_url)}{path}",
            params=params,
            json=body,
            timeout=REQUEST_TIMEOUT_SECONDS,
        )
    except (requests.RequestException, ValueError) as error:
        return {"error": f"Backend tool request failed: {error}"}

    try:
        payload = response.json()
    except ValueError:
        payload = {"error": response.text or "Backend returned an invalid response"}

    if response.ok:
        return payload

    return {
        "error": payload.get("error", "Backend tool request failed") if isinstance(payload, dict) else "Backend tool request failed",
        "status": response.status_code,
        "details": payload,
    }


def lookup_vehicle(make: str, model: str, year: int, backend_api_url: str | None = None, customer_id: str | None = None) -> Any:
    return _request(
        "GET",
        "/api/tools/lookup-vehicle",
        backend_api_url=backend_api_url,
        params={"make": make, "model": model, "year": year, **({"customerId": customer_id} if customer_id else {})},
    )


def get_vehicle_history(vehicle_id: str, backend_api_url: str | None = None) -> Any:
    return _request(
        "GET",
        f"/api/tools/vehicle-history/{vehicle_id}",
        backend_api_url=backend_api_url,
    )


def search_parts(issue_category: str, backend_api_url: str | None = None) -> Any:
    return _request(
        "GET",
        "/api/tools/search-parts",
        backend_api_url=backend_api_url,
        params={"issueCategory": issue_category},
    )


def estimate_repair(
    issue_category: str,
    labor_task_type: str,
    backend_api_url: str | None = None,
) -> Any:
    return _request(
        "POST",
        "/api/tools/estimate-repair",
        backend_api_url=backend_api_url,
        body={"issueCategory": issue_category, "laborTaskType": labor_task_type},
    )


def check_schedule(from_date: str, to_date: str, backend_api_url: str | None = None) -> Any:
    return _request(
        "GET",
        "/api/tools/check-schedule",
        backend_api_url=backend_api_url,
        params={"fromDate": from_date, "toDate": to_date},
    )


def create_appointment(
    customer_id: str,
    vehicle_id: str,
    slot_id: str,
    notes: str | None = None,
    backend_api_url: str | None = None,
) -> Any:
    return _request(
        "POST",
        "/api/tools/create-appointment",
        backend_api_url=backend_api_url,
        body={
            "customerId": customer_id,
            "vehicleId": vehicle_id,
            "slotId": slot_id,
            "notes": notes,
        },
    )


def create_work_order(
    appointment_id: str,
    vehicle_id: str,
    issue_categories: list[str],
    estimate_low: float,
    estimate_high: float,
    parts_needed: list[str] | None = None,
    backend_api_url: str | None = None,
) -> Any:
    return _request(
        "POST",
        "/api/tools/create-workorder",
        backend_api_url=backend_api_url,
        body={
            "appointmentId": appointment_id,
            "vehicleId": vehicle_id,
            "issueCategories": issue_categories,
            "estimateLow": estimate_low,
            "estimateHigh": estimate_high,
            "partsNeeded": parts_needed or [],
        },
    )


def get_intake_overview(make: str, model: str, year: int, issue_category: str,
                        backend_api_url: str | None = None, customer_id: str | None = None) -> Any:
    """Read-only intake research in parallel, with one model tool round-trip."""
    today = datetime.now(ZoneInfo(os.getenv("SHOP_TIMEZONE", "Europe/Tirane"))).date()
    with ThreadPoolExecutor(max_workers=4) as pool:
        vehicle_future = pool.submit(lookup_vehicle, make, model, year, backend_api_url, customer_id)
        estimate_future = pool.submit(estimate_repair, issue_category, "Diagnostics", backend_api_url)
        schedule_future = pool.submit(check_schedule, today.isoformat(), (today + timedelta(days=14)).isoformat(), backend_api_url)
        parts_future = pool.submit(search_parts, issue_category, backend_api_url)
        vehicle = vehicle_future.result()
        history = get_vehicle_history(vehicle["vehicleId"], backend_api_url) if isinstance(vehicle, dict) and vehicle.get("vehicleId") else []
        return {"vehicle": vehicle, "history": history, "estimate": estimate_future.result(),
                "slots": schedule_future.result(), "parts": parts_future.result(),
                "checkedAt": datetime.now(ZoneInfo(os.getenv("SHOP_TIMEZONE", "Europe/Tirane"))).isoformat()}
