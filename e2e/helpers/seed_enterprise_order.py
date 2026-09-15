#!/usr/bin/env python3
"""Seed / inspect enterprise orders for Phase Enterprise E2E.

Usage (from repo root):
  .venv/bin/python e2e/helpers/seed_enterprise_order.py ensure
  .venv/bin/python e2e/helpers/seed_enterprise_order.py ensure --fresh
  .venv/bin/python e2e/helpers/seed_enterprise_order.py status
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from decimal import Decimal
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
os.chdir(REPO)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "julmin_taxis.settings")

import django

django.setup()

from django.core.management import call_command
from django.utils import timezone

from enterprises.models import Enterprise
from orders.models import Order

DEMO_EMAIL = "demo.entreprise@daxi.ht"
DEMO_NAME = "DAXI Demo Entreprise"
CAP = (19.7596, -72.2042)
CAP_DEST = (19.7870, -72.2450)
E2E_TAG = "e2e-enterprise"


def ensure_demo(quiet: bool = False):
    import io
    from contextlib import redirect_stdout

    buf = io.StringIO()
    with redirect_stdout(buf):
        call_command("create_demo_accounts")
    ent = Enterprise.objects.filter(email=DEMO_EMAIL, name=DEMO_NAME).first()
    if not ent:
        raise SystemExit(f"{DEMO_EMAIL} missing after create_demo_accounts")
    # Approved + GPS so location modal does not block dashboard
    ent.status = "approved"
    ent.mode = "self_order"
    ent.commission_percent = 10.0
    ent.address_lat = CAP[0]
    ent.address_lng = CAP[1]
    ent.address_label = "DAXI Demo Entreprise — Cap-Haïtien"
    ent.location_status = "set"
    ent.location_set_at = timezone.now()
    if not ent.approved_at:
        ent.approved_at = timezone.now()
    ent.save()
    payload = {
        "ok": True,
        "enterprise_id": ent.pk,
        "email": ent.email,
        "mode": ent.mode,
        "status": ent.status,
        "location_status": ent.location_status,
    }
    if not quiet:
        print(json.dumps(payload))
    return ent


def _cancel_e2e_orders(ent: Enterprise):
    qs = Order.objects.filter(enterprise=ent, notes__icontains=E2E_TAG)
    n = 0
    for o in qs:
        if o.status not in ("completed", "cancelled"):
            o.status = "cancelled"
            o.cancelled_at = timezone.now()
            o.save(update_fields=["status", "cancelled_at", "updated_at"])
            n += 1
    return n


def ensure(fresh: bool = False):
    ent = ensure_demo(quiet=True)
    if fresh:
        _cancel_e2e_orders(ent)

    # Reuse open e2e orders when present
    accept = (
        Order.objects.filter(
            enterprise=ent,
            notes__icontains=E2E_TAG,
            status="pending",
            price__isnull=False,
        )
        .order_by("-id")
        .first()
    )
    choose = (
        Order.objects.filter(
            enterprise=ent,
            notes__icontains=E2E_TAG,
            status="price_confirmed",
            price_confirmed=True,
        )
        .exclude(payment_status__in=["paid", "in_person"])
        .order_by("-id")
        .first()
    )
    hist = (
        Order.objects.filter(
            enterprise=ent,
            notes__icontains=E2E_TAG,
            status="completed",
        )
        .order_by("-id")
        .first()
    )

    if not accept:
        accept = Order.objects.create(
            client_name="E2E Ent Client Accept",
            client_phone="+50937001111",
            client_email="ent.accept@example.com",
            pickup="Place d'Armes, Cap-Haïtien",
            destination="Labadee, Cap-Haïtien",
            pickup_lat=Decimal(str(CAP[0])),
            pickup_lng=Decimal(str(CAP[1])),
            destination_lat=Decimal(str(CAP_DEST[0])),
            destination_lng=Decimal(str(CAP_DEST[1])),
            status="pending",
            price=Decimal("850.00"),
            price_confirmed=False,
            vehicle_type="economy",
            trip_type="one_way",
            enterprise=ent,
            enterprise_commission_pct=ent.commission_percent or 10.0,
            notes=f"{E2E_TAG}-accept-price",
        )

    if not choose:
        choose = Order.objects.create(
            client_name="E2E Ent Client Pay",
            client_phone="+50937002222",
            client_email="ent.pay@example.com",
            pickup="Boulevard du Cap, Cap-Haïtien",
            destination="Hôtel Mariott, Cap-Haïtien",
            pickup_lat=Decimal(str(CAP[0])),
            pickup_lng=Decimal(str(CAP[1])),
            destination_lat=Decimal(str(CAP_DEST[0])),
            destination_lng=Decimal(str(CAP_DEST[1])),
            status="price_confirmed",
            price=Decimal("920.00"),
            price_confirmed=True,
            payment_status="pending",
            payment_method="",
            vehicle_type="economy",
            trip_type="one_way",
            enterprise=ent,
            enterprise_commission_pct=ent.commission_percent or 10.0,
            notes=f"{E2E_TAG}-choose-payment",
        )

    if not hist:
        hist = Order.objects.create(
            client_name="E2E Ent Client Done",
            client_phone="+50937003333",
            client_email="ent.done@example.com",
            pickup="Cathédrale, Cap-Haïtien",
            destination="Aéroport Cap-Haïtien",
            pickup_lat=Decimal(str(CAP[0])),
            pickup_lng=Decimal(str(CAP[1])),
            destination_lat=Decimal(str(CAP_DEST[0])),
            destination_lng=Decimal(str(CAP_DEST[1])),
            status="completed",
            price=Decimal("1100.00"),
            price_confirmed=True,
            payment_status="paid",
            payment_method="moncash",
            vehicle_type="economy",
            trip_type="one_way",
            enterprise=ent,
            enterprise_commission_pct=ent.commission_percent or 10.0,
            notes=f"{E2E_TAG}-history",
            completed_at=timezone.now(),
        )

    payload = {
        "ok": True,
        "enterprise_id": ent.pk,
        "email": ent.email,
        "mode": ent.mode,
        "location_status": ent.location_status,
        "accept_price_order_id": accept.pk,
        "choose_payment_order_id": choose.pk,
        "history_order_id": hist.pk,
        "active_count": Order.objects.filter(enterprise=ent)
        .exclude(status__in=["completed", "cancelled"])
        .count(),
        "history_count": Order.objects.filter(
            enterprise=ent, status__in=["completed", "cancelled"]
        ).count(),
    }
    print(json.dumps(payload))
    return payload


def status():
    ent = Enterprise.objects.filter(email=DEMO_EMAIL).first()
    if not ent:
        print(json.dumps({"ok": False, "error": "enterprise_missing"}))
        return 1
    orders = list(
        Order.objects.filter(enterprise=ent)
        .order_by("-id")
        .values("id", "status", "price", "notes", "payment_status")[:20]
    )
    print(
        json.dumps(
            {
                "ok": True,
                "enterprise_id": ent.pk,
                "status": ent.status,
                "mode": ent.mode,
                "location_status": ent.location_status,
                "orders": orders,
            }
        )
    )
    return 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["ensure", "status", "ensure-demo"])
    ap.add_argument("--fresh", action="store_true")
    args = ap.parse_args()
    if args.cmd == "ensure-demo":
        ensure_demo()
        return 0
    if args.cmd == "status":
        return status()
    ensure(fresh=args.fresh)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
