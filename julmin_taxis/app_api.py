"""
API JSON native DAXI — /api/app/

Une route par action (login, commander, payer, chat, GPS, chauffeur…).
Le site HTML continue d’utiliser HTMX ; l’app Android parle uniquement ici.
"""
from __future__ import annotations

import json
import re
from django.http import JsonResponse, HttpResponse, QueryDict
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET, require_http_methods

from orders.models import Order, OrderMessage
from julmin_taxis.htmx_views import (
    _get_current_driver,
    _get_order_for_client,
    _order_to_dict,
    client_account_delete,
    client_cancel_order,
    client_confirm_arrival,
    client_confirm_price,
    client_create_order,
    client_login,
    client_login_by_id,
    client_logout,
    client_order_stats,
    client_payment_contract_ack,
    client_payment_init,
    client_payment_status,
    client_profile_photo,
    client_profile_update,
    client_refuse_price,
    client_register,
    client_report_lost_object,
    client_request_return_pickup,
    client_save_phone,
    client_share_trip,
    client_submit_rating,
    client_unread_count,
    client_with_driver,
    driver_accept_order,
    driver_active_order,
    driver_cancel_order,
    driver_cash_sent_moncash,
    driver_commission_pay_moncash,
    driver_extend_trip,
    driver_login,
    driver_logout,
    driver_pause_trip,
    driver_profile_update,
    driver_register,
    driver_resume_trip,
    driver_send_reg_otp,
    driver_set_coords,
    driver_share_trip,
    driver_stats,
    driver_update_location,
    driver_update_online_status,
    driver_update_status,
    driver_verify_reg_otp,
    driver_withdrawal_request,
)
from julmin_taxis.htmx_views_tracking import (
    client_confirm_pickup,
    client_update_gps,
    client_update_pickup,
    order_track,
)
from julmin_taxis.mobile_views import (
    _json_safe,
    client_recent_places,
    client_service_plans,
    mobile_bootstrap,
)


def _next_step(order: Order | None) -> str:
    if not order:
        return 'home'
    phone = (order.client_phone or '').strip()
    if not phone and not getattr(order, 'user_id', None):
        return 'phone'
    if order.status in ('pending',) and not (order.pickup_lat and order.destination_lat):
        return 'pending_coords'
    if order.status in ('pending', 'price_proposed'):
        return 'confirm_price'
    if order.status == 'price_confirmed' and (order.payment_status or 'pending') == 'pending':
        return 'payment'
    if order.status in (
        'price_confirmed', 'driver_assigned', 'on_way', 'arrived',
        'in_progress', 'waiting_return',
    ):
        return 'tracking'
    if order.status == 'completed':
        return 'rating'
    if order.status == 'cancelled':
        return 'cancelled'
    return 'tracking'


def _user_payload(request):
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return None
    photo = ''
    try:
        if getattr(user, 'photo', None):
            photo = user.photo.url
    except Exception:
        photo = ''
    return {
        'id': user.pk,
        'email': user.email or '',
        'first_name': user.first_name or '',
        'last_name': user.last_name or '',
        'name': user.get_full_name() or user.email,
        'phone': getattr(user, 'phone', '') or '',
        'user_id': getattr(user, 'firebase_user_id', '') or '',
        'photo': photo,
        'is_driver': bool(getattr(user, 'is_driver', False)),
    }


def _driver_payload(driver):
    if not driver:
        return None
    photo = ''
    try:
        if driver.photo:
            photo = driver.photo.url
    except Exception:
        photo = ''
    return {
        'id': driver.pk,
        'firstname': driver.firstname or '',
        'lastname': driver.lastname or '',
        'name': f'{(driver.firstname or "")} {(driver.lastname or "")}'.strip(),
        'email': driver.email or '',
        'phone': driver.phone or '',
        'status': driver.status,
        'lat': driver.latitude,
        'lng': driver.longitude,
        'rating': float(driver.rating or 0),
        'vehicle': driver.vehicle or '',
        'plate': driver.plate or '',
        'photo': photo or (driver.car_image_url or ''),
        'wallet_balance': float(getattr(driver, 'wallet_balance', 0) or 0),
        'is_verified': bool(driver.is_verified),
    }


def _inject_json_post(request):
    """JSON body → request.POST (les vues HTMX lisent request.POST)."""
    data = {}
    ct = (request.content_type or '').lower()
    if 'application/json' in ct:
        raw = (request.body or b'').decode('utf-8') or '{}'
        try:
            parsed = json.loads(raw)
            if isinstance(parsed, dict):
                data = parsed
        except json.JSONDecodeError:
            data = {}
    qd = QueryDict('', mutable=True)
    if request.POST:
        for k in request.POST:
            qd.setlist(k, request.POST.getlist(k))
    for k, v in data.items():
        if v is None:
            continue
        if isinstance(v, bool):
            qd[k] = 'true' if v else 'false'
        elif isinstance(v, (dict, list)):
            qd[k] = json.dumps(v, ensure_ascii=False)
        else:
            qd[k] = str(v)
    gid = (
        qd.get('guest_id')
        or request.META.get('HTTP_X_DAXI_GUEST_ID', '')
        or request.session.get('guest_id', '')
    )
    if gid:
        qd['guest_id'] = gid
        request.session['guest_id'] = gid
    request._post = qd
    if not hasattr(request, '_files') or request._files is None:
        from django.utils.datastructures import MultiValueDict
        request._files = MultiValueDict()
    return qd


def _strip_html(text: str) -> str:
    text = re.sub(r'<[^>]+>', ' ', text or '')
    return re.sub(r'\s+', ' ', text).strip()


def _html_error(resp: HttpResponse) -> str | None:
    if isinstance(resp, JsonResponse):
        return None
    content_type = (resp.get('Content-Type') or '')
    if 'html' not in content_type and not (resp.content or b'').lstrip().startswith(b'<'):
        return None
    text = resp.content.decode('utf-8', errors='ignore')
    if 'ri-error-warning' in text or 'bg-red-500' in text or 'text-red-500' in text:
        msg = _strip_html(text)
        return msg or 'Erreur'
    return None


def _json_from_htmx(resp: HttpResponse) -> dict | None:
    if not isinstance(resp, JsonResponse):
        return None
    try:
        return json.loads(resp.content.decode('utf-8'))
    except Exception:
        return None


def _ok(payload: dict, status: int = 200) -> JsonResponse:
    payload.setdefault('ok', True)
    return JsonResponse(_json_safe(payload), status=status)


def _err(message: str, status: int = 400, extra: dict | None = None) -> JsonResponse:
    data = {'ok': False, 'error': message}
    if extra:
        data.update(extra)
    return JsonResponse(data, status=status)


def _wrap_order_action(request, order_id, htmx_view):
    _inject_json_post(request)
    resp = htmx_view(request, order_id)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err)
    data = _json_from_htmx(resp)
    if data is not None:
        if data.get('error') and not data.get('ok', True):
            return _err(str(data.get('error')), status=resp.status_code or 400)
        data.setdefault('ok', data.get('success', True))
        order, _ = _get_order_for_client(request, order_id)
        if order and 'order' not in data:
            data['order'] = _json_safe(_order_to_dict(order, request=request))
            data['next'] = _next_step(order)
        return JsonResponse(_json_safe(data))
    order, err = _get_order_for_client(request, order_id)
    if err:
        return _err(_strip_html(err.content.decode('utf-8', errors='ignore')))
    return _ok({
        'order': _json_safe(_order_to_dict(order, request=request)) if order else None,
        'next': _next_step(order),
    })


def _jwt_for_user(user):
    try:
        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        return {
            'access': str(refresh.access_token),
            'refresh': str(refresh),
        }
    except Exception:
        return None


def _messages_payload(order, scope='user'):
    qs = order.messages.order_by('timestamp')[:120]
    out = []
    for m in qs:
        out.append({
            'id': m.pk,
            'sender_type': m.sender_type,
            'sender_name': m.sender_name or '',
            'content': m.content or '',
            'image_url': m.image_url or '',
            'audio_url': getattr(m, 'audio_url', '') or '',
            'message_type': m.message_type or 'text',
            'is_read': bool(m.is_read),
            'timestamp': m.timestamp.isoformat() if m.timestamp else None,
        })
    return out


APP_API_CATALOG = {
    'version': 1,
    'base': '/api/app/',
    'pages': {
        'home': [
            'GET home',
            'GET places/autocomplete',
            'GET places/details',
            'POST pricing/estimate',
            'POST pricing/route',
        ],
        'auth': [
            'POST auth/login',
            'POST auth/login-by-id',
            'POST auth/register',
            'POST auth/logout',
            'POST auth/send-otp',
            'GET auth/me',
        ],
        'booking': [
            'POST orders/create',
            'POST orders/<id>/confirm-price',
            'POST orders/<id>/refuse-price',
            'POST orders/<id>/phone',
            'POST orders/<id>/payment/init',
            'GET orders/<id>/payment/status',
        ],
        'tracking': [
            'GET orders/<id>',
            'GET orders/<id>/status',
            'GET orders/<id>/track',
            'POST orders/<id>/update-gps',
            'POST orders/<id>/update-pickup',
            'POST orders/<id>/confirm-pickup',
            'POST orders/<id>/cancel',
            'POST orders/<id>/arrived',
            'POST orders/<id>/rating',
            'POST orders/<id>/share',
            'POST orders/<id>/sos',
            'POST orders/<id>/lost-object',
            'POST orders/<id>/request-return',
            'POST orders/<id>/client-with-driver',
        ],
        'chat': [
            'GET chat/<id>',
            'POST chat/<id>/send',
            'GET chat/<id>/unread',
        ],
        'account': [
            'GET account',
            'POST account/update',
            'POST account/photo',
            'POST account/delete',
            'GET account/stats',
            'GET orders',
        ],
        'driver': [
            'POST driver/login',
            'POST driver/logout',
            'POST driver/register',
            'GET driver/home',
            'GET driver/orders',
            'POST driver/orders/<id>/accept',
            'POST driver/orders/<id>/status',
            'POST driver/orders/<id>/cancel',
            'POST driver/orders/<id>/set-coords',
            'POST driver/orders/<id>/extend',
            'POST driver/orders/<id>/pause',
            'POST driver/orders/<id>/resume',
            'POST driver/location',
            'POST driver/status',
            'GET driver/active-order',
            'GET driver/stats',
            'GET driver/wallet',
        ],
    },
}


@require_GET
def app_catalog(request):
    return _ok({'catalog': APP_API_CATALOG, 'csrf_token': get_token(request)})


@require_GET
def app_home(request):
    boot = mobile_bootstrap(request)
    try:
        data = json.loads(boot.content.decode('utf-8'))
    except Exception:
        data = {'ok': False}
    data['user'] = _user_payload(request)
    data['driver'] = _driver_payload(_get_current_driver(request))
    data['csrf_token'] = get_token(request)
    data['next'] = 'home'
    orders = data.get('orders') or []
    active = next(
        (o for o in orders if o.get('status') not in ('completed', 'cancelled')),
        None,
    )
    data['active_order'] = active
    if active:
        try:
            order = Order.objects.filter(pk=active.get('id')).first()
            data['next'] = _next_step(order)
        except Exception:
            pass
    data.setdefault('ok', True)
    return JsonResponse(_json_safe(data))


@require_GET
def app_me(request):
    driver = _get_current_driver(request)
    return _ok({
        'user': _user_payload(request),
        'driver': _driver_payload(driver),
        'guest_id': request.session.get('guest_id') or request.META.get('HTTP_X_DAXI_GUEST_ID', ''),
        'csrf_token': get_token(request),
        'is_authenticated': bool(request.user and request.user.is_authenticated),
        'is_driver': bool(driver),
    })


@require_http_methods(['POST'])
def app_login(request):
    _inject_json_post(request)
    resp = client_login(request)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err, status=401)
    data = _json_from_htmx(resp) or {}
    if not data.get('success'):
        return _err(_strip_html(resp.content.decode('utf-8', errors='ignore')) or 'Connexion impossible', 401)
    tokens = _jwt_for_user(request.user) if request.user.is_authenticated else None
    return _ok({
        'user': _user_payload(request),
        'csrf_token': data.get('csrf_token') or get_token(request),
        'tokens': tokens,
    })


@require_http_methods(['POST'])
def app_login_by_id(request):
    _inject_json_post(request)
    resp = client_login_by_id(request)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err, status=401)
    data = _json_from_htmx(resp) or {}
    if not data.get('success'):
        return _err('Connexion impossible', 401)
    return _ok({
        'user': _user_payload(request),
        'csrf_token': data.get('csrf_token') or get_token(request),
        'tokens': _jwt_for_user(request.user) if request.user.is_authenticated else None,
    })


@require_http_methods(['POST'])
def app_register(request):
    _inject_json_post(request)
    resp = client_register(request)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err)
    data = _json_from_htmx(resp) or {}
    data.setdefault('ok', data.get('success', True))
    if request.user.is_authenticated:
        data['user'] = _user_payload(request)
        data['tokens'] = _jwt_for_user(request.user)
    return JsonResponse(_json_safe(data))


@require_http_methods(['POST'])
def app_logout(request):
    _inject_json_post(request)
    client_logout(request)
    return _ok({'logged_out': True})


@require_http_methods(['POST'])
def app_send_otp(request):
    _inject_json_post(request)
    import random
    from django.core.cache import cache
    email = request.POST.get('email', '').strip().lower()
    phone = (request.POST.get('phone') or request.POST.get('whatsapp') or '').strip()
    name = (request.POST.get('firstname') or request.POST.get('name') or email.split('@')[0] or 'Client').strip()
    if not email:
        return _err('Email requis.')
    from julmin_taxis.email_validate import is_valid_email
    if not is_valid_email(email):
        return _err('Entrez une adresse email valide (ex. toi@gmail.com ou toi@entreprise.ht).')
    if not phone:
        return _err('Numéro WhatsApp requis.')
    otp = str(random.randint(100000, 999999))
    from julmin_taxis.whatsapp_service import _normalize_phone, send_otp_whatsapp
    phone_norm = _normalize_phone(phone)
    if not phone_norm:
        return _err('Numéro WhatsApp invalide.')
    cache.set(f'reg_otp_{email}', otp, timeout=600)
    cache.set(f'reg_otp_phone_{email}', phone_norm, timeout=600)
    try:
        if send_otp_whatsapp(phone_norm, name, otp):
            return _ok({'success': True, 'message': 'Code envoyé sur WhatsApp.'})
        return _err('Échec envoi WhatsApp — vérifiez le numéro.', 500)
    except Exception as exc:
        return _err(str(exc), 500)


@require_GET
def app_places_autocomplete(request):
    from julmin_taxis.places_api import places_autocomplete
    return places_autocomplete(request)


@require_GET
def app_places_details(request):
    from julmin_taxis.places_api import places_details
    return places_details(request)


@require_http_methods(['GET', 'POST'])
def app_pricing_estimate(request):
    _inject_json_post(request)
    from pricing.views import client_estimate_price_view
    return client_estimate_price_view(request)


@require_http_methods(['GET', 'POST'])
def app_pricing_route(request):
    _inject_json_post(request)
    from pricing.views import client_route_view
    return client_route_view(request)


@require_GET
def app_service_plans(request):
    return client_service_plans(request)


@require_GET
def app_recent_places(request):
    return client_recent_places(request)


@require_http_methods(['POST'])
def app_create_order(request):
    _inject_json_post(request)
    resp = client_create_order(request)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err)
    order = getattr(request, '_daxi_order', None)
    if order is None:
        user = request.user if request.user.is_authenticated else None
        qs = Order.objects.all()
        if user:
            qs = qs.filter(user=user)
        else:
            gid = request.POST.get('guest_id') or request.session.get('guest_id')
            qs = qs.filter(guest_id=gid, user__isnull=True)
        order = qs.order_by('-id').first()
    if not order:
        return _err('Commande non créée')
    return _ok({
        'order': _json_safe(_order_to_dict(order, request=request)),
        'next': _next_step(order),
        'order_id': order.pk,
    })


@require_GET
def app_orders(request):
    user = request.user if request.user.is_authenticated else None
    guest_id = request.GET.get('guest_id') or request.session.get('guest_id') or request.META.get('HTTP_X_DAXI_GUEST_ID', '')
    tab = (request.GET.get('tab') or 'active').strip()
    qs = Order.objects.none()
    if user:
        qs = Order.objects.filter(user=user)
    elif guest_id:
        qs = Order.objects.filter(guest_id=guest_id, user__isnull=True)
    active_st = {
        'pending', 'price_proposed', 'price_confirmed', 'driver_assigned',
        'on_way', 'arrived', 'in_progress', 'waiting_return',
    }
    if tab == 'history':
        qs = qs.filter(status__in=['completed', 'cancelled'])
    else:
        qs = qs.filter(status__in=active_st)
    orders = [
        _json_safe(_order_to_dict(o, light=True, request=request))
        for o in qs.select_related('driver').order_by('-created_at')[:80]
    ]
    return _ok({'orders': orders, 'tab': tab})


@require_GET
def app_order_detail(request, order_id):
    order, err = _get_order_for_client(request, order_id)
    if err:
        return _err(_strip_html(err.content.decode('utf-8', errors='ignore')), 404)
    return _ok({
        'order': _json_safe(_order_to_dict(order, request=request)),
        'next': _next_step(order),
    })


@require_GET
def app_order_status(request, order_id):
    from julmin_taxis.htmx_views import client_order_status
    return client_order_status(request, order_id)


@require_GET
def app_order_track(request, order_id):
    return order_track(request, order_id)


@require_http_methods(['POST'])
def app_confirm_price(request, order_id):
    return _wrap_order_action(request, order_id, client_confirm_price)


@require_http_methods(['POST'])
def app_refuse_price(request, order_id):
    return _wrap_order_action(request, order_id, client_refuse_price)


@require_http_methods(['POST'])
def app_cancel_order(request, order_id):
    return _wrap_order_action(request, order_id, client_cancel_order)


@require_http_methods(['POST'])
def app_save_phone(request, order_id):
    return _wrap_order_action(request, order_id, client_save_phone)


@require_http_methods(['POST'])
def app_payment_init(request, order_id):
    return _wrap_order_action(request, order_id, client_payment_init)


@require_GET
def app_payment_status(request, order_id):
    return client_payment_status(request, order_id)


@require_http_methods(['POST'])
def app_payment_contract_ack(request, order_id):
    return _wrap_order_action(request, order_id, client_payment_contract_ack)


@require_http_methods(['POST'])
def app_update_gps(request, order_id):
    return _wrap_order_action(request, order_id, client_update_gps)


@require_http_methods(['POST'])
def app_update_pickup(request, order_id):
    return _wrap_order_action(request, order_id, client_update_pickup)


@require_http_methods(['POST'])
def app_confirm_pickup(request, order_id):
    return _wrap_order_action(request, order_id, client_confirm_pickup)


@require_http_methods(['POST'])
def app_arrived(request, order_id):
    return _wrap_order_action(request, order_id, client_confirm_arrival)


@require_http_methods(['POST'])
def app_rating(request, order_id):
    return _wrap_order_action(request, order_id, client_submit_rating)


@require_http_methods(['POST'])
def app_request_return(request, order_id):
    return _wrap_order_action(request, order_id, client_request_return_pickup)


@require_http_methods(['POST'])
def app_client_with_driver(request, order_id):
    return _wrap_order_action(request, order_id, client_with_driver)


@require_http_methods(['POST'])
def app_share(request, order_id):
    return _wrap_order_action(request, order_id, client_share_trip)


@require_http_methods(['POST'])
def app_sos(request, order_id):
    from julmin_taxis.htmx_views import client_order_sos
    return _wrap_order_action(request, order_id, client_order_sos)


@require_http_methods(['POST'])
def app_lost_object(request, order_id):
    return _wrap_order_action(request, order_id, client_report_lost_object)


@require_GET
def app_chat(request, order_id):
    order, err = _get_order_for_client(request, order_id)
    if err:
        return _err(_strip_html(err.content.decode('utf-8', errors='ignore')), 404)
    OrderMessage.objects.filter(order=order, sender_type='driver', is_read=False).update(is_read=True)
    return _ok({'messages': _messages_payload(order), 'order_id': order.pk})


@require_http_methods(['POST'])
def app_chat_send(request, order_id):
    from julmin_taxis.htmx_views import client_chat_send
    _inject_json_post(request)
    resp = client_chat_send(request, order_id)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err)
    order, err = _get_order_for_client(request, order_id)
    if err:
        return _err('Commande introuvable', 404)
    return _ok({'messages': _messages_payload(order), 'order_id': order.pk})


@require_GET
def app_chat_unread(request, order_id):
    return client_unread_count(request, order_id)


@require_GET
def app_account(request):
    return _ok({
        'user': _user_payload(request),
        'guest_id': request.session.get('guest_id') or '',
        'csrf_token': get_token(request),
    })


@require_http_methods(['POST'])
def app_account_update(request):
    _inject_json_post(request)
    resp = client_profile_update(request)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err)
    data = _json_from_htmx(resp) or {'ok': True}
    data['user'] = _user_payload(request)
    data.setdefault('ok', True)
    return JsonResponse(_json_safe(data))


@require_http_methods(['POST'])
def app_account_photo(request):
    return client_profile_photo(request)


@require_http_methods(['POST'])
def app_account_delete(request):
    _inject_json_post(request)
    return client_account_delete(request)


@require_GET
def app_account_stats(request):
    return client_order_stats(request)


@require_http_methods(['POST'])
def app_driver_login(request):
    _inject_json_post(request)
    resp = driver_login(request)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err, 401)
    driver = _get_current_driver(request)
    if not driver:
        
        if resp.get('HX-Redirect'):
            driver = _get_current_driver(request)
        if not driver:
            return _err('Email ou mot de passe incorrect', 401)
    return _ok({
        'driver': _driver_payload(driver),
        'csrf_token': get_token(request),
        'redirect': '/driver/',
    })


@require_http_methods(['POST'])
def app_driver_logout(request):
    _inject_json_post(request)
    driver_logout(request)
    return _ok({'logged_out': True})


@require_http_methods(['POST'])
def app_driver_register(request):
    _inject_json_post(request)
    resp = driver_register(request)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err)
    data = _json_from_htmx(resp) or {'ok': True}
    data.setdefault('ok', True)
    return JsonResponse(_json_safe(data))


@require_http_methods(['POST'])
def app_driver_send_otp(request):
    _inject_json_post(request)
    return driver_send_reg_otp(request)


@require_http_methods(['POST'])
def app_driver_verify_otp(request):
    _inject_json_post(request)
    return driver_verify_reg_otp(request)


@require_GET
def app_driver_home(request):
    driver = _get_current_driver(request)
    if not driver:
        return _err('Non authentifié', 401)
    active = driver_active_order(request)
    stats = driver_stats(request)
    try:
        active_data = json.loads(active.content.decode('utf-8'))
    except Exception:
        active_data = {}
    try:
        stats_data = json.loads(stats.content.decode('utf-8'))
    except Exception:
        stats_data = {}
    return _ok({
        'driver': _driver_payload(driver),
        'active_order': active_data.get('order'),
        'stats': stats_data,
    })


@require_GET
def app_driver_orders(request):
    driver = _get_current_driver(request)
    if not driver:
        return _err('Non authentifié', 401)
    tab = (request.GET.get('tab') or 'available').strip()
    if tab == 'available':
        qs = Order.objects.filter(
            driver__isnull=True,
            status__in=['price_confirmed', 'pending'],
        ).exclude(payment_status='failed')
    elif tab == 'history':
        qs = Order.objects.filter(driver=driver, status__in=['completed', 'cancelled'])
    else:
        qs = Order.objects.filter(driver=driver).exclude(status__in=['completed', 'cancelled'])
    orders = [
        _json_safe(_order_to_dict(o, light=True, for_driver=True, request=request))
        for o in qs.select_related('driver', 'user').order_by('-created_at')[:80]
    ]
    return _ok({'orders': orders, 'tab': tab, 'driver': _driver_payload(driver)})


@require_http_methods(['POST'])
def app_driver_accept(request, order_id):
    _inject_json_post(request)
    resp = driver_accept_order(request, order_id)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err)
    data = _json_from_htmx(resp)
    if data is not None:
        data.setdefault('ok', True)
        return JsonResponse(_json_safe(data))
    driver = _get_current_driver(request)
    order = Order.objects.filter(pk=order_id, driver=driver).first() if driver else None
    return _ok({
        'order': _json_safe(_order_to_dict(order, for_driver=True, request=request)) if order else None,
        'next': _next_step(order),
    })


def _wrap_driver_order(request, order_id, htmx_view):
    _inject_json_post(request)
    resp = htmx_view(request, order_id)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err)
    data = _json_from_htmx(resp)
    if data is not None:
        data.setdefault('ok', True)
        return JsonResponse(_json_safe(data))
    driver = _get_current_driver(request)
    order = Order.objects.filter(pk=order_id, driver=driver).first() if driver else None
    return _ok({
        'order': _json_safe(_order_to_dict(order, for_driver=True, request=request)) if order else None,
        'next': _next_step(order),
    })


@require_http_methods(['POST'])
def app_driver_order_status(request, order_id):
    return _wrap_driver_order(request, order_id, driver_update_status)


@require_http_methods(['POST'])
def app_driver_cancel(request, order_id):
    return _wrap_driver_order(request, order_id, driver_cancel_order)


@require_http_methods(['POST'])
def app_driver_set_coords(request, order_id):
    return _wrap_driver_order(request, order_id, driver_set_coords)


@require_http_methods(['POST'])
def app_driver_extend(request, order_id):
    return _wrap_driver_order(request, order_id, driver_extend_trip)


@require_http_methods(['POST'])
def app_driver_pause(request, order_id):
    return _wrap_driver_order(request, order_id, driver_pause_trip)


@require_http_methods(['POST'])
def app_driver_resume(request, order_id):
    return _wrap_driver_order(request, order_id, driver_resume_trip)


@require_http_methods(['POST'])
def app_driver_share(request, order_id):
    return _wrap_driver_order(request, order_id, driver_share_trip)


@require_http_methods(['POST'])
def app_driver_location(request):
    _inject_json_post(request)
    return driver_update_location(request)


@require_http_methods(['POST'])
def app_driver_online(request):
    _inject_json_post(request)
    return driver_update_online_status(request)


@require_GET
def app_driver_active(request):
    return driver_active_order(request)


@require_GET
def app_driver_stats_view(request):
    return driver_stats(request)


@require_GET
def app_driver_wallet(request):
    driver = _get_current_driver(request)
    if not driver:
        return _err('Non authentifié', 401)
    return _ok({
        'driver': _driver_payload(driver),
        'wallet_balance': float(getattr(driver, 'wallet_balance', 0) or 0),
    })


@require_http_methods(['POST'])
def app_driver_pay_commission(request):
    _inject_json_post(request)
    return driver_commission_pay_moncash(request)


@require_http_methods(['POST'])
def app_driver_cash_sent(request):
    _inject_json_post(request)
    return driver_cash_sent_moncash(request)


@require_http_methods(['POST'])
def app_driver_withdraw(request):
    _inject_json_post(request)
    return driver_withdrawal_request(request)


@require_http_methods(['POST'])
def app_driver_profile_update(request):
    _inject_json_post(request)
    resp = driver_profile_update(request)
    html_err = _html_error(resp)
    if html_err:
        return _err(html_err)
    return _ok({'driver': _driver_payload(_get_current_driver(request))})
