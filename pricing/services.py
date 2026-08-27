"""
Source unique de vérité pour le calcul de prix des courses DAXI.
Tous les chemins (client, entreprise, admin, coords, API) doivent passer ici.
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from decimal import Decimal
from typing import Any, Optional

logger = logging.getLogger(__name__)


@dataclass
class PriceResult:
    price: Optional[Decimal]
    distance_km: Optional[float]
    duration_min: Optional[float]
    is_fixed_plan: bool
    engine_result: Optional[dict] = None


def _haversine_km(lat1, lon1, lat2, lon2) -> Optional[float]:
    if not all(v is not None for v in (lat1, lon1, lat2, lon2)):
        return None
    import math as _m
    r = 6371.0
    p1, p2 = _m.radians(lat1), _m.radians(lat2)
    dphi = _m.radians(lat2 - lat1)
    dl = _m.radians(lon2 - lon1)
    a = _m.sin(dphi / 2) ** 2 + _m.cos(p1) * _m.cos(p2) * _m.sin(dl / 2) ** 2
    return 2 * r * _m.asin(_m.sqrt(min(1.0, a)))


def _apply_trip_multipliers(
    base_price: float,
    trip_type: str,
    passengers: int,
    wait_minutes: int,
    allow_driver_other: bool,
) -> float:
    from pricing.models import PricingConfig

    cfg = PricingConfig.get_active()
    price = float(base_price)
    if trip_type == 'round_trip':
        try:
            price *= float(cfg.round_trip_multiplier)
        except Exception:
            price *= 2.0
        wait_min = int(wait_minutes or 0)
        if wait_min > 0 and not allow_driver_other:
            blocks = math.ceil(wait_min / 30)
            price += blocks * float(cfg.wait_price_per_30min)
    passengers = int(passengers or 1)
    if passengers > 1:
        try:
            pct = float(cfg.passenger_price_percent)
        except Exception:
            pct = 5.0
        price *= (1 + (passengers - 1) * pct / 100)
    return round(price, 2)


def _fast_estimate_price(
    pickup_lat,
    pickup_lng,
    dest_lat,
    dest_lng,
    trip_type='one_way',
    passengers=1,
    wait_minutes=0,
    allow_driver_other=False,
) -> tuple[Optional[float], Optional[float]]:
    try:
        from pricing.models import PricingConfig

        cfg = PricingConfig.get_active()
        km = _haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng) or 0
        price = max(
            float(cfg.minimum_price),
            km * float(cfg.base_price_per_km) * float(cfg.global_multiplier),
        )
        price = _apply_trip_multipliers(
            price, trip_type, passengers, wait_minutes, allow_driver_other,
        )
        return price, round(km, 1)
    except Exception:
        km = _haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng) or 0
        if not km:
            return None, None
        price = _apply_trip_multipliers(max(5.0, km * 2.5), trip_type, passengers, wait_minutes, allow_driver_other)
        return price, round(km, 1)


def _engine_price(
    pickup_lat,
    pickup_lng,
    dest_lat,
    dest_lng,
    trip_type='one_way',
    passengers=1,
    wait_minutes=0,
    allow_driver_other=False,
    save_log=False,
    order_id='',
) -> PriceResult:
    from pricing.pricing_engine import calculate_price

    try:
        result = calculate_price(
            origin_lat=pickup_lat,
            origin_lng=pickup_lng,
            dest_lat=dest_lat,
            dest_lng=dest_lng,
            order_id=order_id,
            save_log=save_log,
        )
        price = float(result['final_price'])
        km = float(result.get('total_distance_km') or 0)
        duration_min = result.get('duration_min')
        if duration_min is None:
            duration_s = float(result.get('duration_s') or 0)
            duration_min = round(duration_s / 60.0, 1) if duration_s else None
        price = _apply_trip_multipliers(
            price, trip_type, passengers, wait_minutes, allow_driver_other,
        )
        return PriceResult(
            price=Decimal(str(price)),
            distance_km=km,
            duration_min=duration_min,
            is_fixed_plan=False,
            engine_result=result,
        )
    except Exception as exc:
        logger.warning('pricing engine fallback: %s', exc)
        price, km = _fast_estimate_price(
            pickup_lat, pickup_lng, dest_lat, dest_lng,
            trip_type, passengers, wait_minutes, allow_driver_other,
        )
        return PriceResult(
            price=Decimal(str(price)) if price is not None else None,
            distance_km=km,
            duration_min=None,
            is_fixed_plan=False,
            engine_result=None,
        )


def _order_pricing_params(order) -> dict:
    return {
        'pickup_lat': order.pickup_lat,
        'pickup_lng': order.pickup_lng,
        'dest_lat': order.destination_lat,
        'dest_lng': order.destination_lng,
        'trip_type': order.trip_type or 'one_way',
        'passengers': int(order.passengers or 1),
        'wait_minutes': int(order.round_trip_wait_minutes or 0),
        'allow_driver_other': bool(order.round_trip_allow_driver_other_rides),
        'service_plan': order.service_plan or '',
        'order_id': str(order.pk or order.firebase_uid or ''),
    }


def _apply_enterprise_commission(price: Decimal, enterprise_commission_pct: Optional[float], order) -> Decimal:
    pct = enterprise_commission_pct
    if pct is None and getattr(order, 'enterprise_commission_pct', None):
        pct = float(order.enterprise_commission_pct)
    if pct and price is not None:
        return Decimal(str(round(float(price) * (1 + float(pct) / 100), 2)))
    return price


def recalculate_order_price(
    order,
    enterprise_commission_pct: Optional[float] = None,
    save_log: bool = False,
) -> PriceResult:
    """
    Recalcule le prix d'une commande existante (source unique de vérité).
    """
    from julmin_taxis.service_plans import resolve_fixed_plan_price

    params = _order_pricing_params(order)
    fixed = resolve_fixed_plan_price(params['service_plan'])
    if fixed is not None:
        price = _apply_enterprise_commission(Decimal(str(fixed)), enterprise_commission_pct, order)
        km = _haversine_km(params['pickup_lat'], params['pickup_lng'], params['dest_lat'], params['dest_lng'])
        return PriceResult(
            price=price,
            distance_km=round(km, 1) if km else None,
            duration_min=None,
            is_fixed_plan=True,
            engine_result=None,
        )

    if not (
        params['pickup_lat'] and params['pickup_lng']
        and params['dest_lat'] and params['dest_lng']
    ):
        return PriceResult(None, None, None, False, None)

    result = _engine_price(
        params['pickup_lat'],
        params['pickup_lng'],
        params['dest_lat'],
        params['dest_lng'],
        trip_type=params['trip_type'],
        passengers=params['passengers'],
        wait_minutes=params['wait_minutes'],
        allow_driver_other=params['allow_driver_other'],
        save_log=save_log,
        order_id=params['order_id'],
    )
    if result.price is not None:
        result.price = _apply_enterprise_commission(result.price, enterprise_commission_pct, order)
    return result


def preview_order_price(
    pickup_lat,
    pickup_lng,
    dest_lat,
    dest_lng,
    trip_type='one_way',
    passengers=1,
    wait_minutes=0,
    allow_driver_other=False,
    service_plan='',
    enterprise_commission_pct: Optional[float] = None,
    save_log: bool = False,
) -> PriceResult:
    """Estimation sans instance Order (aperçu client / formulaire)."""
    from orders.models import Order

    stub = Order(
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        destination_lat=dest_lat,
        destination_lng=dest_lng,
        trip_type=trip_type,
        passengers=passengers,
        round_trip_wait_minutes=wait_minutes,
        round_trip_allow_driver_other_rides=allow_driver_other,
        service_plan=service_plan or '',
        enterprise_commission_pct=enterprise_commission_pct or 0,
    )
    return recalculate_order_price(stub, enterprise_commission_pct=enterprise_commission_pct, save_log=save_log)


def price_for_new_order(
    service_plan,
    pickup_lat,
    pickup_lng,
    dest_lat,
    dest_lng,
    trip_type='one_way',
    passengers=1,
    wait_minutes=0,
    allow_driver_other=False,
    enterprise_commission_pct: Optional[float] = None,
) -> PriceResult:
    """
    Prix à la création : plan forfaitaire confirmé immédiatement,
    sinon calcul dynamique si coords complètes, sinon None.
    """
    from julmin_taxis.service_plans import resolve_fixed_plan_price

    fixed = resolve_fixed_plan_price(service_plan or '')
    if fixed is not None:
        price = Decimal(str(fixed))
        if enterprise_commission_pct:
            price = Decimal(str(round(float(price) * (1 + float(enterprise_commission_pct) / 100), 2)))
        km = _haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng)
        return PriceResult(
            price=price,
            distance_km=round(km, 1) if km else None,
            duration_min=None,
            is_fixed_plan=True,
        )

    if not (pickup_lat and pickup_lng and dest_lat and dest_lng):
        return PriceResult(None, None, None, False, None)

    return preview_order_price(
        pickup_lat, pickup_lng, dest_lat, dest_lng,
        trip_type=trip_type,
        passengers=passengers,
        wait_minutes=wait_minutes,
        allow_driver_other=allow_driver_other,
        service_plan=service_plan,
        enterprise_commission_pct=enterprise_commission_pct,
    )


def apply_price_to_order(
    order,
    propose: bool = False,
    enterprise_commission_pct: Optional[float] = None,
    save_log: bool = False,
    actor_request=None,
) -> Optional[PriceResult]:
    """Recalcule et applique le prix sur l'ordre (proposition ou mise à jour)."""
    from django.utils import timezone

    result = recalculate_order_price(
        order,
        enterprise_commission_pct=enterprise_commission_pct,
        save_log=save_log,
    )
    if result.price is None:
        return None

    old_price = order.price
    order.price = result.price
    update_fields = ['price']
    if propose:
        order.status = 'price_proposed'
        order.price_proposed_at = timezone.now()
        update_fields.extend(['status', 'price_proposed_at'])
    order.save(update_fields=update_fields)

    try:
        from julmin_taxis.security_audit import log_price_change
        log_price_change(order, old_price, result.price, request=actor_request)
    except Exception:
        pass

    return result
