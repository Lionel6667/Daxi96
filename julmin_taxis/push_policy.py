"""Politique d'envoi des notifications push — une fois par événement, pas d'écho."""
from __future__ import annotations

import logging
import time

from django.core.cache import cache

from julmin_taxis.presence import get_presence_context, had_recent_action, is_online

logger = logging.getLogger(__name__)


EVENT_ALIASES = {
    'driver_on_the_way': 'on_way',
    'driver_arrived': 'arrived',
    'order_cancelled': 'cancelled',
    'order_completed': 'completed',
    'driver_accepted': 'driver_assigned',
    'pending': 'order_created',
}


CRITICAL_EVENTS = frozenset({
    'sos_alert', 'sos_ack', 'cancelled', 'danger_zone', 'driver_unassigned',
})

IMPORTANT_EVENTS = frozenset({
    'order_created', 'price_proposed', 'price_confirmed', 'payment_confirmed',
    'payment_failed', 'driver_assigned', 'on_way', 'arrived', 'in_progress',
    'completed', 'waiting_return', 'new_message', 'trip_reminder',
    'trip_reminder_1d', 'trip_reminder_3d', 'trip_reminder_7d',
    'trip_reminder_same_day', 'pickup_confirm_prompt', 'relocate_prompt',
    'coords_needed', 'coords_set', 'trip_paused', 'trip_resumed', 'trip_extended',
    'price_updated', 'now_transition', 'lost_object_ack', 'gps_reminder',
    'enterprise_payment_link', 'receipt_ready', 'rating_request',
})


CLIENT_NEVER_PUSH = frozenset({
    'status_updated', 'status_changed', 'order_updated',
    'price_refused',
})


USER_ACTION_BY_EVENT = {
    'price_confirmed': 'price_confirmed',
    'price_refused': 'price_refused',
    'cancelled': 'order_cancelled',
    'sos_ack': 'sos_triggered',
}


RETRY_AFTER_OFFLINE_SEC = {
    'sos_alert': 5 * 60,
    'sos_ack': 10 * 60,
    'cancelled': 10 * 60,
    'danger_zone': 15 * 60,
    'driver_unassigned': 15 * 60,
    'price_proposed': 30 * 60,
    'new_message': 20 * 60,
    'driver_assigned': 15 * 60,
    'on_way': 15 * 60,
    'arrived': 15 * 60,
    'pickup_confirm_prompt': 30 * 60,
    'relocate_prompt': 20 * 60,
    'trip_reminder': 2 * 3600,
    'trip_reminder_1d': 4 * 3600,
    'trip_reminder_3d': 6 * 3600,
    'trip_reminder_7d': 12 * 3600,
    'trip_reminder_same_day': 3600,
    'completed': 2 * 3600,
    'gps_reminder': 45 * 60,
}

DELIVERY_CACHE_MAX = 7 * 86400
CLAIM_TTL_SEC = 90

DRIVER_CRITICAL = frozenset({'sos_alert', 'new_order_pending_accept', 'round_trip_pickup_requested'})
DRIVER_IMPORTANT = frozenset({
    'new_order', 'new_message', 'order_updated', 'client_cancelled',
    'lost_object_reported', 'coords_set', 'pickup_updated', 'trip_reminder',
    'danger_zone', 'zone_alert',
})


SKIP_IF_VIEWING_ORDER = frozenset({
    'order_created', 'price_proposed', 'price_confirmed', 'payment_confirmed',
    'driver_assigned', 'on_way', 'arrived', 'in_progress', 'completed',
    'waiting_return', 'coords_needed', 'coords_set', 'trip_paused',
    'trip_resumed', 'trip_extended', 'price_updated', 'now_transition',
    'gps_reminder', 'pickup_confirm_prompt', 'relocate_prompt',
    'lost_object_ack', 'receipt_ready', 'rating_request',
    'enterprise_payment_link', 'sos_ack',
})


def canonical_event(event: str) -> str:
    event = (event or '').strip()
    return EVENT_ALIASES.get(event, event)


def _delivery_key(kind: str, identity, order_id, event: str) -> str:
    return f'daxi:notif:delivered:{kind}:{identity}:{order_id}:{event}'


def _claim_key(kind: str, identity, order_id, event: str) -> str:
    return f'daxi:notif:claim:{kind}:{identity}:{order_id}:{event}'


def _client_identity(order):
    uid = getattr(order, 'user_id', None)
    if uid:
        return 'user', uid
    gid = (getattr(order, 'guest_id', None) or '').strip()
    if gid:
        return 'guest', gid
    return None, None


def _order_id_str(order) -> str:
    return str(getattr(order, 'pk', '') or '')


def _ctx_matches_order(ctx: dict, order) -> bool:
    oid = _order_id_str(order)
    viewing = str(ctx.get('viewing_order_id') or '')
    return bool(oid and viewing == oid)


def _delivery_record(kind: str, identity, order_id, event: str) -> dict | None:
    rec = cache.get(_delivery_key(kind, identity, order_id, event))
    return rec if isinstance(rec, dict) else None


def mark_notification_delivered(order, event: str) -> None:
    """Marque qu'une notification a été envoyée (push ou équivalent)."""
    event = canonical_event(event)
    kind, identity = _client_identity(order)
    if not kind or not event:
        return
    cache.set(
        _delivery_key(kind, identity, order.pk, event),
        {'at': time.time(), 'count': 1},
        DELIVERY_CACHE_MAX,
    )


def claim_client_push(order, event: str) -> bool:
    """Verrou atomique : un seul envoi concurrent pour (client, commande, événement)."""
    event = canonical_event(event)
    kind, identity = _client_identity(order)
    if not event:
        return False
    if not kind:
        key = f'daxi:notif:claim:anon:{_order_id_str(order)}:{event}'
        return cache.add(key, 1, CLAIM_TTL_SEC)
    return cache.add(_claim_key(kind, identity, order.pk, event), 1, CLAIM_TTL_SEC)


def release_client_push_claim(order, event: str) -> None:
    event = canonical_event(event)
    kind, identity = _client_identity(order)
    if not event:
        return
    if not kind:
        cache.delete(f'daxi:notif:claim:anon:{_order_id_str(order)}:{event}')
        return
    cache.delete(_claim_key(kind, identity, order.pk, event))


def _can_retry_delivery(kind: str, identity, order_id, event: str) -> bool:
    if event in CLIENT_NEVER_PUSH:
        return False
    rec = _delivery_record(kind, identity, order_id, event)
    if not rec:
        return True
    if is_online(kind, identity):
        return False
    retry_after = RETRY_AFTER_OFFLINE_SEC.get(event, 3600)
    elapsed = time.time() - float(rec.get('at', 0))
    return elapsed >= retry_after


def should_send_client_push(order, event: str, *, extra: dict | None = None) -> tuple[bool, str]:
    """Retourne (envoyer, raison)."""
    event = canonical_event(event)
    if not event:
        return False, 'empty_event'

    if event in CLIENT_NEVER_PUSH:
        return False, 'never_push'

    kind, identity = _client_identity(order)
    if not kind:
        return True, 'no_identity'

    action = USER_ACTION_BY_EVENT.get(event)
    if action and had_recent_action(kind, identity, action, order.pk):
        return False, 'recent_user_action'

    rec = _delivery_record(kind, identity, order.pk, event)
    if rec and not _can_retry_delivery(kind, identity, order.pk, event):
        return False, 'already_sent'

    ctx = get_presence_context(kind, identity)
    on_order = _ctx_matches_order(ctx, order)

    if event == 'new_message':
        chat_oid = str(ctx.get('viewing_chat_order_id') or '')
        if chat_oid == _order_id_str(order):
            return False, 'chat_open'
        return True, 'new_message'

    if event == 'price_proposed':
        if on_order and ctx.get('viewing_price_proposal'):
            return False, 'price_visible'
        if on_order:
            return False, 'order_visible'
        return True, 'price_proposed'

    if event in CRITICAL_EVENTS:
        return True, event

    if event in SKIP_IF_VIEWING_ORDER and on_order:
        return False, 'order_visible'

    if event in IMPORTANT_EVENTS:
        return True, event

    if ctx.get('online') and on_order:
        return False, 'order_visible'

    return True, 'send'


def mark_push_sent(order_id, event: str) -> None:
    """Compat — délégation vers mark_notification_delivered via order pk seul."""
    from orders.models import Order
    try:
        order = Order.objects.only('pk', 'user_id', 'guest_id').get(pk=order_id)
        mark_notification_delivered(order, event)
    except Order.DoesNotExist:
        cache.set(f'daxi:push:sent:{order_id}:{canonical_event(event)}', {'at': time.time()}, DELIVERY_CACHE_MAX)


def _driver_dedup_key(driver_id, event: str, order=None) -> str:
    event = canonical_event(event)
    oid = getattr(order, 'pk', None) or ''
    return f'daxi:push:driver:{driver_id}:{event}:{oid}'


def should_send_driver_push(driver, event: str, *, order=None, extra: dict | None = None) -> tuple[bool, str]:
    event = canonical_event(event)
    if not event or not driver:
        return False, 'empty'

    driver_id = getattr(driver, 'pk', None) or driver
    dedup_key = _driver_dedup_key(driver_id, event, order)
    rec = cache.get(dedup_key)
    if rec and event not in DRIVER_CRITICAL:
        if is_online('driver', driver_id):
            return False, 'already_sent'
        retry_after = RETRY_AFTER_OFFLINE_SEC.get(event, 1800)
        stamp = float(rec.get('at', 0) if isinstance(rec, dict) else 0)
        if time.time() - stamp < retry_after:
            return False, 'already_sent'

    from julmin_taxis.presence import get_presence_context

    ctx = get_presence_context('driver', driver_id)
    if event == 'new_message' and order:
        viewing = str(ctx.get('viewing_order_id') or '')
        if viewing == str(getattr(order, 'pk', '')):
            chat = str(ctx.get('viewing_chat_order_id') or '')
            if chat == viewing:
                return False, 'chat_open'

    if event in DRIVER_CRITICAL:
        return True, event

    if event in DRIVER_IMPORTANT:
        if ctx.get('viewing_order_id') and order and str(ctx.get('viewing_order_id')) == str(order.pk):
            if event in ('order_updated', 'coords_set', 'pickup_updated', 'danger_zone', 'zone_alert'):
                return False, 'order_visible'
        return True, event

    if ctx.get('online') and order and str(ctx.get('viewing_order_id') or '') == str(getattr(order, 'pk', '')):
        return False, 'order_visible'

    return True, 'offline_default'


def claim_driver_push(driver, event: str, order=None) -> bool:
    event = canonical_event(event)
    driver_id = getattr(driver, 'pk', None) or driver
    if not driver_id or not event:
        return False
    return cache.add(f'daxi:notif:claim:driver:{driver_id}:{event}:{getattr(order, "pk", "") or ""}', 1, CLAIM_TTL_SEC)


def release_driver_push_claim(driver, event: str, order=None) -> None:
    event = canonical_event(event)
    driver_id = getattr(driver, 'pk', None) or driver
    if not driver_id or not event:
        return
    cache.delete(f'daxi:notif:claim:driver:{driver_id}:{event}:{getattr(order, "pk", "") or ""}')


def mark_driver_push_sent(driver, event: str, order=None) -> None:
    driver_id = getattr(driver, 'pk', None) or driver
    cache.set(
        _driver_dedup_key(driver_id, event, order),
        {'at': time.time()},
        DELIVERY_CACHE_MAX,
    )


ENTERPRISE_IMPORTANT = frozenset({
    'new_order', 'order_updated', 'payment_confirmed', 'driver_assigned',
    'completed', 'cancelled', 'new_message', 'withdrawal_approved',
})


def _enterprise_id(enterprise) -> str:
    return str(getattr(enterprise, 'pk', None) or enterprise or '')


def should_send_enterprise_push(enterprise, event: str, *, order=None) -> tuple[bool, str]:
    event = canonical_event(event)
    if not event or not enterprise:
        return False, 'empty'
    eid = _enterprise_id(enterprise)
    key = f'daxi:push:enterprise:{eid}:{event}:{getattr(order, "pk", "") or ""}'
    rec = cache.get(key)
    if rec:
        if is_online('enterprise', eid):
            return False, 'already_sent'
        if time.time() - float(rec.get('at', 0) if isinstance(rec, dict) else 0) < RETRY_AFTER_OFFLINE_SEC.get(event, 1800):
            return False, 'already_sent'
    ctx = get_presence_context('enterprise', eid)
    if order and str(ctx.get('viewing_order_id') or '') == str(getattr(order, 'pk', '')):
        if event not in ('cancelled', 'new_message'):
            return False, 'order_visible'
    if event in ENTERPRISE_IMPORTANT or event in CRITICAL_EVENTS:
        return True, event
    return True, 'send'


def claim_enterprise_push(enterprise, event: str, order=None) -> bool:
    event = canonical_event(event)
    eid = _enterprise_id(enterprise)
    if not eid or not event:
        return False
    return cache.add(
        f'daxi:notif:claim:enterprise:{eid}:{event}:{getattr(order, "pk", "") or ""}',
        1, CLAIM_TTL_SEC,
    )


def release_enterprise_push_claim(enterprise, event: str, order=None) -> None:
    event = canonical_event(event)
    eid = _enterprise_id(enterprise)
    if not eid or not event:
        return
    cache.delete(f'daxi:notif:claim:enterprise:{eid}:{event}:{getattr(order, "pk", "") or ""}')


def mark_enterprise_push_sent(enterprise, event: str, order=None) -> None:
    event = canonical_event(event)
    eid = _enterprise_id(enterprise)
    cache.set(
        f'daxi:push:enterprise:{eid}:{event}:{getattr(order, "pk", "") or ""}',
        {'at': time.time()},
        DELIVERY_CACHE_MAX,
    )


def claim_admin_push(event: str, *, order=None, extra_id: str = '') -> bool:
    event = canonical_event(event)
    oid = str(getattr(order, 'pk', '') or extra_id or '')
    if not event:
        return False
    return cache.add(f'daxi:notif:claim:admin:{event}:{oid}', 1, CLAIM_TTL_SEC)
