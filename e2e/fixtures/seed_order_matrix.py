#!/usr/bin/env python3
"""Exhaustive order-type × status matrix seeder for DAXI UI/logic audits.

Creates durable ORM fixtures tagged e2e-order-matrix:* WITHOUT notifying
(WhatsApp/email stubs must be active — see DAXI_STUB_WHATSAPP).

Usage:
  .venv/bin/python e2e/fixtures/seed_order_matrix.py --fresh
  .venv/bin/python e2e/fixtures/seed_order_matrix.py --types normal,plan_demi_journee --statuses pending,on_way
  .venv/bin/python e2e/fixtures/seed_order_matrix.py --list
  .venv/bin/python e2e/fixtures/seed_order_matrix.py --json-only
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import timedelta
from decimal import Decimal
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO))
os.chdir(REPO)
os.environ.setdefault("DJANGO_SETTINGS_MODULE", "julmin_taxis.settings")
# Force stubs before django.setup so settings picks them up
os.environ.setdefault("DAXI_STUB_WHATSAPP", "1")
os.environ.setdefault("DAXI_STUB_EMAIL", "1")
os.environ.setdefault("DAXI_E2E_STUB_OUTBOUND", "1")

import django

django.setup()

from django.conf import settings
from django.core.management import call_command
from django.utils import timezone

from accounts.models import CustomUser
from drivers.models import Driver
from enterprises.models import Enterprise
from orders.models import Order
from julmin_taxis.service_plans import PLAN_SLUGS, FIXED_PLAN_PRICES

CAP_PICKUP = (19.7596, -72.2042)
CAP_DEST = (19.7870, -72.2450)

DEMO_CLIENT_EMAIL = "demo.client@daxi.ht"
DEMO_DRIVER_EMAIL = "demo.driver@daxi.ht"
DEMO_ENTERPRISE_EMAIL = "demo.entreprise@daxi.ht"
DEMO_PASSWORD = "DemoDaxi2026!"
DEFAULT_TAG = "e2e-order-matrix"

# Canonical FSM (Order.STATUS_CHOICES)
ALL_STATUSES = [s[0] for s in Order.STATUS_CHOICES]

# Order type catalog — invent from models / plans / enterprise / guest
ORDER_TYPES = {
    "normal": {
        "label": "Client registered one-way (no plan)",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [],
        "trip_type": "one_way",
        "service_plan": "",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "standard",
    },
    "round_trip": {
        "label": "Client registered round-trip",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [],
        "trip_type": "round_trip",
        "service_plan": "",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "roundtrip",
    },
    "guest": {
        "label": "Guest client one-way",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [],
        "trip_type": "one_way",
        "service_plan": "",
        "guest": True,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "standard",
    },
    "guest_round_trip": {
        "label": "Guest round-trip",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [],
        "trip_type": "round_trip",
        "service_plan": "",
        "guest": True,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "roundtrip",
    },
    "plan_ville_a_ville": {
        "label": "Plan Ville à Ville (dynamic transport)",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [],  # still uses price_proposed
        "trip_type": "one_way",
        "service_plan": "ville-a-ville",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "transport",
        "fixed_price": None,
    },
    "plan_demi_journee": {
        "label": "Plan Demi-Journée (fixed duration $70)",
        "roles": ["client", "driver", "admin"],
        # Fixed plans skip price_proposed in UI pipeline
        "na_statuses": [],
        "trip_type": "one_way",
        "service_plan": "demi-journee",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "duration",
        "fixed_price": 70.0,
        "skip_price_propose": True,
    },
    "plan_journee_complete": {
        "label": "Plan Journée Complète (fixed duration $140)",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [],
        "trip_type": "one_way",
        "service_plan": "journee-complete",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "duration",
        "fixed_price": 140.0,
        "skip_price_propose": True,
    },
    "plan_elegance_night": {
        "label": "Plan Élégance Night (fixed premium $150)",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [],
        "trip_type": "one_way",
        "service_plan": "elegance-night",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "premium",
        "fixed_price": 150.0,
        "skip_price_propose": True,
    },
    "plan_accueil_aeroport": {
        "label": "Plan Accueil Aéroport Cap (dynamic transport)",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [],
        "trip_type": "one_way",
        "service_plan": "accueil-aeroport-cap",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "transport",
        "fixed_price": None,
    },
    "plan_business_vip": {
        "label": "Plan Business VIP (premium dynamic)",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [],
        "trip_type": "one_way",
        "service_plan": "business-vip",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "premium",
        "fixed_price": None,
    },
    "enterprise": {
        "label": "Enterprise self-order",
        "roles": ["enterprise", "driver", "admin", "client"],
        "na_statuses": [],
        "trip_type": "one_way",
        "service_plan": "",
        "guest": False,
        "enterprise": True,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "standard",
    },
    "affiliate": {
        "label": "Affiliate-referred client order (enterprise commission)",
        "roles": ["client", "driver", "admin", "enterprise"],
        "na_statuses": [],
        "trip_type": "one_way",
        "service_plan": "",
        "guest": False,
        "enterprise": True,  # linked enterprise for commission
        "affiliate": True,
        "scheduled": False,
        "pipeline": "standard",
    },
    "scheduled": {
        "label": "Scheduled / is_later client order",
        "roles": ["client", "driver", "admin"],
        "na_statuses": ["waiting_return"],  # one_way scheduled
        "trip_type": "one_way",
        "service_plan": "",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": True,
        "pipeline": "standard",
    },
    "cancelled_snapshot": {
        "label": "Cancelled terminal (normal)",
        "roles": ["client", "driver", "admin"],
        "na_statuses": [
            "pending", "price_proposed", "price_confirmed", "driver_assigned",
            "on_way", "arrived", "in_progress", "waiting_return", "completed",
        ],
        "force_statuses": ["cancelled"],
        "trip_type": "one_way",
        "service_plan": "",
        "guest": False,
        "enterprise": False,
        "affiliate": False,
        "scheduled": False,
        "pipeline": "standard",
    },
}

# Statuses that require a driver
DRIVER_STATUSES = {
    "driver_assigned", "on_way", "arrived", "in_progress", "waiting_return", "completed",
}
# waiting_return only meaningful for round_trip
ROUND_TRIP_ONLY = {"waiting_return"}


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _note(tag: str, otype: str, status: str) -> str:
    return f"{tag}:{otype}:{status}"


def ensure_accounts():
    import io
    from contextlib import redirect_stdout

    with redirect_stdout(io.StringIO()):
        call_command("create_demo_accounts")

    client_email = _env("DAXI_CLIENT_EMAIL") or DEMO_CLIENT_EMAIL
    driver_email = _env("DAXI_DRIVER_EMAIL") or DEMO_DRIVER_EMAIL
    ent_email = _env("DAXI_ENTERPRISE_EMAIL") or DEMO_ENTERPRISE_EMAIL
    guest_id = _env("DAXI_E2E_GUEST_ID") or "e2e-guest-order-matrix"
    tag = _env("DAXI_E2E_MATRIX_TAG") or DEFAULT_TAG

    user = CustomUser.objects.filter(email=client_email).first()
    if not user:
        raise SystemExit(f"client missing: {client_email}")
    driver = Driver.objects.filter(email=driver_email).first()
    if not driver:
        raise SystemExit(f"driver missing: {driver_email}")
    driver.latitude = CAP_PICKUP[0]
    driver.longitude = CAP_PICKUP[1]
    driver.is_verified = True
    driver.is_blocked = False
    # Don't force available — midflow seeds set busy
    driver.save(update_fields=["latitude", "longitude", "is_verified", "is_blocked"])

    ent = Enterprise.objects.filter(email=ent_email).first()
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
        if not ent.affiliate_code:
            ent.save()  # triggers code gen in model.save
        else:
            ent.save()

    return user, driver, ent, guest_id, tag


def _cancel_tagged(tag: str) -> int:
    n = 0
    for o in Order.objects.filter(notes__startswith=f"{tag}:"):
        if o.status not in ("completed", "cancelled"):
            o.status = "cancelled"
            o.cancelled_at = timezone.now()
            o.save(update_fields=["status", "cancelled_at", "updated_at"])
            n += 1
    return n


def _apply_timestamps(o: Order, status: str, now):
    if status == "price_proposed" and hasattr(o, "price_proposed_at"):
        o.price_proposed_at = now
    if status in DRIVER_STATUSES:
        o.driver_assigned_at = now
    if status in ("on_way", "arrived", "in_progress", "waiting_return", "completed"):
        o.on_way_at = now
    if status in ("arrived", "in_progress", "waiting_return", "completed"):
        o.arrived_at = now
    if status in ("in_progress", "waiting_return", "completed"):
        o.in_progress_at = now
    if status == "waiting_return":
        o.waiting_return_at = now
        o.round_trip_phase = "waiting"
        o.round_trip_wait_minutes = o.round_trip_wait_minutes or 30
    if status == "completed":
        o.completed_at = now
    if status == "cancelled":
        o.cancelled_at = now


def _price_for(otype_cfg: dict, status: str):
    fixed = otype_cfg.get("fixed_price")
    if fixed is not None:
        return Decimal(str(fixed))
    if status == "pending":
        return None
    if status == "price_proposed":
        return Decimal("650.00")
    return Decimal("850.00")


def _upsert(tag: str, otype: str, status: str, defaults: dict) -> Order:
    note = _note(tag, otype, status)
    existing = (
        Order.objects.filter(notes=note)
        .exclude(status="cancelled")
        .order_by("-id")
        .first()
    )
    # For cancelled_snapshot / cancelled status, allow cancelled rows
    if status == "cancelled":
        existing = Order.objects.filter(notes=note).order_by("-id").first()
    if existing:
        for k, v in defaults.items():
            setattr(existing, k, v)
        existing.notes = note
        existing.save()
        return existing
    defaults["notes"] = note
    return Order.objects.create(**defaults)


def seed_cell(otype: str, status: str, user, driver, ent, guest_id: str, tag: str) -> dict:
    cfg = ORDER_TYPES[otype]
    now = timezone.now()
    key = f"{otype}__{status}"

    # N/A rules
    if status in cfg.get("na_statuses", []):
        return {"ok": True, "key": key, "otype": otype, "status": status, "na": True, "reason": "type_na_status"}
    if status in ROUND_TRIP_ONLY and cfg.get("trip_type") != "round_trip":
        return {"ok": True, "key": key, "otype": otype, "status": status, "na": True, "reason": "waiting_return_requires_round_trip"}
    if cfg.get("force_statuses") and status not in cfg["force_statuses"]:
        return {"ok": True, "key": key, "otype": otype, "status": status, "na": True, "reason": "force_statuses_only"}

    price = _price_for(cfg, status)
    skip_propose = bool(cfg.get("skip_price_propose"))
    # Fixed plans: if someone asks for price_proposed, coerce to price_confirmed with price
    real_status = status
    if skip_propose and status == "price_proposed":
        real_status = "price_confirmed"
        if price is None:
            price = Decimal(str(cfg["fixed_price"]))

    price_confirmed = real_status not in ("pending", "price_proposed") or (
        skip_propose and real_status == "price_confirmed"
    )
    if real_status == "pending":
        price_confirmed = False
    if real_status == "price_proposed":
        price_confirmed = False

    payment_status = "pending"
    payment_method = ""
    if real_status in (
        "price_confirmed",
        "driver_assigned",
        "on_way",
        "arrived",
        "in_progress",
        "waiting_return",
        "completed",
    ):
        # For price_confirmed we leave payment pending so client payment UI shows;
        # for driver+ we set in_person so driver/admin midflow unlocks.
        if real_status == "price_confirmed" and not skip_propose:
            payment_status = "pending"
            payment_method = ""
            price_confirmed = True
        elif real_status == "price_confirmed" and skip_propose:
            # Fixed plan: price confirmed + awaiting payment selection
            payment_status = "pending"
            payment_method = ""
            price_confirmed = True
            if price is None:
                price = Decimal(str(cfg["fixed_price"]))
        else:
            payment_status = "in_person"
            payment_method = "in_person"
            price_confirmed = True

    # For fixed plan pending: often already has price set
    if skip_propose and real_status == "pending" and price is None:
        price = Decimal(str(cfg["fixed_price"]))

    is_guest = bool(cfg.get("guest"))
    use_ent = bool(cfg.get("enterprise")) and ent is not None

    defaults = dict(
        user=None if is_guest else user,
        guest_id=f"{guest_id}-{otype}" if is_guest else (guest_id if not use_ent else ""),
        client_name=f"E2E Matrix {otype}/{status}",
        client_phone="+50937008801",
        client_email=(user.email if user and not is_guest else "guest.matrix@example.com"),
        pickup="Place d'Armes, Cap-Haïtien",
        destination="Labadee, Cap-Haïtien",
        pickup_lat=CAP_PICKUP[0],
        pickup_lng=CAP_PICKUP[1],
        destination_lat=CAP_DEST[0],
        destination_lng=CAP_DEST[1],
        vehicle_type="economy" if cfg.get("pipeline") != "premium" else "premium",
        trip_type=cfg.get("trip_type") or "one_way",
        service_plan=cfg.get("service_plan") or "",
        passengers=1,
        status=real_status,
        price=price,
        price_confirmed=price_confirmed,
        payment_status=payment_status,
        payment_method=payment_method,
        is_later=bool(cfg.get("scheduled")),
        scheduled_at=(now + timedelta(hours=6)) if cfg.get("scheduled") else None,
    )
    if use_ent:
        defaults["enterprise"] = ent
        defaults["enterprise_commission_pct"] = ent.commission_percent or 10.0
        if cfg.get("affiliate"):
            defaults["client_name"] = f"E2E Affiliate {status}"
            defaults["guest_id"] = f"{guest_id}-aff-{otype}"
            # Affiliate orders still belong to a client user typically
            defaults["user"] = user
        else:
            # Pure enterprise self-order — often guest_id for payment link
            defaults["guest_id"] = f"{guest_id}-ent-{otype}"
            defaults["user"] = None

    if defaults.get("trip_type") == "round_trip":
        defaults["round_trip_wait_minutes"] = 30
        if real_status == "waiting_return":
            defaults["round_trip_phase"] = "waiting"
        elif real_status in ("in_progress", "arrived", "on_way", "driver_assigned"):
            defaults["round_trip_phase"] = "outbound"
        elif real_status == "completed":
            defaults["round_trip_phase"] = "return"

    o = _upsert(tag, otype, status, defaults)

    if real_status in DRIVER_STATUSES:
        o.driver = driver
        o.driver_name = getattr(driver, "full_name", None) or driver.email
        o.driver_phone = driver.phone or ""
    else:
        o.driver = None
        o.driver_name = ""
        o.driver_phone = ""

    _apply_timestamps(o, real_status, now)
    o.save()

    if real_status in ("driver_assigned", "on_way", "arrived", "in_progress", "waiting_return"):
        driver.status = "busy"
        driver.save(update_fields=["status"])

    return {
        "ok": True,
        "key": key,
        "otype": otype,
        "status": status,
        "real_status": o.status,
        "order_id": o.pk,
        "public_code": getattr(o, "public_code", None) or "",
        "price": str(o.price) if o.price is not None else None,
        "price_confirmed": bool(o.price_confirmed),
        "payment_status": o.payment_status,
        "payment_method": o.payment_method or "",
        "service_plan": o.service_plan or "",
        "trip_type": o.trip_type or "",
        "pipeline": cfg.get("pipeline"),
        "driver_id": o.driver_id,
        "enterprise_id": o.enterprise_id,
        "guest_id": o.guest_id or "",
        "user_id": o.user_id,
        "is_later": bool(o.is_later),
        "na": False,
        "roles": cfg.get("roles", []),
        "notes": o.notes,
    }


def matrix_plan() -> dict:
    """Full combo table metadata (for ORDERS_MATRIX_PLAN.md)."""
    cells = []
    for otype, cfg in ORDER_TYPES.items():
        for status in ALL_STATUSES:
            na = False
            reason = ""
            if cfg.get("force_statuses") and status not in cfg["force_statuses"]:
                na, reason = True, "force_statuses_only"
            elif status in cfg.get("na_statuses", []):
                na, reason = True, "type_na_status"
            elif status in ROUND_TRIP_ONLY and cfg.get("trip_type") != "round_trip":
                na, reason = True, "waiting_return_requires_round_trip"
            cells.append({
                "otype": otype,
                "status": status,
                "na": na,
                "reason": reason,
                "roles": cfg.get("roles", []),
                "pipeline": cfg.get("pipeline"),
                "label": cfg.get("label"),
            })
    return {
        "types": list(ORDER_TYPES.keys()),
        "statuses": ALL_STATUSES,
        "roles": ["client", "driver", "admin", "enterprise"],
        "cells": cells,
        "cell_count": len(cells),
        "seedable": sum(1 for c in cells if not c["na"]),
        "na_count": sum(1 for c in cells if c["na"]),
    }


def seed_all(types=None, statuses=None, fresh=False) -> dict:
    user, driver, ent, guest_id, tag = ensure_accounts()
    cancelled = _cancel_tagged(tag) if fresh else 0

    types = types or list(ORDER_TYPES.keys())
    statuses = statuses or ALL_STATUSES

    # Wave-1 recommended: all normal + all plan types through full FSM
    orders = []
    for otype in types:
        if otype not in ORDER_TYPES:
            orders.append({"ok": False, "otype": otype, "error": "unknown_type"})
            continue
        for status in statuses:
            orders.append(seed_cell(otype, status, user, driver, ent, guest_id, tag))

    active = Order.objects.filter(
        driver=driver,
        status__in=["driver_assigned", "on_way", "arrived", "in_progress", "waiting_return"],
    ).exists()
    if not active:
        driver.status = "available"
        driver.save(update_fields=["status"])

    plan = matrix_plan()
    seeded = [o for o in orders if o.get("ok") and not o.get("na")]
    na_rows = [o for o in orders if o.get("na")]

    return {
        "ok": True,
        "tag": tag,
        "guest_id": guest_id,
        "fresh": fresh,
        "cancelled_prior": cancelled,
        "stub": {
            "DAXI_STUB_WHATSAPP": bool(getattr(settings, "DAXI_STUB_WHATSAPP", False)),
            "DAXI_STUB_EMAIL": bool(getattr(settings, "DAXI_STUB_EMAIL", False)),
            "EMAIL_BACKEND": getattr(settings, "EMAIL_BACKEND", ""),
            "WHATSAPP_ACCESS_TOKEN_set": bool(getattr(settings, "WHATSAPP_ACCESS_TOKEN", "")),
            "stub_log": getattr(settings, "DAXI_WHATSAPP_STUB_LOG", ""),
        },
        "accounts": {
            "client_id": user.pk,
            "client_email": user.email,
            "driver_id": driver.pk,
            "driver_email": driver.email,
            "enterprise_id": ent.pk if ent else None,
            "affiliate_code": ent.affiliate_code if ent else None,
        },
        "types_seeded": types,
        "statuses_seeded": statuses,
        "orders": orders,
        "seeded_count": len(seeded),
        "na_count": len(na_rows),
        "matrix": {
            "types": plan["types"],
            "statuses": plan["statuses"],
            "roles": plan["roles"],
            "cell_count": plan["cell_count"],
            "seedable": plan["seedable"],
            "na_count": plan["na_count"],
        },
        "ui_hints": {
            "client_orders": f"/htmx/client/orders/?guest_id={guest_id}",
            "driver_available": "/htmx/driver/orders/?tab=available",
            "driver_accepted": "/htmx/driver/orders/?tab=accepted",
            "admin_orders": "/htmx/admin/orders/?status=all",
            "enterprise_orders": "/htmx/enterprise/orders/",
            "pages": {
                "client": "/",
                "driver": "/driver/",
                "admin": "/admin-dashboard/",
                "enterprise": "/entreprise/",
            },
        },
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--types", default="", help="Comma-separated order types")
    ap.add_argument("--statuses", default="", help="Comma-separated statuses")
    ap.add_argument("--fresh", action="store_true")
    ap.add_argument("--list", action="store_true")
    ap.add_argument("--wave1", action="store_true",
                    help="normal+round_trip+guest + all plan_* through full FSM")
    ap.add_argument("--json-only", action="store_true")
    args = ap.parse_args()

    if args.list:
        print(json.dumps({"ok": True, "order_types": ORDER_TYPES, "statuses": ALL_STATUSES,
                          "matrix": matrix_plan()}, indent=2, default=str))
        return 0

    types = [t.strip() for t in args.types.split(",") if t.strip()] or None
    statuses = [s.strip() for s in args.statuses.split(",") if s.strip()] or None

    if args.wave1:
        types = [
            "normal", "round_trip", "guest", "guest_round_trip",
            "plan_ville_a_ville", "plan_demi_journee", "plan_journee_complete",
            "plan_elegance_night", "plan_accueil_aeroport", "plan_business_vip",
        ]
        statuses = ALL_STATUSES

    payload = seed_all(types=types, statuses=statuses, fresh=args.fresh)
    print(json.dumps(payload, indent=2, default=str))
    bad = [o for o in payload.get("orders", []) if not o.get("ok")]
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
