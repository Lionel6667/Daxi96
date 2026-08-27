"""Présence utilisateur — activité + contexte UI pour notifications intelligentes."""
from django.core.cache import cache

PRESENCE_TTL = 75
ACTION_TTL = 180


def _key(kind: str, identity) -> str:
    return f'daxi:online:{kind}:{str(identity).strip()}'


def _ctx_key(kind: str, identity) -> str:
    return f'daxi:ctx:{kind}:{str(identity).strip()}'


def _action_key(kind: str, identity, action: str, order_id=None) -> str:
    oid = str(order_id).strip() if order_id is not None else ''
    return f'daxi:action:{kind}:{str(identity).strip()}:{action}:{oid}'


def mark_online(kind: str, identity) -> None:
    if identity is None or str(identity).strip() == '':
        return
    cache.set(_key(kind, identity), 1, PRESENCE_TTL)


def mark_presence_context(kind: str, identity, **context) -> None:
    if identity is None or str(identity).strip() == '':
        return
    mark_online(kind, identity)
    ctx = {k: v for k, v in context.items() if v is not None and v != ''}
    ctx['online'] = True
    cache.set(_ctx_key(kind, identity), ctx, PRESENCE_TTL)


def get_presence_context(kind: str, identity) -> dict:
    if identity is None or str(identity).strip() == '':
        return {}
    ctx = cache.get(_ctx_key(kind, identity))
    if isinstance(ctx, dict):
        return ctx
    if is_online(kind, identity):
        return {'online': True}
    return {}


def is_online(kind: str, identity) -> bool:
    if identity is None or str(identity).strip() == '':
        return False
    return bool(cache.get(_key(kind, identity)))


def mark_recent_action(kind: str, identity, action: str, order_id=None, ttl: int = ACTION_TTL) -> None:
    if identity is None or str(identity).strip() == '' or not action:
        return
    cache.set(_action_key(kind, identity, action, order_id), 1, ttl)


def had_recent_action(kind: str, identity, action: str, order_id=None) -> bool:
    if identity is None or str(identity).strip() == '' or not action:
        return False
    return bool(cache.get(_action_key(kind, identity, action, order_id)))


def is_order_client_online(order) -> bool:
    uid = getattr(order, 'user_id', None)
    if uid:
        return is_online('user', uid)
    gid = (getattr(order, 'guest_id', None) or '').strip()
    if gid:
        return is_online('guest', gid)
    return False


def is_driver_online(driver) -> bool:
    if not driver:
        return False
    return is_online('driver', getattr(driver, 'pk', None) or driver)


def mark_order_client_action(order, action: str, ttl: int = ACTION_TTL) -> None:
    uid = getattr(order, 'user_id', None)
    if uid:
        mark_recent_action('user', uid, action, order.pk, ttl=ttl)
        return
    gid = (getattr(order, 'guest_id', None) or '').strip()
    if gid:
        mark_recent_action('guest', gid, action, order.pk, ttl=ttl)
