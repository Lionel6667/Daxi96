"""Contrôle d'accès commandes, transitions de statut — prix via pricing.services."""
from decimal import Decimal

from django.core.exceptions import PermissionDenied

from julmin_taxis.security_utils import guest_ids_match, normalize_guest_id
from julmin_taxis.staff_auth import user_is_staff
from pricing.services import (
    apply_price_to_order,
    price_for_new_order,
    recalculate_order_price,
)

_DRIVER_TRANSITIONS = {
    'driver_assigned': ['on_way', 'cancelled'],
    'on_way': ['arrived', 'in_progress', 'cancelled'],
    'arrived': ['in_progress', 'cancelled'],
    'in_progress': ['completed'],
}

_CLIENT_TRANSITIONS = {
    'pending': ['cancelled'],
    'price_proposed': ['price_confirmed', 'cancelled'],
    'price_confirmed': ['cancelled'],
}

FIREBASE_STAFF_ONLY_FIELDS = frozenset({
    'status', 'price', 'priceConfirmed', 'driverId', 'driverName', 'driverPhone',
    'paymentStatus', 'paymentMethod', 'paid', 'driverCommission',
})


def _session_driver_id(session):
    return session.get('driver_id')


def _session_enterprise_id(session):
    return session.get('current_enterprise_id') or session.get('enterprise_id')


def get_order_actor_role(request, order):
    if user_is_staff(request):
        return 'staff'
    user = getattr(request, 'user', None)
    if user and user.is_authenticated:
        if hasattr(user, 'driver_profile') and order.driver_id == user.driver_profile.id:
            return 'driver'
        if order.user_id and order.user_id == user.id:
            return 'client'
    guest = normalize_guest_id(
        request.POST.get('guest_id', '')
        or request.GET.get('guest_id', '')
        or request.session.get('guest_id', '')
    )
    if guest and order.user_id is None and guest_ids_match(order.guest_id, guest):
        return 'client'
    driver_id = _session_driver_id(request.session)
    if driver_id and order.driver_id and int(driver_id) == int(order.driver_id):
        return 'driver'
    eid = _session_enterprise_id(request.session)
    if eid and getattr(order, 'enterprise_id', None) and int(eid) == int(order.enterprise_id):
        return 'enterprise'
    return None


def can_access_order(request, order):
    return get_order_actor_role(request, order) is not None


def assert_order_transition(order, new_status, role):
    from orders.models import Order

    valid = {s[0] for s in Order.STATUS_CHOICES}
    if new_status not in valid:
        raise PermissionDenied('Statut invalide.')
    if new_status == order.status:
        return
    if role == 'staff':
        return
    table = _CLIENT_TRANSITIONS if role == 'client' else _DRIVER_TRANSITIONS
    allowed = table.get(order.status, [])
    if new_status not in allowed:
        raise PermissionDenied(
            f'Transition interdite: {order.status} → {new_status}'
        )


def filter_firebase_sync_data(data, is_staff):
    if not isinstance(data, dict):
        return data
    if is_staff:
        return data
    return {k: v for k, v in data.items() if k not in FIREBASE_STAFF_ONLY_FIELDS}


def resolve_order_price_for_create(
    service_plan,
    pickup_lat,
    pickup_lng,
    dest_lat,
    dest_lng,
    trip_type='one_way',
    passengers=1,
    wait_minutes=0,
    allow_driver_other=False,
    enterprise_commission_pct=None,
):
    """Compat — délègue à pricing.services.price_for_new_order."""
    result = price_for_new_order(
        service_plan,
        pickup_lat,
        pickup_lng,
        dest_lat,
        dest_lng,
        trip_type=trip_type,
        passengers=passengers,
        wait_minutes=wait_minutes,
        allow_driver_other=allow_driver_other,
        enterprise_commission_pct=enterprise_commission_pct,
    )
    return result.price, result.is_fixed_plan
