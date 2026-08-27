"""Journal d'audit sécurité / financier."""
from __future__ import annotations

import json
from decimal import Decimal
from typing import Any, Optional


def _actor_from_request(request) -> tuple[str, str]:
    if not request:
        return 'system', ''
    session = getattr(request, 'session', {})
    if session.get('is_admin'):
        return 'staff', 'admin_session'
    user = getattr(request, 'user', None)
    if user and getattr(user, 'is_authenticated', False):
        if getattr(user, 'is_staff', False):
            return 'staff', str(user.pk)
        if hasattr(user, 'driver_profile'):
            return 'driver', str(user.driver_profile.pk)
        return 'client', str(user.pk)
    if session.get('driver_id'):
        return 'driver', str(session.get('driver_id'))
    if session.get('enterprise_id') or session.get('current_enterprise_id'):
        eid = session.get('enterprise_id') or session.get('current_enterprise_id')
        return 'enterprise', str(eid)
    guest = session.get('guest_id')
    if guest:
        return 'guest', str(guest)
    return 'anonymous', ''


def _ip(request) -> str:
    if not request:
        return ''
    return (request.META.get('HTTP_X_FORWARDED_FOR', '').split(',')[0].strip()
            or request.META.get('REMOTE_ADDR', ''))


def _serialize_value(value: Any) -> str:
    if value is None:
        return ''
    if isinstance(value, Decimal):
        return str(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, default=str)
    return str(value)


def log_security_event(
    action: str,
    request=None,
    order=None,
    old_value: Any = None,
    new_value: Any = None,
    metadata: Optional[dict] = None,
    actor_type: Optional[str] = None,
    actor_id: Optional[str] = None,
):
    from orders.models import SecurityLog

    if actor_type is None or actor_id is None:
        at, aid = _actor_from_request(request)
        actor_type = actor_type or at
        actor_id = actor_id or aid

    SecurityLog.objects.create(
        action=action,
        actor_type=actor_type,
        actor_id=actor_id or '',
        order=order,
        old_value=_serialize_value(old_value),
        new_value=_serialize_value(new_value),
        ip_address=_ip(request) or None,
        metadata=metadata or {},
        user=request.user if request and getattr(request.user, 'is_authenticated', False) else None,
    )


def log_price_change(order, old_price, new_price, request=None, source=''):
    log_security_event(
        'PRICE_CHANGE',
        request=request,
        order=order,
        old_value=old_price,
        new_value=new_price,
        metadata={'source': source},
    )


def log_status_change(order, old_status, new_status, request=None, source=''):
    log_security_event(
        'STATUS_CHANGE',
        request=request,
        order=order,
        old_value=old_status,
        new_value=new_status,
        metadata={'source': source},
    )


def log_payment(order, old_status, new_status, request=None, source='', txn_id=''):
    log_security_event(
        'PAYMENT',
        request=request,
        order=order,
        old_value=old_status,
        new_value=new_status,
        metadata={'source': source, 'txn_id': txn_id},
        actor_type='gateway' if source.endswith('webhook') else None,
    )


def log_wallet(driver, action_detail, request=None, old_value='', new_value=''):
    log_security_event(
        'WALLET',
        request=request,
        old_value=old_value,
        new_value=new_value,
        metadata={'driver_id': driver.pk, 'detail': action_detail},
        actor_type='driver',
        actor_id=str(driver.pk),
    )


def log_driver_block(driver, blocked: bool, request=None):
    log_security_event(
        'DRIVER_BLOCK',
        request=request,
        old_value='active',
        new_value='blocked' if blocked else 'active',
        metadata={'driver_id': driver.pk},
    )


def log_access_denied(request, resource: str = '', permission: str = ''):
    log_security_event(
        'ACCESS_DENIED',
        request=request,
        metadata={'resource': resource, 'permission': permission},
    )
