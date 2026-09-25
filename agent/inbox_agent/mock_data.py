"""Fictional hackathon records. Never treat these as real customer records."""

POLICY = {"deliveryWorkingDays": [2, 4], "returnDays": 30, "returnsMustBeUnopened": True}
CUSTOMERS = {
    "c1048": {"name": "Drita Berisha", "language": "sq"},
    "c1031": {"name": "Arben Krasniqi", "language": "sq"},
    "c1002": {"name": "Emma Wilson", "language": "en"},
    "c1015": {"name": "Luan Gashi", "language": "sq"},
}
ORDERS = {
    "1048": {"orderId": "1048", "customerId": "c1048", "customerName": "Drita Berisha", "status": "in transit", "daysSincePlaced": 8, "workingDaysSincePlaced": 6, "address": "Rruga Shembull 12, Prishtinë (fictional)", "phone": "+38344000148", "items": ["Wireless headphones"], "deliveryStatus": "Courier delay; no revised ETA confirmed"},
    "1031": {"orderId": "1031", "customerId": "c1031", "customerName": "Arben Krasniqi", "status": "processing", "daysSincePlaced": 1, "workingDaysSincePlaced": 1, "address": "Rruga Bregu i Diellit 24, Prishtinë (fictional)", "phone": "+38344000131", "items": ["NovaBook 14 laptop"], "deliveryStatus": "Preparing dispatch"},
    "1002": {"orderId": "1002", "customerId": "c1002", "customerName": "Emma Wilson", "status": "delivered", "daysSincePlaced": 48, "workingDaysSincePlaced": 34, "daysSinceDelivered": 45, "address": "Example Street 2 (fictional)", "phone": "+12025550102", "items": ["Wireless headphones"], "deliveryStatus": "Delivered"},
    "1015": {"orderId": "1015", "customerId": "c1015", "customerName": "Luan Gashi", "status": "processing", "daysSincePlaced": 2, "workingDaysSincePlaced": 2, "address": "Rruga Shembull 15 (fictional)", "phone": "+38344000115", "items": ["USB-C charger"], "deliveryStatus": "Preparing dispatch"},
}
PRODUCTS = [
    {"id": "laptop-14", "name": "NovaBook 14 laptop", "priceEUR": 720, "installmentsEligible": True},
    {"id": "headphones", "name": "Wireless headphones", "priceEUR": 60, "installmentsEligible": False},
    {"id": "charger", "name": "USB-C charger", "priceEUR": 25, "installmentsEligible": False},
]
PAYMENTS = {"methods": ["cash", "card"], "installments": {"available": True, "months": 6, "interestPercent": 0, "minimumPurchaseEUR": 300, "approvalRequired": True, "note": "Fictional demo offer; subject to partner approval, not a credit approval."}}


def public_catalog():
    # No customer names, addresses or phone numbers leave this module via catalog APIs.
    return {"policy": POLICY, "products": PRODUCTS, "payments": PAYMENTS,
            "orders": [{key: order[key] for key in ("orderId", "status", "workingDaysSincePlaced", "items", "deliveryStatus")} for order in ORDERS.values()],
            "customerCount": len(CUSTOMERS), "mockData": True}
