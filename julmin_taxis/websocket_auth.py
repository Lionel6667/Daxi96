"""
Autorisation WebSocket — contrôle d'accès par rôle (OWASP broken access control).
"""
from urllib.parse import parse_qs

from channels.db import database_sync_to_async

from julmin_taxis.security_utils import guest_ids_match, normalize_guest_id


def _session(scope) -> dict:
    return scope.get('session') or {}


def _query(scope) -> dict:
    return parse_qs(scope.get('query_string', b'').decode())


@database_sync_to_async
def can_access_order_ws(scope, order_id: str) -> bool:
    from orders.models import Order

    try:
        order = Order.objects.get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError, TypeError):
        return False

    user = scope.get('user')
    if user and getattr(user, 'is_authenticated', False):
        if getattr(user, 'is_staff', False):
            return True
        if order.user_id and order.user_id == user.pk:
            return True

    session = _session(scope)
    if session.get('is_admin'):
        return True

    driver_id = session.get('driver_id')
    if driver_id and order.driver_id and int(driver_id) == int(order.driver_id):
        return True

    enterprise_id = session.get('enterprise_id')
    if enterprise_id and order.enterprise_id and int(enterprise_id) == int(order.enterprise_id):
        return True

    qs = _query(scope)
    guest_qs = normalize_guest_id((qs.get('guest_id') or [''])[0])
    guest_sess = normalize_guest_id(session.get('guest_id'))
    gid = guest_qs or guest_sess
    if gid and order.user_id is None and guest_ids_match(order.guest_id, gid):
        return True

    return False


@database_sync_to_async
def can_access_driver_ws(scope, driver_id: str) -> bool:
    session = _session(scope)
    if session.get('is_admin'):
        return True
    user = scope.get('user')
    if user and getattr(user, 'is_authenticated', False) and getattr(user, 'is_staff', False):
        return True
    sid = session.get('driver_id')
    if sid and str(sid) == str(driver_id):
        from drivers.models import Driver
        try:
            d = Driver.objects.get(pk=int(driver_id))
            return not d.is_blocked
        except (Driver.DoesNotExist, ValueError, TypeError):
            return False
    return False


@database_sync_to_async
def can_access_enterprise_ws(scope, enterprise_id: str) -> bool:
    session = _session(scope)
    if session.get('is_admin'):
        return True
    user = scope.get('user')
    if user and getattr(user, 'is_authenticated', False) and getattr(user, 'is_staff', False):
        return True
    eid = session.get('enterprise_id')
    if eid and str(eid) == str(enterprise_id):
        return True
    return False
