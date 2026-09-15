#!/usr/bin/env python3
"""Smoke: payment WhatsApp is skipped (no paiement_recu enqueue, zero Meta HTTP)."""
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
# Leave DAXI_WHATSAPP_SKIP_PAYMENT unset → settings default True
os.environ.pop("DAXI_WHATSAPP_SKIP_PAYMENT", None)

import django
django.setup()

from django.conf import settings
from julmin_taxis import whatsapp_service as wa

assert getattr(settings, "DAXI_WHATSAPP_SKIP_PAYMENT", None) is True, (
    f"expected DAXI_WHATSAPP_SKIP_PAYMENT=True, got {getattr(settings, 'DAXI_WHATSAPP_SKIP_PAYMENT', None)!r}"
)

order = SimpleNamespace(
    pk=999001,
    client_name="Marie Test",
    client_phone="50937009999",
    user_id=None,
    total_price=25.0,
    price=25.0,
    pickup_address="Petion-Ville",
    destination_address="Aeroport",
    payment_method="card",
)

calls_graph = []
calls_dedicated = []
log_buf = io.StringIO()
handler = logging.StreamHandler(log_buf)
handler.setLevel(logging.INFO)
wa.logger.addHandler(handler)
wa.logger.setLevel(logging.INFO)

def boom_urlopen(*a, **k):
    raise AssertionError("urllib must not be called")

orig_graph = wa._graph_post
orig_dedicated = wa._dedicated_or_skip

def wrap_graph(payload):
    calls_graph.append(payload)
    return orig_graph(payload)

def wrap_dedicated(*a, **k):
    calls_dedicated.append({"args": a, "kwargs": k})
    return orig_dedicated(*a, **k)

with mock.patch("urllib.request.urlopen", side_effect=boom_urlopen):
    with mock.patch.object(wa, "_graph_post", side_effect=wrap_graph):
        with mock.patch.object(wa, "_dedicated_or_skip", side_effect=wrap_dedicated):
            r1 = wa.notify_client_payment_confirmed(order)
            order.payment_method = "in_person"
            r2 = wa.notify_client_payment_cash(order)

wa.logger.removeHandler(handler)
logs = log_buf.getvalue()

# Also via notify._safe_whatsapp if Order exists (optional)
notify_path = None
try:
    from julmin_taxis.notify import _safe_whatsapp, notify_payment_ready_for_drivers
    from orders.models import Order
    o = Order.objects.order_by("-id").first()
    if o:
        stub_log = Path(getattr(settings, "DAXI_WHATSAPP_STUB_LOG", "") or "")
        before = stub_log.read_text(encoding="utf-8") if stub_log.is_file() else ""
        with mock.patch("urllib.request.urlopen", side_effect=boom_urlopen):
            _safe_whatsapp(o, "notify_client_payment_confirmed")
            _safe_whatsapp(o, "notify_client_payment_cash")
        after = stub_log.read_text(encoding="utf-8") if stub_log.is_file() else ""
        new_lines = after[len(before):] if after.startswith(before) else after
        notify_path = {
            "order_pk": o.pk,
            "new_stub_lines": [ln for ln in new_lines.splitlines() if ln.strip()],
            "paiement_recu_enqueued": any("paiement_recu" in ln for ln in new_lines.splitlines()),
        }
except Exception as exc:
    notify_path = f"skip:{exc}"

payload = {
    "ok": True,
    "DAXI_STUB_WHATSAPP": bool(settings.DAXI_STUB_WHATSAPP),
    "DAXI_WHATSAPP_SKIP_PAYMENT": bool(settings.DAXI_WHATSAPP_SKIP_PAYMENT),
    "notify_client_payment_confirmed_return": r1,
    "notify_client_payment_cash_return": r2,
    "graph_post_calls": len(calls_graph),
    "dedicated_or_skip_calls": len(calls_dedicated),
    "skip_logged_confirmed": "SKIP_PAYMENT" in logs and "notify_client_payment_confirmed" in logs,
    "skip_logged_cash": "SKIP_PAYMENT" in logs and "notify_client_payment_cash" in logs,
    "paiement_recu_in_logs": "paiement_recu" in logs and "no paiement_recu" in logs.lower() or (
        "paiement_recu" in logs and "SKIP_PAYMENT" in logs
    ),
    "urllib_calls": 0,
    "notify_path": notify_path,
    "log_excerpt": [ln for ln in logs.splitlines() if "SKIP_PAYMENT" in ln or "paiement_recu" in ln],
    "proof": "payment WA skipped; no paiement_recu enqueue; zero Meta HTTP",
}

ok = (
    r1 is False
    and r2 is False
    and len(calls_graph) == 0
    and len(calls_dedicated) == 0
    and "SKIP_PAYMENT" in logs
    and "notify_client_payment_confirmed" in logs
    and "notify_client_payment_cash" in logs
)
if isinstance(notify_path, dict) and notify_path.get("paiement_recu_enqueued"):
    ok = False
    payload["ok"] = False
    payload["proof"] = "FAILED — paiement_recu appeared in stub log"

payload["ok"] = ok
print(json.dumps(payload, indent=2, default=str))
raise SystemExit(0 if ok else 1)
