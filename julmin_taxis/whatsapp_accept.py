"""WhatsApp & web accept flow for driver order assignment."""
import logging

from django.core import signing
from django.db import transaction
from django.utils import timezone

logger = logging.getLogger(__name__)

ACCEPT_TOKEN_SALT = 'daxi-wa-accept'
ACCEPT_TOKEN_MAX_AGE = 86400


def make_accept_token(order_id: int, driver_id: int) -> str:
    """Token signé URL-safe (sans « : » — certains proxies tronquent le path)."""
    raw = signing.dumps({'o': order_id, 'd': driver_id}, salt=ACCEPT_TOKEN_SALT)
    return raw.replace(':', '.')


def normalize_accept_token(raw: str) -> str:
    """Rétablit le format Django signing depuis l'URL (points ou deux-points)."""
    from urllib.parse import unquote

    token = unquote(raw or '').strip().strip('/')
    if not token:
        return token
    if token.count(':') < 2:
        token = token.replace('.', ':')
    return token


def load_accept_token(raw: str) -> dict:
    token = normalize_accept_token(raw)
    return signing.loads(token, salt=ACCEPT_TOKEN_SALT, max_age=ACCEPT_TOKEN_MAX_AGE)


def _normalize_phone(phone: str) -> str:
    from julmin_taxis.whatsapp_service import _normalize_phone as _n
    return _n(phone)


def _accept_order_for_driver(order, driver):
    """Assign order to driver atomically. Returns (ok, message)."""
    from orders.models import Order
    from julmin_taxis.htmx_views import (
        _driver_can_accept_order,
        _notify_ws,
        _order_has_full_coords,
        _order_ready_for_driver_accept,
    )

    if not _order_ready_for_driver_accept(order):
        return False, (
            '❌ Le client n\'a pas encore payé — la course n\'est pas disponible à l\'acceptation.'
        )

    can, block_msg = _driver_can_accept_order(driver, order)
    if not can:
        return False, f'❌ {block_msg}'

    with transaction.atomic():
        order = Order.objects.select_for_update().get(pk=order.pk)
        if order.status not in ('pending', 'price_proposed', 'price_confirmed'):
            if order.driver_id == driver.pk:
                return True, f'✅ Vous êtes déjà assigné à la course #{order.pk}.'
            other = order.driver_name or 'un autre chauffeur'
            return False, f'❌ Désolé — {other} a déjà accepté cette course (#{order.pk}).'

        if not _order_ready_for_driver_accept(order):
            return False, (
                '❌ Le client n\'a pas encore payé — la course n\'est pas disponible à l\'acceptation.'
            )

        can, block_msg = _driver_can_accept_order(driver, order)
        if not can:
            return False, f'❌ {block_msg}'

        order.driver = driver
        from julmin_taxis.driver_display_utils import driver_public_dict
        drv_info = driver_public_dict(driver, order)
        order.driver_name = drv_info['driver_name'] or driver.get_full_name()
        order.driver_phone = drv_info['driver_phone'] or driver.phone
        order.driver_photo_url = drv_info['driver_photo'] or ''
        order.status = 'driver_assigned'
        order.driver_assigned_at = timezone.now()
        order.save()

    if not order.is_later:
        driver.status = 'busy'
        driver.save(update_fields=['status'])

    drv_payload = driver_public_dict(driver, order)
    drv_payload['order_id'] = order.pk
    drv_payload['status'] = 'driver_assigned'
    _notify_ws(f'order_{order.pk}', 'driver_accepted', drv_payload)
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'driver_assigned'})
    if not order.is_later:
        _notify_ws(f'order_{order.pk}', 'driver_assigned', {
            **drv_payload,
            'message': f'Votre chauffeur {order.driver_name} a accepté — en attente de départ.',
        })
        try:
            from julmin_taxis.notify import notify_order_status
            notify_order_status(order, 'driver_assigned')
        except Exception as exc:
            logger.warning('Notify driver_assigned failed: %s', exc)

    if not _order_has_full_coords(order):
        return True, (
            f'✅ Course #{order.pk} acceptée ! '
            f'Ouvrez l\'app chauffeur et placez départ/destination sur la carte avant de partir.'
        )
    return True, f'✅ Course #{order.pk} acceptée ! Départ : {order.pickup}'


def accept_order_from_token(order_id, token, phone_hint=None):
    """Validate signed token and assign order. Returns HTML or text message."""
    from drivers.models import Driver
    from orders.models import Order

    try:
        data = load_accept_token(token)
    except signing.BadSignature:
        return False, 'Lien invalide ou expiré. Demandez une nouvelle notification.'

    if int(data.get('o', 0)) != int(order_id):
        return False, 'Lien invalide pour cette commande.'

    try:
        driver = Driver.objects.get(pk=int(data['d']))
    except (Driver.DoesNotExist, KeyError, ValueError):
        return False, 'Chauffeur introuvable.'

    if phone_hint:
        norm_hint = _normalize_phone(phone_hint)
        norm_driver = _normalize_phone(driver.phone)
        if norm_hint and norm_driver and norm_hint != norm_driver:
            return False, 'Ce lien est réservé à un autre chauffeur.'

    try:
        order = Order.objects.get(pk=int(order_id))
    except Order.DoesNotExist:
        return False, 'Commande introuvable.'

    ok, msg = _accept_order_for_driver(order, driver)
    return ok, msg


def handle_whatsapp_accept_reply(sender: str, payload: str) -> str:
    """Handle quick-reply / button payload from WhatsApp."""
    from drivers.models import Driver

    sender_norm = _normalize_phone(sender)
    driver = Driver.objects.filter(phone__icontains=sender_norm[-8:]).first()
    if not driver:
        return '❌ Numéro non reconnu comme chauffeur DAXI. Connectez-vous sur l\'app chauffeur.'

    order_id = None
    if payload.startswith('accept_'):
        parts = payload.split('_')
        if len(parts) >= 2:
            try:
                order_id = int(parts[1])
            except ValueError:
                pass
    if not order_id:
        return 'Utilisez le bouton *J\'accepte* dans le message de nouvelle commande, ou le lien reçu.'

    token = make_accept_token(order_id, driver.pk)
    ok, msg = accept_order_from_token(order_id, token, phone_hint=sender)
    return msg
