#!/usr/bin/env python3
"""Durable E2E seed: client / driver / enterprise orders across real Order.status values.

Reveals mid-trip UI for Playwright coverage of:
  - templates/htmx/_client_order_actions.html
  - templates/htmx/_driver_order_row_actions.html
  - templates/htmx/_admin_order_details.html (adm-order-actions)
  - templates/htmx/enterprise_order_actions.html + enterprise checkout

Real model statuses (orders.models.Order.STATUS_CHOICES):
  pending, price_proposed, price_confirmed, driver_assigned,
  on_way, arrived, in_progress, waiting_return, completed, cancelled

Colloquial aliases (COVERAGE_PLAN_100.md):
  pending_price → pending (no price)
  priced        → price_proposed
  accepted      → driver_assigned

Usage (from repo root):
  .venv/bin/python e2e/fixtures/seed_trip_states.py
  .venv/bin/python e2e/fixtures/seed_trip_states.py --fresh
  .venv/bin/python e2e/fixtures/seed_trip_states.py --statuses on_way,arrived
  .venv/bin/python e2e/fixtures/seed_trip_states.py --json-only

Env (optional; falls back to create_demo_accounts defaults):
  DAXI_CLIENT_EMAIL / DAXI_CLIENT_PASSWORD
  DAXI_DRIVER_EMAIL
  DAXI_ENTERPRISE_EMAIL
  DAXI_E2E_GUEST_ID
  DAXI_E2E_SEED_TAG   (default: e2e-trip-states)
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

from accounts.models import CustomUser
from drivers.models import Driver
from enterprises.models import Enterprise
from orders.models import Order

# Cap-Haïtien / Nord — matches Phase 8 / existing seeders
CAP_PICKUP = (19.7596, -72.2042)
CAP_DEST = (19.7870, -72.2450)

DEMO_CLIENT_EMAIL = "demo.client@daxi.ht"
DEMO_DRIVER_EMAIL = "demo.driver@daxi.ht"
DEMO_ENTERPRISE_EMAIL = "demo.entreprise@daxi.ht"
DEMO_ENTERPRISE_NAME = "DAXI Demo Entreprise"
DEMO_PASSWORD = "DemoDaxi2026!"

DEFAULT_TAG = "e2e-trip-states"

# Canonical status keys → human alias used in coverage docs
STATUS_ALIASES = {
    "pending_price": "pending",
    "priced": "price_proposed",
    "accepted": "driver_assigned",
}

# All durable states we seed by default (order matters for docs)
DEFAULT_STATUSES = [
    "pending",           # admin: Fixer un prix; client: Annuler
    "price_proposed",    # client: Accepter / Refuser prix
    "price_confirmed",   # client: payment selection (payment pending)
    "awaiting_driver",   # price_confirmed + in_person — driver available tab
    "driver_assigned",
    "on_way",
    "arrived",
    "in_progress",
    "waiting_return",
    "completed",
    "ent_accept_price",  # enterprise checkout phase
    "ent_choose_payment",
]


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _resolve_emails():
    client = _env("DAXI_CLIENT_EMAIL") or _env("DAXI_E2E_CLIENT_USER") or DEMO_CLIENT_EMAIL
    driver = _env("DAXI_DRIVER_EMAIL") or _env("DAXI_E2E_DRIVER_USER") or DEMO_DRIVER_EMAIL
    enterprise = (
        _env("DAXI_ENTERPRISE_EMAIL")
        or _env("DAXI_E2E_ENTERPRISE_USER")
        or DEMO_ENTERPRISE_EMAIL
    )
    guest = _env("DAXI_E2E_GUEST_ID") or f"e2e-guest-trip-states"
    tag = _env("DAXI_E2E_SEED_TAG") or DEFAULT_TAG
    return client, driver, enterprise, guest, tag


def ensure_accounts(client_email: str, driver_email: str, enterprise_email: str, quiet: bool = True):
    """Ensure demo accounts exist; force driver online at Cap-Haïtien."""
    import io
    from contextlib import redirect_stdout

    buf = io.StringIO()
    with redirect_stdout(buf):
        call_command("create_demo_accounts")

    user = CustomUser.objects.filter(email=client_email).first()
    if not user and client_email != DEMO_CLIENT_EMAIL:
        # Env pointed at a custom client — create/update lightly
        user, _ = CustomUser.objects.update_or_create(
            email=client_email,
            defaults={
                "username": client_email,
                "first_name": "E2E",
                "last_name": "Client",
                "phone": "+50937001111",
                "is_verified": True,
                "is_active": True,
            },
        )
        user.set_password(_env("DAXI_CLIENT_PASSWORD") or DEMO_PASSWORD)
        user.save()
    if not user:
        user = CustomUser.objects.filter(email=DEMO_CLIENT_EMAIL).first()
    if not user:
        raise SystemExit(f"client missing: {client_email}")

    driver = Driver.objects.filter(email=driver_email).first()
    if not driver and driver_email != DEMO_DRIVER_EMAIL:
        raise SystemExit(f"driver missing: {driver_email} (run create_demo_accounts)")
    if not driver:
        driver = Driver.objects.filter(email=DEMO_DRIVER_EMAIL).first()
    if not driver:
        raise SystemExit("demo driver missing after create_demo_accounts")

    driver.latitude = CAP_PICKUP[0]
    driver.longitude = CAP_PICKUP[1]
    driver.status = "available"
    driver.is_verified = True
    driver.is_blocked = False
    driver.save(update_fields=["latitude", "longitude", "status", "is_verified", "is_blocked"])

    ent = Enterprise.objects.filter(email=enterprise_email).first()
    if not ent:
        ent = Enterprise.objects.filter(email=DEMO_ENTERPRISE_EMAIL, name=DEMO_ENTERPRISE_NAME).first()
    if ent:
        ent.status = "approved"
        ent.mode = "self_order"
        ent.commission_percent = 10.0
        ent.address_lat = CAP_PICKUP[0]
        ent.address_lng = CAP_PICKUP[1]
        ent.address_label = "DAXI Demo Entreprise — Cap-Haïtien"
        ent.location_status = "set"
        ent.location_set_at = timezone.now()
        if not ent.approved_at:
            ent.approved_at = timezone.now()
        ent.save()

    payload = {
        "client_id": user.pk,
        "client_email": user.email,
        "driver_id": driver.pk,
        "driver_email": driver.email,
        "driver_status": driver.status,
        "enterprise_id": ent.pk if ent else None,
        "enterprise_email": ent.email if ent else None,
    }
    if not quiet:
        print(json.dumps({"ok": True, "accounts": payload}))
    return user, driver, ent, payload


def _note(tag: str, key: str) -> str:
    return f"{tag}:{key}"


def _cancel_tagged(tag: str) -> int:
    n = 0
    qs = Order.objects.filter(notes__startswith=f"{tag}:")
    for o in qs:
        if o.status not in ("completed", "cancelled"):
            o.status = "cancelled"
            o.cancelled_at = timezone.now()
            o.save(update_fields=["status", "cancelled_at", "updated_at"])
            n += 1
    return n


def _base_kwargs(user, guest_id: str, tag: str, key: str, **extra):
    kw = dict(
        user=user,
        guest_id=guest_id,
        client_name=f"E2E Trip ({key})",
        client_phone="+50937008801",
        client_email=user.email if user else "client.e2e@example.com",
        pickup="Place d'Armes, Cap-Haïtien",
        destination="Labadee, Cap-Haïtien",
        pickup_lat=CAP_PICKUP[0],
        pickup_lng=CAP_PICKUP[1],
        destination_lat=CAP_DEST[0],
        destination_lng=CAP_DEST[1],
        vehicle_type="economy",
        trip_type="one_way",
        passengers=1,
        notes=_note(tag, key),
    )
    kw.update(extra)
    return kw


def _apply_timestamps(o: Order, status: str, now):
    """Set lifecycle timestamps consistent with Order.update_status."""
    if status in ("price_proposed",) and hasattr(o, "price_proposed_at"):
        o.price_proposed_at = now
    if status in (
        "driver_assigned",
        "on_way",
        "arrived",
        "in_progress",
        "waiting_return",
        "completed",
    ):
        o.driver_assigned_at = now
    if status in ("on_way", "arrived", "in_progress", "waiting_return", "completed"):
        o.on_way_at = now
    if status in ("arrived", "in_progress", "waiting_return", "completed"):
        o.arrived_at = now
    if status in ("in_progress", "waiting_return", "completed"):
        o.in_progress_at = now
    if status == "waiting_return":
        o.waiting_return_at = now
        o.trip_type = "round_trip"
        o.round_trip_phase = "waiting"
    if status == "completed":
        o.completed_at = now
    if status == "cancelled":
        o.cancelled_at = now


def _upsert(tag: str, key: str, defaults: dict) -> Order:
    """Reuse open tagged order when present; else create."""
    existing = (
        Order.objects.filter(notes=_note(tag, key))
        .exclude(status="cancelled")
        .order_by("-id")
        .first()
    )
    if existing:
        for k, v in defaults.items():
            setattr(existing, k, v)
        existing.save()
        return existing
    return Order.objects.create(**defaults)


def _assign_driver(o: Order, driver: Driver, now):
    o.driver = driver
    o.driver_name = getattr(driver, "full_name", None) or driver.email
    o.driver_phone = driver.phone or ""
    o.driver_assigned_at = now


def seed_status(key: str, user, driver, ent, guest_id: str, tag: str) -> dict:
    """Create/update one order for a logical seed key. Returns {key, order_id, status, ...}."""
    now = timezone.now()
    real = STATUS_ALIASES.get(key, key)

    if key in ("pending", "pending_price"):
        o = _upsert(
            tag,
            "pending",
            _base_kwargs(
                user,
                guest_id,
                tag,
                "pending",
                status="pending",
                price=None,
                price_confirmed=False,
                payment_status="pending",
                payment_method="",
            ),
        )
        return _row(o, key, "admin propose-price + client cancel")

    if key in ("price_proposed", "priced"):
        o = _upsert(
            tag,
            "price_proposed",
            _base_kwargs(
                user,
                guest_id,
                tag,
                "price_proposed",
                status="price_proposed",
                price=Decimal("650.00"),
                price_confirmed=False,
                payment_status="pending",
                payment_method="",
            ),
        )
        _apply_timestamps(o, "price_proposed", now)
        o.save()
        return _row(o, key, "client Accepter/Refuser prix")

    if key == "price_confirmed":
        # Payment selection UI (_order_needs_payment)
        o = _upsert(
            tag,
            "price_confirmed",
            _base_kwargs(
                user,
                guest_id,
                tag,
                "price_confirmed",
                status="price_confirmed",
                price=Decimal("720.00"),
                price_confirmed=True,
                payment_status="pending",
                payment_method="",
            ),
        )
        return _row(o, key, "client payment selection sheet")

    if key == "awaiting_driver":
        # Driver available tab — payable + no driver
        o = _upsert(
            tag,
            "awaiting_driver",
            _base_kwargs(
                user,
                guest_id,
                tag,
                "awaiting_driver",
                status="price_confirmed",
                price=Decimal("750.00"),
                price_confirmed=True,
                payment_status="in_person",
                payment_method="in_person",
                driver=None,
                driver_name="",
            ),
        )
        return _row(o, key, "driver available → Accepter")

    if key in (
        "driver_assigned",
        "accepted",
        "on_way",
        "arrived",
        "in_progress",
        "waiting_return",
        "completed",
    ):
        status = real if real in {
            "driver_assigned",
            "on_way",
            "arrived",
            "in_progress",
            "waiting_return",
            "completed",
        } else key
        seed_key = status
        defaults = _base_kwargs(
            user,
            guest_id,
            tag,
            seed_key,
            status=status,
            price=Decimal("850.00"),
            price_confirmed=True,
            payment_status="in_person",
            payment_method="in_person",
        )
        if status == "waiting_return":
            defaults["trip_type"] = "round_trip"
            defaults["round_trip_phase"] = "waiting"
            defaults["round_trip_wait_minutes"] = 30
        o = _upsert(tag, seed_key, defaults)
        _assign_driver(o, driver, now)
        _apply_timestamps(o, status, now)
        o.save()
        # Keep driver "busy" when any midflow exists
        if status in ("driver_assigned", "on_way", "arrived", "in_progress", "waiting_return"):
            driver.status = "busy"
            driver.latitude = CAP_PICKUP[0]
            driver.longitude = CAP_PICKUP[1]
            driver.save(update_fields=["status", "latitude", "longitude"])
        ui = {
            "driver_assigned": "client track/chat/SOS; driver cancel/SOS",
            "on_way": "client track/chat/SOS; driver mid-trip",
            "arrived": "client track/chat/SOS; driver start gate",
            "in_progress": "client track/chat/SOS; driver complete/pause",
            "waiting_return": "client recall + track",
            "completed": "client receipt + rating",
        }.get(status, "")
        return _row(o, key, ui)

    if key == "ent_accept_price":
        if not ent:
            return {"key": key, "ok": False, "error": "enterprise_missing"}
        o = _upsert(
            tag,
            "ent_accept_price",
            dict(
                client_name="E2E Ent Accept Price",
                client_phone="+50937001111",
                client_email="ent.accept@example.com",
                guest_id=f"{guest_id}-ent-accept",
                pickup="Place d'Armes, Cap-Haïtien",
                destination="Labadee, Cap-Haïtien",
                pickup_lat=CAP_PICKUP[0],
                pickup_lng=CAP_PICKUP[1],
                destination_lat=CAP_DEST[0],
                destination_lng=CAP_DEST[1],
                status="pending",
                price=Decimal("850.00"),
                price_confirmed=False,
                vehicle_type="economy",
                trip_type="one_way",
                enterprise=ent,
                enterprise_commission_pct=ent.commission_percent or 10.0,
                notes=_note(tag, "ent_accept_price"),
            ),
        )
        return _row(o, key, "enterprise Valider le prix → openEntCheckout")

    if key == "ent_choose_payment":
        if not ent:
            return {"key": key, "ok": False, "error": "enterprise_missing"}
        o = _upsert(
            tag,
            "ent_choose_payment",
            dict(
                client_name="E2E Ent Choose Pay",
                client_phone="+50937002222",
                client_email="ent.pay@example.com",
                guest_id=f"{guest_id}-ent-pay",
                pickup="Boulevard du Cap, Cap-Haïtien",
                destination="Hôtel Mariott, Cap-Haïtien",
                pickup_lat=CAP_PICKUP[0],
                pickup_lng=CAP_PICKUP[1],
                destination_lat=CAP_DEST[0],
                destination_lng=CAP_DEST[1],
                status="price_confirmed",
                price=Decimal("920.00"),
                price_confirmed=True,
                payment_status="pending",
                payment_method="",
                vehicle_type="economy",
                trip_type="one_way",
                enterprise=ent,
                enterprise_commission_pct=ent.commission_percent or 10.0,
                notes=_note(tag, "ent_choose_payment"),
            ),
        )
        return _row(o, key, "enterprise Choisir le paiement → openEntCheckout")

    return {"key": key, "ok": False, "error": "unknown_status", "hint": sorted(set(DEFAULT_STATUSES) | set(STATUS_ALIASES))}


def _row(o: Order, key: str, unlocks: str) -> dict:
    return {
        "ok": True,
        "key": key,
        "order_id": o.pk,
        "status": o.status,
        "payment_status": o.payment_status,
        "payment_method": o.payment_method or "",
        "price": str(o.price) if o.price is not None else None,
        "price_confirmed": bool(o.price_confirmed),
        "driver_id": o.driver_id,
        "enterprise_id": o.enterprise_id,
        "guest_id": o.guest_id or "",
        "user_id": o.user_id,
        "unlocks": unlocks,
        "notes": o.notes,
    }


def seed_all(statuses: list[str] | None = None, fresh: bool = False) -> dict:
    client_email, driver_email, enterprise_email, guest_id, tag = _resolve_emails()
    user, driver, ent, accounts = ensure_accounts(
        client_email, driver_email, enterprise_email, quiet=True
    )
    cancelled = 0
    if fresh:
        cancelled = _cancel_tagged(tag)

    keys = statuses or DEFAULT_STATUSES
    # Normalize aliases
    normalized = []
    for k in keys:
        k = k.strip()
        if not k:
            continue
        normalized.append(k)

    orders = []
    for key in normalized:
        orders.append(seed_status(key, user, driver, ent, guest_id, tag))

    # If no midflow active left, set driver available
    active = Order.objects.filter(
        driver=driver,
        status__in=["driver_assigned", "on_way", "arrived", "in_progress", "waiting_return"],
    ).exists()
    if not active:
        driver.status = "available"
        driver.save(update_fields=["status"])

    payload = {
        "ok": True,
        "tag": tag,
        "guest_id": guest_id,
        "fresh": fresh,
        "cancelled_prior": cancelled,
        "accounts": accounts,
        "orders": orders,
        "status_field": "Order.status",
        "status_choices": [s[0] for s in Order.STATUS_CHOICES],
        "aliases": STATUS_ALIASES,
        "ui_hints": {
            "client_sheet": "/htmx/client/orders/sheet/?guest_id=" + guest_id,
            "client_orders": "/htmx/client/orders/?guest_id=" + guest_id,
            "driver_orders_available": "/htmx/driver/orders/?tab=available",
            "driver_orders_accepted": "/htmx/driver/orders/?tab=accepted",
            "driver_active": "/htmx/driver/active-order/",
            "admin_orders": "/htmx/admin/orders/?status=all",
            "enterprise_dashboard": "/entreprise/dashboard/",
            "pages": {
                "client": "/",
                "driver": "/driver/",
                "admin": "/admin-dashboard/",
                "enterprise": "/entreprise/",
            },
        },
    }
    return payload


def main():
    ap = argparse.ArgumentParser(description="Seed durable mid-trip orders for DAXI E2E")
    ap.add_argument(
        "--statuses",
        default="",
        help="Comma-separated keys (default: full set). Aliases: pending_price,priced,accepted",
    )
    ap.add_argument(
        "--fresh",
        action="store_true",
        help=f"Cancel prior open orders tagged {DEFAULT_TAG}:* before recreate",
    )
    ap.add_argument("--json-only", action="store_true", help="Print JSON only (default)")
    ap.add_argument("--list-statuses", action="store_true", help="Print status choices and exit")
    args = ap.parse_args()

    if args.list_statuses:
        print(
            json.dumps(
                {
                    "ok": True,
                    "model_statuses": [s[0] for s in Order.STATUS_CHOICES],
                    "seed_keys": DEFAULT_STATUSES,
                    "aliases": STATUS_ALIASES,
                },
                indent=2,
            )
        )
        return 0

    statuses = [s.strip() for s in args.statuses.split(",") if s.strip()] or None
    payload = seed_all(statuses=statuses, fresh=args.fresh)
    print(json.dumps(payload, indent=2, default=str))
    if not payload.get("ok"):
        return 1
    # Fail if any order seed failed
    bad = [o for o in payload.get("orders", []) if not o.get("ok")]
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
