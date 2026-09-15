#!/usr/bin/env python3
"""Seed client guest orders across trip mid-states for RUN3 ledger unlock."""
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

from django.utils import timezone
from orders.models import Order

PAP = (18.5392, -72.3350)
PETION = (18.5125, -72.2850)
GUEST = "e2e-run3-client-guest"
TAG = "e2e-run3-client"

STATUSES = [
    "pending",
    "price_proposed",
    "price_confirmed",
    "driver_assigned",
    "on_way",
    "arrived",
    "in_progress",
    "completed",
]


def _cancel_old():
    n = 0
    for o in Order.objects.filter(guest_id=GUEST, notes__icontains=TAG):
        if o.status not in ("completed", "cancelled"):
            o.status = "cancelled"
            o.cancelled_at = timezone.now()
            o.save(update_fields=["status", "cancelled_at", "updated_at"])
            n += 1
    return n


def ensure(fresh: bool = False):
    if fresh:
        _cancel_old()

    now = timezone.now()
    out = {"ok": True, "guest_id": GUEST, "orders": {}}
    for st in STATUSES:
        existing = (
            Order.objects.filter(guest_id=GUEST, notes__icontains=f"{TAG}-{st}", status=st)
            .order_by("-id")
            .first()
        )
        if existing and not fresh:
            out["orders"][st] = existing.pk
            continue

        o = Order(
            client_name=f"E2E Client {st}",
            client_phone="+50937112233",
            client_email="client.run3@example.com",
            guest_id=GUEST,
            pickup="Champ de Mars, Port-au-Prince",
            destination="Pétion-Ville, Place Boyer",
            pickup_lat=Decimal(str(PAP[0])),
            pickup_lng=Decimal(str(PAP[1])),
            destination_lat=Decimal(str(PETION[0])),
            destination_lng=Decimal(str(PETION[1])),
            status=st,
            vehicle_type="economy",
            trip_type="one_way",
            notes=f"{TAG}-{st}",
        )
        if st in ("price_proposed", "price_confirmed", "driver_assigned", "on_way", "arrived", "in_progress", "completed"):
            o.price = Decimal("650.00")
        if st in ("price_confirmed", "driver_assigned", "on_way", "arrived", "in_progress", "completed"):
            o.price_confirmed = True
            o.payment_status = "in_person"
            o.payment_method = "in_person"
        if st == "price_proposed":
            o.payment_status = "pending"
        if st in ("driver_assigned", "on_way", "arrived", "in_progress", "completed"):
            o.driver_name = "Demo Driver"
            o.driver_assigned_at = now
        if st in ("on_way", "arrived", "in_progress", "completed"):
            o.on_way_at = now
        if st in ("arrived", "in_progress", "completed"):
            o.arrived_at = now
        if st in ("in_progress", "completed"):
            o.in_progress_at = now
        if st == "completed":
            o.completed_at = now
            o.payment_status = "paid"
        o.save()
        out["orders"][st] = o.pk

    print(json.dumps(out))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["ensure"])
    ap.add_argument("--fresh", action="store_true")
    args = ap.parse_args()
    ensure(fresh=args.fresh)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
