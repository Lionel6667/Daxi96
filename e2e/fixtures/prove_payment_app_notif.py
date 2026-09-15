#!/usr/bin/env python3
"""Smoke: payment confirmation uses FCM/push path; WhatsApp payment stays skipped."""
import io
import json
import logging
import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
os.chdir(REPO)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "julmin_taxis.settings")
os.environ["DAXI_STUB_WHATSAPP"] = "1"
os.environ["DAXI_STUB_EMAIL"] = "1"
os.environ.pop("DAXI_WHATSAPP_SKIP_PAYMENT", None)

import django
django.setup()

from django.conf import settings
from julmin_taxis import notify as notify_mod
from julmin_taxis import whatsapp_service as wa
from julmin_taxis.push_policy import SKIP_IF_VIEWING_ORDER, IMPORTANT_EVENTS, should_send_client_push

assert settings.DAXI_WHATSAPP_SKIP_PAYMENT is True

# --- Policy: payment not suppressed by viewing order ---
policy_ok = (
    "payment_confirmed" not in SKIP_IF_VIEWING_ORDER
    and "payment_cash_confirmed" not in SKIP_IF_VIEWING_ORDER
    and "payment_confirmed" in IMPORTANT_EVENTS
    and "payment_cash_confirmed" in IMPORTANT_EVENTS
)

# --- notify_payment_ready_for_drivers calls push then WA ---
push_calls = []
wa_calls = []
admin_calls = []

order_card = SimpleNamespace(
    pk=888001,
    payment_method="card",
    payment_status="paid",
    user_id=None,
    guest_id="guest-proof-888001",
    client_name="Proof Client",
    client_phone="50937008888",
    price=30.0,
    total_price=30.0,
    pickup_address="PV",
    destination_address="Aéroport",
)
order_cash = SimpleNamespace(**{**order_card.__dict__, "pk": 888002, "payment_method": "in_person", "payment_status": "in_person", "guest_id": "guest-proof-888002"})

def fake_push(order, status, extra=None):
    push_calls.append({"pk": order.pk, "status": status, "extra": extra})
    return 1

def fake_wa(order, fn_name, **kwargs):
    result = wa.__dict__.get(fn_name) or getattr(wa, fn_name)
    ok = result(order, **kwargs) if kwargs else result(order)
    wa_calls.append({"pk": order.pk, "fn": fn_name, "ok": bool(ok)})
    return bool(ok)

def fake_admin(event_key, title=None, body=None, extra_data=None, order=None):
    admin_calls.append({"event": event_key, "order_pk": getattr(order, "pk", None), "title": title})
    return 1

log_buf = io.StringIO()
handler = logging.StreamHandler(log_buf)
handler.setLevel(logging.INFO)
wa.logger.addHandler(handler)
wa.logger.setLevel(logging.INFO)

with mock.patch.object(notify_mod, "_safe_push_order", side_effect=fake_push):
    with mock.patch.object(notify_mod, "_safe_whatsapp", side_effect=fake_wa):
        with mock.patch.object(notify_mod, "push_notify_admin", side_effect=fake_admin):
            notify_mod.notify_payment_ready_for_drivers(order_card)
            notify_mod.notify_payment_ready_for_drivers(order_cash)

wa.logger.removeHandler(handler)
logs = log_buf.getvalue()

# --- should_send_client_push allows payment even if "viewing" ---
# Simulate viewing by mocking presence context
view_push = {}
with mock.patch("julmin_taxis.push_policy.get_presence_context", return_value={
    "viewing_order_id": "888001", "online": True
}):
    with mock.patch("julmin_taxis.push_policy._client_identity", return_value=("guest", "guest-proof-888001")):
        with mock.patch("julmin_taxis.push_policy._delivery_record", return_value=None):
            with mock.patch("julmin_taxis.push_policy.had_recent_action", return_value=False):
                view_push["payment_confirmed"] = should_send_client_push(order_card, "payment_confirmed")
                view_push["payment_cash_confirmed"] = should_send_client_push(order_cash, "payment_cash_confirmed")

# --- urgent list includes payment ---
src = Path(notify_mod.__file__).read_text(encoding="utf-8")
urgent_ok = (
    "'payment_confirmed'" in src
    and "'payment_cash_confirmed'" in src
    and "urgent = status in" in src
)

# Frontend: card/moncash init must not mark payment_confirmed
fe = Path(REPO / "static/js/vubez2/vubez2-inline-04.js").read_text(encoding="utf-8")
# crude check around payment init handler
idx = fe.find("if (seg.indexOf('payment') === 0)")
chunk = fe[idx:idx+700] if idx >= 0 else ""
fe_ok = (
    idx >= 0
    and "payment_cash_confirmed" in chunk
    and "action = null" in chunk
    and "else action = 'payment_confirmed'" not in chunk
)

payload = {
    "ok": False,
    "DAXI_WHATSAPP_SKIP_PAYMENT": bool(settings.DAXI_WHATSAPP_SKIP_PAYMENT),
    "policy_payment_not_in_skip_viewing": policy_ok,
    "push_calls": push_calls,
    "wa_calls": wa_calls,
    "admin_calls": admin_calls,
    "wa_skipped_logged": "SKIP_PAYMENT" in logs,
    "viewing_still_allows_push": view_push,
    "urgent_includes_payment": urgent_ok,
    "frontend_cash_only_user_action": fe_ok,
    "functions_on_payment": {
        "card/moncash": [
            "_safe_push_order(order, 'payment_confirmed')",
            "_safe_whatsapp → notify_client_payment_confirmed (no-op SKIP_PAYMENT)",
            "push_notify_admin('payment_confirmed')",
            "WS order_{id} payment_confirmed (from _advance_to_driver_notified)",
        ],
        "in_person": [
            "_safe_push_order(order, 'payment_cash_confirmed')",
            "_safe_whatsapp → notify_client_payment_cash (no-op SKIP_PAYMENT)",
            "push_notify_admin('payment_confirmed', title=Paiement sur place)",
            "WS order_{id} payment_cash_confirmed",
        ],
    },
}

ok = (
    policy_ok
    and urgent_ok
    and fe_ok
    and push_calls == [
        {"pk": 888001, "status": "payment_confirmed", "extra": None},
        {"pk": 888002, "status": "payment_cash_confirmed", "extra": None},
    ]
    and all(c["ok"] is False for c in wa_calls)
    and {c["fn"] for c in wa_calls} == {"notify_client_payment_confirmed", "notify_client_payment_cash"}
    and "SKIP_PAYMENT" in logs
    and view_push.get("payment_confirmed", (False,))[0] is True
    and view_push.get("payment_cash_confirmed", (False,))[0] is True
)
payload["ok"] = ok
print(json.dumps(payload, indent=2, default=str))
raise SystemExit(0 if ok else 1)
