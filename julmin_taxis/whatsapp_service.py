"""WhatsApp Cloud API — inbound webhook + outbound templates."""

import json
import logging
import math
import re
import urllib.error
import urllib.request

from django.conf import settings

from julmin_taxis.address_utils import clean_address_display
from julmin_taxis.whatsapp_delivery import (
    fallback_body_params,
    fallback_situation,
    format_delivery_error,
    record_delivery_status,
    situation_has_active_template,
)
from julmin_taxis.whatsapp_templates import template_lang, template_name

logger = logging.getLogger(__name__)

                     
TPL_NOUVELLE_COMMANDE = template_name('nouvelle_commande')
TPL_CHAUFFEUR_ARRIVE = template_name('chauffeur_arrive')
TPL_COURSE_TERMINEE = template_name('course_terminee')
TPL_LANG = template_lang()


def _normalize_phone(phone: str) -> str:
    """Digits only with country code (no +). Defaults Haiti +509."""
    if not phone:
        return ''
    digits = re.sub(r'\D', '', str(phone))
    if not digits:
        return ''
    if digits.startswith('509'):
        return digits
    if len(digits) == 8:
        return '509' + digits
    if len(digits) == 10 and digits.startswith('0'):
        return '509' + digits[1:]
    if len(digits) == 11 and digits.startswith('1'):
        return digits
    return digits


def _graph_post(payload: dict) -> bool:
    token = getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '')
    phone_id = getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '')
    if not token or not phone_id:
        logger.warning('[WhatsApp] WHATSAPP_ACCESS_TOKEN or WHATSAPP_PHONE_NUMBER_ID not configured')
        return False

    url = f'https://graph.facebook.com/v25.0/{phone_id}/messages'
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode('utf-8'),
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            raw = resp.read().decode('utf-8', errors='replace')
            ok = 200 <= resp.status < 300
            tmpl = (payload.get('template') or {}).get('name') or 'text'
            to = payload.get('to')
            if ok:
                try:
                    data = json.loads(raw) if raw else {}
                except json.JSONDecodeError:
                    data = {}
                msgs = data.get('messages') or []
                wamid = msgs[0].get('id') if msgs else None
                msg_status = msgs[0].get('message_status') if msgs else None
                contacts = data.get('contacts') or []
                wa_id = contacts[0].get('wa_id') if contacts else None
                logger.info(
                    '[WhatsApp] ✓ queued template=%s to=%s wa_id=%s wamid=%s status=%s http=%s',
                    tmpl, to, wa_id, wamid, msg_status, resp.status,
                )
                if msg_status and msg_status not in ('accepted', 'held_for_quality_assessment'):
                    logger.warning('[WhatsApp] unexpected message_status=%s for %s', msg_status, to)
            else:
                logger.warning('[WhatsApp] send unexpected status %s to=%s body=%s', resp.status, to, raw[:300])
            return ok
    except urllib.error.HTTPError as exc:
        body = exc.read()[:800]
        err_code = ''
        err_msg = ''
        try:
            err_data = json.loads(body.decode() if isinstance(body, bytes) else body)
            err_obj = (err_data.get('error') or {})
            err_code = err_obj.get('code', '')
            err_msg = err_obj.get('message', '') or (
                (err_obj.get('error_data') or {}).get('details', '')
            )
        except Exception:
            pass
        if exc.code == 401:
            logger.error(
                '[WhatsApp] Token expiré ou invalide (401) — régénérez WHATSAPP_ACCESS_TOKEN dans Meta Business'
            )
        elif err_code == 132001:
            logger.warning(
                '[WhatsApp] template inexistant sur Meta (132001) tmpl=%s — approuvez le modèle en français (fr)',
                (payload.get('template') or {}).get('name'),
            )
        elif err_code == 132000:
            logger.warning(
                '[WhatsApp] mauvais nombre de paramètres (132000) tmpl=%s detail=%s',
                (payload.get('template') or {}).get('name'), err_msg,
            )
        elif err_code == 131047:
            logger.warning(
                '[WhatsApp] fenêtre 24h fermée (131047) — template Meta requis, pas de texte libre to=%s',
                payload.get('to'),
            )
        else:
            logger.warning('[WhatsApp] send failed (%s) code=%s: %s', exc.code, err_code, body)
    except Exception as exc:
        logger.warning('[WhatsApp] send error: %s', exc)
    return False


def _graph_send_text(to_phone: str, body: str) -> bool:
    to_phone = _normalize_phone(to_phone)
    if not to_phone:
        return False
    payload = {
        'messaging_product': 'whatsapp',
        'to': to_phone,
        'type': 'text',
        'text': {'body': body[:4096]},
    }
    return _graph_post(payload)


def _template_lang_candidates(preferred: str = None) -> list:
    """Langues à essayer — compte Daxi : tous les templates sont en French (code API: fr)."""
    raw = [preferred, template_lang(), 'fr']
    seen = set()
    out = []
    for lang in raw:
        lang = (lang or '').strip()
        if lang and lang not in seen:
            seen.add(lang)
            out.append(lang)
    return out


def send_template(
    to_phone: str,
    template_name: str,
    body_params: list,
    lang: str = None,
    header_params: list = None,
    button_url_suffix: str = None,
    copy_code: str = None,
    lang_fallback: bool = True,
) -> bool:
    """Send an approved WhatsApp template with optional header + body params."""
    to_phone = _normalize_phone(to_phone)
    if not to_phone or not template_name:
        return False

    langs = _template_lang_candidates(lang) if lang_fallback else [lang or template_lang()]

    for try_lang in langs:
        components = []
        if header_params:
            components.append({
                'type': 'header',
                'parameters': [{'type': 'text', 'text': str(p)[:1024]} for p in header_params],
            })
        if body_params:
            components.append({
                'type': 'body',
                'parameters': [{'type': 'text', 'text': str(p)[:1024]} for p in body_params],
            })
        if copy_code:
            components.append({
                'type': 'button',
                'sub_type': 'copy_code',
                'index': '0',
                'parameters': [{'type': 'coupon_code', 'coupon_code': str(copy_code)[:15]}],
            })
        elif button_url_suffix:
            components.append({
                'type': 'button',
                'sub_type': 'url',
                'index': '0',
                'parameters': [{'type': 'text', 'text': str(button_url_suffix)[:256]}],
            })

        payload = {
            'messaging_product': 'whatsapp',
            'to': to_phone,
            'type': 'template',
            'template': {
                'name': template_name,
                'language': {'code': try_lang},
            },
        }
        if components:
            payload['template']['components'] = components

        if _graph_post(payload):
            logger.info('[WhatsApp] template %s (%s) → %s', template_name, try_lang, to_phone)
            return True
    return False


def send_situation(to_phone: str, situation: str, body_params: list, **kwargs) -> bool:
    """Envoie un template pour une situation métier (nom résolu via whatsapp_templates)."""
    return send_template(to_phone, template_name(situation), body_params, **kwargs)


def _try_situation(
    to_phone: str,
    situation: str,
    body_params: list,
    text_fallback: str = None,
    *,
    allow_text_fallback: bool = False,
    **kwargs,
) -> bool:
    """Template Meta approuvé ; repli vers un autre template actif si besoin.

    Le texte libre hors fenêtre 24h est refusé par Meta (131047) — désactivé par défaut
    pour les clients qui n'ont jamais écrit au numéro business.
    """
    if send_situation(to_phone, situation, body_params, lang_fallback=False, **kwargs):
        return True

    alt = fallback_situation(situation)
    if alt and alt != situation:
        alt_params = fallback_body_params(situation, body_params, alt)
        alt_kwargs = dict(kwargs)
        if alt == 'welcome_client' and 'header_params' not in alt_kwargs:
            alt_kwargs['header_params'] = ['DAXI']
        logger.info('[WhatsApp] repli template %s → %s pour %s', situation, alt, to_phone)
        if send_situation(to_phone, alt, alt_params, lang_fallback=False, **alt_kwargs):
            return True

    if not situation_has_active_template(situation) and not alt:
        logger.error(
            '[WhatsApp] ✗ aucun template Meta actif pour %s → %s '
            '(approuvez le modèle sur Meta Business — le texte libre ne fonctionne pas sans opt-in)',
            situation, to_phone,
        )
        return False

    if allow_text_fallback and text_fallback:
        logger.info('[WhatsApp] fallback texte (fenêtre 24h) pour %s → %s', situation, to_phone)
        return _graph_send_text(to_phone, text_fallback)
    return False


def _first_name(label: str, default: str = 'Client') -> str:
    """Prénom pour les templates Meta ({{1}} = Bonjour …)."""
    raw = (label or default).strip()
    parts = [p for p in raw.split() if p]
    name = parts[0] if parts else default
    if name.isdigit() or len(name) > 24:
        return default
    return name


def _amount_plain(value) -> str:
    """Montant sans symbole $ (le template Meta ajoute « $ » après {{n}})."""
    try:
        return f'{float(value):.2f}'
    except (TypeError, ValueError):
        return '0.00'


def _driver_vehicle_label(driver) -> str:
    if not driver:
        return 'DAXI'
    parts = [driver.car_brand, driver.car_model]
    label = ' '.join(p for p in parts if p).strip()
    return label or driver.vehicle or 'DAXI'


def _price_label(order) -> str:
    total = getattr(order, 'total_price', None)
    if total is not None and float(total) > 0:
        return f'${float(total):.2f}'
    if order.price is not None:
        return f'${float(order.price):.2f}'
    return 'À confirmer'


def _client_phone(order) -> str:
    """Numéro WhatsApp du client : commande, puis compte utilisateur."""
    raw = (getattr(order, 'client_phone', None) or '').strip()
    if not raw and getattr(order, 'user_id', None):
        try:
            user = order.user
            if user:
                raw = (getattr(user, 'phone', None) or '').strip()
        except Exception:
            pass
    return _normalize_phone(raw) if raw else ''


def _site_url() -> str:
    """URL publique pour liens WhatsApp / emails — jamais ngrok ou localhost."""
    explicit = (getattr(settings, 'PUBLIC_SITE_URL', None) or '').strip().rstrip('/')
    if explicit and 'ngrok' not in explicit.lower():
        return explicit
    raw = (getattr(settings, 'SITE_URL', None) or 'https://daxipro.com').strip().rstrip('/')
    low = raw.lower()
    if any(x in low for x in ('ngrok', 'localhost', '127.0.0.1', '0.0.0.0')):
        return 'https://daxipro.com'
    return raw


def _order_coords_link(order, for_admin: bool = False) -> str:
    """Lien texte de repli (hors bouton Meta)."""
    base = _site_url()
    if for_admin:
        return f'{base}/admin-dashboard/#orders'
    return f'{base}/{_driver_order_public_path(order.pk)}'


def _client_app_link(path: str = '') -> str:
    base = _site_url()
    return f'{base}/{path.lstrip("/")}' if path else base


def _order_payment_confirmed(order) -> bool:
    return (order.payment_status or '').strip() in ('paid', 'in_person')


def _trip_addresses(order):
    pickup = clean_address_display(order.pickup or '—')[:200]
    dest = clean_address_display(order.destination or '—')[:200]
    return pickup, dest


def _haversine_km(lat1, lng1, lat2, lng2):
    """Distance en km (ligne droite) entre deux points GPS."""
    if not all([lat1, lng1, lat2, lng2]):
        return None
    r = 6371.0
    dlat = math.radians(float(lat2) - float(lat1))
    dlng = math.radians(float(lng2) - float(lng1))
    a = (
        math.sin(dlat / 2) ** 2
        + math.cos(math.radians(float(lat1)))
        * math.cos(math.radians(float(lat2)))
        * math.sin(dlng / 2) ** 2
    )
    return round(r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 1)


def _order_pickup_coords(order):
    """Coords du point de prise en charge (pickup fixe ou GPS client en direct)."""
    plat = getattr(order, 'pickup_lat', None)
    plng = getattr(order, 'pickup_lng', None)
    if not plat or not plng:
        plat = getattr(order, 'client_gps_lat', None)
        plng = getattr(order, 'client_gps_lng', None)
    if plat and plng:
        return float(plat), float(plng)
    return None, None


def _format_distance_label(km) -> str:
    """Libellé km ou m pour WhatsApp (ex. « 2.3 km », « 450 m »)."""
    if km is None:
        return '—'
    try:
        km = float(km)
    except (TypeError, ValueError):
        return '—'
    if km <= 0:
        return '—'
    if km < 1.0:
        return f'{max(1, int(round(km * 1000)))} m'
    return f'{km:.1f} km'


def _driver_distance_to_pickup(driver, order):
    """Distance chauffeur → client / point de prise en charge (km)."""
    if not driver or not getattr(driver, 'latitude', None) or not getattr(driver, 'longitude', None):
        return None
    plat, plng = _order_pickup_coords(order)
    if not plat:
        return None
    return _haversine_km(driver.latitude, driver.longitude, plat, plng)


def _cache_driver_accept_offer(
    driver_phone: str, order, accept_url: str, coords_note: str = '', distance_label: str = '',
) -> None:
    """Store pending accept link — sent only after driver taps J'accepte."""
    from django.core.cache import cache

    phone = _normalize_phone(driver_phone)
    pickup, dest = _trip_addresses(order)
    cache.set(
        f'wa_accept_offer:{phone}',
        {
            'order_id': order.pk,
            'accept_url': accept_url,
            'pickup': pickup,
            'dest': dest,
            'price': _price_label(order),
            'coords_note': coords_note or '',
            'distance': distance_label or '—',
        },
        timeout=86400 * 2,
    )


def _is_accept_intent(text: str) -> bool:
    if not text:
        return False
    t = text.strip().lower().replace('\u2019', "'")
    if t in ("j'accepte", "j accepte", "accepte", "accept", "oui", "ok"):
        return True
    return 'accept' in t and len(t) < 40


def send_accept_link_on_request(sender: str) -> bool:
    """Driver tapped J'accepte — send step-2 message with the accept URL."""
    from django.core.cache import cache
    from drivers.models import Driver
    from orders.models import Order

    phone = _normalize_phone(sender)
    offer = cache.get(f'wa_accept_offer:{phone}')

    if not offer:
        driver = Driver.objects.filter(phone__icontains=phone[-8:]).first()
        if not driver:
            _graph_send_text(
                sender,
                'Numero non reconnu comme chauffeur DAXI. Connectez-vous sur l\'app chauffeur.',
            )
            return True
        order = (
            Order.objects.filter(status='price_confirmed')
            .order_by('-pk')
            .first()
        )
        if not order:
            _graph_send_text(sender, 'Aucune course en attente pour le moment.')
            return True
        site_url = getattr(settings, 'SITE_URL', '').rstrip('/')
        accept_url = _accept_url(order.pk, driver.pk) if driver else _accept_url(order.pk)
        pickup, dest = _trip_addresses(order)
        distance_label = _format_distance_label(_driver_distance_to_pickup(driver, order))
        offer = {
            'order_id': order.pk,
            'accept_url': accept_url,
            'pickup': pickup,
            'dest': dest,
            'price': _price_label(order),
            'distance': distance_label,
        }

    distance_line = offer.get('distance') or '—'
    msg = (
        f'🚖 Nouvelle course #{offer["order_id"]}\n'
        f'📍 Distance : {distance_line}\n'
        f'{offer["pickup"]} -> {offer["dest"]}\n'
        f'{offer["price"]}'
        f'{offer.get("coords_note", "")}\n\n'
        f'Pour accepter, cliquez ici :\n{offer["accept_url"]}'
    )
    return _graph_send_text(sender, msg)


def _maybe_handle_accept_intent(sender: str, payload_or_text: str = '') -> bool:
    """Return True if message was an accept tap and we replied."""
    payload_or_text = (payload_or_text or '').strip()
    if payload_or_text.startswith('accept_'):
        from julmin_taxis.whatsapp_accept import handle_whatsapp_accept_reply
        reply = handle_whatsapp_accept_reply(sender, payload_or_text)
        _graph_send_text(sender, reply)
        return True
    if _is_accept_intent(payload_or_text):
        return send_accept_link_on_request(sender)
    return False


def _accept_public_path(order_id: int) -> str:
    """Chemin public session (fallback web, pas le bouton Meta)."""
    return f'driver/accept/{order_id}/'


def _accept_wa_button_suffix(order_id: int, driver_id: int) -> str:
    """Suffixe bouton Meta — URL modèle : {SITE_URL}/wa/accept/ (sans {{1}} dans Meta)."""
    from julmin_taxis.whatsapp_accept import make_accept_token
    token = make_accept_token(order_id, driver_id)
    return f'{order_id}/?sig={token}'


def _accept_url(order_id: int, driver_id: int = None) -> str:
    """URL complète d'acceptation chauffeur (lien signé WhatsApp)."""
    site = _site_url()
    if driver_id:
        suffix = _accept_url_suffix(order_id, driver_id)
        return f'{site}/{suffix}' if site else suffix
    path = _accept_public_path(order_id)
    return f'{site}/{path}' if site else path


def _driver_order_public_path(order_id: int) -> str:
    return f'driver/commande_{order_id}/'


def _driver_order_button_suffix(order_id: int) -> str:
    """Suffixe bouton Meta coords — URL modèle : {SITE_URL}/{{1}}"""
    return _driver_order_public_path(order_id)


def _receipt_public_path(order_id: int) -> str:
    return f'recu_{order_id}.pdf'


def _accept_url_suffix(order_id, driver_id) -> str:
    from julmin_taxis.whatsapp_accept import make_accept_token
    token = make_accept_token(order_id, driver_id)
    return f'wa/accept/{order_id}/?sig={token}'


def _admin_whatsapp_phones():
    raw = getattr(settings, 'ADMIN_WHATSAPP_PHONES', '') or ''
    return [p.strip() for p in raw.split(',') if p.strip()]


def _nouvelle_commande_params(order, recipient_name: str, driver=None) -> list:
    """Meta nouvelle_commande : {{1}} nom, {{2}} départ, {{3}} dest, {{4}} prix, {{5}} distance."""
    pickup, dest = _trip_addresses(order)
    distance = _format_distance_label(_driver_distance_to_pickup(driver, order))
    return [recipient_name, pickup, dest, _price_label(order), distance]


def _send_nouvelle_commande_template(to_phone: str, order, recipient_name: str, driver=None) -> bool:
    tpl = template_name('nouvelle_commande')
    body = _nouvelle_commande_params(order, recipient_name, driver)
    suffix = str(order.pk)
    if driver:
        # Meta {{1}} = URL dynamique complète (pas un suffixe relatif).
        suffix = f'{_site_url()}/driver/accept/{_accept_wa_button_suffix(order.pk, driver.pk)}'
    return send_template(
        to_phone, tpl, body,
        button_url_suffix=suffix,
    )


def notify_drivers_new_order(order) -> int:
    """nouvelle_commande → chauffeurs disponibles (après paiement client confirmé)."""
    from drivers.models import Driver

    if not _order_payment_confirmed(order):
        logger.info('[WhatsApp] skip nouvelle_commande #%s — paiement non confirmé', order.pk)
        return 0
    if order.status != 'price_confirmed':
        logger.info('[WhatsApp] skip nouvelle_commande #%s — status=%s', order.pk, order.status)
        return 0

    sent = 0
    drivers = Driver.objects.filter(
        status='available', is_blocked=False, is_verified=True
    ).exclude(phone='')

    site_url = _site_url()
    for driver in drivers:
        name = _first_name(driver.firstname or driver.get_full_name() or 'Chauffeur', 'Chauffeur')
        accept_url = _accept_url(order.pk, driver.pk)
        distance_label = _format_distance_label(_driver_distance_to_pickup(driver, order))
        if _send_nouvelle_commande_template(driver.phone, order, name, driver):
            if accept_url:
                _cache_driver_accept_offer(
                    driver.phone, order, accept_url, '', distance_label,
                )
            sent += 1
    return sent


def _scheduled_when_label(order) -> str:
    if order.scheduled_at:
        return order.scheduled_at.strftime('%d/%m/%Y %H:%M')
    if order.date and order.time:
        return f"{order.date.strftime('%d/%m/%Y')} {order.time.strftime('%H:%M')}"
    return 'Bientôt'


def notify_client_price_proposed(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        logger.info('[WhatsApp] skip prix_propose #%s — pas de téléphone client', order.pk)
        return False
    pickup, dest = _trip_addresses(order)
    client = _first_name(order.client_name or 'Client', 'Client')
    price = _price_label(order)
    site = _client_app_link()
    fallback = (
        f'🚕 *DAXI — Prix proposé*\n\nBonjour {client},\n\n'
        f'📍 Départ : {pickup}\n📍 Destination : {dest}\n💰 Prix : {price}\n\n'
        f'Connectez-vous pour accepter ou refuser : {site}'
    )
    return _try_situation(phone, 'prix_propose', [client, pickup, dest, price], fallback)


def notify_client_driver_assigned(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        logger.info('[WhatsApp] skip chauffeur_assigne #%s — pas de téléphone client', order.pk)
        return False
    driver = order.driver
    pickup, dest = _trip_addresses(order)
    client = _first_name(order.client_name or 'Client', 'Client')
    driver_name = driver.get_full_name() if driver else (order.driver_name or 'Votre chauffeur')
    vehicle = _driver_vehicle_label(driver)
    price = _price_label(order)
    fallback = (
        f'🚖 *DAXI — Chauffeur assigné*\n\nBonjour {client},\n\n'
        f'👤 Chauffeur : {driver_name}\n🚗 Véhicule : {vehicle}\n'
        f'📍 Départ : {pickup}\n📍 Destination : {dest}\n💰 Prix : {price}'
    )
    return _try_situation(
        phone, 'chauffeur_assigne',
        [client, driver_name, vehicle, pickup, dest, price],
        fallback,
    )


def notify_client_driver_on_way(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        logger.info('[WhatsApp] skip chauffeur_en_route #%s — pas de téléphone client', order.pk)
        return False
    driver = order.driver
    client = order.client_name or 'Client'
    driver_name = driver.get_full_name() if driver else (order.driver_name or 'Votre chauffeur')
    eta = '5'
    if order.driver and order.driver.latitude and order.pickup_lat:
        r = 6371
        dlat = math.radians(order.pickup_lat - order.driver.latitude)
        dlng = math.radians(order.pickup_lng - order.driver.longitude)
        a = (
            math.sin(dlat / 2) ** 2
            + math.cos(math.radians(order.driver.latitude))
            * math.cos(math.radians(order.pickup_lat))
            * math.sin(dlng / 2) ** 2
        )
        km = r * 2 * math.asin(math.sqrt(a))
        eta = str(max(1, round(km * 3)))
    client_fn = _first_name(client, 'Client')
    fallback = (
        f'🚖 *DAXI — Chauffeur en route*\n\nBonjour {client_fn},\n\n'
        f'{driver_name} est en route vers vous (≈ {eta} min).'
    )
    return _try_situation(
        phone, 'chauffeur_en_route',
        [client_fn, driver_name, eta],
        fallback,
    )


def notify_client_driver_arrived(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        logger.info('[WhatsApp] skip chauffeur_arrive #%s — pas de téléphone client', order.pk)
        return False
    driver = order.driver
    client = order.client_name or 'Client'
    pickup, dest = _trip_addresses(order)
    driver_name = driver.get_full_name() if driver else (order.driver_name or 'Votre chauffeur')
    vehicle = _driver_vehicle_label(driver) if driver else 'DAXI'
    client_fn = _first_name(client, 'Client')
    fallback = (
        f'📍 *DAXI — Chauffeur arrivé*\n\nBonjour {client_fn},\n\n'
        f'{driver_name} ({vehicle}) est sur place.\n'
        f'📍 Départ : {pickup}'
    )
    return _try_situation(
        phone, 'chauffeur_arrive',
        [client_fn, pickup, dest, driver_name, vehicle],
        fallback,
    )


def notify_client_trip_started(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        return False
    client = _first_name(order.client_name or 'Client', 'Client')
    pickup, dest = _trip_addresses(order)
    fallback = (
        f'🚕 *DAXI — Course démarrée*\n\nBonjour {client},\n\n'
        f'Votre course est en cours.\n📍 Départ : {pickup}\n📍 Destination : {dest}'
    )
    return _try_situation(
        phone, 'course_demarree',
        [client, pickup, dest],
        fallback,
    )


def notify_client_trip_completed(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        logger.info('[WhatsApp] skip course_terminee #%s — pas de téléphone client', order.pk)
        return False
    client = order.client_name or 'Client'
    pickup, dest = _trip_addresses(order)
    client_fn = _first_name(client, 'Client')
    fallback = (
        f'✅ *DAXI — Course terminée*\n\nMerci {client_fn} !\n\n'
        f'📍 {pickup} → {dest}\n\nMèsi pou konfyans ou ! 🙏'
    )
    return _try_situation(
        phone, 'course_terminee',
        [client_fn, pickup, dest],
        fallback,
        button_url_suffix=f'compte/?order={order.pk}',
    )


def notify_client_trip_paused(order, rate_per_5min=None) -> bool:
    phone = _client_phone(order)
    if not phone:
        return False
    client = _first_name(order.client_name or 'Client', 'Client')
    rate = rate_per_5min or getattr(order, 'pause_rate_snapshot', None) or '0'
    rate_str = _amount_plain(rate)
    fallback = (
        f'⏸️ *DAXI — Pause*\n\nBonjour {client},\n\n'
        f'Votre course est en pause.\nTarif : {rate_str} $ / 5 min'
    )
    return _try_situation(phone, 'pause_course', [client, rate_str], fallback)


def notify_client_trip_reminder(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        return False
    client = _first_name(order.client_name or 'Client', 'Client')
    pickup, dest = _trip_addresses(order)
    when = _scheduled_when_label(order)
    fallback = (
        f'🔔 *DAXI — Rappel de course*\n\nBonjour {client},\n\n'
        f'Votre course approche ({when}).\n'
        f'📍 Départ : {pickup}\n📍 Destination : {dest}'
    )
    return _try_situation(phone, 'rappel_course', [client, pickup, dest, when], fallback)


def notify_client_receipt(order) -> bool:
    """Reçu PDF — template recu_course + lien téléchargement (fin de course)."""
    phone = _client_phone(order)
    if not phone:
        return False
    site = getattr(settings, 'SITE_URL', 'http://localhost:8000').rstrip('/')
    receipt_url = f'{site}/htmx/client/orders/{order.pk}/receipt.pdf'
    guest_id = (getattr(order, 'guest_id', None) or '').strip()
    if guest_id:
        receipt_url = f'{receipt_url}?guest_id={guest_id}'
    client = _first_name(order.client_name or 'Client', 'Client')
    price = _price_label(order)
    fallback = (
        f'🧾 *Reçu DAXI — Course #{order.pk}*\n\n'
        f'Merci {client} ! Votre course est terminée.\n'
        f'Montant : {price}\n\n'
        f'Téléchargez votre reçu PDF :\n{receipt_url}\n\n'
        f'Mèsi pou konfyans ou ! 🙏'
    )
    receipt_path = _receipt_public_path(order.pk)
    return _try_situation(
        phone, 'recu_course',
        [client, price, f'#{order.pk}'],
        fallback,
        button_url_suffix=receipt_path,
    )


def send_otp_whatsapp(phone: str, name: str, code: str) -> bool:
    """OTP — demande_numero_badge_de_mon_chauffeur : {{1}} prénom, {{2}} info/code."""
    code_str = str(code).strip()
    first_name = _first_name(name, 'Client')
    info = f'Votre code de vérification Daxi est : {code_str}. Ne le partagez avec personne.'
    tpl = template_name('otp_whatsapp')
    body = [first_name, info]
    msg = (
        f'🚕 *DAXI* — Code de vérification\n\n'
        f'Bonjour {first_name},\n\n'
        f'Votre code : *{code_str}*\n'
        f'Valable 10 minutes. Ne le partagez avec personne.'
    )
    if send_template(phone, tpl, body, lang_fallback=True):
        return True
    for header in ([code_str], [first_name], ['DAXI']):
        if send_template(phone, tpl, body, header_params=header, lang_fallback=True):
            return True
    return _graph_send_text(phone, msg)


def notify_welcome_client(user) -> bool:
    phone = _normalize_phone(getattr(user, 'phone', '') or '')
    name = _first_name(user.get_full_name() or user.first_name or 'Client', 'Client')
    if not phone:
        return False
    fallback = (
        f'👋 *Bienvenue sur DAXI, {name} !*\n\n'
        f'Votre compte est prêt. Commandez un taxi en quelques secondes sur daxipro.com'
    )
    return _try_situation(phone, 'welcome_client', [name], fallback, header_params=['DAXI'])


def notify_client_order_received(order) -> bool:
    """Accusé de commande. welcome_client est réservé à l'inscription réelle."""
    phone = _client_phone(order)
    if not phone:
        logger.info('[WhatsApp] skip order_received #%s — pas de téléphone client', order.pk)
        return False
    if getattr(order, 'price', None):
        return notify_client_price_proposed(order)
    logger.info(
        '[WhatsApp] skip order_received #%s — pas de prix, welcome_client non envoyé',
        order.pk,
    )
    return False


def notify_driver_verified(driver) -> bool:
    phone = (driver.phone or '').strip()
    name = _first_name(driver.firstname or driver.get_full_name() or 'Chauffeur', 'Chauffeur')
    if not phone:
        return False
    return send_situation(phone, 'chauffeur_valide', [name])


def notify_driver_trip_completed(driver, earned_amount, wallet_balance) -> bool:
    phone = (driver.phone or '').strip()
    name = _first_name(driver.firstname or driver.get_full_name() or 'Chauffeur', 'Chauffeur')
    if not phone:
        return False
    return send_situation(
        phone, 'course_terminer_chauffeur',
        [name, _amount_plain(earned_amount), _amount_plain(wallet_balance)],
    )


def notify_driver_client_ready_return(order) -> bool:
    """client_demande_retour → chauffeur assigné (client prêt pour le retour aller-retour)."""
    driver = order.driver
    if not driver:
        return False
    phone = (driver.phone or '').strip()
    if not phone:
        logger.info('[WhatsApp] skip client_demande_retour #%s — pas de téléphone chauffeur', order.pk)
        return False
    driver_fn = _first_name(
        getattr(driver, 'firstname', None) or driver.get_full_name() or 'Chauffeur',
        'Chauffeur',
    )
    client_fn = _first_name(order.client_name or 'Client', 'Client')
    pickup, _dest = _trip_addresses(order)
    order_ref = str(order.pk)
    fallback = (
        f'🔔 *DAXI — Client prêt pour le retour*\n\n'
        f'Bonjour {driver_fn},\n\n'
        f'{client_fn} vous attend pour le retour de la course aller-retour #{order_ref}.\n\n'
        f'📍 Point de prise en charge : {pickup}\n\n'
        f'Terminez votre course en cours si nécessaire, puis revenez le chercher.'
    )
    return _try_situation(
        phone, 'client_demande_retour',
        [driver_fn, client_fn, order_ref, pickup],
        fallback,
    )


def notify_enterprise_commission(enterprise, earned_amount, balance) -> bool:
    phone = (enterprise.phone or '').strip()
    name = enterprise.name or 'Partenaire'
    if not phone:
        return False
    return send_situation(
        phone, 'commande_entreprise',
        [name, _amount_plain(earned_amount), _amount_plain(balance)],
    )


def notify_admin_withdrawal_request(
    account_type: str, name: str, method: str, phone: str, amount,
) -> int:
    """demande_paiment → numéros admin WhatsApp."""
    tpl = template_name('demande_paiment')
    sent = 0
    phone_display = _normalize_phone(phone) or phone
    for admin_phone in _admin_whatsapp_phones():
        if send_template(
            admin_phone, tpl,
            [account_type, name, method, phone_display, _amount_plain(amount)],
        ):
            sent += 1
    return sent


def notify_client_sos_ack(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        return False
    client = _first_name(order.client_name or 'Client', 'Client')
    ok = send_situation(phone, 'sos_client', [client])
    if not ok:
        return _graph_send_text(
            phone,
            f'🆘 *DAXI — SOS reçu*\n\nBonjour {client}, nous avons bien reçu votre signal SOS '
            f'pour la course #{order.pk}. Notre équipe intervient immédiatement. Restez en sécurité.',
        )
    return ok


def notify_admin_sos_alert(order, triggered_by: str) -> int:
    """Alerte SOS admin — template sos_admin + repli texte."""
    pickup, dest = _trip_addresses(order)
    who = 'CLIENT' if triggered_by == 'client' else 'CHAUFFEUR'
    driver = order.driver
    driver_name = (driver.get_full_name() if driver else order.driver_name) or '—'
    client_name = order.client_name or '—'
    tpl_params = [
        f'#{order.pk}',
        who,
        client_name,
        driver_name,
        pickup,
        dest,
    ]
    fallback = (
        f'🆘 *SOS DAXI — Course #{order.pk}*\n\n'
        f'Signalé par : *{who}*\n'
        f'Client : {client_name}\n'
        f'Chauffeur : {driver_name}\n'
        f'Départ : {pickup}\n'
        f'Destination : {dest}\n'
        f'Tél. client : {order.client_phone or "—"}\n'
        f'Tél. chauffeur : {(driver.phone if driver else "") or "—"}\n\n'
        f'Vérifiez immédiatement dans l\'admin.'
    )
    return _broadcast_admin_situation('sos_admin', tpl_params, fallback)


def _broadcast_admin_situation(
    situation: str,
    body_params: list,
    text_fallback: str = None,
    **kwargs,
) -> int:
    """Envoie un template (ou repli texte) à tous les numéros ADMIN_WHATSAPP_PHONES."""
    sent = 0
    for admin_phone in _admin_whatsapp_phones():
        if _try_situation(admin_phone, situation, body_params, text_fallback, **kwargs):
            sent += 1
    return sent


def notify_coords_needed(order, admins_only: bool = False) -> int:
    """commande_attente_coords → admins (+ chauffeurs dispo si admins_only=False)."""
    from drivers.models import Driver

    pickup, dest = _trip_addresses(order)
    client = (order.client_name or 'Client')[:40]
    order_ref = f'#{order.pk}'
    sent = 0

    def _params(recipient_name: str, for_admin: bool = False) -> list:
        return [
            recipient_name,
            order_ref,
            client,
            pickup[:120],
            dest[:120],
        ]

    def _coords_button_suffix(for_admin: bool = False) -> str:
        if for_admin:
            return 'admin-dashboard/#orders'
        return _driver_order_button_suffix(order.pk)

    fallback_tpl = (
        f'🚖 *DAXI — Course {order_ref} sans GPS*\n\n'
        f'Client : {client}\n'
        f'📍 Départ : {pickup}\n'
        f'📍 Destination : {dest}\n\n'
        f'Placez les lieux sur la carte dans l\'application pour calculer le prix.'
    )

    for admin_phone in _admin_whatsapp_phones():
        if _try_situation(
            admin_phone, 'commande_attente_coords',
            _params('Admin', for_admin=True), fallback_tpl,
            button_url_suffix=_coords_button_suffix(for_admin=True),
        ):
            sent += 1

    if admins_only:
        return sent

    drivers = Driver.objects.filter(
        status='available', is_blocked=False, is_verified=True,
    ).exclude(phone='')
    for driver in drivers:
        name = _first_name(driver.firstname or driver.get_full_name() or 'Chauffeur', 'Chauffeur')
        if _try_situation(
            driver.phone, 'commande_attente_coords',
            _params(name, for_admin=False), fallback_tpl,
            button_url_suffix=_coords_button_suffix(for_admin=False),
        ):
            sent += 1
    return sent


def notify_admin_new_order(order) -> int:
    """Nouvelle commande avec GPS — template nouvelle_commande_admin (admin uniquement)."""
    has_coords = bool(
        order.pickup_lat and order.pickup_lng
        and order.destination_lat and order.destination_lng
    )
    if not has_coords:
        return 0

    pickup, dest = _trip_addresses(order)
    client = order.client_name or 'Client'
    price = _price_label(order) if order.price else 'À confirmer'
    timing = 'Programmée' if getattr(order, 'is_later', False) else 'Immédiate'
    tpl_params = [f'#{order.pk}', client, pickup, dest, price]
    fallback = (
        f'🚕 *DAXI Admin — Nouvelle commande #{order.pk}*\n\n'
        f'Client : {client}\nType : {timing}\n'
        f'📍 Départ : {pickup}\n📍 Destination : {dest}\n💰 Prix : {price}\n\n'
        f'Consultez le tableau de bord admin.'
    )
    return _broadcast_admin_situation('nouvelle_commande_admin', tpl_params, fallback)


def notify_admin_lost_object(order, description: str) -> int:
    driver = order.driver
    driver_name = (driver.get_full_name() if driver else order.driver_name) or '—'
    client = order.client_name or '—'
    desc = (description or '—')[:120]
    tpl_params = [f'#{order.pk}', client, driver_name, desc]
    fallback = (
        f'📦 *DAXI Admin — Objet oublié*\n\n'
        f'Course #{order.pk}\nClient : {client}\nChauffeur : {driver_name}\n'
        f'Objet : {desc}\n\nVérifiez Objets oubliés dans l\'admin.'
    )
    return _broadcast_admin_situation('objet_oublie_admin', tpl_params, fallback)


def notify_admin_enterprise_pending(enterprise) -> int:
    mode = enterprise.get_mode_display() if hasattr(enterprise, 'get_mode_display') else (enterprise.mode or '—')
    tpl_params = [
        (enterprise.name or 'Entreprise')[:60],
        (enterprise.phone or '—')[:30],
        (enterprise.email or '—')[:50],
        mode[:40],
    ]
    fallback = (
        f'🏢 *DAXI Admin — Nouvelle entreprise*\n\n'
        f'{enterprise.name}\nTél. : {enterprise.phone}\nEmail : {enterprise.email}\n'
        f'Mode : {mode}\n\nValidez dans Entreprises.'
    )
    return _broadcast_admin_situation('entreprise_en_attente', tpl_params, fallback)


def notify_admin_enterprise_location(enterprise) -> int:
    msg = (getattr(enterprise, 'location_help_message', None) or '—')[:200]
    tpl_params = [(enterprise.name or 'Entreprise')[:60], msg]
    fallback = (
        f'📍 *DAXI Admin — Emplacement entreprise*\n\n'
        f'{enterprise.name} a besoin d\'aide.\nMessage : {msg}\n\n'
        f'Configurez l\'emplacement dans Entreprises.'
    )
    return _broadcast_admin_situation('entreprise_emplacement', tpl_params, fallback)


def notify_admin_chat_escalated(session_id, last_message: str = '') -> int:
    """chat_escalade non créé sur Meta — texte libre admins (conversation ouverte)."""
    excerpt = (last_message or '—')[:200]
    fallback = (
        f'💬 *DAXI Admin — Support chat*\n\n'
        f'Session #{session_id}\nDernier message : {excerpt}\n\n'
        f'Ouvrez le support chat admin.'
    )
    sent = 0
    for admin_phone in _admin_whatsapp_phones():
        if _graph_send_text(admin_phone, fallback):
            sent += 1
    return sent


def notify_admin_driver_pending(driver) -> int:
    full_name = (driver.get_full_name() or f'{driver.firstname or ""} {driver.lastname or ""}').strip() or 'Chauffeur'
    vehicle = (driver.vehicle or '').strip()
    if not vehicle:
        parts = [driver.car_brand, driver.car_model]
        vehicle = ' '.join(p for p in parts if p).strip() or '—'
    tpl_params = [
        full_name[:60],
        vehicle[:40],
        (driver.phone or '—')[:30],
        (driver.city or '—')[:40],
    ]
    fallback = (
        f'👤 *DAXI Admin — Chauffeur à valider*\n\n'
        f'Nom complet : {full_name}\nVéhicule : {vehicle}\n'
        f'Tél. : {driver.phone}\nVille : {driver.city or "—"}\n\n'
        f'Vérifiez les documents dans Chauffeurs.'
    )
    return _broadcast_admin_situation('chauffeur_a_valider', tpl_params, fallback)


def notify_client_price_confirmed(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        return False
    client = _first_name(order.client_name or 'Client', 'Client')
    pickup, dest = _trip_addresses(order)
    price = _price_label(order)
    fallback = (
        f'✅ *DAXI — Prix confirmé*\n\nBonjour {client},\n\n'
        f'Votre tarif est confirmé : {price}\n'
        f'📍 Départ : {pickup}\n📍 Destination : {dest}\n\n'
        f'Procédez au paiement pour lancer la recherche de chauffeur.'
    )
    return _try_situation(phone, 'prix_confirme', [client, pickup, dest, price], fallback)


def notify_client_cancelled(order) -> bool:
    phone = _client_phone(order)
    if not phone:
        return False
    client = _first_name(order.client_name or 'Client', 'Client')
    pickup, dest = _trip_addresses(order)
    fallback = (
        f'❌ *DAXI — Course annulée*\n\nBonjour {client},\n\n'
        f'Votre course #{order.pk} a été annulée.\n'
        f'📍 Départ : {pickup}\n📍 Destination : {dest}'
    )
    return _try_situation(
        phone, 'course_annulee',
        [client, f'#{order.pk}', pickup],
        fallback,
    )


def notify_admin_cancel_custom_client(order, message: str, prev_status: str = '') -> bool:
    phone = _client_phone(order)
    if not phone or not (message or '').strip():
        return False
    client = _first_name(order.client_name or 'Client', 'Client')
    moved = prev_status in ('driver_assigned', 'on_way', 'arrived', 'in_progress')
    fee_line = (
        '_Aucun frais ne vous sera facturé (annulation par DAXI)._'
        if moved
        else '_Aucun frais ne vous sera facturé._'
    )
    text = (
        f'🛡️ *DAXI — Course annulée*\n\n'
        f'Bonjour {client},\n\n'
        f'{message.strip()}\n\n'
        f'Course #{order.pk}\n'
        f'{fee_line}'
    )
    return _graph_send_text(phone, text)


def notify_admin_cancel_custom_driver(driver, order, message: str) -> bool:
    phone = (getattr(driver, 'phone', None) or '').strip()
    if not phone or not (message or '').strip():
        return False
    name = _first_name(getattr(driver, 'first_name', None) or driver.get_full_name(), 'Chauffeur')
    text = (
        f'🛡️ *DAXI — Course annulée*\n\n'
        f'Bonjour {name},\n\n'
        f'{message.strip()}\n\n'
        f'Course #{order.pk} retirée de votre planning.'
    )
    return _graph_send_text(phone, text)


def handle_inbound_text(sender: str, text: str) -> str:
    """Route inbound WhatsApp text through the chatbot AI and return the reply."""
    from chat.models import ChatSession, ChatMessage
    from chatbot.ai_service import get_ai_response

    guest_id = f'whatsapp:{sender}'
    session = (
        ChatSession.objects.filter(guest_id=guest_id, is_resolved=False)
        .order_by('-updated_at')
        .first()
    )
    if not session:
        session = ChatSession.objects.create(guest_id=guest_id)

    ChatMessage.objects.create(session=session, role='user', content=text)

    history = list(session.messages.values('role', 'content').order_by('timestamp'))
    ai_result = get_ai_response(text, history, language='fr')
    reply = ai_result.get('response') or "Bonjour ! Comment puis-je vous aider ?"

    if ai_result.get('escalated'):
        session.is_escalated = True
        session.save(update_fields=['is_escalated', 'updated_at'])
        try:
            from julmin_taxis.notify import notify_admin_chat_escalated_event
            notify_admin_chat_escalated_event(session.pk, text)
        except Exception:
            pass
        reply += "\n\n_Un conseiller DAXI va reprendre la conversation sous peu._"

    ChatMessage.objects.create(session=session, role='assistant', content=reply)
    session.save(update_fields=['updated_at'])
    return reply


def process_webhook_payload(data: dict) -> None:
    """Parse Meta webhook JSON — statuts de livraison + réponses entrantes."""
    for entry in data.get('entry', []):
        for change in entry.get('changes', []):
            value = change.get('value', {})
            for st in value.get('statuses', []):
                record_delivery_status(st)
                wamid = st.get('id', '')
                status = st.get('status', '')
                recipient = st.get('recipient_id', '')
                errs = st.get('errors') or []
                if status in ('failed', 'deleted'):
                    err_txt = '; '.join(format_delivery_error(e) for e in errs) if errs else ''
                    logger.error(
                        '[WhatsApp] ✗ delivery %s to=%s wamid=%s %s',
                        status, recipient, wamid, err_txt or errs,
                    )
                elif status in ('delivered', 'read', 'sent'):
                    logger.info('[WhatsApp] ✓ delivery %s to=%s wamid=%s', status, recipient, wamid)
                else:
                    logger.info('[WhatsApp] status %s to=%s wamid=%s', status, recipient, wamid)
            for msg in value.get('messages', []):
                sender = msg.get('from', '')
                mtype = msg.get('type', '')
                if not sender:
                    continue
                try:
                    if mtype == 'text':
                        text = (msg.get('text') or {}).get('body', '').strip()
                        if not text:
                            continue
                        logger.info('[WhatsApp] Message from %s: %s', sender, text[:120])
                        if _maybe_handle_accept_intent(sender, text):
                            continue
                        reply = handle_inbound_text(sender, text)
                        _graph_send_text(sender, reply)
                    elif mtype == 'button':
                        payload = (msg.get('button') or {}).get('payload', '').strip()
                        text = (msg.get('button') or {}).get('text', '').strip()
                        logger.info('[WhatsApp] Button from %s: %s / %s', sender, text, payload[:80])
                        if _maybe_handle_accept_intent(sender, payload or text):
                            continue
                    elif mtype == 'interactive':
                        interactive = msg.get('interactive') or {}
                        if interactive.get('type') == 'button_reply':
                            br = interactive.get('button_reply') or {}
                            text = (br.get('title') or br.get('id') or '').strip()
                            logger.info('[WhatsApp] Button reply from %s: %s', sender, text)
                            if _maybe_handle_accept_intent(sender, text):
                                continue
                    else:
                        logger.info('[WhatsApp] Non-text message %s from %s', mtype, sender)
                except Exception as exc:
                    logger.exception('[WhatsApp] handler error: %s', exc)
