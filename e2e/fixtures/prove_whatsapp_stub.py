#!/usr/bin/env python3
"""Prove WhatsApp outbound is stubbed — zero urllib/HTTP to Meta."""
import json
import os
import sys
from pathlib import Path
from unittest import mock

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
os.chdir(REPO)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "julmin_taxis.settings")
os.environ["DAXI_STUB_WHATSAPP"] = "1"
os.environ["DAXI_STUB_EMAIL"] = "1"
os.environ["DAXI_E2E_STUB_OUTBOUND"] = "1"

import django
django.setup()

from django.conf import settings
from julmin_taxis import whatsapp_service as wa

calls = []

def boom(*a, **k):
    calls.append({"args": str(a)[:200], "kwargs": str(k)[:200]})
    raise AssertionError("urllib.request.urlopen must not be called when DAXI_STUB_WHATSAPP=1")

with mock.patch("urllib.request.urlopen", side_effect=boom):
    ok = wa._graph_post({
        "messaging_product": "whatsapp",
        "to": "50937000000",
        "type": "template",
        "template": {"name": "prix_propose", "language": {"code": "fr"}},
    })

# Also try a notify path if available
notify_ok = None
try:
    from julmin_taxis.notify import _safe_whatsapp
    from orders.models import Order
    o = Order.objects.order_by("-id").first()
    if o:
        with mock.patch("urllib.request.urlopen", side_effect=boom):
            notify_ok = _safe_whatsapp(o, "notify_client_price_proposed")
except Exception as exc:
    notify_ok = f"skip:{exc}"

payload = {
    "ok": True,
    "DAXI_STUB_WHATSAPP": bool(getattr(settings, "DAXI_STUB_WHATSAPP", False)),
    "DAXI_STUB_EMAIL": bool(getattr(settings, "DAXI_STUB_EMAIL", False)),
    "EMAIL_BACKEND": settings.EMAIL_BACKEND,
    "WHATSAPP_ACCESS_TOKEN_set": bool(settings.WHATSAPP_ACCESS_TOKEN),
    "WHATSAPP_PHONE_NUMBER_ID_set": bool(settings.WHATSAPP_PHONE_NUMBER_ID),
    "graph_post_return": ok,
    "urllib_calls": len(calls),
    "notify_safe_whatsapp": notify_ok,
    "stub_log": getattr(settings, "DAXI_WHATSAPP_STUB_LOG", ""),
    "proof": "zero Meta HTTP" if len(calls) == 0 else "FAILED — urllib was called",
}
print(json.dumps(payload, indent=2))
raise SystemExit(0 if len(calls) == 0 and ok else 1)
