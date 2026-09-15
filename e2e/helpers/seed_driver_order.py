#!/usr/bin/env python3
"""Seed / inspect driver-lifecycle orders for Phase 8 E2E (Cap-Haïtien / Nord).

Usage (from repo root):
  .venv/bin/python e2e/helpers/seed_driver_order.py create
  .venv/bin/python e2e/helpers/seed_driver_order.py create --guest-id e2e-guest-xyz
  .venv/bin/python e2e/helpers/seed_driver_order.py status <order_id>
  .venv/bin/python e2e/helpers/seed_driver_order.py clear-driver-active
  .venv/bin/python e2e/helpers/seed_driver_order.py ensure-demo
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

from drivers.models import Driver
from orders.models import Order

CAP_PICKUP = (19.7596, -72.2042)
CAP_DEST = (19.7870, -72.2450)
DEMO_DRIVER_EMAIL = "demo.driver@daxi.ht"


def ensure_demo(quiet: bool = False):
    import io
    from contextlib import redirect_stdout
    buf = io.StringIO()
    with redirect_stdout(buf):
        call_command("create_demo_accounts")
    d = Driver.objects.filter(email=DEMO_DRIVER_EMAIL).first()
    if not d:
        raise SystemExit("demo.driver@daxi.ht missing after create_demo_accounts")
    # Cap-Haïtien coords + available
    d.latitude = CAP_PICKUP[0]
    d.longitude = CAP_PICKUP[1]
    d.status = "available"
    d.is_verified = True
    d.is_blocked = False
    d.save(update_fields=["latitude", "longitude", "status", "is_verified", "is_blocked"])
    payload = {"ok": True, "driver_id": d.pk, "email": d.email, "status": d.status}
    if not quiet:
        print(json.dumps(payload))
    return payload


def clear_driver_active(email: str = DEMO_DRIVER_EMAIL, quiet: bool = False):
    d = Driver.objects.filter(email=email).first()
    if not d:
        payload = {"ok": False, "error": "driver_missing", "email": email}
        if not quiet:
            print(json.dumps(payload))
        return 1 if quiet else 1
    active = Order.objects.filter(
        driver=d,
        status__in=["driver_assigned", "on_way", "arrived", "in_progress", "waiting_return", "price_proposed", "price_confirmed"],
    )
    n = 0
    for o in active:
        o.status = "cancelled"
        o.cancelled_at = timezone.now()
        o.save(update_fields=["status", "cancelled_at", "updated_at"])
        n += 1
    d.status = "available"
    d.save(update_fields=["status"])
    payload = {"ok": True, "cancelled": n, "driver_id": d.pk}
    if not quiet:
        print(json.dumps(payload))
    return 0


def create_order(guest_id: str | None = None, tag: str | None = None):
    ensure_demo(quiet=True)
    d = Driver.objects.filter(email=DEMO_DRIVER_EMAIL).first()
    # Free driver so accept is allowed
    clear_driver_active(DEMO_DRIVER_EMAIL, quiet=True)

    gid = guest_id or f"e2e-drv-{timezone.now().strftime('%H%M%S')}-{os.getpid()}"
    tag = tag or "phase8"
    o = Order.objects.create(
        client_name=f"E2E Driver Client ({tag})",
        client_phone="+50937008888",
        client_email="client.e2e@example.com",
        guest_id=gid,
        pickup="Place d'Armes, Cap-Haïtien",
        destination="Labadee, Cap-Haïtien",
        pickup_lat=Decimal(str(CAP_PICKUP[0])),
        pickup_lng=Decimal(str(CAP_PICKUP[1])),
        destination_lat=Decimal(str(CAP_DEST[0])),
        destination_lng=Decimal(str(CAP_DEST[1])),
        status="price_confirmed",
        price=Decimal("750.00"),
        price_confirmed=True,
        payment_status="in_person",
        payment_method="in_person",
        vehicle_type="economy",
        trip_type="one_way",
        notes=f"e2e-{tag}",
    )
    # Ensure demo driver at pickup for proximity gate
    if d:
        d.latitude = float(CAP_PICKUP[0])
        d.longitude = float(CAP_PICKUP[1])
        d.status = "available"
        d.save(update_fields=["latitude", "longitude", "status"])
    print(
        json.dumps(
            {
                "ok": True,
                "order_id": o.pk,
                "guest_id": gid,
                "status": o.status,
                "payment_status": o.payment_status,
                "pickup_lat": float(o.pickup_lat),
                "pickup_lng": float(o.pickup_lng),
                "destination_lat": float(o.destination_lat),
                "destination_lng": float(o.destination_lng),
                "driver_email": DEMO_DRIVER_EMAIL,
            }
        )
    )
    return 0


def status_order(order_id: int):
    try:
        o = Order.objects.get(pk=order_id)
    except Order.DoesNotExist:
        print(json.dumps({"ok": False, "error": "not_found", "order_id": order_id}))
        return 1
    print(
        json.dumps(
            {
                "ok": True,
                "order_id": o.pk,
                "status": o.status,
                "payment_status": o.payment_status,
                "driver_id": o.driver_id,
                "driver_name": o.driver_name or "",
                "guest_id": o.guest_id or "",
                "on_way_at": o.on_way_at.isoformat() if o.on_way_at else None,
                "arrived_at": o.arrived_at.isoformat() if o.arrived_at else None,
                "in_progress_at": o.in_progress_at.isoformat() if o.in_progress_at else None,
                "completed_at": o.completed_at.isoformat() if o.completed_at else None,
            }
        )
    )
    return 0



def create_midflow(status: str = "on_way", tag: str | None = None):
    """Create an order already assigned to demo driver in mid-trip status.

    status: on_way | arrived | in_progress | driver_assigned
    Reveals trip action buttons in driver_home.
    """
    allowed = {"driver_assigned", "on_way", "arrived", "in_progress"}
    if status not in allowed:
        print(json.dumps({"ok": False, "error": "bad_status", "allowed": sorted(allowed)}))
        return 1
    ensure_demo(quiet=True)
    clear_driver_active(DEMO_DRIVER_EMAIL, quiet=True)
    d = Driver.objects.filter(email=DEMO_DRIVER_EMAIL).first()
    if not d:
        print(json.dumps({"ok": False, "error": "driver_missing"}))
        return 1

    tag = tag or "run3-midflow"
    now = timezone.now()
    o = Order.objects.create(
        client_name=f"E2E Midflow ({tag})",
        client_phone="+50937009999",
        client_email="midflow.e2e@example.com",
        guest_id=f"e2e-mid-{timezone.now().strftime('%H%M%S')}-{os.getpid()}",
        pickup="Place d'Armes, Cap-Haïtien",
        destination="Labadee, Cap-Haïtien",
        pickup_lat=Decimal(str(CAP_PICKUP[0])),
        pickup_lng=Decimal(str(CAP_PICKUP[1])),
        destination_lat=Decimal(str(CAP_DEST[0])),
        destination_lng=Decimal(str(CAP_DEST[1])),
        status=status,
        price=Decimal("850.00"),
        price_confirmed=True,
        payment_status="in_person",
        payment_method="in_person",
        vehicle_type="economy",
        trip_type="one_way",
        notes=f"e2e-{tag}",
        driver=d,
        driver_name=getattr(d, "full_name", None) or d.email,
        driver_assigned_at=now,
    )
    updates = ["status", "driver", "driver_name", "driver_assigned_at", "updated_at"]
    if status in ("on_way", "arrived", "in_progress"):
        o.on_way_at = now
        updates.append("on_way_at")
    if status in ("arrived", "in_progress"):
        o.arrived_at = now
        updates.append("arrived_at")
    if status == "in_progress":
        o.in_progress_at = now
        updates.append("in_progress_at")
    o.save(update_fields=list(set(updates)))

    d.latitude = float(CAP_PICKUP[0])
    d.longitude = float(CAP_PICKUP[1])
    d.status = "busy" if status != "driver_assigned" else "on_trip"
    # keep available-ish statuses the app understands
    if hasattr(Driver, "STATUS_CHOICES") or True:
        d.status = "busy"
    d.save(update_fields=["latitude", "longitude", "status"])

    print(
        json.dumps(
            {
                "ok": True,
                "order_id": o.pk,
                "status": o.status,
                "driver_id": d.pk,
                "driver_email": DEMO_DRIVER_EMAIL,
                "guest_id": o.guest_id,
            }
        )
    )
    return 0

def main():
    p = argparse.ArgumentParser()
    sub = p.add_subparsers(dest="cmd", required=True)
    sub.add_parser("ensure-demo")
    sub.add_parser("clear-driver-active")
    c = sub.add_parser("create")
    c.add_argument("--guest-id", default=None)
    c.add_argument("--tag", default="phase8")
    m = sub.add_parser("create-midflow")
    m.add_argument("--status", default="on_way")
    m.add_argument("--tag", default="run3-midflow")
    s = sub.add_parser("status")
    s.add_argument("order_id", type=int)
    args = p.parse_args()
    if args.cmd == "ensure-demo":
        ensure_demo(quiet=False)
        return 0
    if args.cmd == "clear-driver-active":
        return clear_driver_active(quiet=False)
    if args.cmd == "create":
        return create_order(guest_id=args.guest_id, tag=args.tag)
    if args.cmd == "create-midflow":
        return create_midflow(status=args.status, tag=args.tag)
    if args.cmd == "status":
        return status_order(args.order_id)
    return 1


if __name__ == "__main__":
    raise SystemExit(main() or 0)
