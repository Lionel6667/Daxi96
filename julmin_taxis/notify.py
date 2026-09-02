"""Central order notifications — email + WhatsApp + push FCM avec safe fallbacks."""
import logging

from julmin_taxis.notify_dispatch import run_after_commit

logger = logging.getLogger(__name__)

PUSH_MESSAGES = {
    'price_proposed': ('Prix proposé', 'Un tarif vous a été proposé pour votre course.'),
    'price_confirmed': ('Prix confirmé', 'Le tarif de votre course a été confirmé.'),
    'payment_confirmed': ('Paiement reçu', 'Paiement confirmé. Un chauffeur va bientôt être assigné.'),
    'payment_cash_confirmed': ('Course confirmée', 'Vous paierez le chauffeur en espèces. Recherche d\'un chauffeur en cours.'),
    'driver_assigned': ('Chauffeur assigné', 'Votre chauffeur a été assigné à la course.'),
    'on_way': ('Chauffeur en route', 'Votre chauffeur est en route vers vous.'),
    'arrived': ('Chauffeur arrivé', 'Votre chauffeur est arrivé au point de départ.'),
    'in_progress': ('Course démarrée', 'Votre course est en cours.'),
    'waiting_return': ('Attente avant le retour', 'Arrivé à destination — attente du retour.'),
    'completed': ('Course terminée', 'Merci d\'avoir voyagé avec Daxi.'),
    'cancelled': ('Course annulée', 'Votre course a été annulée.'),
    'new_message': ('Nouveau message', 'Vous avez un nouveau message sur votre course.'),
    'sos_ack': ('SOS reçu', 'Votre signal SOS a été transmis à l\'équipe DAXI.'),
    'trip_reminder': ('Rappel de course', 'Votre course planifiée approche — préparez-vous.'),
    'trip_paused': ('Course en pause', 'La course est en pause — frais d\'attente applicables.'),
    'trip_resumed': ('Course reprise', 'Votre course a repris.'),
    'trip_extended': ('Trajet prolongé', 'Prolongation confirmée — tarif ajusté.'),
}

DRIVER_PUSH_MESSAGES = {
    'new_order': ('Nouvelle course', 'Une nouvelle demande de course est disponible.'),
    'new_message': ('Nouveau message', 'Message du client sur une course.'),
    'order_updated': ('Course mise à jour', 'Une de vos courses a été mise à jour.'),
    'sos_alert': ('🆘 SOS URGENCE', 'Alerte SOS sur une course en cours.'),
}

                                                                        
WHATSAPP_BY_STATUS = {
    'price_proposed': 'notify_client_price_proposed',
    'price_confirmed': 'notify_client_price_confirmed',
    'payment_confirmed': 'notify_client_payment_confirmed',
    'payment_cash_confirmed': 'notify_client_payment_cash',
    'driver_assigned': 'notify_client_driver_assigned',
    'on_way': 'notify_client_driver_on_way',
    'arrived': 'notify_client_driver_arrived',
    'in_progress': 'notify_client_trip_started',
    'waiting_return': 'notify_client_waiting_return',
    'completed': 'notify_client_trip_completed',
    'cancelled': 'notify_client_cancelled',
    'trip_paused': 'notify_client_trip_paused',
    'trip_resumed': 'notify_client_trip_resumed',
    'trip_extended': 'notify_client_trip_extended',
}


def _safe_email(order, method_name: str) -> bool:
    email = (getattr(order, 'client_email', None) or '').strip()
    if not email:
        return False
    try:
        from notifications.email_service import EmailService
        fn = getattr(EmailService, method_name, None)
        if not fn:
            return False
        fn(order)
        logger.info('[Notify] email %s → %s (order #%s)', method_name, email, order.pk)
        return True
    except Exception as exc:
        logger.warning('[Notify] email %s failed order #%s: %s', method_name, order.pk, exc)
        return False


def _safe_whatsapp(order, fn_name: str, **kwargs) -> bool:
    try:
        from julmin_taxis import whatsapp_service as wa
        fn = getattr(wa, fn_name, None)
        if not fn:
            return False
        ok = fn(order, **kwargs) if kwargs else fn(order)
        if ok:
            logger.info('[Notify] whatsapp %s order #%s OK', fn_name, order.pk)
        else:
            logger.warning('[Notify] whatsapp %s order #%s → false (no send)', fn_name, order.pk)
        return bool(ok)
    except Exception as exc:
        logger.warning('[Notify] whatsapp %s failed order #%s: %s', fn_name, order.pk, exc)
        return False


def _safe_push_order(order, status: str, extra: dict | None = None) -> int:
    """Envoie une notification push FCM au client si elle apporte une vraie valeur."""
    claimed = False
    try:
        from notifications.push_devices import send_push_tokens, tokens_for_order_client
        from julmin_taxis.notification_messages import push_text
        from julmin_taxis.push_policy import (
            claim_client_push, mark_notification_delivered,
            release_client_push_claim, should_send_client_push,
        )

        should, reason = should_send_client_push(order, status, extra=extra)
        if not should:
            logger.debug('[Notify] push skip %s order #%s (%s)', status, order.pk, reason)
            return 0
        if not claim_client_push(order, status):
            logger.debug('[Notify] push skip %s order #%s (claim_taken)', status, order.pk)
            return 0
        claimed = True

        title, body = push_text('client', status, order)
        if extra:
            title = extra.get('push_title') or title
            body = extra.get('push_body') or extra.get('message') or body
        tokens = tokens_for_order_client(order)
        if not tokens:
            release_client_push_claim(order, status)
            return 0
        from notifications.push_devices import envelope_push_data
        data = envelope_push_data(status, order=order, url=f'/#courses/{order.pk}', extra=extra)
        urgent = status in (
            'sos_alert', 'sos_ack', 'driver_assigned', 'on_way', 'arrived',
            'price_proposed', 'danger_zone', 'cancelled', 'order_cancelled',
            'new_message', 'driver_unassigned',
        )
        sent = send_push_tokens(tokens, title, body, data, urgent=urgent)
        if sent:
            mark_notification_delivered(order, status)
            logger.info('[Notify] push %s → %s device(s) order #%s (%s)', status, sent, order.pk, reason)
            return sent
        release_client_push_claim(order, status)
        return 0
    except Exception as exc:
        if claimed:
            try:
                from julmin_taxis.push_policy import release_client_push_claim
                release_client_push_claim(order, status)
            except Exception:
                pass
        logger.warning('[Notify] push %s failed order #%s: %s', status, order.pk, exc)
        return 0


def push_order_event(order, event: str, extra: dict | None = None) -> int:
    """Point d'entrée unique — un push client par événement, jamais en double."""
    return _safe_push_order(order, event, extra)


def _safe_push_enterprise(enterprise, event: str, order=None, extra: dict | None = None) -> int:
    if not enterprise:
        return 0
    claimed = False
    try:
        from notifications.push_devices import envelope_push_data, send_push_tokens, tokens_for_enterprise
        from julmin_taxis.notification_messages import push_text
        from julmin_taxis.push_policy import (
            claim_enterprise_push, mark_enterprise_push_sent,
            release_enterprise_push_claim, should_send_enterprise_push,
        )

        should, reason = should_send_enterprise_push(enterprise, event, order=order)
        if not should:
            logger.debug('[Notify] push enterprise skip %s (%s)', event, reason)
            return 0
        if not claim_enterprise_push(enterprise, event, order):
            return 0
        claimed = True
        title, body = push_text('enterprise', event, order)
        tokens = tokens_for_enterprise(enterprise)
        if not tokens:
            release_enterprise_push_claim(enterprise, event, order)
            return 0
        url = '/entreprise/'
        if order is not None and getattr(order, 'pk', None):
            url = f'/entreprise/#order-{order.pk}'
        data = envelope_push_data(event, order=order, url=url, extra=extra)
        sent = send_push_tokens(tokens, title, body, data, urgent=event in ('cancelled', 'new_order'))
        if sent:
            mark_enterprise_push_sent(enterprise, event, order)
            logger.info('[Notify] enterprise push %s → %s device(s)', event, sent)
            return sent
        release_enterprise_push_claim(enterprise, event, order)
        return 0
    except Exception as exc:
        if claimed:
            try:
                from julmin_taxis.push_policy import release_enterprise_push_claim
                release_enterprise_push_claim(enterprise, event, order)
            except Exception:
                pass
        logger.warning('[Notify] push enterprise %s failed: %s', event, exc)
        return 0


def push_enterprise_event(order, event: str, extra: dict | None = None) -> int:
    enterprise = getattr(order, 'enterprise', None)
    if not enterprise:
        return 0
    return _safe_push_enterprise(enterprise, event, order, extra)


def _safe_push_driver(driver, event: str, order=None, extra: dict | None = None) -> int:
    try:
        if isinstance(order, dict) and extra is None:
            extra = order
            order = None
        from notifications.push_devices import send_push_tokens, tokens_for_driver
        from julmin_taxis.notification_messages import push_text
        from julmin_taxis.push_policy import (
            claim_driver_push, mark_driver_push_sent,
            release_driver_push_claim, should_send_driver_push,
        )

        should, reason = should_send_driver_push(driver, event, order=order, extra=extra)
        if not should:
            logger.debug('[Notify] push driver skip %s (%s)', event, reason)
            return 0
        if not claim_driver_push(driver, event, order):
            logger.debug('[Notify] push driver skip %s (claim_taken)', event)
            return 0

        title, body = push_text('driver', event, order)
        if extra:
            title = extra.get('push_title') or title
            body = extra.get('push_body') or extra.get('message') or body
        tokens = tokens_for_driver(driver)
        if not tokens:
            release_driver_push_claim(driver, event, order)
            return 0
        from notifications.push_devices import envelope_push_data
        url = '/driver/'
        if order is not None and getattr(order, 'pk', None):
            url = f'/driver/#order-{order.pk}'
        data = envelope_push_data(event, order=order, url=url, extra=extra)
        urgent = event in ('new_order', 'sos_alert', 'new_order_pending_accept', 'new_message', 'round_trip_pickup_requested')
        sent = send_push_tokens(tokens, title, body, data, urgent=urgent)
        if sent:
            mark_driver_push_sent(driver, event, order)
            return sent
        release_driver_push_claim(driver, event, order)
        return 0
    except Exception as exc:
        try:
            from julmin_taxis.push_policy import release_driver_push_claim
            release_driver_push_claim(driver, event, order)
        except Exception:
            pass
        logger.warning('[Notify] push driver %s failed: %s', event, exc)
        return 0


def notify_client_accepted_price(order) -> None:
    """Le client vient d'accepter le tarif — alerter le client + admin."""
    notify_order_status_sync(order, 'price_confirmed')
    push_notify_admin('price_confirmed', order=order)


def notify_payment_ready_for_drivers(order) -> None:
    """Paiement validé ou cash choisi — push + WhatsApp client + admin + chauffeurs."""
    pm = (getattr(order, 'payment_method', None) or '').strip()
    if pm == 'in_person':
        _safe_push_order(order, 'payment_cash_confirmed')
        _safe_whatsapp(order, 'notify_client_payment_cash')
        push_notify_admin(
            'payment_confirmed',
            title='Paiement sur place',
            body=f'Course #{order.pk} — le client paiera le chauffeur.',
            order=order,
        )
    else:
        _safe_push_order(order, 'payment_confirmed')
        _safe_whatsapp(order, 'notify_client_payment_confirmed')
        push_notify_admin('payment_confirmed', order=order)


def _safe_whatsapp(order, fn_name: str, **kwargs) -> bool:
    try:
        from julmin_taxis import whatsapp_service as wa
        fn = getattr(wa, fn_name, None)
        if not fn:
            return False
        ok = fn(order, **kwargs) if kwargs else fn(order)
        if ok:
            logger.info('[Notify] whatsapp %s order #%s OK', fn_name, order.pk)
        else:
            logger.warning('[Notify] whatsapp %s order #%s → false (no send)', fn_name, order.pk)
        return bool(ok)
    except Exception as exc:
        logger.warning('[Notify] whatsapp %s failed order #%s: %s', fn_name, order.pk, exc)
        return False


def _dispatch_whatsapp(order_pk: int, fn_name: str, **kwargs) -> None:
    def _run():
        from orders.models import Order
        try:
            order = Order.objects.select_related('driver', 'user').get(pk=order_pk)
        except Order.DoesNotExist:
            return
        _safe_whatsapp(order, fn_name, **kwargs)

    run_after_commit(_run)


def notify_order_status_sync(order, status: str) -> None:
    """Dispatch email + WhatsApp + push for a status transition (synchronous)."""
    status = (status or '').strip()

    email_map = {
        'price_proposed': 'send_price_proposed',
        'price_confirmed': 'send_price_proposed',
        'driver_assigned': 'send_driver_assigned',
        'on_way': 'send_driver_on_way',
        'arrived': 'send_driver_arrived',
        'in_progress': 'send_trip_started',
        'completed': 'send_trip_completed',
    }
    if status in email_map:
        _safe_email(order, email_map[status])

    wa_fn = WHATSAPP_BY_STATUS.get(status)
    if wa_fn:
        _safe_whatsapp(order, wa_fn)

    _safe_push_order(order, status)
    if getattr(order, 'enterprise_id', None):
        push_enterprise_event(order, status)

    if status == 'completed':
        _safe_whatsapp(order, 'notify_client_receipt')


def _notify_order_status_by_pk(order_pk: int, status: str) -> None:
    from orders.models import Order
    try:
        order = Order.objects.select_related('driver', 'user').get(pk=order_pk)
    except Order.DoesNotExist:
        return
    notify_order_status_sync(order, status)


def notify_order_status(order, status: str) -> None:
    """Email + WhatsApp + push — exécuté en arrière-plan après commit (réponse HTTP immédiate)."""
    order_pk = getattr(order, 'pk', None)
    if not order_pk:
        notify_order_status_sync(order, status)
        return
    run_after_commit(_notify_order_status_by_pk, order_pk, status)


def notify_order_status_now(order, status: str) -> None:
    """Envoi synchrone immédiat — lié aux actions bouton (accept, statut, paiement…)."""
    status = (status or '').strip()
    order_pk = getattr(order, 'pk', None)
    logger.info('[NotifyNow] ▶ %s order #%s', status, order_pk)
    try:
        if order_pk:
            from orders.models import Order
            order = Order.objects.select_related('driver', 'user').get(pk=order_pk)
        notify_order_status_sync(order, status)
        logger.info('[NotifyNow] ✓ %s order #%s', status, order_pk)
    except Exception:
        logger.exception('[NotifyNow] ✗ %s order #%s', status, order_pk)


def notify_drivers_new_order_now(order) -> int:
    """WhatsApp chauffeurs — envoi synchrone immédiat après paiement client."""
    order_pk = getattr(order, 'pk', None)
    logger.info('[NotifyNow] ▶ nouvelle_commande order #%s', order_pk)
    try:
        if order_pk:
            from orders.models import Order
            order = Order.objects.select_related('driver', 'user').get(pk=order_pk)
        count = notify_drivers_new_order_sync(order)
        logger.info('[NotifyNow] ✓ nouvelle_commande order #%s → %s chauffeur(s)', order_pk, count)
        return count
    except Exception:
        logger.exception('[NotifyNow] ✗ nouvelle_commande order #%s', order_pk)
        return 0


def notify_drivers_new_order_sync(order) -> int:
    try:
        from julmin_taxis.whatsapp_service import notify_drivers_new_order as _fn
        count = _fn(order)
    except Exception as exc:
        logger.warning('[Notify] nouvelle_commande failed order #%s: %s', order.pk, exc)
        count = 0
    try:
        from drivers.models import Driver
        from django.db.models import Q
        drivers = Driver.objects.filter(status='available').filter(
            Q(fcm_token__gt='') | Q(push_devices__isnull=False)
        ).distinct()[:80]
        for driver in drivers:
            push_notify_driver_new_order(driver, order)
    except Exception:
        pass
    return count


def _notify_drivers_new_order_by_pk(order_pk: int) -> int:
    from orders.models import Order
    try:
        order = Order.objects.select_related('driver', 'user').get(pk=order_pk)
    except Order.DoesNotExist:
        return 0
    return notify_drivers_new_order_sync(order)


def notify_drivers_new_order(order) -> int:
    """Sync — préférer notify_drivers_new_order_async depuis les vues HTTP."""
    return notify_drivers_new_order_sync(order)


def notify_drivers_new_order_async(order) -> None:
    order_pk = getattr(order, 'pk', None)
    if not order_pk:
        notify_drivers_new_order_sync(order)
        return
    run_after_commit(_notify_drivers_new_order_by_pk, order_pk)


def notify_trip_paused(order, rate_per_5min=None) -> bool:
    _safe_push_order(order, 'trip_paused')
    return _safe_whatsapp(order, 'notify_client_trip_paused', rate_per_5min=rate_per_5min)


def notify_trip_resumed(order) -> bool:
    _safe_push_order(order, 'trip_resumed')
    return _safe_whatsapp(order, 'notify_client_trip_resumed')


def notify_trip_extended(order) -> bool:
    _safe_push_order(order, 'trip_extended')
    return _safe_whatsapp(order, 'notify_client_trip_extended')


def notify_zone_approach(order, payload: dict | None = None) -> None:
    """Push OS seulement pour le danger (500 m). Les autres situations restent en bandeau in-app 4 s."""
    payload = payload or {}
    extra = {
        'push_title': 'Zone sensible' if payload.get('is_danger') else 'Sur la route',
        'push_body': payload.get('message') or '',
        'message': payload.get('message') or '',
        'zone_id': payload.get('zone_id'),
    }
    if payload.get('is_danger'):
        _safe_push_order(order, 'danger_zone', extra)
        if getattr(order, 'driver', None):
            _safe_push_driver(order.driver, 'danger_zone', order, extra)



def notify_trip_reminder(order) -> bool:
    order_pk = getattr(order, 'pk', None)
    if not order_pk:
        return _safe_whatsapp(order, 'notify_client_trip_reminder')

    def _run():
        from orders.models import Order
        try:
            o = Order.objects.select_related('driver', 'user').get(pk=order_pk)
        except Order.DoesNotExist:
            return
        _safe_whatsapp(o, 'notify_client_trip_reminder')
        _safe_push_order(o, 'trip_reminder')
        if o.driver_id:
            _safe_push_driver(o.driver, 'trip_reminder', o)
        if getattr(o, 'enterprise_id', None):
            push_enterprise_event(o, 'order_updated')

    run_after_commit(_run)
    return True


def push_notify_client_message(order) -> None:
    _safe_push_order(order, 'new_message')
    if getattr(order, 'enterprise_id', None):
        push_enterprise_event(order, 'new_message')


def push_notify_driver_new_order(driver, order) -> None:
    _safe_push_driver(driver, 'new_order', order, {'order_id': str(order.pk)})


def push_notify_driver_message(order) -> None:
    if order.driver_id:
        _safe_push_driver(order.driver, 'new_message', order, {'order_id': str(order.pk)})


def notify_driver_return_pickup_requested(order) -> None:
    """Client prêt pour le retour aller-retour — push + WhatsApp chauffeur."""
    driver = order.driver
    if not driver:
        return
    _safe_push_driver(
        driver, 'round_trip_pickup_requested', order,
        {'order_id': str(order.pk), 'pickup': (order.pickup or '')[:80]},
    )
    _safe_whatsapp(order, 'notify_driver_client_ready_return')


def push_notify_sos_client_ack(order) -> None:
    _safe_push_order(order, 'sos_ack')


ADMIN_PUSH_MESSAGES = {
    'sos_alert': ('🆘 SOS URGENCE', 'Alerte SOS — intervention immédiate requise.'),
    'new_order': ('🚕 Nouvelle commande', 'Une commande attend votre attention.'),
    'withdrawal': ('💰 Retrait en attente', 'Nouvelle demande de retrait à traiter.'),
    'lost_object': ('📦 Objet oublié', 'Un client a signalé un objet oublié.'),
    'enterprise_pending': ('🏢 Nouvelle entreprise', 'Demande de partenariat en attente.'),
    'enterprise_location_pending': ('📍 Emplacement entreprise', 'Un partenaire demande de l\'aide pour son emplacement.'),
    'chat_escalated': ('💬 Support chat', 'Conversation escaladée — réponse requise.'),
    'driver_pending': ('👤 Chauffeur en attente', 'Nouveau chauffeur à valider.'),
}


def push_notify_admin(event_key: str, title: str = None, body: str = None, extra_data: dict = None, order=None) -> int:
    """Push FCM vers appareils admin staff — fonctionne même hors dashboard."""
    try:
        from notifications.push_devices import send_push_tokens, tokens_for_admin_staff
        from julmin_taxis.notification_messages import push_text
        if not title or not body:
            dt, db = push_text('admin', event_key, order)
            title = title or dt
            body = body or db
        from julmin_taxis.push_policy import claim_admin_push
        extra_id = ''
        if extra_data:
            extra_id = str(extra_data.get('enterprise_id') or extra_data.get('driver_id') or extra_data.get('session_id') or '')
        if not claim_admin_push(event_key, order=order, extra_id=extra_id):
            return 0
        tokens = tokens_for_admin_staff()
        if not tokens:
            return 0
        data = {'event': event_key, 'title': title, 'body': body}
        if extra_data:
            data.update({k: str(v) for k, v in extra_data.items()})
        url_map = {
            'new_order': '/admin-dashboard/#orders',
            'withdrawal': '/admin-dashboard/#withdrawals',
            'lost_object': '/admin-dashboard/#lost-objects',
            'sos_alert': '/admin-dashboard/#sos',
            'enterprise_pending': '/admin-dashboard/#enterprises',
            'enterprise_location_pending': '/admin-dashboard/#enterprises',
            'chat_escalated': '/admin-dashboard/#chat-support',
            'driver_pending': '/admin-dashboard/#drivers',
        }
        if event_key in url_map:
            data['url'] = url_map[event_key]
            data['deep_link'] = data['url']
            data['type'] = 'sos' if event_key == 'sos_alert' else event_key
            if order is not None:
                data['order_id'] = str(order.pk)
        sent = send_push_tokens(tokens, title, body, data, urgent=(event_key == 'sos_alert'), channel='daxi_sos' if event_key == 'sos_alert' else 'daxi_orders')
        if sent:
            logger.info('[Notify] admin push %s → %s device(s)', event_key, sent)
        return sent
    except Exception as exc:
        logger.warning('[Notify] admin push %s failed: %s', event_key, exc)
        return 0


def push_notify_admin_sos(order, triggered_by: str = 'client') -> int:
    """Push FCM haute priorité vers les appareils admin (staff), même hors dashboard."""
    who = 'CLIENT' if triggered_by == 'client' else 'CHAUFFEUR'
    return push_notify_admin(
        'sos_alert',
        body=f'Course #{order.pk} — signalé par {who}',
        extra_data={
            'order_id': str(order.pk),
            'triggered_by': triggered_by,
        },
    )


def notify_coords_needed_event(order) -> None:
    """Push + WhatsApp admin/chauffeurs : commande sans GPS, placer les lieux sur la carte."""
    from django.core.cache import cache
    from julmin_taxis.htmx_views import _order_has_full_coords

    if _order_has_full_coords(order):
        return
    cache_key = f'daxi_coords_needed_notified:{order.pk}'
    if cache.get(cache_key):
        return

    pickup = (order.pickup or '')[:40]
    _safe_push_order(order, 'coords_needed')
    push_notify_admin(
        'coords_needed',
        body=f'#{order.pk} — placer GPS sur carte',
        extra_data={'order_id': str(order.pk)},
    )
    wa_sent = 0
    try:
        from julmin_taxis.whatsapp_service import notify_coords_needed
        wa_sent = notify_coords_needed(order) or 0
    except Exception as exc:
        logger.warning('[Notify] coords_needed WA failed #%s: %s', order.pk, exc)

    try:
        from julmin_taxis.htmx_views import _notify_ws
        from drivers.models import Driver
        payload = {
            'order_id': order.pk,
            'pickup': order.pickup,
            'destination': order.destination,
            'needs_coords': True,
        }
        _notify_ws('admin', 'new_order_needs_coords', payload)
        for did in Driver.objects.filter(status='available', is_blocked=False).values_list('pk', flat=True):
            _notify_ws(f'driver_{did}', 'new_order_needs_coords', payload)
    except Exception as exc:
        logger.warning('[Notify] coords_needed WS failed #%s: %s', order.pk, exc)

    if wa_sent > 0:
        cache.set(cache_key, True, timeout=86400 * 7)
        logger.info('[Notify] commande_attente_coords #%s → %s message(s)', order.pk, wa_sent)


def notify_admin_new_order_event(order) -> None:
    """Push + WhatsApp admin quand une commande est créée (avant paiement)."""
    from julmin_taxis.htmx_views import _order_has_full_coords

    push_notify_admin('new_order', order=order, extra_data={'order_id': str(order.pk)})
    if getattr(order, 'enterprise_id', None):
        push_enterprise_event(order, 'new_order')
    try:
        if _order_has_full_coords(order):
            from julmin_taxis.whatsapp_service import notify_admin_new_order
            notify_admin_new_order(order)
                                                                                                   
    except Exception as exc:
        logger.warning('[Notify] admin new_order WA failed #%s: %s', order.pk, exc)


def notify_coords_set_event(order) -> None:
    """GPS placé — un push client + chauffeur, pas sur chaque coord partielle."""
    _safe_push_order(order, 'coords_set')
    if getattr(order, 'driver_id', None):
        _safe_push_driver(order.driver, 'coords_set', order)


def notify_admin_lost_object_event(order, description: str) -> None:
    _safe_push_order(order, 'lost_object_ack')
    if getattr(order, 'driver_id', None):
        _safe_push_driver(order.driver, 'lost_object_reported', order)
    push_notify_admin(
        'lost_object',
        body=f'Commande #{order.pk} — objet signalé',
        extra_data={'order_id': str(order.pk)},
    )
    try:
        from julmin_taxis.whatsapp_service import notify_admin_lost_object
        notify_admin_lost_object(order, description)
    except Exception as exc:
        logger.warning('[Notify] admin lost_object WA failed #%s: %s', order.pk, exc)


def notify_admin_enterprise_pending_event(enterprise) -> None:
    push_notify_admin(
        'enterprise_pending',
        body=f'{enterprise.name} — validation requise',
        extra_data={'enterprise_id': str(enterprise.pk)},
    )
    try:
        from julmin_taxis.whatsapp_service import notify_admin_enterprise_pending
        notify_admin_enterprise_pending(enterprise)
    except Exception as exc:
        logger.warning('[Notify] admin enterprise_pending WA failed: %s', exc)


def notify_admin_enterprise_location_event(enterprise) -> None:
    push_notify_admin(
        'enterprise_location_pending',
        body=f'{enterprise.name} — emplacement à configurer',
        extra_data={'enterprise_id': str(enterprise.pk)},
    )
    try:
        from julmin_taxis.whatsapp_service import notify_admin_enterprise_location
        notify_admin_enterprise_location(enterprise)
    except Exception as exc:
        logger.warning('[Notify] admin enterprise_location WA failed: %s', exc)


def notify_admin_chat_escalated_event(session_id, last_message: str = '') -> None:
    push_notify_admin(
        'chat_escalated',
        body='Un client attend une réponse humaine',
        extra_data={'session_id': str(session_id)},
    )
    try:
        from julmin_taxis.whatsapp_service import notify_admin_chat_escalated
        notify_admin_chat_escalated(session_id, last_message)
    except Exception as exc:
        logger.warning('[Notify] admin chat_escalated WA failed: %s', exc)


def notify_admin_driver_pending_event(driver) -> None:
    push_notify_admin(
        'driver_pending',
        body=f'{driver.get_full_name()} — documents à valider',
        extra_data={'driver_id': str(driver.pk)},
    )
    try:
        from orders.views import notify_websocket
        notify_websocket('admin_orders', 'driver_pending', {
            'driver_id': driver.pk,
            'name': driver.get_full_name(),
        })
    except Exception as exc:
        logger.warning('[Notify] admin driver_pending WS failed: %s', exc)
    try:
        from julmin_taxis.whatsapp_service import notify_admin_driver_pending
        notify_admin_driver_pending(driver)
    except Exception as exc:
        logger.warning('[Notify] admin driver_pending WA failed: %s', exc)


DRIVER_MOVED_STATUSES = frozenset({'driver_assigned', 'on_way', 'arrived', 'in_progress'})


def _client_paid_online(order) -> bool:
    if not order:
        return False
    pm = (getattr(order, 'payment_method', None) or '').strip()
    ps = (getattr(order, 'payment_status', None) or '').strip()
    return pm in ('card', 'moncash') and ps == 'paid'


def _format_admin_cancel_inapp(body: str, audience: str, prev_status: str, order=None) -> str:
    body = (body or '').strip()
    if audience == 'client':
        header = '🛡️ Course annulée par DAXI'
        if _client_paid_online(order):
            if prev_status in DRIVER_MOVED_STATUSES:
                footer = 'Le chauffeur s\'était déjà déplacé. Si vous aviez payé en ligne, vous serez remboursé intégralement sous peu.'
            else:
                footer = 'Si vous aviez payé en ligne, vous serez remboursé intégralement sous peu.'
        elif prev_status in DRIVER_MOVED_STATUSES:
            footer = 'Le chauffeur s\'était déjà déplacé : aucun frais ne vous sera facturé.'
        else:
            footer = 'Aucun frais ne vous sera facturé pour cette annulation.'
    else:
        header = '🛡️ Course annulée par l\'administration'
        footer = 'Cette course a été retirée de votre planning.'
    parts = [header]
    if body:
        parts.append(body)
    parts.append(footer)
    return '\n\n'.join(parts)


def _notify_ws_broadcast(group: str, event_type: str, data: dict):
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        layer = get_channel_layer()
        if not layer:
            return
        async_to_sync(layer.group_send)(group, {
            'type': 'broadcast_message',
            'message': {'type': event_type, 'data': dict(data or {})},
        })
    except Exception:
        pass


def _admin_cancel_order_message(order, content: str, audience: str):
    from orders.models import OrderMessage
    msg_type = 'admin_cancel_client' if audience == 'client' else 'admin_cancel_driver'
    msg = OrderMessage.objects.create(
        order=order,
        sender_type='admin',
        sender_name='Équipe DAXI',
        content=content,
        message_type=msg_type,
    )
    payload = {
        'id': msg.pk,
        'order_id': order.pk,
        'sender_type': 'admin',
        'sender_name': msg.sender_name,
        'content': content,
        'audience': audience,
        'kind': 'admin_cancel',
        'message_type': msg_type,
    }
    if audience == 'client':
        _notify_ws_broadcast(f'order_{order.pk}', 'new_message', payload)
    elif audience == 'driver' and order.driver_id:
        _notify_ws_broadcast(f'driver_{order.driver_id}', 'new_message', payload)
    return msg


def notify_admin_cancelled_order(
    order,
    prev_status: str,
    *,
    message_client: str = '',
    message_driver: str = '',
    notify_client: bool = True,
    notify_driver: bool = True,
) -> None:
    """Annulation admin — messages optionnels, jamais de frais client (géré en amont)."""
    prev_status = (prev_status or '').strip()
    order_pk = getattr(order, 'pk', None)
    logger.info(
        '[NotifyAdminCancel] order #%s prev=%s client=%s driver=%s',
        order_pk, prev_status, bool(notify_client), bool(notify_driver),
    )
    try:
        if order_pk:
            from orders.models import Order
            order = Order.objects.select_related('driver', 'user').get(pk=order_pk)
    except Exception:
        logger.exception('[NotifyAdminCancel] reload order #%s failed', order_pk)
        return

    if notify_client:
        if message_client:
            text = _format_admin_cancel_inapp(message_client, 'client', prev_status, order)
            _admin_cancel_order_message(order, text, 'client')
            try:
                from julmin_taxis.whatsapp_service import notify_admin_cancel_custom_client
                notify_admin_cancel_custom_client(order, message_client, prev_status)
            except Exception as exc:
                logger.warning('[NotifyAdminCancel] WA client failed: %s', exc)
            try:
                _safe_push_order(order, 'cancelled', extra={'admin_message': message_client[:200]})
            except Exception as exc:
                logger.warning('[NotifyAdminCancel] push client failed: %s', exc)
        else:
            notify_order_status_sync(order, 'cancelled')

    if notify_driver and order.driver_id:
        driver = order.driver
        if message_driver:
            text = _format_admin_cancel_inapp(message_driver, 'driver', prev_status)
            _admin_cancel_order_message(order, text, 'driver')
            try:
                from julmin_taxis.whatsapp_service import notify_admin_cancel_custom_driver
                notify_admin_cancel_custom_driver(driver, order, message_driver)
            except Exception as exc:
                logger.warning('[NotifyAdminCancel] WA driver failed: %s', exc)
            _safe_push_driver(
                driver, 'order_updated', order=order,
                extra={'status': 'cancelled', 'admin_message': message_driver[:200]},
            )
        else:
            _safe_push_driver(driver, 'order_updated', order=order, extra={'status': 'cancelled'})
