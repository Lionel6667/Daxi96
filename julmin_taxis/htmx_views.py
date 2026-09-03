"""
DAXI HTMX Views — All server-side logic replacing JavaScript in the 3 HTML pages.
Each view returns an HTML fragment (for HTMX swaps) or JSON where needed.
"""
import json
import os
import hashlib
import uuid
import base64
import requests
import random
import math
from urllib.parse import quote
from datetime import datetime, timedelta, date
from calendar import monthcalendar

FRENCH_MONTH_NAMES = [
    '', 'Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin',
    'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre',
]

                                                              
_OCR_READER = None

def get_ocr_reader():
    global _OCR_READER
    if _OCR_READER is None:
        import easyocr
                                                             
                                                          
        _OCR_READER = easyocr.Reader(['fr', 'en'], gpu=False)
    return _OCR_READER

from django.shortcuts import render, get_object_or_404
from django.http import HttpResponse, JsonResponse
from django.views import View
from django.views.decorators.http import require_http_methods
from django.utils import timezone
from django.utils.decorators import method_decorator
from django.db.models import Q, Count, Sum
from django.db import transaction
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.decorators import login_required
from django.middleware.csrf import get_token
from django.conf import settings

from orders.models import Order, OrderMessage, LostObject
from chat.models import ChatSession, ChatMessage
from drivers.models import Driver, DriverReview
from accounts.models import CustomUser
import requests
import uuid
import base64
import random

from julmin_taxis.security_utils import rate_limit_request, verify_admin_password


def _hash(pw: str) -> str:
    return hashlib.sha256(pw.strip().encode()).hexdigest()


def _sanitize_phone(phone: str) -> str:
    """Return E.164 (+country + national) or empty."""
    if not phone:
        return ''
    import re
    raw = str(phone).strip()
    if '🔒' in raw or 'débloqu' in raw.lower():
        return ''
    digits = re.sub(r'\D', '', raw)
    if len(digits) < 8:
        return ''
    if digits.startswith('509'):
        national = digits[3:]
        if len(national) == 9 and national.startswith('0'):
            national = national[1:]
        if len(national) == 8:
            return '+509' + national
    if len(digits) == 8:
        return '+509' + digits
    if len(digits) == 9 and digits.startswith('0'):
        return '+509' + digits[1:]
    if raw.startswith('+') or digits:
        return '+' + digits
    return ''


def _phone_from_prefix_and_national(prefix: str, national: str) -> str:
    """Build E.164 phone from prefix select + national digits."""
    import re

    prefix = (prefix or '+509').strip()
    if prefix.endswith('-DO'):
        prefix = '+1'
    if not prefix.startswith('+'):
        prefix = '+' + re.sub(r'\D', '', prefix)

    national_digits = re.sub(r'\D', '', national or '')
    prefix_digits = re.sub(r'\D', '', prefix)

    if national_digits.startswith(prefix_digits) and len(national_digits) > len(prefix_digits) + 4:
        return '+' + national_digits

    if prefix == '+509':
        if len(national_digits) == 9 and national_digits.startswith('0'):
            national_digits = national_digits[1:]
        if len(national_digits) != 8:
            return ''
        return '+509' + national_digits
    if prefix == '+1':
        if len(national_digits) == 11 and national_digits.startswith('1'):
            national_digits = national_digits[1:]
        if len(national_digits) != 10:
            return ''
        return '+1' + national_digits
    if prefix == '+33':
        if national_digits.startswith('0'):
            national_digits = national_digits[1:]
        if len(national_digits) != 9:
            return ''
        return '+33' + national_digits
    if prefix == '+52':
        if len(national_digits) == 12 and national_digits.startswith('52'):
            national_digits = national_digits[2:]
        if len(national_digits) != 10:
            return ''
        return '+52' + national_digits

    if len(national_digits) < 8:
        return ''
    return prefix + national_digits


def _driver_phone_from_request(request) -> str:
    raw = (request.POST.get('phone') or '').strip()
    if raw.startswith('+'):
        normalized = _sanitize_phone(raw)
        return normalized or raw
    prefix = (request.POST.get('phone_prefix') or '+509').strip()
    return _phone_from_prefix_and_national(prefix, raw)


def _is_admin_session(request) -> bool:
    return bool(request.session.get('is_admin', False))


def _client_auth_user(request):
    """Compte client connecté — exclut staff, session admin et session chauffeur."""
    if _is_admin_session(request) or request.session.get('driver_id'):
        return None
    user = getattr(request, 'user', None)
    if not user or not user.is_authenticated:
        return None
    if getattr(user, 'is_staff', False):
        return None
    return user


def _is_admin_authenticated(request) -> bool:
    """Session admin (adm.html) or Django staff — including JWT Bearer on HTMX calls."""
    if _is_admin_session(request):
        return True
    if getattr(request, 'user', None) and request.user.is_authenticated and request.user.is_staff:
        return True
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if auth.startswith('Bearer '):
        try:
            from rest_framework_simplejwt.authentication import JWTAuthentication
            result = JWTAuthentication().authenticate(request)
            if result:
                user, _ = result
                return bool(user.is_staff)
        except Exception:
            pass
    return False


def _admin_gate(request, permission=None):
    """Return None if admin is authenticated with required permission, else HX-Redirect / error."""
    if not _is_admin_authenticated(request):
        resp = HttpResponse('', status=200)
        resp['HX-Redirect'] = '/admin-dashboard/'
        return resp
    from julmin_taxis.admin_permissions import (
        admin_has_permission,
        admin_permission_denied_response,
        required_permission_for_request,
    )
    perm = permission or required_permission_for_request(request)
    if perm and not admin_has_permission(request, perm):
        return admin_permission_denied_response(request)
    return None


def _htmx_error(message: str, status: int = 400) -> HttpResponse:
                                                           
                                                                      
    if status in (400, 401, 403):
        status = 200
    return HttpResponse(
        f'<div class="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-2xl font-bold text-sm mb-4">'
        f'<i class="ri-error-warning-line mr-2"></i> {message}</div>',
        status=status,
        content_type='text/html'
    )


def _htmx_success(message: str) -> HttpResponse:
    return HttpResponse(
        f'<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded">'
        f'✅ {message}</div>',
        content_type='text/html'
    )


def _admin_ok(request, message: str):
    accept = request.headers.get('Accept') or ''
    if 'application/json' in accept:
        return JsonResponse({'ok': True, 'message': message})
    return _htmx_success(message)


def _notify_ws(group: str, event_type: str, data: dict):
    """Broadcast a WebSocket message via Django Channels."""
    data = dict(data or {})
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        layer = get_channel_layer()
        if not layer:
            return
        payload = {
            'type': 'broadcast_message',
            'message': {'type': event_type, 'data': data}
        }
        async_to_sync(layer.group_send)(group, payload)
                                                         
        eid = data.get('enterprise_id')
        if not eid and data.get('order_id'):
            try:
                from orders.models import Order
                eid = Order.objects.filter(pk=data['order_id']).values_list('enterprise_id', flat=True).first()
            except Exception:
                eid = None
        if eid and not str(group).startswith(f'enterprise_{eid}'):
            async_to_sync(layer.group_send)(f'enterprise_{eid}', payload)
        uid = data.get('user_id')
        if not uid and data.get('order_id'):
            try:
                from orders.models import Order
                uid = Order.objects.filter(pk=data['order_id']).values_list('user_id', flat=True).first()
            except Exception:
                uid = None
        if uid and not str(group).startswith(f'user_{uid}'):
            async_to_sync(layer.group_send)(f'user_{uid}', payload)
    except Exception:
        pass


from julmin_taxis.round_trip_utils import (
    is_round_trip_order,
    round_trip_phase,
    round_trip_can_take_other_rides,
    round_trip_wait_remaining_seconds,
    round_trip_pickup_request_pending,
    order_pipeline_index,
)
from julmin_taxis.plan_pipeline_utils import (
    is_plan_order,
    plan_pipeline_index,
    plan_pipeline_variant,
)


_DRIVER_STATUS_TRANSITIONS = {
    'driver_assigned': ['on_way'],
    'on_way': ['arrived', 'in_progress'],
    'arrived': ['in_progress'],
    'in_progress': ['completed', 'waiting_return'],
    'waiting_return': ['in_progress'],
}


def _validate_driver_status_transition(order, new_status):
    """Return an error message if the status transition is not allowed."""
    allowed = _DRIVER_STATUS_TRANSITIONS.get(order.status, [])
    if new_status not in allowed:
        return (
            f'Transition invalide: {order.get_status_display()} → '
            f'{dict(order.STATUS_CHOICES).get(new_status, new_status)}'
        )

    if new_status == 'completed':
        if is_round_trip_order(order):
            if order.status == 'in_progress' and round_trip_phase(order) != 'return':
                return (
                    'Course aller-retour : signalez d\'abord votre arrivée à destination, '
                    'puis démarrez le retour avant de terminer.'
                )
            if order.status == 'waiting_return':
                return 'Démarrez le trajet retour avant de terminer la course.'

    if new_status == 'waiting_return':
        if not is_round_trip_order(order):
            return 'Cette étape est réservée aux courses aller-retour.'
        if order.status != 'in_progress':
            return 'Vous devez être en course pour signaler l\'arrivée à destination.'
        phase = round_trip_phase(order)
        if phase and phase not in ('outbound', ''):
            return 'Transition aller-retour invalide.'

    if new_status == 'completed' and order.status == 'in_progress' and not is_round_trip_order(order):
        pass

    return None


                                                                                 
                      
                                                                                 

def admin_login(request):
    """POST: verify admin password → set session, return main interface HTML."""
    if request.method == 'POST':
        from julmin_taxis.security_utils import rate_limit_request
        allowed, retry = rate_limit_request(request, 'admin_login', 8, 300)
        if not allowed:
            return _htmx_error(f'Trop de tentatives. Réessayez dans {retry}s.')
        pw = request.POST.get('password', '').strip()
        if verify_admin_password(pw, request.session):
            request.session.cycle_key()
            request.session['is_admin'] = True
            role = (request.POST.get('admin_role') or '').strip()
            if role:
                from julmin_taxis.admin_permissions import ROLE_PERMISSIONS
                if role in ROLE_PERMISSIONS:
                    request.session['admin_role'] = role
            request.session.set_expiry(86400 * 7)
            response = HttpResponse('', status=200)
            response['HX-Refresh'] = 'true'
            return response
                                                                                       
        response = HttpResponse(
            '<div id="login-password-error" class="text-red-500 text-sm mt-2 flex items-center gap-2">'
            '<i class="fas fa-exclamation-circle"></i>&nbsp;Mot de passe incorrect</div>',
            status=200,
            content_type='text/html',
        )
        response['HX-Retarget'] = '#login-password-error'
        response['HX-Reswap'] = 'outerHTML'
        return response
    return _htmx_error('Méthode non supportée', 405)


def admin_logout(request):
    """POST: destroy admin session."""
    request.session.flush()
    response = HttpResponse('', status=200)
    response['HX-Redirect'] = '/admin-dashboard/'
    return response


def admin_change_password(request):
    """POST: change admin password stored in settings/session."""
    gate = _admin_gate(request)
    if gate: return gate
    old_pw = request.POST.get('old_password', '')
    new_pw = request.POST.get('new_password', '')
    if old_pw.strip() and not verify_admin_password(old_pw.strip(), request.session):
        return _htmx_error('Ancien mot de passe incorrect')
                                                                                     
    request.session['admin_password_override'] = new_pw.strip()
    return _htmx_success('Mot de passe changé avec succès')


                                                                                 
                
                                                                                 

from julmin_taxis.address_utils import clean_address_display, coords_in_covered_zone
from julmin_taxis.driver_display_utils import driver_public_dict
from julmin_taxis.currency_utils import format_price, usd_to_htg


def _fmt_haiti(dt):
    """Format a UTC-aware datetime as Haiti local time (America/Port-au-Prince)."""
    if not dt:
        return ''
    try:
        import pytz
        ht = pytz.timezone('America/Port-au-Prince')
        local = dt.astimezone(ht)
        return local.strftime('%d/%m %H:%M')
    except Exception:
        try:
            return dt.strftime('%d/%m %H:%M')
        except Exception:
            return ''


def _haversine_km(lat1, lng1, lat2, lng2):
    if not all([lat1, lng1, lat2, lng2]):
        return None
    R = 6371
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlng/2)**2
    return round(R * 2 * math.asin(math.sqrt(a)), 1)


_HAITI_ROAD_FACTOR = 1.35
_HAITI_AVG_SPEED_KMH = 28.0


def _estimate_duration_min(lat1, lng1, lat2, lng2):
    """Estimation conservative (ligne droite × facteur route, vitesse Haïti ~28 km/h)."""
    km = _haversine_km(lat1, lng1, lat2, lng2)
    if km is None:
        return None
    road_km = km * _HAITI_ROAD_FACTOR
    return max(5, round(road_km / _HAITI_AVG_SPEED_KMH * 60))


def _light_trip_duration_min(pickup_lat, pickup_lng, dest_lat, dest_lng,
                             trip_type='one_way', wait_minutes=0):
    """Durée estimée sans OSRM (listes)."""
    dm = _estimate_duration_min(pickup_lat, pickup_lng, dest_lat, dest_lng)
    if dm is None:
        return None
    tt = (trip_type or '').lower()
    if tt in ('round_trip', 'aller-retour') or 'retour' in tt:
        return int(dm) * 2 + int(wait_minutes or 0)
    return dm


def _trip_duration_min(pickup_lat, pickup_lng, dest_lat, dest_lng,
                       trip_type='one_way', wait_minutes=0):
    """Durée estimée course : OSRM si dispo, sinon haversine ajustée ; AR = ×2 + attente."""
    if not all([pickup_lat, pickup_lng, dest_lat, dest_lng]):
        return None
    duration_min = None
    try:
        from pricing.routing import get_route
        route = get_route(pickup_lat, pickup_lng, dest_lat, dest_lng)
        duration_s = float(route.get('duration_s') or 0)
        dist_km = float(route.get('distance_km') or 0)
        if route.get('source') == 'straight_line' or duration_s <= 0:
            duration_s = (dist_km / _HAITI_AVG_SPEED_KMH) * 3600.0
        else:
                                                                                 
            floor_s = (dist_km / 25.0) * 3600.0
            duration_s = max(duration_s, floor_s)
        duration_min = max(5, round(duration_s / 60.0))
    except Exception:
        duration_min = _estimate_duration_min(pickup_lat, pickup_lng, dest_lat, dest_lng)
    tt = (trip_type or '').lower()
    if tt in ('round_trip', 'aller-retour') or 'retour' in tt:
        duration_min = int(duration_min) * 2 + int(wait_minutes or 0)
    return duration_min


def _trip_distance_km(pickup_lat, pickup_lng, dest_lat, dest_lng):
    """Distance route (OSRM/Google routing) en km, sinon haversine."""
    if not all([pickup_lat, pickup_lng, dest_lat, dest_lng]):
        return None
    try:
        from pricing.routing import get_route
        route = get_route(pickup_lat, pickup_lng, dest_lat, dest_lng)
        dist_km = float(route.get('distance_km') or 0)
        if dist_km > 0 and route.get('source') != 'straight_line':
            return round(dist_km, 1)
    except Exception:
        pass
    km = _haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng)
    return round(km, 1) if km is not None else None


def _fast_order_price(pickup_lat, pickup_lng, dest_lat, dest_lng, trip_type='one_way', passengers=1, wait_minutes=0, allow_driver_other=False):
    """Estimation rapide (haversine + config) — pas d'appel OSRM."""
    try:
        from pricing.models import PricingConfig
        cfg = PricingConfig.get_active()
        km = _haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng) or 0
        price = max(
            float(cfg.minimum_price),
            km * float(cfg.base_price_per_km) * float(cfg.global_multiplier),
        )
        if trip_type == 'round_trip':
            try:
                price *= float(cfg.round_trip_multiplier)
            except Exception:
                price *= 2.0
            wait_min = int(wait_minutes or 0)
            if wait_min > 0 and not allow_driver_other:
                import math
                blocks = math.ceil(wait_min / 30)
                price += blocks * float(cfg.wait_price_per_30min)
        if passengers > 1:
            try:
                pct = float(cfg.passenger_price_percent)
            except Exception:
                pct = 5.0
            price *= (1 + (passengers - 1) * pct / 100)
        return round(price, 2), km
    except Exception:
        km = _haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng) or 0
        return (round(max(5.0, km * 2.5), 2), km) if km else (None, None)


def _smart_order_price(pickup_lat, pickup_lng, dest_lat, dest_lng, trip_type='one_way', passengers=1, wait_minutes=0, allow_driver_other=False):
    """Prix intelligent — délègue à pricing.services (source unique)."""
    from pricing.services import preview_order_price

    result = preview_order_price(
        pickup_lat, pickup_lng, dest_lat, dest_lng,
        trip_type=trip_type,
        passengers=passengers,
        wait_minutes=wait_minutes,
        allow_driver_other=allow_driver_other,
    )
    price = float(result.price) if result.price is not None else None
    return price, result.distance_km, result.duration_min, result.engine_result


_FIXED_SERVICE_PLAN_KEYS = frozenset({
    'demi-journee', 'demi_journee', 'journee-complete', 'journee_complete', 'journee',
    'elegance-night', 'elegance_night',
})

_STATUS_PIPELINE = (
    'pending', 'price_proposed', 'price_confirmed', 'driver_assigned',
    'on_way', 'arrived', 'in_progress', 'completed',
)


def _status_pipeline_index(status):
    try:
        return _STATUS_PIPELINE.index(status)
    except ValueError:
        return -1


def _pipeline_index_for_order(order, status=None):
    """Index pipeline UI — forfait/plan, aller-retour ou course standard."""
    if is_plan_order(order) and not is_round_trip_order(order):
        idx = plan_pipeline_index(order, status)
        if idx >= 0:
            return idx
    return order_pipeline_index(order, status)


def _client_order_phase(order):
    """Étape pipeline + message explicite pour le client."""
    status = (order.status or '').strip()
    has_coords = bool(
        order.pickup_lat and order.pickup_lng
        and order.destination_lat and order.destination_lng
    )
    has_price = bool(order.price and float(order.price) > 0)
    paid = (order.payment_status or '').strip() in ('paid', 'in_person')
    has_driver = bool(order.driver_id)

    if status == 'cancelled':
        return {
            'pipeline_index': -1,
            'client_waiting_title': '',
            'client_waiting_detail': '',
            'client_waiting_kind': 'cancelled',
            'client_status_label': 'Annulé',
        }
    if status == 'completed':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'completed'),
            'client_waiting_title': 'Course terminée',
            'client_waiting_detail': 'Merci d\'avoir voyagé avec DAXI.',
            'client_waiting_kind': 'done',
            'client_status_label': 'Terminée',
        }
    if status == 'waiting_return':
        wait_mins = int(order.round_trip_wait_minutes or 0)
        remaining = round_trip_wait_remaining_seconds(order)
        detail = (
            f'Vous êtes arrivé à destination. Attente prévue : '
            f'{wait_mins} min avant le retour vers le point de départ.'
        )
        if remaining is not None and wait_mins > 0:
            rm = max(1, (remaining + 59) // 60)
            detail = (
                f'Pause avant le retour — environ {rm} min restante(s). '
                f'Le chauffeur vous ramènera au point de départ.'
            )
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'waiting_return'),
            'client_waiting_title': 'Attente avant le retour',
            'client_waiting_detail': detail,
            'client_waiting_kind': 'active',
            'client_status_label': 'Attente retour',
        }
    if status == 'in_progress':
        if is_round_trip_order(order) and round_trip_phase(order) == 'return':
            return {
                'pipeline_index': _pipeline_index_for_order(order, 'in_progress'),
                'client_waiting_title': 'Retour en cours',
                'client_waiting_detail': 'Vous êtes en route vers le point de départ initial.',
                'client_waiting_kind': 'active',
                'client_status_label': 'Retour en cours',
            }
        if is_round_trip_order(order):
            return {
                'pipeline_index': _pipeline_index_for_order(order, 'in_progress'),
                'client_waiting_title': 'Aller en cours',
                'client_waiting_detail': 'Vous êtes en route vers votre destination.',
                'client_waiting_kind': 'active',
                'client_status_label': 'Aller en cours',
            }
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'in_progress'),
            'client_waiting_title': 'Course en cours',
            'client_waiting_detail': 'Vous êtes en route vers votre destination.',
            'client_waiting_kind': 'active',
            'client_status_label': 'Course en cours',
        }
    if status == 'arrived':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'arrived'),
            'client_waiting_title': 'Chauffeur sur place',
            'client_waiting_detail': 'Rejoignez votre chauffeur au point de départ.',
            'client_waiting_kind': 'active',
            'client_status_label': 'Chauffeur arrivé',
        }
    if status == 'on_way':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'on_way'),
            'client_waiting_title': 'Chauffeur en route',
            'client_waiting_detail': 'Votre chauffeur se dirige vers le point de départ.',
            'client_waiting_kind': 'active',
            'client_status_label': 'En route',
        }
    if status == 'driver_assigned':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'driver_assigned'),
            'client_waiting_title': 'Chauffeur assigné',
            'client_waiting_detail': 'Votre chauffeur prépare la prise en charge.',
            'client_waiting_kind': 'driver',
            'client_status_label': 'Chauffeur assigné',
        }
    if status == 'price_confirmed':
        if paid and not has_driver:
            return {
                'pipeline_index': 3,
                'client_waiting_title': 'Recherche d\'un chauffeur',
                'client_waiting_detail': 'Nous contactons les chauffeurs disponibles à proximité.',
                'client_waiting_kind': 'driver',
                'client_status_label': 'Recherche chauffeur',
            }
        if not paid:
            return {
                'pipeline_index': 2,
                'client_waiting_title': 'Finalisez le paiement',
                'client_waiting_detail': 'Choisissez un mode de paiement pour lancer la recherche de chauffeur.',
                'client_waiting_kind': 'payment',
                'client_status_label': 'Paiement requis',
            }
        return {
            'pipeline_index': 2,
            'client_waiting_title': 'Prix confirmé',
            'client_waiting_detail': 'Prochaine étape : attribution d\'un chauffeur.',
            'client_waiting_kind': 'confirmed',
            'client_status_label': 'Prix confirmé',
        }
    if status == 'price_proposed':
        return {
            'pipeline_index': 1,
            'client_waiting_title': 'Prix proposé',
            'client_waiting_detail': 'Acceptez ou refusez le tarif proposé ci-dessous.',
            'client_waiting_kind': 'price',
            'client_status_label': 'Prix à valider',
        }
    if status == 'pending':
        if not has_coords or not has_price:
            return {
                'pipeline_index': 1,
                'client_waiting_title': 'En attente du prix',
                'client_waiting_detail': (
                    'Votre trajet est localisé sur la carte par un chauffeur ou l\'équipe DAXI. '
                    'Le tarif vous sera envoyé par WhatsApp.'
                ),
                'client_waiting_kind': 'price',
                'client_status_label': 'En attente du prix',
            }
        return {
            'pipeline_index': 1,
            'client_waiting_title': 'Devis en préparation',
            'client_waiting_detail': 'Le prix de votre course est en cours de calcul.',
            'client_waiting_kind': 'price',
            'client_status_label': 'En attente',
        }

    idx = _status_pipeline_index(status)
    label = order.get_status_display() if hasattr(order, 'get_status_display') else status
    return {
        'pipeline_index': idx,
        'client_waiting_title': label,
        'client_waiting_detail': '',
        'client_waiting_kind': 'default',
        'client_status_label': label,
    }


def _driver_order_phase(order):
    """Messages de statut adaptés à la vue chauffeur."""
    status = (order.status or '').strip()
    has_price = bool(order.price and float(order.price) > 0)
    paid = (order.payment_status or '').strip() in ('paid', 'in_person')
    has_driver = bool(order.driver_id)

    if status == 'cancelled':
        return {
            'pipeline_index': -1,
            'client_waiting_title': '',
            'client_waiting_detail': '',
            'client_waiting_kind': 'cancelled',
            'client_status_label': 'Annulée',
        }
    if status == 'completed':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'completed'),
            'client_waiting_title': 'Course terminée',
            'client_waiting_detail': 'Bonne route pour la suite.',
            'client_waiting_kind': 'done',
            'client_status_label': 'Terminée',
        }
    if status == 'waiting_return':
        wait_mins = int(order.round_trip_wait_minutes or 0)
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'waiting_return'),
            'client_waiting_title': 'Pause avant le retour',
            'client_waiting_detail': (
                f'Attente prévue : {wait_mins} min. Restez joignable pour le trajet retour.'
                if wait_mins else 'Le client vous attend pour le retour au point de départ.'
            ),
            'client_waiting_kind': 'active',
            'client_status_label': 'Attente retour',
        }
    if status == 'in_progress':
        if is_round_trip_order(order) and round_trip_phase(order) == 'return':
            return {
                'pipeline_index': _pipeline_index_for_order(order, 'in_progress'),
                'client_waiting_title': 'Retour en cours',
                'client_waiting_detail': 'Ramenez le client au point de départ initial.',
                'client_waiting_kind': 'active',
                'client_status_label': 'Retour en cours',
            }
        if is_round_trip_order(order):
            return {
                'pipeline_index': _pipeline_index_for_order(order, 'in_progress'),
                'client_waiting_title': 'Aller en cours',
                'client_waiting_detail': 'Direction la destination du client.',
                'client_waiting_kind': 'active',
                'client_status_label': 'Aller en cours',
            }
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'in_progress'),
            'client_waiting_title': 'Course en cours',
            'client_waiting_detail': 'Suivez l\'itinéraire vers la destination.',
            'client_waiting_kind': 'active',
            'client_status_label': 'En cours',
        }
    if status == 'arrived':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'arrived'),
            'client_waiting_title': 'Sur place',
            'client_waiting_detail': 'Attendez le client au point de prise en charge.',
            'client_waiting_kind': 'active',
            'client_status_label': 'Sur place',
        }
    if status == 'on_way':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'on_way'),
            'client_waiting_title': 'En route vers le client',
            'client_waiting_detail': 'Dirigez-vous vers le point de départ.',
            'client_waiting_kind': 'active',
            'client_status_label': 'En route',
        }
    if status == 'driver_assigned':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'driver_assigned'),
            'client_waiting_title': 'Course acceptée',
            'client_waiting_detail': 'Préparez la prise en charge du client.',
            'client_waiting_kind': 'driver',
            'client_status_label': 'Assignée',
        }
    if status == 'price_confirmed':
        if paid and not has_driver:
            return {
                'pipeline_index': 3,
                'client_waiting_title': 'Course disponible',
                'client_waiting_detail': 'Acceptez cette course si vous êtes disponible.',
                'client_waiting_kind': 'driver',
                'client_status_label': 'À accepter',
            }
        if not paid:
            return {
                'pipeline_index': 2,
                'client_waiting_title': 'Paiement en attente',
                'client_waiting_detail': 'Le client doit finaliser le paiement avant la prise en charge.',
                'client_waiting_kind': 'payment',
                'client_status_label': 'Paiement requis',
            }
        return {
            'pipeline_index': 2,
            'client_waiting_title': 'Prix confirmé',
            'client_waiting_detail': 'En attente d\'attribution ou d\'acceptation.',
            'client_waiting_kind': 'confirmed',
            'client_status_label': 'Confirmée',
        }
    if status == 'price_proposed':
        return {
            'pipeline_index': 1,
            'client_waiting_title': 'Devis envoyé',
            'client_waiting_detail': 'En attente de la réponse du client.',
            'client_waiting_kind': 'price',
            'client_status_label': 'Devis envoyé',
        }
    if status == 'pending':
        if not has_price:
            return {
                'pipeline_index': 1,
                'client_waiting_title': 'À tarifer',
                'client_waiting_detail': 'Placez les points sur la carte et proposez un prix.',
                'client_waiting_kind': 'price',
                'client_status_label': 'Sans tarif',
            }
        return {
            'pipeline_index': 1,
            'client_waiting_title': 'En traitement',
            'client_waiting_detail': 'La course est en cours de préparation.',
            'client_waiting_kind': 'price',
            'client_status_label': 'En attente',
        }

    base = _client_order_phase(order)
    base['client_status_label'] = order.get_status_display() if hasattr(order, 'get_status_display') else status
    return base


def _admin_order_phase(order):
    """Messages de statut adaptés à la vue admin."""
    status = (order.status or '').strip()
    has_price = bool(order.price and float(order.price) > 0)
    paid = (order.payment_status or '').strip() in ('paid', 'in_person')
    has_driver = bool(order.driver_id)
    driver_name = order.driver.full_name if order.driver else ''

    if status == 'cancelled':
        return {
            'pipeline_index': -1,
            'client_waiting_title': '',
            'client_waiting_detail': '',
            'client_waiting_kind': 'cancelled',
            'client_status_label': 'Annulée',
        }
    if status == 'completed':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'completed'),
            'client_waiting_title': 'Course terminée',
            'client_waiting_detail': 'Course clôturée avec succès.',
            'client_waiting_kind': 'done',
            'client_status_label': 'Terminée',
        }
    if status == 'waiting_return':
        wait_mins = int(order.round_trip_wait_minutes or 0)
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'waiting_return'),
            'client_waiting_title': 'Attente retour (aller-retour)',
            'client_waiting_detail': (
                f'Pause de {wait_mins} min avant le trajet retour.'
                if wait_mins else 'Le chauffeur attend le retour vers le point de départ.'
            ),
            'client_waiting_kind': 'active',
            'client_status_label': 'Attente retour',
        }
    if status == 'in_progress':
        if is_round_trip_order(order) and round_trip_phase(order) == 'return':
            return {
                'pipeline_index': _pipeline_index_for_order(order, 'in_progress'),
                'client_waiting_title': 'Retour en cours',
                'client_waiting_detail': 'Trajet retour vers le point de départ.',
                'client_waiting_kind': 'active',
                'client_status_label': 'Retour en cours',
            }
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'in_progress'),
            'client_waiting_title': 'Course en cours',
            'client_waiting_detail': (
                f'Chauffeur : {driver_name}.' if driver_name else 'Course active.'
            ),
            'client_waiting_kind': 'active',
            'client_status_label': 'En cours',
        }
    if status == 'arrived':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'arrived'),
            'client_waiting_title': 'Chauffeur sur place',
            'client_waiting_detail': 'Le chauffeur attend le client au point de départ.',
            'client_waiting_kind': 'active',
            'client_status_label': 'Sur place',
        }
    if status == 'on_way':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'on_way'),
            'client_waiting_title': 'Chauffeur en route',
            'client_waiting_detail': (
                f'{driver_name} se dirige vers le client.' if driver_name
                else 'Un chauffeur se dirige vers le client.'
            ),
            'client_waiting_kind': 'active',
            'client_status_label': 'En route',
        }
    if status == 'driver_assigned':
        return {
            'pipeline_index': _pipeline_index_for_order(order, 'driver_assigned'),
            'client_waiting_title': 'Chauffeur assigné',
            'client_waiting_detail': (
                f'Assigné à {driver_name}.' if driver_name
                else 'Un chauffeur a accepté la course.'
            ),
            'client_waiting_kind': 'driver',
            'client_status_label': 'Assignée',
        }
    if status == 'price_confirmed':
        if paid and not has_driver:
            return {
                'pipeline_index': 3,
                'client_waiting_title': 'Recherche chauffeur',
                'client_waiting_detail': 'Aucun chauffeur n\'a encore accepté cette course.',
                'client_waiting_kind': 'driver',
                'client_status_label': 'Recherche chauffeur',
            }
        if not paid:
            return {
                'pipeline_index': 2,
                'client_waiting_title': 'Paiement en attente',
                'client_waiting_detail': 'Le client n\'a pas encore finalisé le paiement.',
                'client_waiting_kind': 'payment',
                'client_status_label': 'Paiement requis',
            }
        return {
            'pipeline_index': 2,
            'client_waiting_title': 'Prix confirmé',
            'client_waiting_detail': 'Attribuez un chauffeur ou attendez une acceptation.',
            'client_waiting_kind': 'confirmed',
            'client_status_label': 'Confirmée',
        }
    if status == 'price_proposed':
        return {
            'pipeline_index': 1,
            'client_waiting_title': 'Devis envoyé',
            'client_waiting_detail': 'En attente de validation par le client.',
            'client_waiting_kind': 'price',
            'client_status_label': 'Devis envoyé',
        }
    if status == 'pending':
        if not has_price:
            return {
                'pipeline_index': 1,
                'client_waiting_title': 'Sans tarif',
                'client_waiting_detail': 'Localisez le trajet et proposez un prix au client.',
                'client_waiting_kind': 'price',
                'client_status_label': 'À tarifer',
            }
        return {
            'pipeline_index': 1,
            'client_waiting_title': 'En traitement',
            'client_waiting_detail': 'Course en cours de préparation.',
            'client_waiting_kind': 'price',
            'client_status_label': 'En attente',
        }

    base = _client_order_phase(order)
    base['client_status_label'] = order.get_status_display() if hasattr(order, 'get_status_display') else status
    return base


def _order_phase_for_audience(order, *, for_driver=False, for_admin=False, request=None):
    if for_driver:
        return _driver_order_phase(order)
    if for_admin:
        return _admin_order_phase(order)
    if request is not None:
        path = getattr(request, 'path', '') or ''
        if '/htmx/admin/' in path:
            return _admin_order_phase(order)
        if '/htmx/driver/' in path:
            return _driver_order_phase(order)
    return _client_order_phase(order)


SERVICE_PLAN_LABELS = {
    'demi-journee': 'Demi-journée',
    'demi_journee': 'Demi-journée',
    'journee-complete': 'Journée complète',
    'journee_complete': 'Journée complète',
    'journee': 'Journée complète',
    'elegance-night': 'Élégance Night',
    'elegance_night': 'Élégance Night',
    'ville-a-ville': 'Course ville à ville',
    'ville_a_ville': 'Course ville à ville',
    'accueil-aeroport-cap': 'Accueil aéroport Cap-Haïtien',
    'accueil_aeroport_cap': 'Accueil aéroport Cap-Haïtien',
    'business-vip': 'Business / VIP',
    'business_vip': 'Business / VIP',
}

SERVICE_PLAN_HINTS = {
    'demi-journee': 'Forfait ~4 h · départ flexible',
    'demi_journee': 'Forfait ~4 h · départ flexible',
    'journee-complete': 'Forfait journée · multi-arrêts',
    'journee_complete': 'Forfait journée · multi-arrêts',
    'journee': 'Forfait journée · multi-arrêts',
    'elegance-night': 'Soirée · mise à disposition',
    'elegance_night': 'Soirée · mise à disposition',
    'ville-a-ville': 'Trajet inter-villes · devis personnalisé',
    'ville_a_ville': 'Trajet inter-villes · devis personnalisé',
    'accueil-aeroport-cap': 'Aéroport CAP · panneau nominatif',
    'accueil_aeroport_cap': 'Aéroport CAP · panneau nominatif',
    'business-vip': 'Abonnement premium · sur mesure',
    'business_vip': 'Abonnement premium · sur mesure',
}


def _service_plan_key(raw: str) -> str:
    return (raw or '').strip().lower().replace('_', '-')


def _service_plan_display(raw: str) -> str:
    key = _service_plan_key(raw)
    if not key:
        return ''
    return SERVICE_PLAN_LABELS.get(key, SERVICE_PLAN_LABELS.get(key.replace('-', '_'), raw))


PLAN_STOPS_JSON_TAG = '[PLAN_STOPS_JSON]'


def _embed_plan_stops_in_notes(notes: str, plan_waypoints: str) -> str:
    """Persist plan stop labels + coordinates for maps and order cards."""
    if not plan_waypoints:
        return notes
    try:
        stops = json.loads(plan_waypoints)
        if not isinstance(stops, list) or not stops:
            return notes
        labels = [s.get('label', 'Étape') for s in stops if isinstance(s, dict) and s.get('label')]
        if labels:
            notes = (notes + '\n\n' if notes else '') + '[ITINÉRAIRE] ' + ' → '.join(labels)
        valid = []
        for s in stops:
            if not isinstance(s, dict):
                continue
            try:
                lat, lng = float(s.get('lat')), float(s.get('lng'))
            except (TypeError, ValueError):
                continue
            valid.append({'label': (s.get('label') or 'Étape').strip(), 'lat': lat, 'lng': lng})
        if valid:
            payload = json.dumps({'stops': valid}, ensure_ascii=False)
            notes = (notes + '\n\n' if notes else '') + PLAN_STOPS_JSON_TAG + payload
    except Exception:
        pass
    return notes


def _parse_plan_itinerary(o: Order) -> str:
    notes = (o.notes or '').strip()
    if '[ITINÉRAIRE]' in notes:
        return notes.split('[ITINÉRAIRE]', 1)[1].strip().split('\n')[0].strip()
    if o.description and o.description.strip().startswith('[ITINÉRAIRE]'):
        return o.description.strip().split('[ITINÉRAIRE]', 1)[1].strip().split('\n')[0].strip()
    return ''


def _gps_coords_valid(lat, lng) -> bool:
    """Coordonnées GPS utilisables (carte, itinéraire, tarif)."""
    try:
        lat, lng = float(lat), float(lng)
    except (TypeError, ValueError):
        return False
    if not (-90.0 <= lat <= 90.0 and -180.0 <= lng <= 180.0):
        return False
    if abs(lat) < 1e-4 and abs(lng) < 1e-4:
        return False
    return True


def _parse_plan_stops(o: Order) -> list:
    for field in (o.notes or '', o.description or ''):
        if PLAN_STOPS_JSON_TAG not in field:
            continue
        try:
            chunk = field.split(PLAN_STOPS_JSON_TAG, 1)[1].strip().split('\n')[0].strip()
            data = json.loads(chunk)
            stops = data.get('stops') if isinstance(data, dict) else data
            if isinstance(stops, list):
                out = []
                for s in stops:
                    if not isinstance(s, dict):
                        continue
                    label = (s.get('label') or 'Étape').strip()
                    lat, lng = None, None
                    try:
                        lat, lng = float(s.get('lat')), float(s.get('lng'))
                        if not _gps_coords_valid(lat, lng):
                            lat, lng = None, None
                    except (TypeError, ValueError):
                        pass
                    out.append({'label': label, 'lat': lat, 'lng': lng})
                if out:
                    return out
        except Exception:
            pass
    itin = _parse_plan_itinerary(o)
    if itin:
        return [{'label': p.strip(), 'lat': None, 'lng': None} for p in itin.split('→') if p.strip()]
    return []


def _order_effective_pickup_coords(order) -> tuple:
    """GPS départ effectif : pickup enregistré, meeting, ou position client au moment de la commande."""
    if _gps_coords_valid(order.pickup_lat, order.pickup_lng):
        return float(order.pickup_lat), float(order.pickup_lng)
    if _gps_coords_valid(order.meeting_lat, order.meeting_lng):
        return float(order.meeting_lat), float(order.meeting_lng)
    if _gps_coords_valid(order.client_gps_lat, order.client_gps_lng):
        return float(order.client_gps_lat), float(order.client_gps_lng)
    from julmin_taxis.meeting_point_utils import order_meeting_coords
    mlat, mlng = order_meeting_coords(order)
    if _gps_coords_valid(mlat, mlng):
        return float(mlat), float(mlng)
    return None, None


def _order_has_all_coords(order) -> bool:
    """Tous les points requis (départ + chaque destination) ont des GPS valides."""
    plat, plng = _order_effective_pickup_coords(order)
    if not _gps_coords_valid(plat, plng):
        return False
    plan_stops = _parse_plan_stops(order)
    if plan_stops:
        return all(_gps_coords_valid(s.get('lat'), s.get('lng')) for s in plan_stops)
    return _gps_coords_valid(order.destination_lat, order.destination_lng)


def _order_coords_placement_slots(order) -> list:
    """Points à placer sur la carte — départ + chaque destination sans GPS."""
    slots = []
    eff_plat, eff_plng = _order_effective_pickup_coords(order)
    if not _gps_coords_valid(eff_plat, eff_plng):
        slots.append({
            'id': 'pickup',
            'kind': 'pickup',
            'label': clean_address_display(order.pickup) or 'Départ',
            'button_label': 'Départ',
            'marker_label': 'A',
        })
    plan_stops = _parse_plan_stops(order)
    if plan_stops:
        for i, stop in enumerate(plan_stops):
            if _gps_coords_valid(stop.get('lat'), stop.get('lng')):
                continue
            is_last = i == len(plan_stops) - 1
            n = i + 1
            slots.append({
                'id': f'stop-{i}',
                'kind': 'stop',
                'index': i,
                'label': stop.get('label') or (f'Destination {n}' if not is_last else 'Arrivée'),
                'button_label': 'Arrivée' if is_last else f'Dest. {n}',
                'marker_label': 'B' if is_last else str(n),
                'is_last': is_last,
            })
    elif not _gps_coords_valid(order.destination_lat, order.destination_lng):
        slots.append({
            'id': 'dest',
            'kind': 'dest',
            'label': clean_address_display(order.destination) or 'Destination',
            'button_label': 'Arrivée',
            'marker_label': 'B',
        })
    return slots


def _merge_plan_stops_list(order, incoming: list) -> list:
    """Fusionne arrêts existants + nouveaux placements partiels."""
    existing = _parse_plan_stops(order)
    if not existing and incoming:
        existing = [
            {'label': (s.get('label') or 'Étape').strip(), 'lat': None, 'lng': None}
            for s in incoming if isinstance(s, dict)
        ]
    count = max(len(existing), len(incoming or []))
    merged = []
    for i in range(count):
        ex = existing[i] if i < len(existing) else {'label': f'Étape {i + 1}', 'lat': None, 'lng': None}
        inc = incoming[i] if incoming and i < len(incoming) and isinstance(incoming[i], dict) else {}
        label = (inc.get('label') or ex.get('label') or f'Étape {i + 1}').strip()
        lat, lng = ex.get('lat'), ex.get('lng')
        if _gps_coords_valid(inc.get('lat'), inc.get('lng')):
            lat, lng = float(inc['lat']), float(inc['lng'])
        elif _gps_coords_valid(ex.get('lat'), ex.get('lng')):
            lat, lng = float(ex['lat']), float(ex['lng'])
        else:
            lat, lng = None, None
        merged.append({'label': label, 'lat': lat, 'lng': lng})
    return merged


def _persist_plan_stops_on_order(order, stops_list, update_fields: list) -> None:
    """Enregistre les arrêts forfait (labels + GPS) dans les notes de la commande."""
    merged = _merge_plan_stops_list(order, stops_list or [])
    valid = [s for s in merged if _gps_coords_valid(s.get('lat'), s.get('lng'))]
    if not valid:
        return

    payload = json.dumps({'stops': valid}, ensure_ascii=False)
    notes = order.notes or ''
    if PLAN_STOPS_JSON_TAG in notes:
        head, rest = notes.split(PLAN_STOPS_JSON_TAG, 1)
        tail = rest.split('\n', 1)
        notes = head.rstrip() + PLAN_STOPS_JSON_TAG + payload + (
            ('\n' + tail[1]) if len(tail) > 1 else ''
        )
    else:
        notes = (notes + '\n\n' if notes else '') + PLAN_STOPS_JSON_TAG + payload
    order.notes = notes
    update_fields.append('notes')

    last = valid[-1]
    order.destination_lat = last['lat']
    order.destination_lng = last['lng']
    if last.get('label'):
        order.destination = last['label'][:500]
    order.dest_coords_set_by_driver = True
    update_fields.extend([
        'destination_lat', 'destination_lng', 'destination', 'dest_coords_set_by_driver',
    ])


def _parse_plan_airport_meta(notes: str) -> tuple:
    sign, landing = '', ''
    for line in (notes or '').split('\n'):
        line = line.strip()
        if line.lower().startswith('panneau :'):
            sign = line.split(':', 1)[1].strip()
        elif line.lower().startswith('atterrissage prévu :'):
            landing = line.split(':', 1)[1].strip()
    return sign, landing


def _parse_plan_occasion(notes: str) -> str:
    for line in (notes or '').split('\n'):
        if line.strip().startswith('[ÉVÉNEMENT]'):
            return line.split(']', 1)[-1].strip()
    return ''


def _order_total_price_float(o: Order):
    """Prix total affichable (base + pause + extension), jamais 0 si un composant existe."""
    try:
        total = float(o.total_price)
    except (TypeError, ValueError):
        total = 0.0
    if total > 0:
        return round(total, 2)
    return None


def _order_to_dict(o: Order, *, light: bool = False, for_driver: bool = False, for_admin: bool = False, request=None) -> dict:
    """Convert Order to dict used in templates.

    light=True : pas d'appel OSRM (listes admin/chauffeur) — haversine uniquement.
    """
    now = timezone.now()
    driver = o.driver
    pickup_lat = o.pickup_lat
    pickup_lng = o.pickup_lng
    dest_lat = o.destination_lat
    dest_lng = o.destination_lng
    eff_pickup_lat, eff_pickup_lng = _order_effective_pickup_coords(o)
    if not _gps_coords_valid(pickup_lat, pickup_lng) and _gps_coords_valid(eff_pickup_lat, eff_pickup_lng):
        pickup_lat = eff_pickup_lat
        pickup_lng = eff_pickup_lng

                                              
    scheduled_dt = None
    if o.date and o.time:
        try:
            import pytz
            ht = pytz.timezone('America/Port-au-Prince')
            naive = datetime.combine(o.date, o.time)
            scheduled_dt = ht.localize(naive)
        except Exception:
            scheduled_dt = timezone.make_aware(
                datetime.combine(o.date, o.time),
                timezone.get_current_timezone(),
            ) if timezone.is_naive(datetime.combine(o.date, o.time)) else datetime.combine(o.date, o.time)

    sched_for_diff = o.scheduled_at or scheduled_dt
    if sched_for_diff and timezone.is_naive(sched_for_diff):
        sched_for_diff = timezone.make_aware(sched_for_diff, timezone.get_current_timezone())

    from julmin_taxis.meeting_point_utils import order_meeting_coords
    rdv_lat, rdv_lng = order_meeting_coords(o)

                                                                      
    unlock_dt = None
    contact_unlocked = True
    if scheduled_dt:
        unlock_dt = scheduled_dt - timedelta(hours=1)
        try:
            contact_unlocked = now >= unlock_dt
        except Exception:
            contact_unlocked = True
    if for_driver and o.driver_id:
        contact_unlocked = True

    client_phone_raw = (o.client_phone or '').strip()
    if not client_phone_raw and getattr(o, 'user_id', None) and o.user:
        client_phone_raw = (getattr(o.user, 'phone', '') or '').strip()

                     
    is_later = o.is_later
    time_until_scheduled = None
    is_later_active = False
    if is_later and sched_for_diff:
        diff = (sched_for_diff - now).total_seconds()
        time_until_scheduled = int(diff)
        is_later_active = diff <= 3600

    phase = _order_phase_for_audience(o, for_driver=for_driver, for_admin=for_admin, request=request)

    return {
        'id': o.pk,
        'code': getattr(o, 'public_code', None) or getattr(o, 'ref_code', None) or f'DX-{o.pk}',
        'public_code': getattr(o, 'public_code', None) or '',
        'ref_tail': client_order_ref_tail(o),
        'firebase_uid': o.firebase_uid or str(o.pk),
        'status': o.status,
        'status_pipeline_index': phase['pipeline_index'],
        'client_waiting_title': phase['client_waiting_title'],
        'client_waiting_detail': phase['client_waiting_detail'],
        'client_waiting_kind': phase['client_waiting_kind'],
        'client_status_label': phase['client_status_label'],
        'status_display': _enterprise_status_label(o) if getattr(o, 'enterprise_id', None) else o.get_status_display(),
        'ent_checkout_phase': _enterprise_checkout_phase(o),
        'ent_client_pay_url': _enterprise_client_pay_url(o),
        'client_name': o.client_name or 'Client',
        'client_email': o.client_email,
        'client_phone': _sanitize_phone(client_phone_raw) if contact_unlocked else '',
        'client_phone_display': (
            _sanitize_phone(client_phone_raw) if contact_unlocked
            else ('🔒 Débloqué à ' + unlock_dt.strftime('%H:%M') if unlock_dt else 'Numéro masqué')
        ),
        'contact_unlocked': contact_unlocked,
        'unlock_time': unlock_dt.strftime('%H:%M') if unlock_dt and not contact_unlocked else None,
        'pickup': o.pickup,
        'destination': o.destination,
        'pickup_display': clean_address_display(o.pickup),
        'destination_display': clean_address_display(o.destination),
        'pickup_lat': pickup_lat,
        'pickup_lng': pickup_lng,
        'destination_lat': dest_lat,
        'destination_lng': dest_lng,
        'has_coords': _order_has_all_coords(o),
        'coords_slots': _order_coords_placement_slots(o),
        'coords_slots_json': json.dumps(_order_coords_placement_slots(o), ensure_ascii=False),
        'rdv_lat': rdv_lat,
        'rdv_lng': rdv_lng,
        'has_map_coords': (
            (rdv_lat is not None and rdv_lng is not None)
            or (pickup_lat is not None and pickup_lng is not None)
            or (dest_lat is not None and dest_lng is not None)
            or (o.client_gps_lat is not None and o.client_gps_lng is not None)
        ),
        'pickup_coords_set_by_driver': o.pickup_coords_set_by_driver,
        'dest_coords_set_by_driver': o.dest_coords_set_by_driver,
        'coords_placed_by_id': getattr(o, 'coords_placed_by_id', None),
        'coords_placed_by_name': (
            o.coords_placed_by.get_full_name()
            if getattr(o, 'coords_placed_by_id', None) and o.coords_placed_by else ''
        ),
        'client_gps_lat': o.client_gps_lat,
        'client_gps_lng': o.client_gps_lng,
        'client_gps_accuracy': (
            round(float(o.client_gps_accuracy))
            if for_driver and getattr(o, 'driver_id', None) and o.client_gps_accuracy
            else None
        ),
        'meeting_lat': o.meeting_lat if o.meeting_lat is not None else pickup_lat,
        'meeting_lng': o.meeting_lng if o.meeting_lng is not None else pickup_lng,
        'date': o.date,
        'time': str(o.time) if o.time else None,
        'date_display': o.date.strftime('%d/%m/%Y') if o.date else None,
        'scheduled_at': o.scheduled_at.isoformat() if o.scheduled_at else None,
        'is_later': is_later,
        'is_later_active': is_later_active,
        'time_until_scheduled': time_until_scheduled,
        'price': float(o.price) if o.price else None,
        'price_confirmed': o.price_confirmed,
        'notes': o.notes,
        'description': o.description,
        'is_paused': o.is_paused,
        'is_extended': getattr(o, 'is_extended', False),
        'pause_price': float(o.pause_price) if getattr(o, 'pause_price', None) else 0,
        'pause_rate_snapshot': float(o.pause_rate_snapshot) if getattr(o, 'pause_rate_snapshot', None) else 0,
        'pause_accumulated_seconds': int(o.pause_accumulated_seconds or 0),
        'extra_km_price': float(o.extra_km_price) if getattr(o, 'extra_km_price', None) else 0,
        **driver_public_dict(driver, o, request),
        'driver_lat': driver.latitude if driver else None,
        'driver_lng': driver.longitude if driver else None,
        'created_at': o.created_at,
        'created_display': _fmt_haiti(o.created_at),
        'scheduled_dt': scheduled_dt,
        'passengers': o.passengers,
        'firebase_table': o.firebase_table or 'commande',
        'guest_id': o.guest_id,
        'distance_km': (
            round(_haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng), 1)
            if light and pickup_lat and pickup_lng and dest_lat and dest_lng
            else _trip_distance_km(pickup_lat, pickup_lng, dest_lat, dest_lng)
        ),
        'duration_min': (
            _light_trip_duration_min(
                pickup_lat, pickup_lng, dest_lat, dest_lng,
                o.trip_type, int(o.round_trip_wait_minutes or 0),
            )
            if light and pickup_lat and pickup_lng and dest_lat and dest_lng
            else (
                _trip_duration_min(
                    pickup_lat, pickup_lng, dest_lat, dest_lng,
                    o.trip_type, int(o.round_trip_wait_minutes or 0),
                )
                if pickup_lat and pickup_lng and dest_lat and dest_lng else None
            )
        ),
        'enterprise_name': o.enterprise.name if getattr(o, 'enterprise_id', None) and o.enterprise else '',
        'enterprise_commission_pct': float(o.enterprise_commission_pct) if o.enterprise_commission_pct else None,
        'duration_actual': o.duration_minutes,
        'driver_distance_km': None,                                                     
        'eta_min': None,
        'service_plan': o.service_plan,
        'service_plan_key': _service_plan_key(o.service_plan or ''),
        'plan_pipeline_variant': plan_pipeline_variant(o.service_plan or ''),
        'is_service_plan': _service_plan_key(o.service_plan or '') in _FIXED_SERVICE_PLAN_KEYS,
        'is_plan_order': bool((o.service_plan or '').strip()),
        'service_plan_display': _service_plan_display(o.service_plan),
        'service_plan_hint': SERVICE_PLAN_HINTS.get(
            _service_plan_key(o.service_plan),
            'Forfait DAXI' if (o.service_plan or '').strip() else '',
        ),
        'plan_itinerary': _parse_plan_itinerary(o),
        'plan_stops': _parse_plan_stops(o),
        'plan_stops_json': json.dumps(_parse_plan_stops(o), ensure_ascii=False),
        'plan_sign_name': _parse_plan_airport_meta(o.notes or '')[0],
        'plan_landing_at': _parse_plan_airport_meta(o.notes or '')[1],
        'plan_occasion': _parse_plan_occasion(o.notes or ''),
        'is_scheduled': bool(o.date),
        'is_soon': bool(sched_for_diff and (sched_for_diff - now).total_seconds() < 3600),
        'hours_until': round(max(0, (sched_for_diff - now).total_seconds()) / 3600, 1) if sched_for_diff else None,
        'trip_type': o.trip_type,
        'is_round_trip': is_round_trip_order(o),
        'round_trip_phase': round_trip_phase(o),
        'round_trip_wait_minutes': int(o.round_trip_wait_minutes or 0),
        'round_trip_wait_remaining_seconds': round_trip_wait_remaining_seconds(o),
        'round_trip_allow_driver_other_rides': bool(o.round_trip_allow_driver_other_rides),
        'round_trip_pickup_requested': round_trip_pickup_request_pending(o),
        'round_trip_pickup_requested_at': (
            o.round_trip_pickup_requested_at.isoformat()
            if getattr(o, 'round_trip_pickup_requested_at', None) else None
        ),
        'total_price': _order_total_price_float(o),
        'vehicle_type': o.vehicle_type,
        'payment_method': o.payment_method or '',
        'payment_status': o.payment_status or 'pending',
        'payment_confirmed': _order_payment_confirmed(o),
        'ready_for_accept': _order_ready_for_driver_accept(o),
        'client_can_cancel': _client_can_cancel_order(o),
        'client_can_rate': _client_can_rate_order(o, request),
        'sos_triggered': bool(getattr(o, 'sos_triggered_at', None)),
        'sos_triggered_by': getattr(o, 'sos_triggered_by', '') or '',
    }


def admin_orders(request):
    """GET /htmx/admin/orders/?status=pending — return order cards HTML."""
    gate = _admin_gate(request)
    if gate: return gate

    status_map = {
        'pending': ['pending', 'price_proposed', 'price_confirmed'],
        'ongoing': ['driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return'],
        'today': None,
        'completed': ['completed'],
        'cancelled': ['cancelled'],
    }
    tab = request.GET.get('status', 'all')

    qs = Order.objects.select_related('driver', 'user', 'enterprise', 'coords_placed_by').order_by('-created_at')

    if tab == 'all':
        qs = qs.exclude(status__in=['completed', 'cancelled'])[:100]
    elif tab == 'today':
        today = timezone.now().date()
        qs = qs.filter(
            Q(created_at__date=today) | Q(date=today)
        ).exclude(status__in=['completed', 'cancelled'])
    elif tab == 'price_proposed':
        qs = qs.filter(Q(status='price_proposed') | Q(status='pending', price__gt=0))
    elif tab in ('pending', 'price_confirmed', 'driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return', 'completed', 'cancelled'):
        qs = qs.filter(status=tab)
    elif tab in status_map and status_map[tab]:
        qs = qs.filter(status__in=status_map[tab])
    else:
        qs = qs[:50]

    orders = [_order_to_dict(o, light=True, for_admin=True, request=request) for o in qs[:50]]

                      
    pending_count = Order.objects.filter(status__in=['pending', 'price_proposed', 'price_confirmed']).count()
    ongoing_count = Order.objects.filter(status__in=['driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return']).count()
    today_count = Order.objects.filter(
        Q(created_at__date=timezone.now().date()) | Q(date=timezone.now().date())
    ).exclude(status__in=['completed', 'cancelled']).count()

    return render(request, 'htmx/admin_orders.html', {
        'orders': orders,
        'tab': tab,
        'pending_count': pending_count,
        'ongoing_count': ongoing_count,
        'today_count': today_count,
        'google_maps_key': getattr(settings, 'GOOGLE_MAPS_API_KEY', ''),
    })


def admin_propose_price(request, order_id):
    """POST: admin proposes a price for an order."""
    gate = _admin_gate(request)
    if gate: return gate
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    try:
        order = Order.objects.get(pk=order_id)
    except Order.DoesNotExist:
                          
        order = Order.objects.filter(firebase_uid=str(order_id)).first()
        if not order:
            return _htmx_error('Commande introuvable')

    price_str = request.POST.get('price', '').strip()
    use_calculated = request.POST.get('use_calculated', '').lower() in ('1', 'true', 'yes', 'on')

    if use_calculated or not price_str:
        from pricing.services import apply_price_to_order
        result = apply_price_to_order(order, propose=True, actor_request=request)
        if not result or result.price is None:
            return _htmx_error('Impossible de calculer le prix pour cette course.')
        order.refresh_from_db()
        price = float(order.price)
    else:
        try:
            price = float(price_str)
            if price <= 0:
                raise ValueError
        except ValueError:
            return _htmx_error('Prix invalide. Entrez un nombre positif.')
        old_price = order.price
        order.price = price
        order.status = 'price_proposed'
        order.price_proposed_at = timezone.now()
        order.save(update_fields=['price', 'status', 'price_proposed_at'])
        try:
            from julmin_taxis.security_audit import log_price_change
            log_price_change(order, old_price, price, request=request, source='admin_manual')
        except Exception:
            pass

                          
    _notify_ws(f'order_{order.pk}', 'price_proposed', {
        'price': price,
        'total_price': _order_total_price_float(order),
        'order_id': order.pk,
        'status': 'price_proposed',
    })
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'price_proposed'})

    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, 'price_proposed')
    except Exception:
        pass

    return _htmx_success(f'Prix de ${price:.2f} proposé au client')


def admin_assign_driver(request, order_id):
    """POST: admin assigns a driver to an order."""
    gate = _admin_gate(request)
    if gate: return gate
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    try:
        order = Order.objects.get(pk=order_id)
    except Order.DoesNotExist:
        order = Order.objects.filter(firebase_uid=str(order_id)).first()
        if not order:
            return _htmx_error('Commande introuvable')

    driver_id = request.POST.get('driver_id', '').strip()
    try:
        driver = Driver.objects.get(pk=int(driver_id))
    except (Driver.DoesNotExist, ValueError):
        return _htmx_error('Chauffeur introuvable')

    order.driver = driver
    drv_info = driver_public_dict(driver, order, request)
    order.driver_name = drv_info['driver_name'] or driver.get_full_name()
    order.driver_phone = drv_info['driver_phone'] or driver.phone
    order.driver_photo_url = drv_info['driver_photo'] or ''
    order.status = 'driver_assigned'
    order.driver_assigned_at = timezone.now()
    order.save()

    from julmin_taxis.driver_presence import sync_driver_status_from_orders
    sync_driver_status_from_orders(driver)

    drv_payload = driver_public_dict(driver, order, request)
    drv_payload['order_id'] = order.pk
    _notify_ws(f'order_{order.pk}', 'driver_assigned', drv_payload)

    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, 'driver_assigned')
    except Exception:
        pass

    return _htmx_success(f'Chauffeur {driver.get_full_name()} assigné')


DRIVER_MOVED_CANCEL_STATUSES = frozenset({'driver_assigned', 'on_way', 'arrived', 'in_progress'})


def _parse_admin_cancel_post(request):
    send_client = request.POST.get('send_client', '1').strip().lower() not in ('0', 'false', 'off', 'no')
    send_driver = request.POST.get('send_driver', '1').strip().lower() not in ('0', 'false', 'off', 'no')
    message_client = (request.POST.get('message_client') or '').strip()
    message_driver = (request.POST.get('message_driver') or '').strip()
    return send_client, send_driver, message_client, message_driver


def _admin_cancel_order(order, prev_status, request=None):
    """Annulation par l'admin : aucun frais client, messages optionnels."""
    order.status = 'cancelled'
    order.cancelled_at = timezone.now()
    order.save(update_fields=['status', 'cancelled_at'])

    send_client, send_driver, message_client, message_driver = (True, True, '', '')
    if request is not None:
        send_client, send_driver, message_client, message_driver = _parse_admin_cancel_post(request)
        if not send_driver or not order.driver_id:
            send_driver = False

    payload = {'order_id': order.pk, 'status': 'cancelled', 'by': 'admin'}
    _notify_ws(f'order_{order.pk}', 'order_cancelled', payload)
    _notify_ws('admin', 'order_cancelled', payload)
    if order.driver_id:
        _notify_ws(f'driver_{order.driver_id}', 'order_cancelled', payload)

    try:
        from julmin_taxis.notify import notify_admin_cancelled_order
        notify_admin_cancelled_order(
            order,
            prev_status,
            message_client=message_client,
            message_driver=message_driver,
            notify_client=send_client,
            notify_driver=send_driver,
        )
    except Exception:
        pass


def admin_refuse_order(request, order_id):
    """POST: admin cancels/refuses an order."""
    gate = _admin_gate(request)
    if gate: return gate
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    try:
        order = Order.objects.get(pk=order_id)
    except Order.DoesNotExist:
        order = Order.objects.filter(firebase_uid=str(order_id)).first()
        if not order:
            return _htmx_error('Commande introuvable')

    prev_status = order.status
    _admin_cancel_order(order, prev_status, request)
    response = HttpResponse('', content_type='text/html')
    response['HX-Reswap'] = 'delete'
    return response


def admin_update_order_status(request, order_id):
    """POST: admin updates order status (on_way, arrived, in_progress, completed, etc.)."""
    gate = _admin_gate(request)
    if gate: return gate

    admin_allowed = ['cancelled', 'driver_assigned', 'price_proposed', 'price_confirmed']
    driver_only = ['on_way', 'arrived', 'in_progress', 'completed']
    new_status = request.POST.get('status', '').strip()
    if new_status in driver_only:
        return _htmx_error('Seul le chauffeur peut mettre à jour ce statut.')
    if new_status not in admin_allowed:
        return _htmx_error('Statut invalide')

    try:
        order = Order.objects.get(pk=order_id)
    except Order.DoesNotExist:
        order = Order.objects.filter(firebase_uid=str(order_id)).first()
        if not order:
            return _htmx_error('Commande introuvable')

    prev_status = order.status
    if new_status == 'cancelled':
        _admin_cancel_order(order, prev_status, request)
        return _htmx_success(f'Statut mis à jour: {order.get_status_display()}')
    order.update_status(new_status)
    _notify_ws(f'order_{order.pk}', 'status_updated', {'status': new_status, 'order_id': order.pk})
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': new_status})

    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, new_status)
    except Exception:
        pass

    return _htmx_success(f'Statut mis à jour: {order.get_status_display()}')


def admin_delete_order(request, order_id):
    """DELETE: admin deletes an order."""
    gate = _admin_gate(request)
    if gate: return gate

    try:
        order = Order.objects.get(pk=order_id)
        oid = order.pk
        uid = order.user_id
        gid = (order.guest_id or '').strip()
        drv_id = order.driver_id
        payload = {
            'order_id': oid,
            'status': 'cancelled',
            'reason': 'deleted_by_admin',
        }
        if uid:
            payload['user_id'] = uid
        _notify_ws(f'order_{oid}', 'order_deleted', payload)
        _notify_ws('admin', 'order_deleted', payload)
        if drv_id:
            _notify_ws(f'driver_{drv_id}', 'order_deleted', payload)
        order.delete()
    except Order.DoesNotExist:
        pass
    return HttpResponse('', status=200)


                                                                                 
                                 
                                                                                 

def admin_users_list(request):
    """GET /htmx/admin/users/ — return users list HTML."""
    gate = _admin_gate(request)
    if gate: return gate

    search = request.GET.get('q', '').strip()
    qs = CustomUser.objects.filter(is_superuser=False).order_by('-date_inscription')
    if search:
        qs = qs.filter(
            Q(first_name__icontains=search) |
            Q(last_name__icontains=search) |
            Q(email__icontains=search) |
            Q(phone__icontains=search) |
            Q(firebase_user_id__icontains=search)
        )

    users = [{
        'id': u.pk,
        'firebase_user_id': u.firebase_user_id,
        'name': u.get_full_name() or u.username or u.email,
        'email': u.email,
        'phone': u.phone,
        'city': u.city,
        'is_blocked': u.is_blocked,
        'is_verified': u.is_verified,
        'date_inscription': u.date_inscription,
        'completed_trips': u.completed_trips,
    } for u in qs[:100]]

    return render(request, 'htmx/admin_users.html', {'users': users, 'search': search})


def admin_block_user(request, user_id):
    """
    POST /htmx/admin/users/<id>/block/
    Block or unblock a user by Django PK or Firebase userId.
    The current JS used Firebase path 'users/${userId}' which didn't sync to Django.
    This view DIRECTLY updates the Django DB — reliable and permanent.
    """
    gate = _admin_gate(request)
    if gate: return gate

                                                     
    user = None
    try:
        user = CustomUser.objects.get(pk=int(user_id))
    except (CustomUser.DoesNotExist, ValueError):
        user = CustomUser.objects.filter(
            Q(firebase_user_id=str(user_id)) | Q(firebase_uid=str(user_id))
        ).first()

    if not user:
        return _htmx_error('Utilisateur introuvable')

    action = request.POST.get('action', 'block')
    user.is_blocked = (action == 'block')
    user.save(update_fields=['is_blocked'])
    label = 'bloqué' if user.is_blocked else 'débloqué'
    return _htmx_success(f'Utilisateur {user.get_full_name() or user.email} {label}')


def admin_block_user_by_firebase_id(request):
    """
    POST /htmx/admin/users/block-by-firebase/
    Block a user by their Firebase userId (4-digit code).
    Used by adm.html which stores userId not Django PK.
    """
    gate = _admin_gate(request)
    if gate: return gate

    firebase_user_id = request.POST.get('userId', '').strip()
    action = request.POST.get('action', 'block')

    if not firebase_user_id:
        return _htmx_error('userId manquant')

                                              
    user = CustomUser.objects.filter(
        Q(firebase_user_id=firebase_user_id) | Q(firebase_uid=firebase_user_id)
    ).first()

    if not user:
                                                 
        phone = request.POST.get('phone', '').strip()
        email = request.POST.get('email', '').strip()
        if phone:
            user = CustomUser.objects.filter(phone=phone).first()
        if not user and email:
            user = CustomUser.objects.filter(email=email).first()

    if not user:
                                                                            
        blocked_ids = request.session.get('blocked_firebase_ids', [])
        unblocked_ids = request.session.get('unblocked_firebase_ids', [])
        if action == 'block':
            if firebase_user_id not in blocked_ids:
                blocked_ids.append(firebase_user_id)
            if firebase_user_id in unblocked_ids:
                unblocked_ids.remove(firebase_user_id)
        else:
            if firebase_user_id in blocked_ids:
                blocked_ids.remove(firebase_user_id)
            unblocked_ids.append(firebase_user_id)
        request.session['blocked_firebase_ids'] = blocked_ids
        request.session['unblocked_firebase_ids'] = unblocked_ids
        label = 'bloqué' if action == 'block' else 'débloqué'
        return _htmx_success(f'Utilisateur Firebase {firebase_user_id} {label} (compte non encore inscrit en DB)')

    user.is_blocked = (action == 'block')
    user.save(update_fields=['is_blocked'])
    label = 'bloqué' if user.is_blocked else 'débloqué'
    return _htmx_success(f'Utilisateur {user.get_full_name() or user.email} {label}')


def admin_check_user_blocked(request):
    """GET /htmx/check-blocked/?userId=XXXX — check if a user is blocked."""
    firebase_user_id = request.GET.get('userId', '').strip()
    phone = request.GET.get('phone', '').strip()
    email = request.GET.get('email', '').strip()

    is_blocked = False

                                                          
    blocked_ids = request.session.get('blocked_firebase_ids', [])
    if firebase_user_id and firebase_user_id in blocked_ids:
        is_blocked = True

    if not is_blocked:
        qs = CustomUser.objects.filter(is_blocked=True)
        if firebase_user_id:
            qs = qs.filter(Q(firebase_user_id=firebase_user_id) | Q(firebase_uid=firebase_user_id))
            is_blocked = qs.exists()
        if not is_blocked and phone:
            is_blocked = CustomUser.objects.filter(phone=phone, is_blocked=True).exists()
        if not is_blocked and email:
            is_blocked = CustomUser.objects.filter(email=email, is_blocked=True).exists()

    return JsonResponse({'is_blocked': is_blocked})


                                                                                 
                 
                                                                                 

def admin_drivers_list(request):
    """GET /htmx/admin/drivers/ — drivers list HTML."""
    gate = _admin_gate(request)
    if gate: return gate

    tab = request.GET.get('tab', 'confirmed')
    search = request.GET.get('q', '').strip()

    if tab == 'pending':
        qs = Driver.objects.filter(is_verified=False, is_blocked=False)
    elif tab == 'blocked':
        qs = Driver.objects.filter(is_blocked=True)
    else:
        qs = Driver.objects.filter(is_verified=True, is_blocked=False)

    if search:
        qs = qs.filter(
            Q(firstname__icontains=search) |
            Q(lastname__icontains=search) |
            Q(phone__icontains=search) |
            Q(plate__icontains=search) |
            Q(city__icontains=search)
        )

    from julmin_taxis.driver_display_utils import _driver_photo_url
    from julmin_taxis.vehicle_image_ai import build_vehicle_pro_prompt

    drivers = [{
        'id': d.pk,
        'name': d.get_full_name() or d.phone or d.email or f'Chauffeur #{d.pk}',
        'phone': d.phone,
        'city': d.city,
        'plate': d.plate,
        'vehicle': d.vehicle,
        'car_brand': d.car_brand,
        'car_model': d.car_model,
        'car_year': d.car_year,
        'car_image_url': d.get_public_vehicle_image_url() or '',
        'vehicle_reference_photo_url': d.get_vehicle_reference_image_url() or '',
        'vehicle_professional_photo_url': d.get_public_vehicle_image_url() or '',
        'vehicle_gemini_prompt': build_vehicle_pro_prompt(d),
        'status': d.status,
        'rating': d.rating,
        'completed_trips': d.completed_trips,
        'is_blocked': d.is_blocked,
        'is_verified': d.is_verified,
        'photo': _driver_photo_url(d, request=request) or None,
        'latitude': d.latitude,
        'longitude': d.longitude,
        'email': d.email,
        'created_at': d.created_at,
        'has_license': bool(d.driving_license),
        'has_oavct': bool(d.oavct_insurance),
        'has_dgi': bool(d.dgi_card),
        'has_tint': bool(d.tint_permit),
        'commission_rate': float(d.commission_rate),
    } for d in qs[:100]]

    return render(request, 'htmx/admin_drivers.html', {
        'drivers': drivers,
        'tab': tab,
        'search': search,
    })


def admin_block_driver(request, driver_id):
    """POST: block/unblock a driver."""
    gate = _admin_gate(request)
    if gate: return gate

    driver = get_object_or_404(Driver, pk=driver_id)
    action = request.POST.get('action', 'block')
    driver.is_blocked = (action == 'block')
    driver.save(update_fields=['is_blocked'])
    from julmin_taxis.security_audit import log_driver_block
    log_driver_block(driver, driver.is_blocked, request)
    label = 'bloqué' if driver.is_blocked else 'débloqué'
    return _htmx_success(f'Chauffeur {driver.get_full_name()} {label}')


def admin_verify_driver(request, driver_id):
    """POST: approve/verify a driver."""
    gate = _admin_gate(request)
    if gate: return gate

    driver = get_object_or_404(Driver, pk=driver_id)
    driver.is_verified = True
    driver.is_blocked = False
    driver.save(update_fields=['is_verified', 'is_blocked'])
    try:
        from julmin_taxis.whatsapp_service import notify_driver_verified
        notify_driver_verified(driver)
    except Exception:
        pass
    try:
        from julmin_taxis.notify import _safe_push_driver
        _safe_push_driver(driver, 'account_validated')
    except Exception:
        pass
    return _admin_ok(request, f'Chauffeur {driver.get_full_name()} approuvé')


def admin_reject_driver(request, driver_id):
    """POST: refuse a pending driver registration (block, stay unverified)."""
    gate = _admin_gate(request)
    if gate:
        return gate

    driver = get_object_or_404(Driver, pk=driver_id)
    reason = (request.POST.get('reason') or '').strip()
    if not reason:
        accept = request.headers.get('Accept') or ''
        if 'application/json' in accept:
            return JsonResponse({'ok': False, 'message': 'Motif du refus requis.'}, status=400)
        return _htmx_error('Motif du refus requis.')
    from julmin_taxis.registration_utils import set_driver_rejection_notes
    driver.is_verified = False
    driver.is_blocked = True
    driver.verification_notes = set_driver_rejection_notes(driver.verification_notes, reason)
    driver.save(update_fields=['is_verified', 'is_blocked', 'verification_notes'])
    from julmin_taxis.security_audit import log_driver_block
    log_driver_block(driver, True, request)
    return _admin_ok(request, f'Inscription de {driver.get_full_name()} refusée')


def admin_delete_driver(request, driver_id):
    """DELETE: remove a driver."""
    gate = _admin_gate(request)
    if gate: return gate
    driver = get_object_or_404(Driver, pk=driver_id)
    name = driver.get_full_name()
    driver.delete()
    return _htmx_success(f'Chauffeur {name} supprimé')


def admin_set_driver_car_image(request, driver_id):
    """POST /htmx/admin/drivers/<id>/car-image/ — set car image (file upload or URL)."""
    gate = _admin_gate(request)
    if gate: return gate
    driver = get_object_or_404(Driver, pk=driver_id)
    from julmin_taxis.media_utils import delete_cloudinary_url

    old_legacy_url = (driver.car_image_url or '').strip()

    if 'car_image_file' in request.FILES:
        from julmin_taxis.security_utils import validate_upload, ALLOWED_IMAGE_MIMES, MAX_CAR_IMAGE_BYTES
        f = request.FILES['car_image_file']
        err = validate_upload(f, allowed_mimes=ALLOWED_IMAGE_MIMES, max_bytes=MAX_CAR_IMAGE_BYTES)
        if err:
            return HttpResponse(
                f'<span style="color:#ef4444;font-weight:700;">{err}</span>',
                content_type='text/html',
            )
        if driver.vehicle_professional_photo:
            try:
                driver.vehicle_professional_photo.delete(save=False)
            except Exception:
                pass
        driver.vehicle_professional_photo = f
        driver.save(update_fields=['vehicle_professional_photo'])
        driver.car_image_url = driver.get_public_vehicle_image_url() or ''
    elif request.POST.get('car_image_url', '').strip():
        new_url = request.POST['car_image_url'].strip()
        if old_legacy_url and old_legacy_url != new_url:
            delete_cloudinary_url(old_legacy_url)
        driver.car_image_url = new_url

    if old_legacy_url and driver.car_image_url != old_legacy_url:
        delete_cloudinary_url(old_legacy_url)

    driver.save(update_fields=['car_image_url'])
    return HttpResponse('<span style="color:#10b981;font-weight:700;">✓ Image enregistrée</span>', content_type='text/html')


def admin_download_vehicle_reference(request, driver_id):
    """GET — télécharge la photo référence véhicule (pour Gemini manuel)."""
    gate = _admin_gate(request)
    if gate:
        return gate
    driver = get_object_or_404(Driver, pk=driver_id)
    ref = driver.vehicle_reference_photo
    if not ref:
        return HttpResponse('Aucune photo de référence.', status=404)

    import os
    from django.http import HttpResponse as RawHttpResponse

    try:
        ref.open('rb')
        data = ref.read()
        ref.close()
    except Exception:
        return HttpResponse('Impossible de lire la photo.', status=500)

    ext = os.path.splitext(ref.name)[1].lower() or '.jpg'
    plate = (driver.plate or 'chauffeur').replace('/', '-').replace(' ', '_')
    filename = f'daxi_vehicule_ref_{driver.pk}_{plate}{ext}'
    mime = 'image/png' if ext == '.png' else 'image/jpeg'
    if ext == '.webp':
        mime = 'image/webp'

    resp = RawHttpResponse(data, content_type=mime)
    resp['Content-Disposition'] = f'attachment; filename="{filename}"'
    resp['Content-Length'] = len(data)
    return resp


def admin_set_driver_photo(request, driver_id):
    """POST /htmx/admin/drivers/<id>/photo/ — set driver profile photo."""
    gate = _admin_gate(request)
    if gate: return gate
    driver = get_object_or_404(Driver, pk=driver_id)

    if 'photo' not in request.FILES:
        return HttpResponse(
            '<span style="color:#ef4444;font-weight:700;">Aucune photo fournie</span>',
            content_type='text/html',
        )
    f = request.FILES['photo']
    if f.size > 5 * 1024 * 1024:
        return HttpResponse(
            '<span style="color:#ef4444;font-weight:700;">Fichier trop grand (max 5 Mo)</span>',
            content_type='text/html',
        )

    driver.photo = f
    driver.save(update_fields=['photo'])
    from julmin_taxis.driver_display_utils import sync_driver_photo_snapshots
    sync_driver_photo_snapshots(driver, request=request)
    return HttpResponse(
        '<span style="color:#10b981;font-weight:700;">✓ Photo enregistrée</span>',
        content_type='text/html',
    )


def admin_set_driver_commission(request, driver_id):
    """POST /htmx/admin/drivers/<id>/set-commission/
    Body: commission_rate (0–100)
    Sets the % that the driver keeps on each online-payment ride.
    """
    gate = _admin_gate(request)
    if gate: return gate

    try:
        driver = Driver.objects.get(pk=int(driver_id))
    except (Driver.DoesNotExist, ValueError):
        return _htmx_error('Chauffeur introuvable')

    try:
        from decimal import Decimal as _D
        rate = _D(str(request.POST.get('commission_rate', '80')))
        if not (_D('0') <= rate <= _D('100')):
            return _htmx_error('Le taux doit être entre 0 et 100.')
        driver.commission_rate = rate
        driver.save(update_fields=['commission_rate'])
        return HttpResponse(
            f'<span style="color:#10b981;font-weight:700;font-size:12px;">✓ Taux: {rate}% enregistré</span>',
            content_type='text/html'
        )
    except Exception as e:
        return _htmx_error(f'Erreur: {e}')


def admin_available_drivers(request):
    """GET: return available drivers for order assignment (HTML fragment)."""
    gate = _admin_gate(request)
    if gate: return gate

    city = request.GET.get('city', '').strip()
    qs = Driver.objects.filter(is_verified=True, is_blocked=False).order_by('status', 'city')
    if city:
        qs = qs.filter(city__icontains=city)

    from julmin_taxis.driver_display_utils import _driver_photo_url
    drivers = [{
        'id': d.pk,
        'name': d.get_full_name(),
        'phone': d.phone,
        'city': d.city,
        'vehicle': d.vehicle,
        'plate': d.plate,
        'status': d.status,
        'rating': d.rating,
        'photo': _driver_photo_url(d, request=request) or None,
        'latitude': d.latitude,
        'longitude': d.longitude,
    } for d in qs]

    order_id = request.GET.get('order_id', '').strip()
    return render(request, 'htmx/admin_assign_drivers.html', {
        'drivers': drivers,
        'order_id': order_id,
    })


                                                                                 
                        
                                                                                 

def admin_pricing(request):
    """GET/POST /htmx/admin/pricing/ — pricing config (HTML fragment or JSON)."""
    gate = _admin_gate(request)
    if gate:
        return gate

    from pricing.models import PricingConfig
    from pricing.serializers import PricingConfigSerializer

    config = PricingConfig.get_active()
    wants_json = (
        request.GET.get('format') == 'json'
        or 'application/json' in request.headers.get('Accept', '')
    )

    if request.method == 'GET':
        data = PricingConfigSerializer(config).data
        if wants_json:
            return JsonResponse({'config': data})
        return render(request, 'htmx/admin_pricing.html', {'config': config})

    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    try:
        if request.content_type and 'application/json' in request.content_type:
            payload = json.loads(request.body.decode('utf-8') or '{}')
        else:
            payload = request.POST.dict()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'error': 'JSON invalide'}, status=400) if wants_json else _htmx_error('JSON invalide')

    numeric_fields = (
        'base_price_per_km', 'minimum_price', 'round_trip_multiplier',
        'wait_price_per_30min', 'pause_price_per_5min', 'passenger_price_percent', 'global_multiplier',
        'default_driver_commission_rate',
    )
    for field in numeric_fields:
        if field in payload and payload[field] not in (None, ''):
            setattr(config, field, payload[field])
    if 'notes' in payload:
        config.notes = payload['notes'] or ''
    config.save()

    if 'default_driver_commission_rate' in payload and payload['default_driver_commission_rate'] not in (None, ''):
        from drivers.models import Driver
        Driver.objects.all().update(commission_rate=config.default_driver_commission_rate)

    from julmin_taxis.pricing_rates import sync_system_pause_rate
    sync_system_pause_rate(config.pause_price_per_5min)

    msg = 'Configuration tarifaire enregistrée.'
    if wants_json or (request.content_type and 'application/json' in request.content_type):
        return JsonResponse({
            'message': msg,
            'config': PricingConfigSerializer(config).data,
        })
    return render(request, 'htmx/admin_pricing.html', {
        'config': config,
        'success_msg': msg,
    })


def admin_system_config(request):
    """GET/POST /htmx/admin/system-config/ — taux USD→HTG et paramètres système."""
    gate = _admin_gate(request)
    if gate:
        return gate

    from orders.models import SystemConfig
    config = SystemConfig.get()
    wants_json = (
        request.GET.get('format') == 'json'
        or 'application/json' in request.headers.get('Accept', '')
    )

    if request.method == 'GET':
        data = {
            'usd_htg_rate': float(config.usd_htg_rate),
            'wait_rate_per_5min': float(config.wait_rate_per_5min),
            'extra_km_rate': float(config.extra_km_rate),
        }
        return JsonResponse({'config': data})

    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    try:
        if request.content_type and 'application/json' in request.content_type:
            payload = json.loads(request.body.decode('utf-8') or '{}')
        else:
            payload = request.POST.dict()
    except (json.JSONDecodeError, UnicodeDecodeError):
        return JsonResponse({'error': 'JSON invalide'}, status=400) if wants_json else _htmx_error('JSON invalide')

    if 'usd_htg_rate' in payload and payload['usd_htg_rate'] not in (None, ''):
        config.usd_htg_rate = payload['usd_htg_rate']
    if 'wait_rate_per_5min' in payload and payload['wait_rate_per_5min'] not in (None, ''):
        config.wait_rate_per_5min = payload['wait_rate_per_5min']
    if 'extra_km_rate' in payload and payload['extra_km_rate'] not in (None, ''):
        config.extra_km_rate = payload['extra_km_rate']
    config.save()

    msg = 'Configuration système enregistrée.'
    data = {
        'usd_htg_rate': float(config.usd_htg_rate),
        'wait_rate_per_5min': float(config.wait_rate_per_5min),
        'extra_km_rate': float(config.extra_km_rate),
    }
    if wants_json or (request.content_type and 'application/json' in request.content_type):
        return JsonResponse({'message': msg, 'config': data})
    return JsonResponse({'message': msg, 'config': data})


                                                                                 
                  
                                                                                 

def admin_calendar(request):
    """
    GET /htmx/admin/calendar/?year=2024&month=1
    Returns an interactive calendar HTML showing orders per day.
    """
    gate = _admin_gate(request)
    if gate: return gate

    now = timezone.now()
    try:
        year = int(request.GET.get('year', now.year))
        month = int(request.GET.get('month', now.month))
    except ValueError:
        year, month = now.year, now.month

           
    if month < 1:
        month = 12
        year -= 1
    elif month > 12:
        month = 1
        year += 1

                                                                
    from datetime import date as date_type
    from julmin_taxis.calendar_utils import (
        build_calendar_day_data,
        calendar_month_order_qs,
        format_calendar_date_fr,
        orders_on_calendar_day,
    )

    month_start = date_type(year, month, 1)
    if month == 12:
        month_end = date_type(year + 1, 1, 1)
    else:
        month_end = date_type(year, month + 1, 1)

    orders_this_month = calendar_month_order_qs(Order.objects.all(), year, month)
    day_data = build_calendar_day_data(orders_this_month, year, month)

                                                                               
    raw_weeks = monthcalendar(year, month)
    weeks_data = []
    for week in raw_weeks:
        week_row = []
        for day in week:
            week_row.append({
                'day': day,
                'info': day_data.get(day) if day != 0 else None,
                'is_today': (day != 0 and day == now.day and month == now.month and year == now.year),
                'date_str': f'{year}-{month:02d}-{day:02d}' if day != 0 else '',
            })
        weeks_data.append(week_row)

    prev_month = month - 1 if month > 1 else 12
    prev_year = year if month > 1 else year - 1
    next_month = month + 1 if month < 12 else 1
    next_year = year if month < 12 else year + 1

    return render(request, 'htmx/admin_calendar.html', {
        'year': year,
        'month': month,
        'month_name': FRENCH_MONTH_NAMES[month],
        'weeks_data': weeks_data,
        'today': now.date(),
        'prev_year': prev_year,
        'prev_month': prev_month,
        'next_year': next_year,
        'next_month': next_month,
    })


def admin_calendar_day(request):
    """GET /htmx/admin/calendar/day/?date=2024-01-15 — orders for a specific day."""
    gate = _admin_gate(request)
    if gate: return gate

    from julmin_taxis.calendar_utils import format_calendar_date_fr, orders_on_calendar_day

    date_str = request.GET.get('date', '')
    try:
        selected_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        selected_date = timezone.now().date()

    orders = orders_on_calendar_day(
        Order.objects.select_related('driver'),
        selected_date,
    )
    orders.sort(key=lambda o: (o.time is None, o.time or datetime.min.time(), o.created_at))
    orders_data = [_order_to_dict(o, for_admin=True, request=request) for o in orders]
    return render(request, 'htmx/admin_calendar_day.html', {
        'orders': orders_data,
        'selected_date': selected_date,
        'date_display': format_calendar_date_fr(selected_date),
        'is_today': selected_date == timezone.localdate(),
        'day_url': f'/htmx/admin/calendar/day/?date={selected_date.isoformat()}',
    })


                                                                                 
                    
                                                                                 

def admin_stats(request):
    """GET /htmx/admin/stats/ — dashboard statistics HTML."""
    gate = _admin_gate(request)
    if gate: return gate

    now = timezone.now()
    today = now.date()
    week_ago = now - timedelta(days=7)

    pending = Order.objects.filter(status__in=['pending', 'price_proposed', 'price_confirmed']).count()
    ongoing = Order.objects.filter(status__in=['driver_assigned', 'on_way', 'arrived', 'in_progress']).count()
    completed = Order.objects.filter(status='completed').count()
    today_orders = Order.objects.filter(Q(created_at__date=today) | Q(date=today)).count()

    total_rev = Order.objects.filter(status='completed').aggregate(t=Sum('price'))['t'] or 0
    week_rev = Order.objects.filter(status='completed', completed_at__gte=week_ago).aggregate(t=Sum('price'))['t'] or 0

    total_drivers = Driver.objects.filter(is_verified=True, is_blocked=False).count()
    available_drivers = Driver.objects.filter(is_verified=True, is_blocked=False, status='available').count()
    pending_drivers = Driver.objects.filter(is_verified=False, is_blocked=False).count()

    total_users = CustomUser.objects.filter(is_driver=False, is_superuser=False).count()
    blocked_users = CustomUser.objects.filter(is_blocked=True).count()

    return render(request, 'htmx/admin_stats.html', {
        'pending': pending,
        'ongoing': ongoing,
        'completed': completed,
        'today_orders': today_orders,
        'total_revenue': float(total_rev),
        'week_revenue': float(week_rev),
        'total_drivers': total_drivers,
        'available_drivers': available_drivers,
        'pending_drivers': pending_drivers,
        'total_users': total_users,
        'blocked_users': blocked_users,
    })


                                                                                 
              
                                                                                 

def admin_chat_messages(request, order_id):
    """GET /htmx/admin/chat/<order_id>/ — messages HTML fragment."""
    gate = _admin_gate(request)
    if gate: return gate

                                      
    try:
        order = Order.objects.get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        order = Order.objects.filter(firebase_uid=str(order_id)).first()
        if not order:
            return _htmx_error('Commande introuvable')

    messages = order.messages.order_by('timestamp')[:100]
    return render(request, 'htmx/chat_messages.html', {
        'messages': _order_messages_for_scope(order, 'admin', request),
        'order_id': order_id,
        'scope': 'admin',
    })


def admin_chat_send(request, order_id):
    """POST /htmx/admin/chat/<order_id>/send/ — send a message."""
    gate = _admin_gate(request)
    if gate: return gate

    try:
        order = Order.objects.get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        order = Order.objects.filter(firebase_uid=str(order_id)).first()
        if not order:
            return _htmx_error('Commande introuvable')

    parsed, err = _parse_chat_send(request)
    if err:
        return _htmx_error(err)

    msg = OrderMessage.objects.create(
        order=order,
        sender_type='admin',
        sender_name='Admin',
        content=parsed['content'],
        image_url=parsed['image_url'],
        audio_url=parsed['audio_url'],
        message_type=parsed['message_type'],
        audio_duration_sec=parsed.get('audio_duration_sec'),
        reply_to_id=parsed['reply_to_id'],
    )

    _notify_ws(f'order_{order.pk}', 'new_message', {
        'id': msg.pk,
        'order_id': order.pk,
        'sender_type': 'admin',
        'sender_name': 'Admin',
    })

    messages = order.messages.order_by('timestamp')[:100]
    return render(request, 'htmx/chat_messages.html', {
        'messages': _order_messages_for_scope(order, 'admin', request),
        'order_id': order_id,
        'scope': 'admin',
    })


                                                                                 
                       
                                                                                 

def driver_login(request):
    """POST /htmx/driver/login/ — authenticate driver via email+password or phone+password."""
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    identifier = (
        request.POST.get('identifier')
        or request.POST.get('email')
        or ''
    ).strip()
    password = request.POST.get('password', '').strip()

    if not identifier or not password:
        return _htmx_error('Identifiant et mot de passe requis')

    def _driver_phone_match(d, phone_norm):
        dp = (d.phone or '').replace(' ', '').replace('-', '').replace('+', '')
        return dp and (dp == phone_norm or dp.lstrip('0') == phone_norm.lstrip('0'))

    driver = None
    if '@' in identifier:
        driver = Driver.objects.filter(email=identifier).first()
    else:
        phone_norm = identifier.replace(' ', '').replace('-', '').replace('+', '')
        for d in Driver.objects.all():
            if _driver_phone_match(d, phone_norm):
                driver = d
                break

    if not driver:
        return _htmx_error('Identifiant introuvable')

    pw_hash = _hash(password)
    if driver.password_hash and driver.password_hash != pw_hash:
        if driver.password_hash != password:
            return _htmx_error('Mot de passe incorrect')

    if driver.is_blocked and not driver.is_verified:
        from julmin_taxis.registration_utils import driver_rejection_reason
        reason = driver_rejection_reason(driver.verification_notes)
        return _htmx_error(f'Votre inscription a été refusée. Motif : {reason}')

    if driver.is_blocked:
        return _htmx_error('Votre compte est bloqué. Contactez l\'administrateur.')

    if not driver.is_verified:
        return _htmx_error('Votre inscription est en cours de validation. Réponse sous 24–48h.')

    request.session['driver_id'] = driver.pk
    request.session['driver_name'] = driver.get_full_name()
    request.session.set_expiry(86400 * 30)

    response = HttpResponse('', status=200)
    response['HX-Redirect'] = '/driver/'
    return response


def driver_register(request):
    """POST /htmx/driver/register/ — create a new driver account."""
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    firstname = request.POST.get('firstname', '').strip()
    lastname = request.POST.get('lastname', '').strip()
    email = request.POST.get('email', '').strip().lower()
    phone = request.POST.get('phone', '').strip()
    city = request.POST.get('city', '').strip()
    password = request.POST.get('password', '').strip()
    password_confirm = request.POST.get('password_confirm', '').strip()
    car_brand = request.POST.get('car_brand', '').strip()
    car_model = request.POST.get('car_model', '').strip()
    car_year = request.POST.get('car_year', '').strip()
    car_color = request.POST.get('car_color', '').strip()
    plate = request.POST.get('plate', '').strip()
    phone = _driver_phone_from_request(request)
    if not phone:
        return _htmx_error('Numéro WhatsApp invalide pour le pays sélectionné')

    if len(password) < 8:
        return _htmx_error('Le mot de passe doit contenir au moins 8 caractères')
    if password != password_confirm:
        return _htmx_error('Les mots de passe ne correspondent pas')

    otp = request.POST.get('otp', '').strip()
    from julmin_taxis.reg_otp_cache import consume_registration_otp, validate_registration_otp
    ok, otp_err = validate_registration_otp(email, otp, phone_norm=phone, namespace='driver')
    if not ok:
        return _htmx_error(otp_err)
    consume_registration_otp(email, namespace='driver')

    if not all([firstname, lastname, email, phone, password, car_brand, car_model, plate]):
        return _htmx_error('Tous les champs obligatoires (incluant voiture et plaque) sont requis')

    if 'driving_license' not in request.FILES:
        return _htmx_error('Le permis de conduire est obligatoire')
    if 'photo' not in request.FILES:
        return _htmx_error('La photo de profil est obligatoire')
    if 'vehicle_reference_photo' not in request.FILES:
        return _htmx_error('La photo de votre véhicule est obligatoire')
    if 'oavct_insurance' not in request.FILES:
        return _htmx_error("L'assurance OAVCT est obligatoire")
    if 'dgi_card' not in request.FILES:
        return _htmx_error('La carte DGI est obligatoire')

    from julmin_taxis.security_utils import validate_upload, ALLOWED_IMAGE_MIMES, MAX_CAR_IMAGE_BYTES
    veh_err = validate_upload(
        request.FILES.get('vehicle_reference_photo'),
        allowed_mimes=ALLOWED_IMAGE_MIMES,
        max_bytes=MAX_CAR_IMAGE_BYTES,
    )
    if veh_err:
        return _htmx_error(f'Photo véhicule : {veh_err}')

    if Driver.objects.filter(email=email).exists():
        return _htmx_error('Un compte avec cet email existe déjà')
    if Driver.objects.filter(phone=phone).exists():
        return _htmx_error('Un compte avec ce numéro WhatsApp existe déjà')

    from drivers.document_verification import verify_driver_registration_files
    strict_docs = getattr(settings, 'DRIVER_REGISTRATION_STRICT_DOCS', False)
    allow_manual = getattr(settings, 'DRIVER_DOC_ALLOW_MANUAL_REVIEW', True)
    ocr_reader = None
    if strict_docs:
        try:
            ocr_reader = get_ocr_reader()
        except Exception:
            if not allow_manual:
                return _htmx_error('Vérification des documents indisponible — réessayez plus tard.')
    ok, doc_errors, doc_notes = verify_driver_registration_files(
        request.FILES,
        firstname,
        lastname,
        ocr_reader=ocr_reader,
        allow_manual_review=allow_manual,
        strict=strict_docs,
    )
    if not ok:
        return _htmx_error(' · '.join(doc_errors[:3]))

    vehicle_label = f'{car_brand} {car_model}'.strip()
    if car_year:
        vehicle_label = f'{vehicle_label} ({car_year})'.strip()
    notes_parts = []
    if car_color:
        notes_parts.append(f'Couleur véhicule: {car_color}')
    ver_notes = request.POST.get('verification_notes', '').strip()
    if ver_notes:
        notes_parts.append('Pré-vérification client: ' + ver_notes)
    if doc_notes:
        notes_parts.append('Vérification documents: ' + json.dumps(doc_notes, ensure_ascii=False))
    verification_notes = '\n'.join(notes_parts)

    driver = Driver.objects.create(
        firstname=firstname,
        lastname=lastname,
        full_name=f'{firstname} {lastname}',
        email=email,
        phone=phone,
        city=city,
        vehicle=vehicle_label,
        car_brand=car_brand,
        car_model=car_model,
        car_year=car_year,
        plate=plate,
        password_hash=_hash(password),
        is_verified=False,
        status='offline',
        photo=request.FILES.get('photo'),
        vehicle_reference_photo=request.FILES.get('vehicle_reference_photo'),
        driving_license=request.FILES.get('driving_license'),
        oavct_insurance=request.FILES.get('oavct_insurance'),
        dgi_card=request.FILES.get('dgi_card'),
        tint_permit=request.FILES.get('tint_permit'),
        verification_notes=verification_notes,
    )
    import logging
    logging.getLogger(__name__).info(
        '[DriverRegister] pending driver #%s %s (%s)',
        driver.pk, driver.get_full_name(), email,
    )

    request.session['driver_id'] = driver.pk
    request.session['driver_name'] = driver.get_full_name()
    request.session['driver_pending_verification'] = True

    request.session.set_expiry(86400 * 30)

    try:
        from julmin_taxis.notify import notify_admin_driver_pending_event
        notify_admin_driver_pending_event(driver)
    except Exception:
        pass

    response = HttpResponse('', status=200)
    response['HX-Redirect'] = '/driver/'
    return response


def driver_send_reg_otp(request):
    """POST /htmx/driver/register/send-otp/ — envoie OTP WhatsApp (étape 1 inscription)."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Méthode non supportée'}, status=405)

    import random
    from django.core.cache import cache
    from julmin_taxis.whatsapp_service import send_otp_whatsapp

    def _fail(message: str):
        return JsonResponse({'success': False, 'message': message})

    email = request.POST.get('email', '').strip().lower()
    phone = request.POST.get('phone', '').strip()
    firstname = request.POST.get('firstname', '').strip()

    if not email:
        return _fail('Email requis.')
    if not phone:
        return _fail('Numéro WhatsApp requis.')

    phone_norm = _driver_phone_from_request(request)
    if not phone_norm:
        return _fail('Numéro WhatsApp invalide pour le pays sélectionné.')

    if Driver.objects.filter(email=email).exists():
        return _fail('Un compte avec cet email existe déjà. Utilisez « Retour à la connexion ».')
    if Driver.objects.filter(phone=phone_norm).exists():
        return _fail('Ce numéro WhatsApp est déjà inscrit comme chauffeur. Utilisez « Retour à la connexion ».')

    otp = str(random.randint(100000, 999999))
    from julmin_taxis.reg_otp_cache import store_registration_otp
    store_registration_otp(email, otp, phone_norm=phone_norm, namespace='driver')

    name = firstname or 'Chauffeur'
    try:
        if send_otp_whatsapp(phone_norm, name, otp):
            return JsonResponse({'success': True, 'message': 'Code envoyé sur WhatsApp.'})
        return JsonResponse({'success': False, 'message': 'Échec envoi WhatsApp — vérifiez le numéro.'})
    except Exception as exc:
        return JsonResponse({'success': False, 'message': str(exc)})


def driver_verify_reg_otp(request):
    """POST /htmx/driver/register/verify-otp/ — valide OTP avant étape 2."""
    if request.method != 'POST':
        return JsonResponse({'success': False, 'message': 'Méthode non supportée'}, status=405)

    from julmin_taxis.reg_otp_cache import mark_registration_verified, validate_registration_otp

    email = request.POST.get('email', '').strip().lower()
    phone = request.POST.get('phone', '').strip()
    otp = request.POST.get('otp', '').strip()

    if not email or not otp:
        return JsonResponse({'success': False, 'message': 'Email et code requis.'})

    phone_norm = _driver_phone_from_request(request)
    ok, msg = validate_registration_otp(email, otp, phone_norm=phone_norm, namespace='driver')
    if not ok:
        return JsonResponse({'success': False, 'message': msg})

    mark_registration_verified(email, namespace='driver')
    return JsonResponse({'success': True, 'message': 'WhatsApp vérifié.'})


def driver_logout(request):
    """POST /htmx/driver/logout/"""
    request.session.pop('driver_id', None)
    request.session.pop('driver_name', None)
    response = HttpResponse('', status=200)
    response['HX-Redirect'] = '/driver/login/'
    return response


                                                                                 
                 
                                                                                 

def _get_current_driver(request) -> Driver | None:
    driver_id = request.session.get('driver_id')
    if not driver_id:
        return None
    try:
        driver = Driver.objects.get(pk=driver_id)
        if driver.is_blocked:
            request.session.pop('driver_id', None)
            return None
        return driver
    except Driver.DoesNotExist:
        request.session.pop('driver_id', None)
        return None


def _driver_redirect():
    """Return an HX-Redirect to driver login when session is invalid."""
    resp = HttpResponse('', status=200)
    resp['HX-Redirect'] = '/driver/'
    return resp


DRIVER_ACTIVE_STATUSES = ('driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return')
NOW_ACCEPT_REMAINING_SEC = 300                                                             
LATER_BUFFER_SEC = 1800                                              


def _estimate_order_end_at(order: Order, at=None):
    """Estime l'heure de fin d'une course active pour le chauffeur."""
    at = at or timezone.now()
    duration = _trip_duration_min(
        order.pickup_lat, order.pickup_lng,
        order.destination_lat, order.destination_lng,
        order.trip_type, int(order.round_trip_wait_minutes or 0),
    ) or 30
    trip_sec = duration * 60

    if order.status == 'in_progress' and order.in_progress_at:
        elapsed = max(0, (at - order.in_progress_at).total_seconds())
        remaining = max(60, trip_sec - elapsed)
        return at + timedelta(seconds=remaining)
    if order.status == 'waiting_return':
        wait_sec = int(order.round_trip_wait_minutes or 0) * 60
        started = order.round_trip_wait_started_at or at
        wait_left = max(0, wait_sec - (at - started).total_seconds()) if wait_sec else 1800
        return at + timedelta(seconds=wait_left + trip_sec)
    if order.status == 'arrived':
        return at + timedelta(seconds=trip_sec)
    if order.status == 'on_way':
        return at + timedelta(seconds=900 + trip_sec)                           
    if order.status == 'driver_assigned':
        return at + timedelta(seconds=1200 + trip_sec)                           
    return at + timedelta(seconds=trip_sec + 1200)


def _driver_active_orders(driver):
    return Order.objects.filter(driver=driver, status__in=DRIVER_ACTIVE_STATUSES)


def _order_has_full_coords(order):
    return bool(
        order.pickup_lat and order.pickup_lng
        and order.destination_lat and order.destination_lng
    )


def prev_status_gate_needed(order):
    """Gate 500m for démarrer la course (outbound from arrived, or return from waiting_return)."""
    st = (order.status or '').strip()
    return st in ('arrived', 'waiting_return')


def _driver_near_pickup(driver, order, max_m=500):
    """True if driver GPS is within max_m of the relevant meeting point."""
    try:
        dlat = float(getattr(driver, 'latitude', None) or 0)
        dlng = float(getattr(driver, 'longitude', None) or 0)
    except (TypeError, ValueError):
        return False, None
    if not dlat or not dlng:
        return False, None
    st = (order.status or '').strip()
    # Return leg starts from destination; outbound from pickup/meeting
    if st == 'waiting_return':
        plat = order.destination_lat
        plng = order.destination_lng
    else:
        plat = order.pickup_lat
        plng = order.pickup_lng
        if getattr(order, 'meeting_lat', None) is not None and getattr(order, 'meeting_lng', None) is not None:
            plat = order.meeting_lat
            plng = order.meeting_lng
    try:
        plat = float(plat)
        plng = float(plng)
    except (TypeError, ValueError):
        return False, None
    km = _haversine_km(dlat, dlng, plat, plng)
    if km is None:
        return False, None
    dist_m = float(km) * 1000.0
    return dist_m <= float(max_m), dist_m


def _driver_can_accept_order(driver, order):
    """Règles d'acceptation maintenant / plus tard. Retourne (ok, message)."""
    if not getattr(driver, 'is_verified', False):
        return False, 'Votre compte est en attente de validation par l\'équipe DAXI.'

    paid = _order_ready_for_driver_accept(order)
    if not paid:
        if not _order_has_full_coords(order):
            return False, (
                'Coordonnées manquantes — placez départ et destination sur la carte '
                'et envoyez le prix au client avant d\'accepter.'
            )
        return False, (
            'En attente du paiement client — vous pourrez accepter la course '
            'dès que le paiement est confirmé.'
        )

    active = list(_driver_active_orders(driver))
    blocking = [o for o in active if not round_trip_can_take_other_rides(o)]
    active_now = [o for o in blocking if not o.is_later]
    active_later = [o for o in blocking if o.is_later]
    now = timezone.now()

    if not order.is_later:
        if len(active_now) > 1:
            return False, 'Vous avez déjà plusieurs courses immédiates en cours.'
        if len(active_now) == 1:
            current = active_now[0]
            end_at = _estimate_order_end_at(current, now)
            remaining = (end_at - now).total_seconds()
            if remaining > NOW_ACCEPT_REMAINING_SEC:
                mins = max(1, int(remaining // 60) + 1)
                return False, (
                    f'Terminez votre course actuelle (~{mins} min restantes) '
                    f'avant d\'en accepter une nouvelle.'
                )
        new_end = _estimate_order_end_at(order, now)
        for later in active_later:
            sched = later.scheduled_at
            if sched and new_end > sched - timedelta(seconds=LATER_BUFFER_SEC):
                when = later.date.strftime('%d/%m/%Y') if later.date else ''
                t = str(later.time)[:5] if later.time else ''
                return False, (
                    f'Cette course chevaucherait votre course programmée'
                    f'{(" du " + when) if when else ""}{(" à " + t) if t else ""}. '
                    f'Elle doit se terminer 30 min avant.'
                )
        return True, ''

    sched = order.scheduled_at
    if not sched and order.date and order.time:
        try:
            import pytz
            ht = pytz.timezone('America/Port-au-Prince')
            sched = ht.localize(datetime.combine(order.date, order.time))
        except Exception:
            sched = datetime.combine(order.date, order.time)

    if sched:
        for now_order in active_now:
            end_at = _estimate_order_end_at(now_order, now)
            if end_at > sched - timedelta(seconds=LATER_BUFFER_SEC):
                return False, (
                    'Votre course en cours doit se terminer au moins 30 min '
                    'avant le départ de cette course programmée.'
                )
    return True, ''


def driver_orders(request):
    """GET /htmx/driver/orders/?tab=available|accepted|history"""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    tab = request.GET.get('tab', 'available')

    if tab == 'available':
        qs = Order.objects.filter(
            Q(status__in=['pending', 'price_proposed'])
            | Q(status='price_confirmed', payment_status__in=['paid', 'in_person'])
            | Q(status='driver_assigned', driver__isnull=True),
            driver__isnull=True,
        ).order_by('created_at')[:30]

    elif tab == 'accepted':
        qs = Order.objects.filter(
            driver=driver,
            status__in=['driver_assigned', 'on_way', 'arrived', 'in_progress', 'price_proposed', 'price_confirmed']
        ).order_by('-created_at')[:30]

    elif tab == 'history':
        qs = Order.objects.filter(
            driver=driver,
            status__in=['completed', 'cancelled']
        ).order_by('-created_at')[:50]

    else:
        qs = Order.objects.none()

    if qs.model:
        qs = qs.select_related('enterprise', 'driver', 'user', 'coords_placed_by')

    orders_data = [_order_to_dict(o, for_driver=True, request=request) for o in qs]

                                                    
    if tab == 'available':
        for i, o_obj in enumerate(qs):
            ok, reason = _driver_can_accept_order(driver, o_obj)
            orders_data[i]['can_accept'] = ok
            orders_data[i]['accept_block_reason'] = reason

                                                                                      
    if tab == 'available' and driver.latitude and driver.longitude:
        for od in orders_data:
            plat = od.get('pickup_lat')
            plng = od.get('pickup_lng')
                                                                                           
            if not plat or not plng:
                plat = od.get('client_gps_lat')
                plng = od.get('client_gps_lng')
            if plat and plng:
                try:
                    dlat = math.radians(float(plat) - driver.latitude)
                    dlng = math.radians(float(plng) - driver.longitude)
                    a = (math.sin(dlat / 2) ** 2 +
                         math.cos(math.radians(driver.latitude)) *
                         math.cos(math.radians(float(plat))) *
                         math.sin(dlng / 2) ** 2)
                    km = round(6371 * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a)), 1)
                    od['driver_distance_km'] = km
                                                                                           
                    if km <= 40:
                        eta = max(1, min(120, round((km * 1.35 / 28.0) * 60)))
                        od['eta_to_client_min'] = eta
                        od['show_eta_to_client'] = km <= 35
                    else:
                        od['eta_to_client_min'] = None
                        od['show_eta_to_client'] = False
                    od['eta_min'] = od.get('eta_to_client_min')
                except Exception:
                    od['driver_distance_km'] = None
                    od['eta_min'] = None
                    od['eta_to_client_min'] = None
                    od['show_eta_to_client'] = False

                                                              
    now_orders = [od for od in orders_data if not od.get('is_later')]
    scheduled_orders = [od for od in orders_data if od.get('is_later')]

    return render(request, 'htmx/driver_orders.html', {
        'orders': orders_data,
        'now_orders': now_orders,
        'scheduled_orders': scheduled_orders,
        'tab': tab,
        'driver': driver,
        'google_maps_key': getattr(settings, 'GOOGLE_MAPS_API_KEY', ''),
    })


def driver_accept_order(request, order_id):
    """POST /htmx/driver/orders/<id>/accept/"""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    try:
        with transaction.atomic():
            try:
                order = Order.objects.select_for_update().get(pk=int(order_id))
            except (Order.DoesNotExist, ValueError):
                order = Order.objects.select_for_update().filter(firebase_uid=str(order_id)).first()
                if not order:
                    return _htmx_error('Commande introuvable')

            if order.status not in ('pending', 'price_proposed', 'price_confirmed') and not (
                order.status == 'driver_assigned' and not order.driver_id
            ):
                return _htmx_error('Cette commande a déjà été prise en charge ou n\'est plus disponible')

            if order.driver_id and order.driver_id != driver.pk:
                return _htmx_error('Cette commande a déjà été assignée à un autre chauffeur')

            can, block_msg = _driver_can_accept_order(driver, order)
            if not can:
                return _htmx_error(block_msg)

            order.driver = driver
            drv_info = driver_public_dict(driver, order, request)
            order.driver_name = drv_info['driver_name'] or driver.get_full_name()
            order.driver_phone = drv_info['driver_phone'] or driver.phone
            order.driver_photo_url = drv_info['driver_photo'] or ''
            order.status = 'driver_assigned'
            order.driver_assigned_at = timezone.now()
            order.save()
    except Exception as e:
        return _htmx_error('Erreur lors de l\'acceptation de la commande')

                                                              
    from julmin_taxis.driver_presence import sync_driver_status_from_orders
    sync_driver_status_from_orders(driver)

    drv_payload = driver_public_dict(driver, order, request)
    drv_payload['order_id'] = order.pk
    drv_payload['status'] = 'driver_assigned'
    _notify_ws(f'order_{order.pk}', 'driver_accepted', drv_payload)
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'driver_assigned'})
    try:
        others = Driver.objects.filter(status='available', is_blocked=False).exclude(pk=driver.pk).values_list('pk', flat=True)
        for did in others:
            _notify_ws(f'driver_{did}', 'order_unavailable', {'order_id': order.pk})
    except Exception:
        pass

                                                                        
    _notify_ws(f'order_{order.pk}', 'driver_assigned', {
        **drv_payload,
        'message': (
            f'Votre chauffeur {order.driver_name} a accepté'
            + (' — en attente de départ.' if not order.is_later else ' — course planifiée.')
        ),
    })
    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, 'driver_assigned')
    except Exception as _e:
        import logging
        logging.getLogger(__name__).warning('Notify driver_assigned failed: %s', _e)

    return _htmx_success(f'Commande acceptée!')


def _finalize_pause_if_active(order):
    """Verrouille le prix de pause si la course se termine pendant une pause."""
    if not order.is_paused or not order.pause_started_at:
        return
    from decimal import Decimal as _D
    elapsed = (timezone.now() - order.pause_started_at).total_seconds()
    total_secs = (order.pause_accumulated_seconds or 0) + elapsed
    intervals = total_secs / 300
    pause_price = (_D(str(order.pause_rate_snapshot or 0)) * _D(str(intervals))).quantize(_D('0.01'))
    order.is_paused = False
    order.pause_accumulated_seconds = int(total_secs)
    order.pause_price = pause_price
    order.pause_started_at = None
    order.save(update_fields=['is_paused', 'pause_accumulated_seconds', 'pause_price', 'pause_started_at'])


def driver_update_status(request, order_id):
    """POST /htmx/driver/orders/<id>/status/ — on_way, arrived, in_progress, waiting_return, completed"""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    valid_driver_statuses = ['on_way', 'arrived', 'in_progress', 'waiting_return', 'completed']
    new_status = request.POST.get('status', '').strip()
    if new_status not in valid_driver_statuses:
        return _htmx_error('Statut invalide')

    try:
        order = Order.objects.get(pk=int(order_id), driver=driver)
    except (Order.DoesNotExist, ValueError):
        return _htmx_error('Commande introuvable')

    transition_err = _validate_driver_status_transition(order, new_status)
    if transition_err:
        return _htmx_error(transition_err)

    if new_status in ('on_way', 'arrived', 'in_progress', 'waiting_return') and not _order_has_full_coords(order):
        return _htmx_error(
            'Placez départ et destination sur la carte avant de démarrer la course.'
        )

    # Anti-fraude : démarrer la course seulement si le chauffeur est vraiment près du client
    if new_status == 'in_progress' and prev_status_gate_needed(order):
        near, dist_m = _driver_near_pickup(driver, order, max_m=500)
        if not near:
            return _htmx_error(
                'Vous devez être réellement arrivé au point de rendez-vous avant de démarrer la course.'
            )

    if new_status == 'completed':
        _finalize_pause_if_active(order)

    now = timezone.now()
    prev_status = order.status

    if is_round_trip_order(order):
        if new_status == 'in_progress' and prev_status == 'arrived':
            order.round_trip_phase = 'outbound'
        elif new_status == 'waiting_return':
            order.round_trip_phase = 'waiting'
            order.round_trip_wait_started_at = now
        elif new_status == 'in_progress' and prev_status == 'waiting_return':
            order.round_trip_phase = 'return'
            order.return_started_at = now

    order.update_status(new_status)

    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, new_status)
    except Exception as _n:
        import logging
        logging.getLogger(__name__).warning('Notify status %s failed: %s', new_status, _n)

    if new_status == 'waiting_return' and round_trip_can_take_other_rides(order):
        from julmin_taxis.driver_presence import sync_driver_status_from_orders
        sync_driver_status_from_orders(driver)

    if new_status == 'completed':
        driver.completed_trips += 1
        driver.save(update_fields=['completed_trips'])
        from julmin_taxis.driver_presence import sync_driver_status_from_orders
        sync_driver_status_from_orders(driver)

        _process_driver_commission(order, driver)

    _notify_ws(f'order_{order.pk}', 'status_updated', {
        'status': new_status,
        'order_id': order.pk,
        'round_trip_phase': order.round_trip_phase or '',
    })
    _notify_ws('admin', 'order_updated', {
        'order_id': order.pk,
        'status': new_status,
        'round_trip_phase': order.round_trip_phase or '',
    })

    if new_status == 'on_way':
        _notify_ws(f'order_{order.pk}', 'driver_on_the_way', {
            'order_id': order.pk,
            'driver_name': order.driver_name or (driver.get_full_name() if driver else ''),
            'message': 'Votre chauffeur est en route vers vous !',
        })
    elif new_status == 'arrived':
        _notify_ws(f'order_{order.pk}', 'driver_arrived', {
            'order_id': order.pk,
            'message': 'Votre chauffeur est arrivé au point de départ.',
        })
    elif new_status == 'waiting_return':
        _notify_ws(f'order_{order.pk}', 'round_trip_waiting', {
            'order_id': order.pk,
            'message': 'Arrivé à destination — attente avant le retour.',
            'wait_minutes': int(order.round_trip_wait_minutes or 0),
        })
    elif new_status == 'in_progress' and prev_status == 'waiting_return':
        _notify_ws(f'order_{order.pk}', 'round_trip_return_started', {
            'order_id': order.pk,
            'message': 'Le retour vers le point de départ a commencé.',
        })

    return _htmx_success(f'Statut mis à jour: {order.get_status_display()}')


def driver_cancel_order(request, order_id):
    """POST /htmx/driver/orders/<id>/cancel/"""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    try:
        order = Order.objects.get(pk=int(order_id), driver=driver)
    except (Order.DoesNotExist, ValueError):
        return _htmx_error('Commande introuvable')

    order.driver = None
    order.status = 'pending'
    order.save(update_fields=['driver', 'status'])

    from julmin_taxis.driver_presence import sync_driver_status_from_orders
    sync_driver_status_from_orders(driver)

    _notify_ws(f'order_{order.pk}', 'driver_unassigned', {
        'order_id': order.pk,
        'status': 'pending',
        'message': 'Le chauffeur n\'est plus assigné à cette course.',
    })
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'pending'})
    try:
        from drivers.models import Driver
        for did in Driver.objects.filter(status='available', is_blocked=False).values_list('pk', flat=True):
            _notify_ws(f'driver_{did}', 'order_updated', {'order_id': order.pk, 'status': 'pending'})
    except Exception:
        pass
    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, 'driver_unassigned')
    except Exception:
        pass

    return _htmx_success('Commande annulée')


def driver_set_coords(request, order_id):
    """POST /htmx/driver/orders/<id>/set-coords/
    Driver manually sets pickup/destination coordinates for an order without GPS.
    Accepts dest_lat/dest_lng or destination_lat/destination_lng; partial updates allowed.
    Triggers auto price calculation when all four coordinates are present.
    """
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    try:
        order = Order.objects.select_related('coords_placed_by').get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        return _htmx_error('Commande introuvable')

    if order.driver_id and order.driver_id != driver.pk:
        return _htmx_error('Commande assignée à un autre chauffeur')
    if order.status in ('completed', 'cancelled'):
        return _htmx_error('Commande terminée ou annulée')
    if order.coords_placed_by_id and order.coords_placed_by_id != driver.pk:
        who = order.coords_placed_by.get_full_name() if order.coords_placed_by else 'un autre chauffeur'
        return _htmx_error(
            f'Les coordonnées ont déjà été placées par {who}. '
            f'Seul l\'admin peut les modifier.'
        )

    return _apply_order_coords_from_request(request, order, actor_driver=driver)


def admin_set_coords(request, order_id):
    """POST /htmx/admin/orders/<id>/set-coords/ — admin peut toujours placer ou corriger les GPS."""
    gate = _admin_gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    try:
        order = Order.objects.get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        order = Order.objects.filter(firebase_uid=str(order_id)).first()
        if not order:
            return _htmx_error('Commande introuvable')

    if order.status in ('completed', 'cancelled'):
        return _htmx_error('Commande terminée ou annulée')

    return _apply_order_coords_from_request(request, order, is_admin=True)


def _order_skip_km_repricing_on_coords(order):
    """Ne pas recalculer le tarif au km quand les GPS sont placés (forfait, prix déjà fixé, déjà payé)."""
    if _order_ready_for_driver_accept(order):
        return True
    from julmin_taxis.service_plans import resolve_fixed_plan_price
    if resolve_fixed_plan_price(order.service_plan or ''):
        return True
    if order.price_confirmed and order.price and float(order.price) > 0:
        return True
    return False


def _apply_order_coords_from_request(request, order, actor_driver=None, is_admin=False):
    def _parse_coord(*keys):
        for key in keys:
            raw = request.POST.get(key, '').strip()
            if raw:
                try:
                    return float(raw)
                except ValueError:
                    pass
        return None

    pickup_lat = _parse_coord('pickup_lat')
    pickup_lng = _parse_coord('pickup_lng')
    dest_lat = _parse_coord('dest_lat', 'destination_lat')
    dest_lng = _parse_coord('dest_lng', 'destination_lng')
    pickup_label = request.POST.get('pickup_label', '').strip()
    destination_label = request.POST.get('destination_label', '').strip()
    plan_stops_raw = request.POST.get('plan_stops_json', '').strip()
    pickup_in_request = pickup_lat is not None and pickup_lng is not None
    dest_in_request = dest_lat is not None and dest_lng is not None

    original_pickup = order.pickup
    original_destination = order.destination

    updated = False
    update_fields = ['pickup_lat', 'pickup_lng', 'destination_lat', 'destination_lng',
                     'pickup_coords_set_by_driver', 'dest_coords_set_by_driver', 'updated_at', 'pickup', 'destination']
    if actor_driver and not order.coords_placed_by_id:
        order.coords_placed_by = actor_driver
        update_fields.append('coords_placed_by')

    if pickup_lat is not None and pickup_lng is not None:
        if not _gps_coords_valid(pickup_lat, pickup_lng):
            return _htmx_error('Coordonnées de départ invalides')
        order.pickup_lat = pickup_lat
        order.pickup_lng = pickup_lng
        order.pickup_coords_set_by_driver = True
        if pickup_label:
            order.pickup = pickup_label[:500]
        if order.meeting_lat is None:
            order.meeting_lat = pickup_lat
            order.meeting_lng = pickup_lng
            update_fields.extend(['meeting_lat', 'meeting_lng'])
        updated = True

    plan_stops_saved = False
    if plan_stops_raw:
        try:
            stops_payload = json.loads(plan_stops_raw)
            if isinstance(stops_payload, list) and stops_payload:
                _persist_plan_stops_on_order(order, stops_payload, update_fields)
                plan_stops_saved = True
                updated = True
        except (json.JSONDecodeError, TypeError, ValueError):
            return _htmx_error('Format des destinations invalide')

    if dest_lat is not None and dest_lng is not None and not plan_stops_saved:
        if not _gps_coords_valid(dest_lat, dest_lng):
            return _htmx_error('Coordonnées de destination invalides')
        order.destination_lat = dest_lat
        order.destination_lng = dest_lng
        order.dest_coords_set_by_driver = True
        if destination_label:
            order.destination = destination_label[:500]
        updated = True

    if not updated:
        return _htmx_error('Aucun point placé — touchez la carte pour placer les lieux')

    order.save(update_fields=list(dict.fromkeys(update_fields)))

    from julmin_taxis.known_places_utils import apply_place_decisions, _is_generic_pickup_label
    place_driver = actor_driver if not is_admin else None
    decisions_raw = request.POST.get('known_place_decisions', '').strip()
    decisions = []
    if decisions_raw:
        try:
            parsed = json.loads(decisions_raw)
            if isinstance(parsed, list):
                decisions = parsed
        except (json.JSONDecodeError, TypeError):
            pass

    pickup_tuple = None
    dest_tuple = None
    stops_tuples = []
    if order.pickup_lat and order.pickup_lng and order.pickup_coords_set_by_driver and pickup_in_request:
        lbl = (pickup_label or order.pickup or '').strip()
        if lbl and not _is_generic_pickup_label(lbl):
            pickup_tuple = (lbl, order.pickup_lat, order.pickup_lng, original_pickup)
    if order.destination_lat and order.destination_lng and order.dest_coords_set_by_driver and dest_in_request:
        lbl = (destination_label or order.destination or '').strip()
        if lbl:
            dest_tuple = (lbl, order.destination_lat, order.destination_lng, original_destination)
    for stop in _parse_plan_stops(order):
        if _gps_coords_valid(stop.get('lat'), stop.get('lng')):
            stops_tuples.append((
                stop.get('label') or 'Étape',
                stop['lat'],
                stop['lng'],
                stop.get('label') or '',
            ))

    apply_place_decisions(
        decisions,
        pickup=pickup_tuple,
        dest=dest_tuple,
        stops=stops_tuples,
        driver=place_driver,
        order=order,
    )

    if not _order_has_all_coords(order):
        _notify_ws(f'order_{order.pk}', 'coords_set', {
            'order_id': order.pk,
            'pickup_lat': order.pickup_lat,
            'pickup_lng': order.pickup_lng,
            'destination_lat': order.destination_lat,
            'destination_lng': order.destination_lng,
        })
        msg = 'Coordonnées partielles sauvegardées'
        if is_admin:
            return _htmx_success(msg)
        return _htmx_success(msg)

    coords_payload = {
        'order_id': order.pk,
        'pickup_lat': order.pickup_lat,
        'pickup_lng': order.pickup_lng,
        'destination_lat': order.destination_lat,
        'destination_lng': order.destination_lng,
    }

    if _order_skip_km_repricing_on_coords(order):
        _notify_ws(f'order_{order.pk}', 'coords_set', coords_payload)
        _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': order.status})
        try:
            from julmin_taxis.notify import notify_coords_set_event
            notify_coords_set_event(order)
        except Exception:
            pass
        from julmin_taxis.service_plans import resolve_fixed_plan_price
        is_fixed = bool(resolve_fixed_plan_price(order.service_plan or ''))
        if _order_ready_for_driver_accept(order):
            detail = 'vous pouvez démarrer la course'
        elif is_fixed:
            detail = 'tarif forfait conservé'
        else:
            detail = 'tarif existant conservé'
        html = (
            f'<div style="padding:10px 14px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;color:#10b981;font-size:12px;font-weight:700;">'
            f'<i class="ri-check-line"></i> Coordonnées enregistrées — {detail}</div>'
        )
        if is_admin:
            return _htmx_success(f'Coordonnées enregistrées — {detail}')
        return HttpResponse(html, content_type='text/html')

    from pricing.services import apply_price_to_order

    price_result = None
    if not _order_ready_for_driver_accept(order):
        price_result = apply_price_to_order(order, propose=True, actor_request=request)

    if price_result and price_result.price is not None and not _order_ready_for_driver_accept(order):
        order.refresh_from_db()
        _notify_ws(f'order_{order.pk}', 'price_proposed', {
            'price': float(order.price),
            'total_price': _order_total_price_float(order),
            'order_id': order.pk,
            'status': 'price_proposed',
        })
        _notify_ws(f'order_{order.pk}', 'coords_set', {
            **coords_payload,
            'price': float(order.price),
            'status': order.status,
        })
        _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'price_proposed'})
        try:
            from julmin_taxis.notify import notify_order_status_now
            notify_order_status_now(order, 'price_proposed')
        except Exception:
            pass
        html = (
            f'<div style="padding:10px 14px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;color:#10b981;font-size:12px;font-weight:700;">'
            f'<i class="ri-check-line"></i> Coordonnées confirmées — prix DAXI calculé : {format_price(order.price)} — proposition envoyée au client</div>'
        )
        if is_admin:
            return _htmx_success(f'Prix {format_price(order.price)} proposé au client')
        return HttpResponse(html, content_type='text/html')

    if _order_ready_for_driver_accept(order):
        _notify_ws(f'order_{order.pk}', 'coords_set', coords_payload)
        _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': order.status})
        try:
            from julmin_taxis.notify import notify_coords_set_event
            notify_coords_set_event(order)
        except Exception:
            pass
        html = (
            f'<div style="padding:10px 14px;background:rgba(16,185,129,0.1);border:1px solid rgba(16,185,129,0.3);border-radius:10px;color:#10b981;font-size:12px;font-weight:700;">'
            f'<i class="ri-check-line"></i> Coordonnées enregistrées — vous pouvez démarrer la course</div>'
        )
        if is_admin:
            return _htmx_success('Coordonnées enregistrées')
        return HttpResponse(html, content_type='text/html')

        return HttpResponse(html, content_type='text/html')

    _notify_ws(f'order_{order.pk}', 'coords_set', {
        'order_id': order.pk,
        'pickup_lat': order.pickup_lat,
        'pickup_lng': order.pickup_lng,
        'destination_lat': order.destination_lat,
        'destination_lng': order.destination_lng,
    })
    try:
        from julmin_taxis.notify import notify_coords_set_event
        notify_coords_set_event(order)
    except Exception:
        pass
    return _htmx_success('Coordonnées enregistrées — le moteur tarifaire n\'a pas pu calculer de prix automatiquement')


                                                                                 
                            
                                                                                 

def driver_update_online_status(request):
    """POST /htmx/driver/status/ — hors ligne manuel ; disponible/occupé = système."""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    session = (request.POST.get('session') or '').strip().lower()
    requested = (request.POST.get('status') or '').strip().lower()
    label_map = {'available': 'Disponible', 'offline': 'Hors ligne', 'busy': 'Occupé'}

    from julmin_taxis.driver_presence import open_driver_online_status, sync_driver_status_from_orders

    if session == 'close' or requested == 'offline':
        new_status = 'offline'
        driver.status = new_status
        driver.status_updated_at = timezone.now()
        driver.save(update_fields=['status', 'status_updated_at'])
    elif session == 'open':
        new_status = open_driver_online_status(driver)
    elif session == 'sync' or requested in ('available', 'busy'):
        new_status = sync_driver_status_from_orders(driver)
    else:
        return _htmx_error('Statut invalide')

    driver_name = driver.get_full_name() or driver.phone or driver.email or f'Chauffeur #{driver.pk}'
    _notify_ws('admin', 'driver_status_changed', {
        'driver_id': driver.pk,
        'driver_name': driver_name,
        'status': new_status,
    })

    wants_json = (
        session in ('open', 'close', 'sync')
        or 'application/json' in request.headers.get('Accept', '')
        or request.POST.get('format') == 'json'
    )
    if wants_json:
        return JsonResponse({
            'status': new_status,
            'label': label_map.get(new_status, new_status),
        })

    return render(request, 'htmx/driver_status_badge.html', {
        'status': new_status,
        'label': label_map.get(new_status, new_status),
        'driver': driver,
    })


def driver_update_location(request):
    """POST /htmx/driver/location/ — update GPS position."""
    from julmin_taxis.gps_trace import gps_trace

    driver = _get_current_driver(request)
    if not driver:
        gps_trace('BACKEND', 'BACKEND_DRIVER_UPDATE_LOCATION_REJECT', ok=False, reason='unauthorized')
        return JsonResponse({'error': 'Non autorisé'}, status=401)

    lat_raw = request.POST.get('lat', '')
    lng_raw = request.POST.get('lng', '')
    gps_trace(
        'BACKEND',
        'BACKEND_DRIVER_UPDATE_LOCATION_RECEIVED',
        driver_id=driver.pk,
        lat=lat_raw,
        lng=lng_raw,
        channel='http',
    )

    try:
        lat = float(lat_raw or 0)
        lng = float(lng_raw or 0)
    except ValueError:
        gps_trace('BACKEND', 'BACKEND_DRIVER_UPDATE_LOCATION_REJECT', ok=False, driver_id=driver.pk, reason='invalid_coordinates')
        return JsonResponse({'error': 'Coordonnées invalides'}, status=400)

    if not (-90 <= lat <= 90 and -180 <= lng <= 180):
        gps_trace('BACKEND', 'BACKEND_DRIVER_UPDATE_LOCATION_REJECT', ok=False, driver_id=driver.pk, reason='out_of_bounds', lat=lat, lng=lng)
        return JsonResponse({'error': 'Coordonnées hors limites'}, status=400)

    from julmin_taxis.gps_antispoof import validate_driver_gps
    speed_raw = request.POST.get('speed')
    speed_ms = None
    if speed_raw:
        try:
            speed_ms = float(speed_raw)
        except (TypeError, ValueError):
            speed_ms = None
    ok, gps_reason, trust = validate_driver_gps(driver.pk, lat, lng, speed_ms)
    if not ok:
        gps_trace(
            'BACKEND',
            'BACKEND_VALIDATE_DRIVER_GPS_REJECT',
            ok=False,
            driver_id=driver.pk,
            lat=lat,
            lng=lng,
            reason=gps_reason,
            trust=trust,
        )
        from julmin_taxis.security_audit import log_security_event
        log_security_event(
            'ACCESS_DENIED',
            request=request,
            metadata={
                'resource': 'driver_gps',
                'reason': gps_reason,
                'driver_id': driver.pk,
                'trust_score': trust,
            },
            actor_type='driver',
            actor_id=str(driver.pk),
        )
        return JsonResponse({'error': 'Position GPS rejetée (mouvement impossible).', 'trust': trust}, status=400)

    gps_trace(
        'BACKEND',
        'BACKEND_VALIDATE_DRIVER_GPS_OK',
        driver_id=driver.pk,
        lat=lat,
        lng=lng,
        trust=trust,
    )

    driver.latitude = lat
    driver.longitude = lng
    from julmin_taxis.driver_presence import touch_driver_location_seen
    touch_driver_location_seen(driver, save=False)
    driver.save(update_fields=['latitude', 'longitude', 'location_updated_at', 'last_seen_at'])
    gps_trace(
        'BACKEND',
        'BACKEND_DRIVER_UPDATE_LOCATION_SAVED',
        driver_id=driver.pk,
        lat=lat,
        lng=lng,
        location_updated_at=driver.location_updated_at.isoformat() if driver.location_updated_at else None,
    )

    try:
        from julmin_taxis.scheduled_tasks import run_scheduled_order_tasks
        run_scheduled_order_tasks()
    except Exception:
        pass

    danger_hits = []
    emitted = []
                                     
    active_order = driver.orders.filter(
        status__in=['driver_assigned', 'on_way', 'arrived', 'in_progress']
    ).first()
    if active_order:
        from julmin_taxis.driver_gps_utils import driver_location_payload
        payload = driver_location_payload(lat, lng, driver.pk, active_order.pk)
        _notify_ws(f'order_{active_order.pk}', 'driver_location', payload)
        _notify_ws('admin_orders', 'driver_location', payload)
        gps_trace(
            'BACKEND',
            'BACKEND_WS_BROADCAST_DRIVER_LOCATION',
            driver_id=driver.pk,
            order_id=active_order.pk,
            lat=lat,
            lng=lng,
            groups=['order_' + str(active_order.pk), 'admin_orders'],
            channel='http_path',
        )

                                                          
        if active_order.is_extended and active_order.extension_start_lat and active_order.extra_km_rate:
            from decimal import Decimal as _D
            km_extra = _haversine_km(
                active_order.extension_start_lat, active_order.extension_start_lng,
                lat, lng
            )
            km_extra = max(0.0, km_extra)
            new_extra_price = (_D(str(active_order.extra_km_rate)) * _D(str(round(km_extra, 3)))).quantize(_D('0.01'))
            if new_extra_price != (active_order.extra_km_price or _D('0')):
                active_order.extra_km_price = new_extra_price
                active_order.save(update_fields=['extra_km_price'])
                _broadcast_price_update(active_order)

                                 
        elif active_order.is_paused:
            _broadcast_price_update(active_order)

        from pricing.zone_alerts import process_order_zone_alerts
        nearby, emitted = process_order_zone_alerts(active_order, lat, lng)
        danger_hits = nearby

    return JsonResponse({
        'ok': True,
        'danger': any(h.get('is_danger') for h in danger_hits),
        'zones': danger_hits[:3],
        'alerts': emitted,
    })


                                                                                 
                   
                                                                                 

def driver_calendar(request):
    """GET /htmx/driver/calendar/?year=&month="""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    now = timezone.now()
    try:
        year = int(request.GET.get('year', now.year))
        month = int(request.GET.get('month', now.month))
    except ValueError:
        year, month = now.year, now.month

    if month < 1:
        month = 12; year -= 1
    elif month > 12:
        month = 1; year += 1

    from datetime import date as date_type
    from julmin_taxis.calendar_utils import (
        build_calendar_day_data,
        calendar_month_order_qs,
        format_calendar_date_fr,
        orders_on_calendar_day,
    )

    month_start = date_type(year, month, 1)
    month_end = date_type(year + 1, 1, 1) if month == 12 else date_type(year, month + 1, 1)

    driver_orders = calendar_month_order_qs(
        Order.objects.filter(driver=driver),
        year,
        month,
    )
    day_data = build_calendar_day_data(driver_orders, year, month)

    raw_weeks = monthcalendar(year, month)
    weeks_data = []
    for week in raw_weeks:
        week_row = []
        for day in week:
            week_row.append({
                'day': day,
                'info': day_data.get(day) if day != 0 else None,
                'is_today': (day != 0 and day == now.day and month == now.month and year == now.year),
                'date_str': f'{year}-{month:02d}-{day:02d}' if day != 0 else '',
            })
        weeks_data.append(week_row)

    return render(request, 'htmx/driver_calendar.html', {
        'year': year,
        'month': month,
        'month_name': FRENCH_MONTH_NAMES[month],
        'weeks_data': weeks_data,
        'today': now.date(),
        'prev_year': year if month > 1 else year - 1,
        'prev_month': month - 1 if month > 1 else 12,
        'next_year': year if month < 12 else year + 1,
        'next_month': month + 1 if month < 12 else 1,
        'driver': driver,
    })


def driver_calendar_day(request):
    """GET /htmx/driver/calendar/day/?date=YYYY-MM-DD"""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    from julmin_taxis.calendar_utils import format_calendar_date_fr, orders_on_calendar_day

    date_str = request.GET.get('date', '')
    try:
        selected_date = datetime.strptime(date_str, '%Y-%m-%d').date()
    except ValueError:
        selected_date = timezone.now().date()

    orders = orders_on_calendar_day(
        Order.objects.filter(driver=driver),
        selected_date,
    )
    orders.sort(key=lambda o: (o.time is None, o.time or datetime.min.time(), o.created_at))
    return render(request, 'htmx/driver_calendar_day.html', {
        'orders': [_order_to_dict(o, for_driver=True, request=request) for o in orders],
        'date': selected_date,
        'date_display': format_calendar_date_fr(selected_date),
        'is_today': selected_date == timezone.localdate(),
        'day_url': f'/htmx/driver/calendar/day/?date={selected_date.isoformat()}',
    })


def driver_calendar_order_detail(request, order_id):
    """GET /htmx/driver/calendar/order/<id>/ — détail course pour le calendrier chauffeur."""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    order = Order.objects.filter(pk=order_id, driver=driver).select_related('driver', 'user').first()
    if not order:
        from django.http import HttpResponse
        return HttpResponse(
            '<p class="drv-cal-day__empty">Commande introuvable.</p>',
            status=404,
        )

    return render(request, 'htmx/driver_calendar_order_detail.html', {
        'o': _order_to_dict(order, for_driver=True, request=request),
    })


                                                                                 
                  
                                                                                 

def driver_profile(request):
    """GET /htmx/driver/profile/"""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    reviews = DriverReview.objects.filter(driver=driver).order_by('-created_at')[:10]
    return render(request, 'htmx/driver_profile.html', {
        'driver': driver,
        'reviews': reviews,
    })


def driver_stats(request):
    """GET /htmx/driver/stats/  → JSON stats for the current driver."""
    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'error': 'not_authenticated'}, status=401)

    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start  = today_start - timedelta(days=7)
    month_start = today_start.replace(day=1)

    completed_qs = Order.objects.filter(driver=driver, status='completed')

    today_qs  = completed_qs.filter(completed_at__gte=today_start)
    week_qs   = completed_qs.filter(completed_at__gte=week_start)
    month_qs  = completed_qs.filter(completed_at__gte=month_start)

    def _sum(qs):
        val = qs.aggregate(s=Sum('price'))['s']
        return float(val) if val else 0.0

    data = {
        'today_trips':    today_qs.count(),
        'week_trips':     week_qs.count(),
        'month_trips':    month_qs.count(),
        'total_trips':    completed_qs.count(),
        'today_earnings': _sum(today_qs),
        'week_earnings':  _sum(week_qs),
        'month_earnings': _sum(month_qs),
        'total_earnings': _sum(completed_qs),
        'rating': round(float(driver.rating), 1) if (driver.rating_count or 0) > 0 else None,
        'rating_count': driver.rating_count or 0,
    }
    return JsonResponse(data)


def driver_active_order(request):
    """GET /htmx/driver/active-order/ — course active du chauffeur (JSON fiable au boot)."""
    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'error': 'not_authenticated'}, status=401)

    priority = ('in_progress', 'waiting_return', 'on_way', 'arrived', 'driver_assigned')
    qs = Order.objects.filter(
        driver=driver,
        status__in=list(priority) + ['price_confirmed', 'price_proposed'],
    ).select_related('enterprise', 'driver', 'user', 'coords_placed_by').order_by('-created_at')[:10]

    orders = list(qs)
    if not orders:
        return JsonResponse({'order': None, 'accepted_count': 0})

    def _prio(o):
        try:
            return priority.index(o.status)
        except ValueError:
            return len(priority)

    orders.sort(key=_prio)
    od = _order_to_dict(orders[0], for_driver=True, request=request)
    return JsonResponse({
        'order': od,
        'accepted_count': len(orders),
        'return_recall_orders': _driver_return_recall_orders(driver),
    })


                                                                                 
                                      
                                                                                 


def _client_payment_complete_response(request, order, payment_method):
    """After payment is confirmed — ask guest phone last if missing, else show order card."""
    od = _order_to_dict(order)
    if not request.user.is_authenticated and not (order.client_phone or '').strip():
        return render(request, 'htmx/guest_phone_prompt.html', {
            'order': od,
            'next_step': 'post_payment',
            'payment_method': payment_method,
        })
    return _render_client_sheet_fragment(request, order)


def _get_order_for_client(request, order_id):
    """Return (order, error_response) for a client-owned order."""
    from julmin_taxis.security_utils import normalize_guest_id, guest_ids_match
    user = getattr(request, 'user', None)
    is_auth_client = bool(user and user.is_authenticated)
    try:
        oid = int(order_id)
        guest_id = normalize_guest_id(
            request.POST.get('guest_id', '')
            or request.GET.get('guest_id', '')
            or request.session.get('guest_id', '')
        )
        if guest_id:
            request.session['guest_id'] = guest_id

        if is_auth_client:
            try:
                return Order.objects.get(pk=oid, user=user), None
            except Order.DoesNotExist:
                pass

        if guest_id:
            try:
                order = Order.objects.get(pk=oid, user__isnull=True)
            except Order.DoesNotExist:
                return None, _htmx_error('Commande introuvable')
            if guest_ids_match(order.guest_id, guest_id):
                return order, None
            return None, _htmx_error('Commande introuvable')

        if request.session.get('driver_id') and not is_auth_client:
            return None, _htmx_error('Non autorisé.')
        return None, _htmx_error('Session expirée.')
    except (Order.DoesNotExist, ValueError):
        return None, _htmx_error('Commande introuvable')


def client_payment_init(request, order_id):
    """POST /htmx/client/orders/<id>/payment/init/
    Body: method = card | in_person
    - card: redirects to Transak card payment page
    - in_person: marks payment_method and notifies driver/admin
    """
    if request.method != 'POST':
        return HttpResponse('Method not allowed', status=405)

    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    if request.POST.get('contract_accepted') != '1':
        return _htmx_error('Veuillez accepter le contrat de service pour continuer.')

    order.contract_accepted_at = timezone.now()
    order.save(update_fields=['contract_accepted_at'])

    if order.status != 'price_confirmed':
        return _htmx_error('Aucun paiement requis pour cette commande.')

    method = request.POST.get('method', '').strip()
    if method not in ('card', 'in_person', 'moncash'):
        return _htmx_error('Méthode de paiement invalide.')

    if method == 'in_person':
        from julmin_taxis.presence import mark_order_client_action
        mark_order_client_action(order, 'payment_confirmed')
        order.payment_method = 'in_person'
        order.payment_status = 'in_person'
        order.save(update_fields=['payment_method', 'payment_status'])
        _cancel_unpaid_sibling_orders(order)
        _advance_to_driver_notified(order)
        return _client_payment_complete_response(request, order, 'in_person')

    if method == 'moncash':
        if not order.price:
            return _htmx_error('Prix non défini.')
        from julmin_taxis.payments import moncash_connect
        if not moncash_connect.is_configured():
            return _htmx_error('MonCash temporairement indisponible — contactez le support.')

        from django.conf import settings as _s
        site_url = getattr(_s, 'SITE_URL', 'http://localhost:8000').rstrip('/')
        guest_param = f'&guest_id={order.guest_id}' if order.guest_id else ''
        return_url = f'{site_url}/payment/{order.pk}/moncash/return/?{guest_param.lstrip("&")}'
        ref = moncash_connect.order_reference(order.pk)
        amount_htg = usd_to_htg(order.price)

        try:
            payment = moncash_connect.create_payment(
                amount_htg=amount_htg,
                reference_id=ref,
                return_url=return_url,
                customer_name=(order.client_name or '').strip(),
                customer_email=(order.client_email or '').strip(),
                idempotency_key=ref,
            )
        except moncash_connect.MonCashConnectError as exc:
            return _htmx_error(f'MonCash : {exc}')

        order.payment_method = 'moncash'
        order.payment_status = 'pending'
        order.nowpayments_invoice_id = ref
        order.save(update_fields=['payment_method', 'payment_status', 'nowpayments_invoice_id'])

        payment_url = payment.get('paymentUrl', '')
        if not payment_url:
            return _htmx_error('URL de paiement MonCash indisponible.')
        return HttpResponse(
            f'<script>window.location.href = {json.dumps(payment_url)};</script>',
            content_type='text/html',
        )

                                                    
    if not order.price:
        return _htmx_error('Prix non défini.')

    order.payment_method = 'card'
    order.payment_status = 'pending'
    order.nowpayments_invoice_id = f'daxi-{order.pk}'
    order.save(update_fields=['payment_method', 'payment_status', 'nowpayments_invoice_id'])

    guest_param = f'?guest_id={order.guest_id}' if order.guest_id else ''
    card_url = f'/payment/{order.pk}/card/{guest_param}'
    return HttpResponse(
        '<script>(function(){'
        f'var u={json.dumps(card_url)}, id={order.pk};'
        'if(window._daxiOpenCardPayment){window._daxiOpenCardPayment(u,id);}'
        'else{window.location.href=u;}'
        '})();</script>',
        content_type='text/html',
    )


def client_payment_contract_ack(request, order_id):
    """POST — enregistre l'acceptation du contrat (flux carte)."""
    if request.method != 'POST':
        return HttpResponse('Method not allowed', status=405)
    order, err = _get_order_for_client(request, order_id)
    if err:
        return err
    if request.POST.get('contract_accepted') != '1':
        return _htmx_error('Contrat non accepté.')
    order.contract_accepted_at = timezone.now()
    order.save(update_fields=['contract_accepted_at'])
    return HttpResponse('', content_type='text/html')


def client_debt_pay(request):
    """POST — lance MonCash pour régler une dette client."""
    if request.method != 'POST':
        return HttpResponse('Method not allowed', status=405)
    from orders.models import ClientPaymentDebt
    from julmin_taxis.client_debt import get_unpaid_debt, is_enforceable_debt
    from julmin_taxis.payments import moncash_connect

    debt_id = request.POST.get('debt_id', '').strip()
    debt = None
    if debt_id:
        try:
            debt = ClientPaymentDebt.objects.select_related('order').get(
                pk=int(debt_id), is_paid=False
            )
        except (ClientPaymentDebt.DoesNotExist, ValueError):
            debt = None
        if debt and not is_enforceable_debt(debt, request):
            debt = None
    if not debt:
        debt = get_unpaid_debt(request)
    if not debt:
        return HttpResponse(
            '<div style="padding:12px;color:#86efac;text-align:center;">Aucune dette en cours.</div>',
            content_type='text/html',
        )

    if not moncash_connect.is_configured():
        return _htmx_error('MonCash indisponible — contactez le support.')

    from django.conf import settings as _s
    site_url = getattr(_s, 'SITE_URL', 'http://localhost:8000').rstrip('/')
    ref = f'daxi-debt-{debt.pk}'
    return_url = f'{site_url}/payment/debt/{debt.pk}/moncash/return/'
    amount_htg = usd_to_htg(debt.amount_usd)
    try:
        payment = moncash_connect.create_payment(
            amount_htg=amount_htg,
            reference_id=ref,
            return_url=return_url,
            customer_name='Client DAXI',
            customer_email='',
            idempotency_key=ref,
        )
    except moncash_connect.MonCashConnectError as exc:
        return _htmx_error(f'MonCash : {exc}')

    debt.payment_reference = ref
    debt.save(update_fields=['payment_reference'])
    payment_url = payment.get('paymentUrl', '')
    if not payment_url:
        return _htmx_error('URL MonCash indisponible.')
    return HttpResponse(
        f'<script>window.location.href = {json.dumps(payment_url)};</script>',
        content_type='text/html',
    )


def client_payment_status(request, order_id):
    """GET /htmx/client/orders/<id>/payment/status/
    Returns current payment status from Django DB (Transak webhook marks orders paid).
    """
    order, err = _get_order_for_client(request, order_id)
    if err:
        return JsonResponse({'status': 'error'}, status=400)

    order.refresh_from_db(fields=['payment_status', 'payment_method', 'status'])

    if order.payment_status == 'paid':
        return JsonResponse({'status': 'paid'})
    if order.payment_status == 'in_person':
        return JsonResponse({'status': 'in_person'})

    return JsonResponse({'status': order.payment_status or 'pending'})


def _cancel_unpaid_sibling_orders(order):
    """Annule les autres commandes impayées du même client (doublons abandonnés)."""
    if not _order_payment_confirmed(order):
        return
    qs = Order.objects.filter(
        status='price_confirmed',
        driver__isnull=True,
    ).exclude(pk=order.pk).exclude(payment_status__in=['paid', 'in_person'])
    if order.user_id:
        qs = qs.filter(user_id=order.user_id)
    elif order.guest_id:
        qs = qs.filter(guest_id=order.guest_id)
    else:
        return
    for stale in qs:
        stale.status = 'cancelled'
        stale.save(update_fields=['status'])
        _notify_ws('admin', 'order_updated', {'order_id': stale.pk, 'status': 'cancelled'})


def _advance_to_driver_notified(order):
    """Payment confirmed — notify drivers but keep status until a driver accepts."""
    import logging
    log = logging.getLogger(__name__)

    if order.status != 'price_confirmed':
        log.info('[Daxi] skip driver notify #%s — status=%s', order.pk, order.status)
        return
    if not _order_payment_confirmed(order):
        log.info('[Daxi] skip driver notify #%s — payment not confirmed (%s)', order.pk, order.payment_status)
        return

    from django.core.cache import cache
    notify_key = f'daxi_drivers_notified:{order.pk}'
    if cache.get(notify_key):
        return
    if not cache.add(f'{notify_key}:lock', 1, timeout=300):
        return

    pm = (order.payment_method or '').strip()
    if pm == 'in_person':
        admin_note = 'Paiement au chauffeur — course confirmée'
    elif pm == 'moncash':
        admin_note = 'MonCash confirmé — recherche chauffeur'
    else:
        admin_note = 'Paiement confirmé'

    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': order.status,
                                           'note': admin_note})
    if pm in ('card', 'moncash'):
        _notify_ws(f'order_{order.pk}', 'payment_confirmed', {
            'order_id': order.pk,
            'payment_method': pm,
        })
    elif pm == 'in_person':
        _notify_ws(f'order_{order.pk}', 'payment_cash_confirmed', {
            'order_id': order.pk,
            'payment_method': pm,
            'message': 'Vous paierez le chauffeur en espèces. Recherche d\'un chauffeur en cours.',
        })
    try:
        from julmin_taxis.notify import notify_payment_ready_for_drivers
        notify_payment_ready_for_drivers(order)
    except Exception:
        pass

    try:
        available_drivers = Driver.objects.filter(status='available', is_blocked=False).values_list('pk', flat=True)
        payload = {
            'order_id': order.pk,
            'pickup': order.pickup,
            'destination': order.destination,
            'price': float(order.price) if order.price else None,
        }
        for did in available_drivers:
            _notify_ws(f'driver_{did}', 'new_order', payload)
    except Exception as exc:
        log.warning('Driver WS broadcast failed order #%s: %s', order.pk, exc)

    order_pk = order.pk

    try:
        from julmin_taxis.notify import notify_drivers_new_order_now
        wa_sent = notify_drivers_new_order_now(order) or 0
        if wa_sent > 0:
            cache.set(notify_key, True, timeout=86400 * 7)
            log.info('[Daxi] WhatsApp nouvelle_commande #%s → %s chauffeur(s)', order_pk, wa_sent)
        else:
            cache.delete(f'{notify_key}:lock')
            log.error(
                '[Daxi] Aucun WhatsApp chauffeur pour #%s — template Meta ou numéros invalides. '
                'Vérifiez les logs [WhatsApp] puis: python manage.py resend_driver_whatsapp %s --force',
                order_pk, order_pk,
            )
            try:
                from julmin_taxis.notify import push_notify_admin
                push_notify_admin(
                    'wa_failed',
                    body=f'Cmd #{order_pk}: aucun WhatsApp chauffeur (token Meta ?)',
                    extra_data={'order_id': str(order_pk)},
                )
            except Exception:
                pass
    except Exception as exc:
        log.warning('[Daxi] WhatsApp driver notify failed order #%s: %s', order_pk, exc)


                                                                                 
                    
                                                                                 

                                                                                 
                                                                                 
                                                                                 

                                                                         
_transak_token_cache: dict = {}


def _transak_get_access_token():
    """Return a valid Transak partner access token (7-day JWT, auto-refreshes)."""
    import time
    from django.conf import settings as _s

    now = time.time()
    cached = _transak_token_cache
    if cached.get('token') and cached.get('expires_at', 0) > now + 300:
        return cached['token']

    api_key    = getattr(_s, 'TRANSAK_API_KEY', '')
    api_secret = getattr(_s, 'TRANSAK_API_SECRET', '')
    env        = getattr(_s, 'TRANSAK_ENVIRONMENT', 'STAGING')

    base = 'https://api-stg.transak.com' if env == 'STAGING' else 'https://api.transak.com'
    resp = requests.post(
        f'{base}/partners/api/v2/refresh-token',
        headers={'api-secret': api_secret, 'Content-Type': 'application/json'},
        json={'apiKey': api_key},
        timeout=15,
    )
    resp.raise_for_status()
    token = resp.json()['data']['accessToken']
    expires_at = resp.json()['data'].get('expiresAt', now + 7 * 86400)
    _transak_token_cache['token'] = token
    _transak_token_cache['expires_at'] = expires_at
    return token


def card_payment_page(request, order_id):
    """GET /payment/<order_id>/card/
    Generates a Transak widget URL (backend-only) and redirects the client.
    Client sees a card payment page — Transak is invisible in the flow.
    """
    from django.conf import settings as _s
    from django.shortcuts import redirect as _redir

               
    try:
        if request.user.is_authenticated:
            order = Order.objects.get(pk=int(order_id), user=request.user)
        else:
            guest_id = request.GET.get('guest_id', '')
            if not guest_id:
                return _redir('/?error=session_expired')
            order = Order.objects.get(pk=int(order_id), guest_id=guest_id, user__isnull=True)
    except (Order.DoesNotExist, ValueError):
        return _redir('/?error=order_not_found')

    if order.payment_status == 'paid':
        return _redir('/?payment=already_paid')

    if order.status != 'price_confirmed':
        return _redir('/?error=payment_unavailable')

    env            = getattr(_s, 'TRANSAK_ENVIRONMENT', 'STAGING')
    api_key        = getattr(_s, 'TRANSAK_API_KEY', '')
    wallet_address = getattr(_s, 'TRANSAK_WALLET_ADDRESS', '')
    site_url       = getattr(_s, 'SITE_URL', 'http://localhost:8000')

                                             
    if not wallet_address:
        if env == 'STAGING':
            wallet_address = 'TXkbNijqFnosYQAvHZWBnUwvjPQHDSjQ2N'                       
        else:
            return render(request, 'payment/card_payment_error.html', {
                'message': 'La configuration du système de paiement est incomplète. Contactez le support Daxi.'
            })

    gateway_base   = 'https://api-gateway-stg.transak.com' if env == 'STAGING' else 'https://api-gateway.transak.com'
    widget_base    = 'https://global-stg.transak.com'      if env == 'STAGING' else 'https://global.transak.com'

    common_params = {
        'apiKey':                   api_key,
        'defaultFiatAmount':        float(order.price),
        'fiatCurrency':             'USD',
        'cryptoCurrencyCode':       'USDT',
        'network':                  'tron',
        'walletAddress':            wallet_address,
        'disableWalletAddressForm': 'true',
        'defaultPaymentMethod':     'credit_debit_card',
        'partnerOrderId':           str(order.pk),
        'redirectURL':              f'{site_url}/?payment=success&order_id={order.pk}',
        'themeColor':               'f59e0b',
        'hideMenu':                 'true',
    }

                                                                              
    widget_url = None
    try:
        access_token = _transak_get_access_token()
        resp = requests.post(
            f'{gateway_base}/api/v2/auth/session',
            headers={'access-token': access_token, 'Content-Type': 'application/json'},
            json={'widgetParams': {**common_params,
                                   'referrerDomain': site_url.replace('https://', '').replace('http://', '').split('/')[0],
                                   'disableWalletAddressForm': True,
                                   'hideMenu': True}},
            timeout=15,
        )
        if resp.status_code == 200:
            widget_url = resp.json().get('data', {}).get('widgetUrl')
        else:
            import logging as _log
            _log.getLogger(__name__).warning(
                '[Transak] session API error %s: %s', resp.status_code, resp.text[:300])
    except Exception as _exc:
        import logging as _log
        _log.getLogger(__name__).warning('[Transak] session API failed: %s', _exc)

                                                                               
    if not widget_url:
        import urllib.parse as _up
        widget_url = f"{widget_base}?{_up.urlencode(common_params)}"

    order.payment_method = 'card'
    order.nowpayments_invoice_id = str(order.pk)
    order.save(update_fields=['payment_method', 'nowpayments_invoice_id'])

    from django.shortcuts import redirect as _redir2
    return _redir2(widget_url)


def transak_webhook(request):
    """POST /htmx/payment/transak/webhook/
    Transak sends ORDER_COMPLETED (and other events) as a JWT-signed payload.
    We verify with access_token, then mark the order paid.
    """
    if request.method != 'POST':
        return HttpResponse('OK', status=200)

    try:
        body = json.loads(request.body)
        jwt_data = body.get('data', '')
    except Exception:
        return HttpResponse('Bad request', status=400)

    if not jwt_data:
        return HttpResponse('OK', status=200)

    try:
        import jwt as _pyjwt
        access_token = _transak_get_access_token()
        decoded = _pyjwt.decode(jwt_data, access_token, algorithms=['HS256'])
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).warning('[Transak] webhook verify failed: %s', exc)
        return HttpResponse('OK', status=200)

    event_id     = decoded.get('eventID', '')
    webhook_data = decoded.get('webhookData', {})

    if event_id != 'ORDER_COMPLETED':
        return HttpResponse('OK', status=200)

    partner_order_id = webhook_data.get('partnerOrderId', '')
    transak_order_id = webhook_data.get('id', '')

    if not partner_order_id:
        return HttpResponse('OK', status=200)

    try:
        order = Order.objects.get(pk=int(partner_order_id))
        from julmin_taxis.payment_security import mark_order_paid
        if mark_order_paid(order, 'card', transak_order_id, source='transak_webhook', request=request):
            _advance_to_driver_notified(order)
    except (Order.DoesNotExist, ValueError):
        pass

    return HttpResponse('OK', status=200)


def client_with_driver(request, order_id):
    """POST /htmx/client/orders/<id>/client-with-driver/
    Client confirms they are physically with the driver. Sets status to in_progress.
    """
    if request.method != 'POST':
        return HttpResponse('Method not allowed', status=405)

    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    if order.status not in ('driver_assigned', 'on_way', 'arrived'):
        return _htmx_error('Action non disponible pour cette commande.')

    order.update_status('in_progress')
    _notify_ws(f'order_{order.pk}', 'in_progress', {'order_id': order.pk})
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'in_progress'})
    if order.driver:
        _notify_ws(f'driver_{order.driver.pk}', 'order_updated', {
            'order_id': order.pk, 'status': 'in_progress'
        })
    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, 'in_progress')
    except Exception:
        pass
    return HttpResponse('', status=200)


                                                                                 
                                         
                                                                                 

def _haversine_km(lat1, lon1, lat2, lon2):
    """Return distance in km between two GPS points."""
    import math
    R = 6371.0
    φ1, φ2 = math.radians(lat1), math.radians(lat2)
    Δφ = math.radians(lat2 - lat1)
    Δλ = math.radians(lon2 - lon1)
    a = math.sin(Δφ/2)**2 + math.cos(φ1)*math.cos(φ2)*math.sin(Δλ/2)**2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _broadcast_price_update(order):
    """Compute total extra price and broadcast to order WS channel."""
    from decimal import Decimal as _D
    base_price = order.price or _D('0')
    extra_km   = order.extra_km_price or _D('0')
    pause_p    = order.pause_price    or _D('0')

                                              
    if order.is_paused and order.pause_started_at and order.pause_rate_snapshot:
        from django.utils import timezone as _tz
        elapsed = (_tz.now() - order.pause_started_at).total_seconds()
        total_secs = (order.pause_accumulated_seconds or 0) + elapsed
        intervals = total_secs / 300             
        pause_p = (_D(str(order.pause_rate_snapshot)) * _D(str(intervals))).quantize(_D('0.01'))

    total = (base_price + extra_km + pause_p).quantize(_D('0.01'))
    _notify_ws(f'order_{order.pk}', 'price_updated', {
        'order_id':    order.pk,
        'base':        str(base_price),
        'extra_km':    str(extra_km),
        'pause':       str(pause_p),
        'total':       str(total),
        'is_extended': order.is_extended,
        'is_paused':   order.is_paused,
    })
    return total


def driver_extend_trip(request, order_id):
    """POST /htmx/driver/orders/<id>/extend/
    Driver clicks "Continuer" beyond original destination.
    Sets extension mode — subsequent GPS updates will accumulate extra_km_price.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'error': 'Non autorisé'}, status=401)

    try:
        order = Order.objects.get(pk=int(order_id), driver=driver, status='in_progress')
    except (Order.DoesNotExist, ValueError):
        return JsonResponse({'error': 'Commande introuvable'}, status=404)

    if order.is_extended:
        return JsonResponse({'ok': True, 'already': True})

    from orders.models import SystemConfig
    config = SystemConfig.get()

    order.is_extended = True
    order.extension_start_lat = driver.latitude
    order.extension_start_lng = driver.longitude
    order.extra_km_price = 0
    order.extra_km_rate = config.extra_km_rate
    order.save(update_fields=['is_extended', 'extension_start_lat', 'extension_start_lng',
                               'extra_km_price', 'extra_km_rate'])

                                           
    _notify_ws(f'order_{order.pk}', 'trip_extended', {
        'order_id': order.pk,
        'message': "Le chauffeur continue la course au-delà de la destination initiale. Le prix va augmenter.",
        'rate_per_km': str(config.extra_km_rate),
    })
    try:
        from julmin_taxis.notify import notify_trip_extended
        notify_trip_extended(order)
    except Exception:
        pass
    _broadcast_price_update(order)
    return JsonResponse({'ok': True})


def driver_pause_trip(request, order_id):
    """POST /htmx/driver/orders/<id>/pause/
    Driver pauses — client is making an unplanned stop. Timer starts.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'error': 'Non autorisé'}, status=401)

    try:
        order = Order.objects.get(pk=int(order_id), driver=driver, status='in_progress')
    except (Order.DoesNotExist, ValueError):
        return JsonResponse({'error': 'Commande introuvable'}, status=404)

    if order.is_paused:
        return JsonResponse({'ok': True, 'already': True})

    from django.utils import timezone as _tz
    from julmin_taxis.pricing_rates import get_pause_rate_per_5min
    pause_rate = get_pause_rate_per_5min()

    order.is_paused = True
    order.pause_started_at = _tz.now()
    order.pause_rate_snapshot = pause_rate
    order.save(update_fields=['is_paused', 'pause_started_at', 'pause_rate_snapshot'])

    _notify_ws(f'order_{order.pk}', 'trip_paused', {
        'order_id': order.pk,
        'message': "Le chauffeur attend — des frais d'attente s'appliquent.",
        'rate_per_5min': str(pause_rate),
        'started_at': order.pause_started_at.isoformat(),
    })
    try:
        from julmin_taxis.notify import notify_trip_paused
        notify_trip_paused(order, rate_per_5min=pause_rate)
    except Exception:
        pass
    _broadcast_price_update(order)
    return JsonResponse({
        'ok': True,
        'started_at': order.pause_started_at.isoformat(),
        'rate_per_5min': str(pause_rate),
    })


def driver_resume_trip(request, order_id):
    """POST /htmx/driver/orders/<id>/resume/
    Driver resumes — stop the pause timer, lock in accumulated pause price.
    """
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)

    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'error': 'Non autorisé'}, status=401)

    try:
        order = Order.objects.get(pk=int(order_id), driver=driver, status='in_progress')
    except (Order.DoesNotExist, ValueError):
        return JsonResponse({'error': 'Commande introuvable'}, status=404)

    if not order.is_paused:
        return JsonResponse({'ok': True, 'already': True})

    from decimal import Decimal as _D
    from django.utils import timezone as _tz

    elapsed = (_tz.now() - order.pause_started_at).total_seconds()
    total_secs = (order.pause_accumulated_seconds or 0) + elapsed
    intervals = total_secs / 300
    pause_price = (_D(str(order.pause_rate_snapshot)) * _D(str(intervals))).quantize(_D('0.01'))

    order.is_paused = False
    order.pause_accumulated_seconds = int(total_secs)
    order.pause_price = pause_price
    order.pause_started_at = None
    order.save(update_fields=['is_paused', 'pause_accumulated_seconds', 'pause_price', 'pause_started_at'])

    _notify_ws(f'order_{order.pk}', 'trip_resumed', {
        'order_id': order.pk,
        'pause_price': str(pause_price),
        'pause_minutes': round(total_secs / 60, 1),
    })
    try:
        from julmin_taxis.notify import notify_trip_resumed
        notify_trip_resumed(order)
    except Exception:
        pass
    _broadcast_price_update(order)
    return JsonResponse({'ok': True, 'pause_price': str(pause_price)})


                                                                                 
                    
                                                                                 

def driver_wallet(request):
    """GET /htmx/driver/wallet/
    Returns driver wallet info with real-time balance calculations.
    - Online balance  : wallet_balance (driver's share of online-paid orders)
    - Cash debt       : admin's cut from all completed in-person orders, minus already paid
    """
    driver = _get_current_driver(request)
    if not driver:
        return _htmx_error('Non autorisé.')

    from drivers.models import DriverWalletTransaction
    from orders.models import Order as _Order
    from django.db.models import Sum
    from decimal import Decimal as _D

                                                                                
    total_admin_due, cash_paid_to_admin, cash_owed_to_admin = driver.get_cash_commission_stats()

                                                                               
    online_balance = driver.wallet_balance or _D('0')
    withdrawable_balance = max(_D('0'), online_balance - cash_owed_to_admin)

                                                                               
    pending_withdrawal = DriverWalletTransaction.objects.filter(
        driver=driver,
        transaction_type='withdrawal_request',
    ).exclude(admin_status__in=['paid', 'rejected']).order_by('-created_at').first()

    transactions = DriverWalletTransaction.objects.filter(driver=driver).order_by('-created_at')[:20]

    cash_orders = list(_Order.objects.filter(
        driver=driver,
        payment_method='in_person',
        status='completed',
    ).values('pk', 'price', 'created_at'))

    from julmin_taxis.commission_utils import get_default_driver_commission_rate, commission_admin_deduction
    commission_rate = driver.commission_rate or get_default_driver_commission_rate()
    commission_deduction = commission_admin_deduction(commission_rate)
    moncash_configured = False
    try:
        from julmin_taxis.payments import moncash_connect
        moncash_configured = moncash_connect.is_configured()
    except Exception:
        pass

    return render(request, 'htmx/driver_wallet.html', {
        'driver':             driver,
        'cash_orders':        cash_orders,
        'total_admin_due':    total_admin_due,
        'cash_paid_to_admin': cash_paid_to_admin,
        'cash_owed_to_admin': cash_owed_to_admin,
        'online_balance':     online_balance,
        'withdrawable_balance': withdrawable_balance,
        'pending_withdrawal': pending_withdrawal,
        'transactions':       transactions,
        'commission_rate':    commission_rate,
        'commission_deduction': commission_deduction,
        'moncash_configured': moncash_configured,
    })


def _get_admin_moncash_number():
    """Return the admin MonCash number from settings or DB."""
    from django.conf import settings as _s
    phone = getattr(_s, 'ADMIN_MONCASH_PHONE', '+509 4000-0000')
    return phone


def _admin_moncash_configured():
    phone = _get_admin_moncash_number()
    return phone and phone not in ('+509 4000-0000', '50940000000', '')


def driver_commission_pay_moncash(request):
    """POST /htmx/driver/wallet/pay-commission/ — lance MonCash (même flux que client)."""
    if request.method != 'POST':
        return HttpResponse('', status=405)

    driver = _get_current_driver(request)
    if not driver:
        return _htmx_error('Non autorisé.')

    from drivers.models import DriverCommissionPayment
    from julmin_taxis.payments import moncash_connect
    from julmin_taxis.currency_utils import usd_to_htg
    from decimal import Decimal as _D

    _, _, cash_owed = driver.get_cash_commission_stats()
    if cash_owed <= 0:
        return _htmx_error('Vous n\'avez rien à payer à l\'admin pour le moment.')

    if not moncash_connect.is_configured():
        return _htmx_error('MonCash indisponible — contactez le support Daxi.')

    amount = cash_owed.quantize(_D('0.01'))
    payment = DriverCommissionPayment.objects.create(
        driver=driver,
        amount_usd=amount,
    )
    ref = f'daxi-drvcomm-{payment.pk}'
    payment.payment_reference = ref
    payment.save(update_fields=['payment_reference'])

    from django.conf import settings as _s
    site_url = getattr(_s, 'SITE_URL', 'http://localhost:8000').rstrip('/')
    return_url = f'{site_url}/payment/driver-commission/{payment.pk}/moncash/return/'
    amount_htg = usd_to_htg(amount)
    try:
        mc = moncash_connect.create_payment(
            amount_htg=amount_htg,
            reference_id=ref,
            return_url=return_url,
            customer_name=driver.full_name or 'Chauffeur DAXI',
            customer_email=driver.email or '',
            idempotency_key=ref,
        )
    except moncash_connect.MonCashConnectError as exc:
        payment.delete()
        return _htmx_error(f'MonCash : {exc}')

    payment_url = mc.get('paymentUrl', '')
    if not payment_url:
        payment.delete()
        return _htmx_error('URL MonCash indisponible.')

    # HTMX: redirect header. Fallback POST (no htmx): HTTP redirect.
    if request.headers.get('HX-Request'):
        resp = HttpResponse(status=204)
        resp['HX-Redirect'] = payment_url
        return resp
    from django.shortcuts import redirect as _redirect
    return _redirect(payment_url)


def _complete_driver_commission_payment(payment):
    """Marque le paiement commission comme reçu et crédite le journal portefeuille."""
    from drivers.models import DriverWalletTransaction, DriverCommissionPayment
    from decimal import Decimal as _D

    if payment.is_paid:
        return True
    amount = payment.amount_usd.quantize(_D('0.01'))
    DriverWalletTransaction.objects.create(
        driver=payment.driver,
        transaction_type='debit_moncash',
        amount=-amount,
        balance_after=payment.driver.wallet_balance or _D('0'),
        note=f"Paiement MonCash commission admin — {format_price(amount, 2)}",
    )
    payment.is_paid = True
    payment.paid_at = timezone.now()
    payment.save(update_fields=['is_paid', 'paid_at'])
    return True


def driver_cash_sent_moncash(request):
    """POST /htmx/driver/wallet/cash-sent/
    Driver declares they have sent a MonCash payment to the admin.
    Records a debit_moncash transaction.
    """
    if request.method != 'POST':
        return HttpResponse('', status=405)

    driver = _get_current_driver(request)
    if not driver:
        return _htmx_error('Non autorisé.')

    from drivers.models import DriverWalletTransaction
    from decimal import Decimal as _D

    amount_str = request.POST.get('amount', '').strip()
    try:
        amount = _D(amount_str).quantize(_D('0.01'))
        if amount <= 0:
            raise ValueError
    except Exception:
        return _htmx_error('Montant invalide.')

                                                                         
    from django.db.models import Sum
    cash_orders = Order.objects.filter(
        driver=driver,
        payment_method='in_person',
        status='completed',
    ).values('price')
    rate_deduction = _D(str(100 - float(driver.commission_rate or 20)))
    total_admin_due = _D('0')
    for o in cash_orders:
        if o['price']:
            total_admin_due += (_D(str(o['price'])) * rate_deduction / _D('100')).quantize(_D('0.01'))
    paid_qs = DriverWalletTransaction.objects.filter(
        driver=driver, transaction_type='debit_moncash'
    ).aggregate(s=Sum('amount'))
    cash_paid = abs(paid_qs['s'] or _D('0'))
    cash_owed = max(_D('0'), total_admin_due - cash_paid)
    if cash_owed <= 0:
        return _htmx_error('Vous n\'avez rien à payer à l\'admin pour le moment.')
    if amount > cash_owed:
        return _htmx_error(f'Montant trop élevé — maximum dû : {format_price(cash_owed, 2)}')

    if not _admin_moncash_configured():
        return _htmx_error('Numéro MonCash admin non configuré — contactez le support Daxi.')

                                                     
    DriverWalletTransaction.objects.create(
        driver=driver,
        transaction_type='debit_moncash',
        amount=-amount,
        balance_after=driver.wallet_balance or _D('0'),
        note=f"Paiement MonCash à l'admin déclaré par chauffeur — {format_price(amount, 2)}",
    )

                              
    return driver_wallet(request)


def driver_withdrawal_request(request):
    """POST /htmx/driver/wallet/withdraw/
    Driver requests a withdrawal of their online balance.
    Creates a withdrawal_request transaction, admin sees it and pays.
    """
    if request.method != 'POST':
        return HttpResponse('', status=405)

    driver = _get_current_driver(request)
    if not driver:
        return _htmx_error('Non autorisé.')

    from drivers.models import DriverWalletTransaction
    from decimal import Decimal as _D

    amount_str = request.POST.get('amount', '').strip()
    phone      = request.POST.get('phone', '').strip()
    payout_method = (request.POST.get('payout_method') or 'moncash').strip().lower()
    if payout_method not in ('moncash', 'natcash'):
        payout_method = 'moncash'
    phone = _sanitize_phone(phone)
    try:
        amount = _D(amount_str).quantize(_D('0.01'))
        if amount <= 0:
            raise ValueError
    except Exception:
        return _htmx_error('Montant invalide.')

    if not phone:
        return _htmx_error('Numéro de téléphone requis.')

    online_balance = driver.wallet_balance or _D('0')
    _, _, cash_owed_to_admin = driver.get_cash_commission_stats()
    withdrawable_balance = max(_D('0'), online_balance - cash_owed_to_admin)

    pending_qs = DriverWalletTransaction.objects.filter(
        driver=driver,
        transaction_type='withdrawal_request',
    ).exclude(admin_status__in=['paid', 'rejected'])
    paid_ids = _driver_withdrawal_paid_ids()
    for tx in pending_qs:
        if _driver_withdrawal_effective_status(tx, paid_ids) == 'pending':
            return _htmx_error('Vous avez déjà une demande de retrait en cours.')

    if withdrawable_balance <= 0:
        if cash_owed_to_admin > 0:
            return _htmx_error(
                f'Retrait impossible — vous devez {format_price(cash_owed_to_admin, 2)} $ à l\'admin avant de retirer votre solde en ligne.'
            )
        return _htmx_error('Solde retirable insuffisant.')

    if amount > withdrawable_balance:
        if cash_owed_to_admin > 0:
            return _htmx_error(
                f'Montant trop élevé — maximum retirable : {format_price(withdrawable_balance, 2)} '
                f'(solde {format_price(online_balance, 2)} $ − dû admin {format_price(cash_owed_to_admin, 2)} $).'
            )
        return _htmx_error(f'Solde insuffisant. Disponible: {format_price(online_balance, 2)}')

    DriverWalletTransaction.objects.create(
        driver=driver,
        transaction_type='withdrawal_request',
        amount=-amount,
        balance_after=online_balance - amount,
        payout_method=payout_method,
        payout_phone=phone,
        admin_status='pending',
        note=f'Demande de retrait {payout_method.upper()} — {format_price(amount, 2)} vers {phone}',
    )

                                                          
    driver.wallet_balance = online_balance - amount
    driver.save(update_fields=['wallet_balance'])

    from julmin_taxis.security_audit import log_wallet
    log_wallet(
        driver,
        'withdrawal_request',
        request=request,
        old_value=str(online_balance),
        new_value=str(driver.wallet_balance),
    )

    _notify_ws('admin', 'withdrawal_request', {
        'driver_id':   driver.pk,
        'driver_name': driver.full_name or driver.firstname,
        'amount':      str(amount),
        'phone':       phone,
        'payout_method': payout_method,
    })
    try:
        from julmin_taxis.notify import push_notify_admin
        push_notify_admin('withdrawal', body=f'{driver.full_name or driver.firstname} — ${amount}', extra_data={'driver_id': str(driver.pk)})
    except Exception:
        pass
    try:
        from julmin_taxis.whatsapp_service import notify_admin_withdrawal_request
        notify_admin_withdrawal_request(
            'Chauffeur',
            driver.get_full_name() or driver.firstname,
            payout_method.upper(),
            phone,
            amount,
        )
    except Exception:
        pass

    return driver_wallet(request)


def _process_driver_commission(order, driver):
    """Called when order is marked completed.
    - Online payment (card): credit driver wallet with driver_commission_rate %
    - Cash payment: record the amount driver owes to admin (no wallet credit)
    """
    total = order.total_price
    if not total or not driver:
        return
    from decimal import Decimal as _D
    from drivers.models import DriverWalletTransaction

    price = _D(str(total))
    rate = driver.commission_rate                       

    driver_amount = (price * rate / _D('100')).quantize(_D('0.01'))
    admin_amount = price - driver_amount

                                 
    order.driver_commission_amount = driver_amount
    order.save(update_fields=['driver_commission_amount'])

    if order.payment_status == 'paid':
                                                 
        driver.wallet_balance = (driver.wallet_balance or _D('0')) + driver_amount
        driver.total_earnings = (driver.total_earnings or _D('0')) + driver_amount
        driver.save(update_fields=['wallet_balance', 'total_earnings'])

        DriverWalletTransaction.objects.create(
            driver=driver,
            order=order,
            transaction_type='credit_online',
            amount=driver_amount,
            balance_after=driver.wallet_balance,
            note=f'Course #{order.pk} payée en ligne — {rate}% de {format_price(price, 2)}',
        )
                                                                           
                                                                             

    try:
        from julmin_taxis.whatsapp_service import notify_driver_trip_completed
        notify_driver_trip_completed(driver, driver_amount, driver.wallet_balance or _D('0'))
    except Exception:
        pass

    if order.enterprise_id:
        try:
            from julmin_taxis.whatsapp_service import notify_enterprise_commission
            ent = order.enterprise
            commission = (price * _D(str(order.enterprise_commission_pct or 0)) / _D('100')).quantize(_D('0.01'))
            completed = Order.objects.filter(enterprise=ent, status='completed')
            total_earnings = sum(
                float(o.total_price or 0) * float(o.enterprise_commission_pct or 0) / 100
                for o in completed
            )
            notify_enterprise_commission(ent, commission, total_earnings)
        except Exception:
            pass


def driver_profile_update(request):
    """POST /htmx/driver/profile/update/"""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    fields = ['firstname', 'lastname', 'phone', 'city', 'vehicle', 'plate', 'car_brand', 'car_model', 'car_year']
    for f in fields:
        val = request.POST.get(f, '').strip()
        if val:
            setattr(driver, f, val)

    nav_mode = request.POST.get('nav_pref_mode', '').strip()
    if nav_mode in ('ask', 'site', 'external'):
        driver.nav_pref_mode = nav_mode
    nav_app = request.POST.get('nav_pref_app', '').strip()
    if nav_app in ('google', 'waze', 'apple'):
        driver.nav_pref_app = nav_app

    driver.full_name = f'{driver.firstname} {driver.lastname}'.strip()

    if 'photo' in request.FILES:
        driver.photo = request.FILES['photo']

    for doc_field in ['driving_license', 'oavct_insurance', 'dgi_card', 'tint_permit']:
        if doc_field in request.FILES:
            setattr(driver, doc_field, request.FILES[doc_field])

    new_pw = request.POST.get('new_password', '').strip()
    if new_pw:
        driver.password_hash = _hash(new_pw)

    driver.save()
    request.session['driver_name'] = driver.get_full_name()
    from julmin_taxis.driver_display_utils import sync_driver_photo_snapshots
    photo_url = sync_driver_photo_snapshots(driver, request=request)
    request.session['driver_photo'] = photo_url
    resp = _htmx_success('Profil mis à jour')
    if photo_url:
        resp['X-Daxi-Driver-Photo'] = photo_url
    return resp


                                                                                 
                                                     
                                                                                 

def driver_chat_messages(request, order_id):
    """GET /htmx/driver/chat/<order_id>/"""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()
    try:
        order = Order.objects.get(pk=int(order_id), driver=driver)
    except (Order.DoesNotExist, ValueError):
        return _htmx_error('Commande introuvable')
                                  
    OrderMessage.objects.filter(order=order, sender_type='user', is_read=False).update(is_read=True)
    return render(request, 'htmx/chat_messages.html', {
        'messages': _order_messages_for_scope(order, 'driver', request),
        'order_id': order_id,
        'scope': 'driver',
    })


def _chat_msg_payload(msg, request=None):
    from julmin_taxis.driver_display_utils import _abs_url
    return {
        'id': msg.pk,
        'content': msg.content,
        'image_url': _abs_url(msg.image_url or '', request),
        'audio_url': _abs_url(getattr(msg, 'audio_url', '') or '', request),
        'message_type': msg.message_type or 'text',
        'sender_type': msg.sender_type,
        'sender_name': msg.sender_name,
        'timestamp': msg.timestamp.strftime('%H:%M'),
        'reply_to_id': msg.reply_to_id,
        'reply_preview': (msg.reply_to.content[:80] if msg.reply_to and msg.reply_to.content else '') if msg.reply_to else '',
    }


def _order_messages_for_scope(order, scope, request=None):
    """Filtre les messages admin d'annulation selon l'audience (client vs chauffeur)."""
    from julmin_taxis.driver_display_utils import _abs_url
    qs = order.messages.order_by('timestamp')
    if scope == 'user':
        msgs = list(qs.exclude(message_type='admin_cancel_driver')[:100])
    elif scope == 'driver':
        msgs = list(qs.exclude(message_type='admin_cancel_client')[:100])
    else:
        msgs = list(qs[:100])
    for m in msgs:
        if m.image_url:
            m.image_url = _abs_url(m.image_url, request)
        audio = getattr(m, 'audio_url', '') or ''
        if audio:
            m.audio_url = _abs_url(audio, request)
    return msgs


def _parse_chat_send(request):
    content = request.POST.get('message', '').strip()
    reply_to_id = request.POST.get('reply_to', '').strip() or None
    image_url = ''
    audio_url = ''
    message_type = 'text'
    if request.FILES.get('image'):
        from julmin_taxis.media_utils import upload_chat_image
        image_url, err = upload_chat_image(request.FILES['image'])
        if err:
            return None, err
        message_type = 'image'
    elif request.FILES.get('audio'):
        from julmin_taxis.media_utils import upload_chat_audio
        audio_url, err = upload_chat_audio(request.FILES['audio'])
        if err:
            return None, err
        message_type = 'audio'
    audio_duration_sec = None
    if message_type == 'audio':
        try:
            raw_dur = int(request.POST.get('audio_duration', 0) or 0)
            if 1 <= raw_dur <= 600:
                audio_duration_sec = raw_dur
        except (TypeError, ValueError):
            audio_duration_sec = None
    if not content and not image_url and not audio_url:
        return None, 'Message vide'
    return {
        'content': content,
        'image_url': image_url,
        'audio_url': audio_url,
        'message_type': message_type,
        'audio_duration_sec': audio_duration_sec,
        'reply_to_id': int(reply_to_id) if reply_to_id and reply_to_id.isdigit() else None,
    }, None


def driver_chat_send(request, order_id):
    """POST /htmx/driver/chat/<order_id>/send/"""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()
    try:
        order = Order.objects.get(pk=int(order_id), driver=driver)
    except (Order.DoesNotExist, ValueError):
        return _htmx_error('Commande introuvable')
    parsed, err = _parse_chat_send(request)
    if err:
        return _htmx_error(err)
    reply_to = None
    if parsed['reply_to_id']:
        reply_to = OrderMessage.objects.filter(pk=parsed['reply_to_id'], order=order).first()
    msg = OrderMessage.objects.create(
        order=order,
        sender_type='driver',
        sender_name=driver.get_full_name(),
        content=parsed['content'],
        image_url=parsed['image_url'],
        audio_url=parsed.get('audio_url', ''),
        message_type=parsed['message_type'],
        audio_duration_sec=parsed.get('audio_duration_sec'),
        reply_to=reply_to,
        is_read=False,
    )
    payload = _chat_msg_payload(msg, request)
    _notify_ws(f'order_{order.pk}', 'new_message', payload)
    try:
        from julmin_taxis.notify import push_notify_client_message
        push_notify_client_message(order)
    except Exception:
        pass
    OrderMessage.objects.filter(order=order, sender_type='user', is_read=False).update(is_read=True)
    return render(request, 'htmx/chat_messages.html', {
        'messages': _order_messages_for_scope(order, 'driver', request),
        'order_id': order_id,
        'scope': 'driver',
    })


def driver_unread_count(request, order_id):
    """GET /htmx/driver/chat/<order_id>/unread/ — unread messages from client"""
    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'unread': 0})
    try:
        order = Order.objects.get(pk=int(order_id), driver=driver)
    except (Order.DoesNotExist, ValueError):
        return JsonResponse({'unread': 0})
    count = OrderMessage.objects.filter(order=order, sender_type='user', is_read=False).count()
    return JsonResponse({'unread': count})


def _chat_order_access(request, scope, order_id):
    """Return (order, error_response) for chat actions."""
    try:
        oid = int(order_id)
    except (TypeError, ValueError):
        return None, _htmx_error('Commande introuvable')
    if scope == 'driver':
        driver = _get_current_driver(request)
        if not driver:
            return None, _driver_redirect()
        try:
            return Order.objects.get(pk=oid, driver=driver), None
        except Order.DoesNotExist:
            return None, _htmx_error('Commande introuvable')
    if scope == 'user':
        try:
            if request.user.is_authenticated:
                return Order.objects.get(pk=oid, user=request.user), None
            gid = request.POST.get('guest_id', '') or request.GET.get('guest_id', '') or request.session.get('guest_id', '')
            if not gid:
                return None, _htmx_error('Non autorisé', 200)
            return Order.objects.get(pk=oid, guest_id=gid, user__isnull=True), None
        except Order.DoesNotExist:
            return None, _htmx_error('Commande introuvable')
    if scope == 'admin':
        gate = _admin_gate(request)
        if gate:
            return None, gate
        try:
            return Order.objects.get(pk=oid), None
        except Order.DoesNotExist:
            return None, _htmx_error('Commande introuvable')
    if scope == 'enterprise':
        return _get_order_for_enterprise(request, oid)
    return None, _htmx_error('Scope invalide')


def _chat_scope_owns(scope, msg):
    if scope == 'user':
        return msg.sender_type == 'user'
    if scope == 'driver':
        return msg.sender_type == 'driver'
    if scope in ('admin', 'enterprise'):
        return msg.sender_type == 'admin'
    return False


def _render_order_chat(request, order, order_id, scope):
    return render(request, 'htmx/chat_messages.html', {
        'messages': _order_messages_for_scope(order, scope, request),
        'order_id': order_id,
        'scope': scope,
    })


def chat_message_delete(request, scope, order_id, msg_id):
  order, err = _chat_order_access(request, scope, order_id)
  if err:
      return err
  try:
      msg = OrderMessage.objects.get(pk=int(msg_id), order=order)
  except (OrderMessage.DoesNotExist, ValueError):
      return _htmx_error('Message introuvable')
  if not _chat_scope_owns(scope, msg):
      return _htmx_error('Action non autorisée')
  msg.delete()
  _notify_ws(f'order_{order.pk}', 'new_message', {'order_id': order.pk, 'action': 'deleted'})
  return _render_order_chat(request, order, order_id, scope)


def chat_message_edit(request, scope, order_id, msg_id):
  order, err = _chat_order_access(request, scope, order_id)
  if err:
      return err
  try:
      msg = OrderMessage.objects.get(pk=int(msg_id), order=order)
  except (OrderMessage.DoesNotExist, ValueError):
      return _htmx_error('Message introuvable')
  if not _chat_scope_owns(scope, msg):
      return _htmx_error('Action non autorisée')
  if msg.message_type != 'text' or msg.image_url or msg.audio_url:
      return _htmx_error('Seuls les messages texte peuvent être modifiés')
  content = request.POST.get('message', '').strip()
  if not content:
      return _htmx_error('Message vide')
  msg.content = content
  msg.save(update_fields=['content'])
  _notify_ws(f'order_{order.pk}', 'new_message', {'order_id': order.pk, 'action': 'edited'})
  return _render_order_chat(request, order, order_id, scope)


                                                                                 
                       
                                                                                 

def client_login(request):
    """POST /htmx/client/login/"""
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    email = request.POST.get('email', '').strip().lower()
    password = request.POST.get('password', '').strip()

    if not email or not password:
        return _htmx_error('Email et mot de passe requis', 200)

    user = authenticate(request, username=email, password=password)
    if not user:
                            
        try:
            u = CustomUser.objects.get(email=email)
            user = authenticate(request, username=u.username, password=password)
        except CustomUser.DoesNotExist:
            pass

    if not user:
        return _htmx_error('Email ou mot de passe incorrect', 200)

    if user.is_blocked:
        return _htmx_error('Votre compte est bloqué. Contactez l\'administrateur.', 200)

    if getattr(user, 'is_staff', False):
        return _htmx_error('Ce compte est réservé à l\'administration. Utilisez /admin-dashboard/.', 200)

    login(request, user)
    request.session.modified = True
    request.session.save()

                                               
    guest_id = request.POST.get('guest_id', '').strip() or request.session.get('guest_id', '')
    if guest_id:
        Order.objects.filter(guest_id=guest_id, user__isnull=True).update(
            user=user, guest_id='',
            client_name=user.get_full_name() or user.email,
            client_email=user.email,
        )
        request.session.pop('guest_id', None)

    from django.middleware.csrf import get_token
    return JsonResponse({
        'success': True,
        'is_authenticated': True,
        'user_name': user.get_full_name() or user.username,
        'first_name': user.first_name or '',
        'user_id': user.firebase_user_id or '',
        'csrf_token': get_token(request),
    })


def client_login_by_id(request):
    """POST /htmx/client/login-by-id/ — connexion par ID unique (firebase_user_id)."""
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    user_id = request.POST.get('user_id', '').strip()
    if not user_id:
        return _htmx_error('Veuillez saisir votre ID', 200)

    try:
        user = CustomUser.objects.get(firebase_user_id=user_id)
    except CustomUser.DoesNotExist:
        return _htmx_error('Aucun compte trouvé avec cet ID. Vérifiez votre ID ou créez un compte.', 200)

    if user.is_blocked:
        return _htmx_error('Votre compte est bloqué. Contactez l\'administrateur.', 200)

    if getattr(user, 'is_staff', False):
        return _htmx_error('Ce compte est réservé à l\'administration. Utilisez /admin-dashboard/.', 200)

    user.backend = 'django.contrib.auth.backends.ModelBackend'
    login(request, user)
    request.session.modified = True
    request.session.save()

                                               
    guest_id = request.POST.get('guest_id', '').strip() or request.session.get('guest_id', '')
    if guest_id:
        Order.objects.filter(guest_id=guest_id, user__isnull=True).update(
            user=user, guest_id='',
            client_name=user.get_full_name() or user.email,
            client_email=user.email,
        )
        request.session.pop('guest_id', None)

    from django.middleware.csrf import get_token
    return JsonResponse({
        'success': True,
        'is_authenticated': True,
        'user_name': user.get_full_name() or user.username,
        'first_name': user.first_name or '',
        'user_id': user.firebase_user_id or '',
        'csrf_token': get_token(request),
    })


def analyze_document(request):
    """POST /htmx/analyze-document/ — Gemini vision (documents chauffeur)."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non supportée'}, status=405)

    uploaded_file = request.FILES.get('file')
    if not uploaded_file:
        return JsonResponse({'error': 'Aucun fichier fourni'}, status=400)

    doc_type = request.POST.get('doc_type', 'license')
    firstname = request.POST.get('firstname', '').strip()
    lastname = request.POST.get('lastname', '').strip()

    from drivers.document_verification import verify_uploaded_file
    result = verify_uploaded_file(
        uploaded_file, doc_type, firstname=firstname, lastname=lastname, ocr_reader=get_ocr_reader(),
    )

    if result.get('status') == 'ai_unavailable':
        return JsonResponse({
            'warning': result.get('message'),
            'manual_review': True,
            'ocr_text': result.get('ocr_text', ''),
        })

    if result.get('status') == 'ocr_error':
        return JsonResponse({
            'warning': result.get('message'),
            'manual_review': True,
        })

    return JsonResponse({
        'document_type': result.get('document_type'),
        'expiry_date': result.get('expiry_date') or 'Inconnue',
        'status': result.get('status'),
        'message': result.get('message'),
        'identity_match': result.get('identity_match'),
        'ok': result.get('ok'),
    })


def client_register(request):
    """POST /htmx/client/register/"""
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    from julmin_taxis.reg_otp_cache import consume_registration_otp, validate_registration_otp

    firstname = request.POST.get('firstname', '').strip()
    lastname  = request.POST.get('lastname', '').strip()
    email     = request.POST.get('email', '').strip().lower()
    phone     = request.POST.get('phone', '').strip()
    password  = request.POST.get('password', '').strip()
    otp       = request.POST.get('otp', '').strip()
    firebase_user_id = request.POST.get('firebase_user_id', '').strip()

    if not all([firstname, lastname, email, password]):
        return _htmx_error('Tous les champs obligatoires sont requis', 200)

    from julmin_taxis.email_validate import is_valid_email
    if not is_valid_email(email):
        return _htmx_error('Entrez une adresse email valide (ex. toi@gmail.com ou toi@entreprise.ht).', 200)

                            
    ok, otp_err = validate_registration_otp(email, otp, namespace='')
    if not ok:
        return _htmx_error(otp_err, 200)
    consume_registration_otp(email, namespace='')

    if len(password) < 6:
        return _htmx_error('Le mot de passe doit contenir au moins 6 caractères', 200)

    if CustomUser.objects.filter(email=email).exists():
        return _htmx_error('Un compte avec cet email existe déjà', 200)

                                               
    if firebase_user_id and CustomUser.objects.filter(firebase_user_id=firebase_user_id).exists():
        import random
        firebase_user_id = str(random.randint(1000, 9999))
        while CustomUser.objects.filter(firebase_user_id=firebase_user_id).exists():
            firebase_user_id = str(random.randint(1000, 9999))

    age_str = request.POST.get('age', '').strip()
    age = None
    if age_str:
        try:
            age = int(age_str)
        except ValueError:
            pass

    user = CustomUser.objects.create_user(
        username=email,
        email=email,
        password=password,
        first_name=firstname,
        last_name=lastname,
        phone=phone,
        age=age,
        firebase_user_id=firebase_user_id,
    )
    login(request, user)

    try:
        from julmin_taxis.whatsapp_service import notify_welcome_client
        notify_welcome_client(user)
    except Exception:
        pass

                                                                  
    guest_id = request.POST.get('guest_id', '').strip() or request.session.get('guest_id', '')
    if guest_id:
        transferred = Order.objects.filter(guest_id=guest_id, user__isnull=True).update(
            user=user, guest_id='',
            client_name=user.get_full_name() or email,
            client_email=email,
        )
        if transferred:
            request.session.pop('guest_id', None)
                                                            
    html = f'''<div id="register-success"
     style="text-align:center;padding:20px;background:#f0fdf4;border-radius:12px;border:1px solid #bbf7d0;">
  <div style="font-size:32px;margin-bottom:8px;">🎉</div>
  <h3 style="font-weight:700;color:#15803d;margin-bottom:6px;">Compte créé !</h3>
  <p style="font-size:13px;color:#166534;margin-bottom:12px;">Bienvenue, {firstname} !</p>
  <div style="background:white;border-radius:8px;padding:12px;margin-bottom:12px;border:2px solid #22c55e;">
    <p style="font-size:12px;color:#6b7280;margin-bottom:4px;">Votre ID unique</p>
    <p style="font-size:28px;font-weight:800;color:#e94560;letter-spacing:4px;">{firebase_user_id}</p>
    <p style="font-size:11px;color:#9ca3af;">Conservez cet ID pour vous connecter depuis n'importe quel appareil</p>
  </div>
  <p style="font-size:12px;color:#9ca3af;">Redirection dans 3 secondes...</p>
</div>'''
    response = HttpResponse(html, status=200, content_type='text/html')
                                                                        
                                                                              
    response['HX-Trigger-After-Swap'] = 'registrationComplete'
    return response


def client_logout(request):
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'Méthode non supportée'}, status=405)
    logout(request)
    from django.middleware.csrf import get_token
    return JsonResponse({'ok': True, 'logged_out': True, 'csrf_token': get_token(request)})


def search_car_images(request):
    """GET /htmx/search-car-images/?make=Toyota&model=Corolla&year=2012&color=Rouge&plate=BB-1234
    Generate car photos using Cloudflare Workers AI (4 variations).
    """
    make = request.GET.get('make', '').strip()
    model = request.GET.get('model', '').strip()
    year = request.GET.get('year', '').strip()
    color = request.GET.get('color', '').strip()
    plate = request.GET.get('plate', '').strip()

    account_id = os.environ.get('CLOUDFLARE_ACCOUNT_ID')
    api_token = os.environ.get('CLOUDFLARE_API_TOKEN')

    if not account_id or not api_token:
        return JsonResponse({'results': [], 'error': 'Configuration Cloudflare manquante.'})

                                                                     
    prompt = (
        f"High-end commercial automotive advertising photography of a {color} {make} {model} {year}. "
        f"The entire car is shown from a dynamic 3/4 profile angle, revealing both the front and the full side of the vehicle. "
        f"The car is perfectly centered and completely visible within the frame on a solid, pure white studio background. "
        f"The license plate is realistically mounted and clearly displays '{plate}'. "
        f"Studio lighting, hyper-realistic, 8k, sharp focus, professional car catalogue style."
    )

    results = []
                                                                      
    model_name = "@cf/black-forest-labs/flux-1-schnell"
    url = f"https://api.cloudflare.com/client/v4/accounts/{account_id}/ai/run/{model_name}"
    headers = {"Authorization": f"Bearer {api_token}"}

    from julmin_taxis.media_utils import cloudinary_configured, upload_image_bytes_to_cloudinary

    save_dir = None
    if not cloudinary_configured():
        save_dir = os.path.join(settings.MEDIA_ROOT, 'generated_cars')
        if not os.path.exists(save_dir):
            os.makedirs(save_dir)

    try:
        for i in range(4):
            payload = {
                "prompt": prompt,
                "num_steps": 4,
                "seed": random.randint(1, 9999999)
            }
            resp = requests.post(url, headers=headers, json=payload, timeout=20)
            
            if resp.status_code == 200:
                content_type = resp.headers.get('Content-Type', '')
                if 'application/json' in content_type:
                    try:
                        data = resp.json()
                        image_b64 = data.get('result', {}).get('image')
                        if image_b64:
                            image_data = base64.b64decode(image_b64)
                        else:
                            print(f"Cloudflare JSON missing image data: {data}")
                            continue
                    except Exception as json_err:
                        print(f"Error parsing Cloudflare JSON: {json_err}")
                        continue
                else:
                    image_data = resp.content

                filename = f"car_{uuid.uuid4().hex}.png"
                if cloudinary_configured():
                    img_url, err = upload_image_bytes_to_cloudinary(
                        image_data, filename=filename, folder='daxi/generated_cars',
                    )
                    if not img_url:
                        print(f"Cloudinary generated car upload failed: {err}")
                        continue
                else:
                    filepath = os.path.join(save_dir, filename)
                    with open(filepath, 'wb') as f:
                        f.write(image_data)
                    img_url = f"{settings.MEDIA_URL}generated_cars/{filename}"
                results.append({'url': img_url, 'thumb': img_url})
            else:
                print(f"Cloudflare AI Error (Variation {i+1}): {resp.text}")

        if not results:
            return JsonResponse({'results': [], 'error': 'Toutes les tentatives de génération ont échoué.'})

        return JsonResponse({'results': results})

    except Exception as e:
        print(f"Cloudflare AI Exception: {e}")
        return JsonResponse({'results': [], 'error': str(e)})


                                                                                 
                 
                                                                                 

def client_orders(request):
    """GET /htmx/client/orders/?tab=active|history"""
    tab = request.GET.get('tab', 'active')

    if request.user.is_authenticated:
        base_filter = {'user': request.user}
    else:
        guest_id = request.POST.get('guest_id', '') or request.GET.get('guest_id', '') or request.session.get('guest_id', '')
        if not guest_id:
            return HttpResponse('''
<div style="text-align:center;padding:40px 20px;color:#9ca3af;">
  <div style="font-size:48px;margin-bottom:12px;">📭</div>
  <p style="font-size:14px;font-weight:500;color:#6b7280;">Aucune course pour le moment</p>
  <p style="font-size:12px;margin-top:4px;">Créez un compte pour voir vos courses.</p>
</div>''', status=200)
        request.session['guest_id'] = guest_id
        base_filter = {'guest_id': guest_id, 'user__isnull': True}

    if tab == 'active':
        qs = Order.objects.filter(
            **base_filter
        ).exclude(status__in=['completed', 'cancelled']).select_related('driver').order_by('-created_at')
    else:
        qs = Order.objects.filter(
            **base_filter,
            status__in=['completed', 'cancelled']
        ).select_related('driver').order_by('-created_at')[:50]

    orders_data = [_order_to_dict(o) for o in qs]

    now = timezone.now()

                                                                 
    active_statuses = {'driver_assigned', 'on_way', 'arrived', 'in_progress'}
    now_orders = []
    scheduled_orders = []

    for o in orders_data:
        sched_raw = o.get('scheduled_at')
        is_active = o['status'] in active_statuses
        is_later_flag = o.get('is_later', False)

        if is_active:
            now_orders.append(o)
        elif is_later_flag and sched_raw:
            try:
                from django.utils.dateparse import parse_datetime
                sched_dt = parse_datetime(sched_raw)
                if sched_dt and sched_dt > now:
                    scheduled_orders.append(o)
                else:
                    now_orders.append(o)
            except Exception:
                now_orders.append(o)
        else:
            now_orders.append(o)

                                                            
    now_orders.sort(key=lambda x: (0 if x['status'] in active_statuses else 1, x.get('created_at') or ''), reverse=False)

                                                                    
    has_active = any(o['status'] in active_statuses for o in now_orders)
    pending_statuses = {'pending', 'price_proposed', 'price_confirmed'}
    if has_active:
        now_orders = [o for o in now_orders if o['status'] not in pending_statuses]

                                                   
    def _sched_key(o):
        try:
            from django.utils.dateparse import parse_datetime
            dt = parse_datetime(o.get('scheduled_at', '') or '')
            return dt.timestamp() if dt else float('inf')
        except Exception:
            return float('inf')
    scheduled_orders.sort(key=_sched_key)

    return render(request, 'htmx/client_orders.html', {
        'orders': orders_data,
        'now_orders': now_orders,
        'scheduled_orders': scheduled_orders,
        'tab': tab,
        'google_maps_key': getattr(settings, 'GOOGLE_MAPS_API_KEY', ''),
        'mapbox_token': getattr(settings, 'MAPBOX_ACCESS_TOKEN', ''),
    })


def _order_payment_confirmed(order):
    ps = (order.payment_status or '').strip()
    if ps in ('paid', 'in_person'):
        return True
    if (order.payment_method or '').strip() == 'in_person' and order.contract_accepted_at:
        return True
    return False


def _order_has_contact_phone(request, order):
    if (order.client_phone or '').strip():
        return True
    user = getattr(request, 'user', None)
    if user and user.is_authenticated:
        if (getattr(user, 'phone', '') or '').strip():
            return True
    return False


def _order_needs_phone_prompt(request, order):
    if order.status in ('completed', 'cancelled'):
        return False
    return not _order_has_contact_phone(request, order)


def _order_needs_coords(order):
    return not (
        order.pickup_lat and order.pickup_lng
        and order.destination_lat and order.destination_lng
    )


def client_order_ref_tail(order):
    """Affichage client : 4 derniers caractères (sans préfixe DX-)."""
    if isinstance(order, dict):
        code = (order.get('public_code') or order.get('code') or '').strip()
        pk = order.get('id')
    else:
        code = (getattr(order, 'public_code', None) or getattr(order, 'ref_code', None) or '').strip()
        pk = order.pk
    if code:
        raw = code.upper().replace('DX-', '').replace('DX', '')
        return raw[-4:] if len(raw) >= 4 else raw
    return str(pk or '')[-4:].rjust(4, '0')


def _enterprise_checkout_phase(order):
    """Étape du parcours entreprise (prix → paiement → chauffeur)."""
    if not getattr(order, 'enterprise_id', None):
        return ''
    if order.status in ('completed', 'cancelled'):
        return ''
    if order.status == 'pending' and order.price:
        return 'accept_price'
    if order.status == 'price_confirmed' and not _order_payment_confirmed(order):
        if (order.payment_method or '').strip() and (order.payment_status or '') == 'pending':
            return 'await_client_pay'
        return 'choose_payment'
    if _order_payment_confirmed(order) and order.status == 'price_confirmed' and not order.driver_id:
        return 'finding_driver'
    return ''


def _enterprise_status_label(order):
    phase = _enterprise_checkout_phase(order)
    labels = {
        'accept_price': 'Prix à valider',
        'choose_payment': 'Paiement requis',
        'await_client_pay': 'En attente paiement client',
        'finding_driver': 'Recherche chauffeur',
    }
    if phase:
        return labels.get(phase, order.get_status_display())
    return order.get_status_display()


def _ensure_enterprise_order_guest_id(order):
    """Garantit un guest_id pour le lien de paiement client."""
    if order.guest_id:
        return order.guest_id
    import uuid
    order.guest_id = str(uuid.uuid4())
    order.save(update_fields=['guest_id'])
    return order.guest_id


def _enterprise_client_pay_url(order, request=None):
    if not getattr(order, 'enterprise_id', None):
        return ''
    guest_id = order.guest_id or _ensure_enterprise_order_guest_id(order)
    if order.status != 'price_confirmed' or _order_payment_confirmed(order):
        return ''
    path = f'/payer/{order.pk}/?g={guest_id}'
    if (order.payment_method or '').strip():
        path += f'&m={order.payment_method}'
    if request is not None:
        return request.build_absolute_uri(path)
    from django.conf import settings as _s
    site = getattr(_s, 'SITE_URL', '').rstrip('/')
    if site:
        return site + path
    return path


def _get_order_for_enterprise(request, order_id):
    ent = _get_enterprise(request)
    if not ent:
        return None, _htmx_error('Entreprise non connectée.', 200)
    try:
        order = Order.objects.get(pk=int(order_id), enterprise=ent)
        return order, None
    except (Order.DoesNotExist, ValueError):
        return None, _htmx_error('Commande introuvable.', 200)


def _order_ready_for_driver_accept(order):
    """Course disponible à l'acceptation chauffeur (paiement confirmé)."""
    return _order_payment_confirmed(order)


def _order_needs_payment(order):
    """Le client doit encore choisir / finaliser le paiement."""
    return order.status == 'price_confirmed' and not _order_payment_confirmed(order)


def _client_can_rate_order(order, request=None):
    """Le client peut noter le chauffeur après une course terminée."""
    if order.status != 'completed' or not order.driver_id:
        return False
    if DriverReview.objects.filter(order=order).exists():
        return False
    return True


def _client_can_cancel_order(order):
    """Le client peut annuler tant qu'aucun chauffeur n'a accepté la course."""
    if order.status in ('completed', 'cancelled'):
        return False
    if order.driver_id:
        return False
    if order.status in ('driver_assigned', 'on_way', 'arrived', 'in_progress'):
        return False
    return order.status in ('pending', 'price_proposed', 'price_confirmed')


def _client_orders_base_filter(request):
    """Return (base_filter dict or Q, guest_id or None) for client order queries."""
    from django.db.models import Q
    guest_id = (request.POST.get('guest_id', '')
                or request.GET.get('guest_id', '')
                or request.session.get('guest_id', ''))
    if guest_id:
        request.session['guest_id'] = guest_id
    client_user = _client_auth_user(request)
    if client_user:
        if guest_id:
            return Q(user=client_user) | Q(guest_id=guest_id, user__isnull=True), guest_id
        return {'user': client_user}, guest_id or None
    if not guest_id:
        return None, None
    return {'guest_id': guest_id, 'user__isnull': True}, guest_id


def _render_client_sheet_fragment(request, order):
    o = _order_to_dict(order)
    ctx = {
        'order': o,
        'order_id': order.pk,
        'o': o,
        'csrf_token': request.META.get('CSRF_COOKIE', ''),
        'mapbox_token': getattr(settings, 'MAPBOX_ACCESS_TOKEN', ''),
        'sheet_mode': True,
    }
    needs_coords = _order_needs_coords(order)
    if needs_coords and _order_needs_phone_prompt(request, order):
        return render(request, 'htmx/guest_phone_prompt.html', {
            'order': o,
            'next_step': 'post_order',
            'pending_coords': True,
        })
    if needs_coords and order.status in ('pending', 'price_proposed'):
        return render(request, 'htmx/client_order_pending_coords.html', {
            'order': o,
            'order_id': order.pk,
            'pickup': clean_address_display(order.pickup),
            'destination': clean_address_display(order.destination),
        })
    has_proposed_price = (
        order.status in ('pending', 'price_proposed')
        and order.price
        and float(order.price) > 0
    )
    if has_proposed_price and order.status in ('pending', 'price_proposed'):
        ctx.update({
            'auto_price': float(order.price),
            'pickup': order.pickup,
            'destination': order.destination,
            'distance_km': o.get('distance_km'),
            'trip_type': order.trip_type,
            'passengers': order.passengers,
        })
        return render(request, 'htmx/client_price_proposal.html', ctx)
    if _order_needs_payment(order):
        ctx['payment_pending'] = bool(
            (order.payment_method or '').strip()
            and (order.payment_status or '') == 'pending'
        )
        from julmin_taxis.refund_policy import service_contract_html
        ctx['contract_html'] = service_contract_html()
        return render(request, 'htmx/client_payment_selection.html', ctx)
    if _order_needs_phone_prompt(request, order):
        return render(request, 'htmx/guest_phone_prompt.html', {
            'order': o,
            'next_step': 'post_payment',
            'pending_coords': False,
        })
    return render(request, 'htmx/_client_order_card.html', ctx)


def client_sheet_orders(request):
    """GET /htmx/client/orders/sheet/ — JSON bootstrap for bottom sheet."""
    base_filter, guest_id = _client_orders_base_filter(request)
    if not base_filter:
        return JsonResponse({'orders': [], 'html': ''})

    active_statuses = {'pending', 'price_proposed', 'price_confirmed',
                       'driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return'}
    from django.db.models import Q
    if isinstance(base_filter, Q):
        qs = Order.objects.filter(base_filter, status__in=active_statuses).order_by('-created_at')[:8]
    else:
        qs = Order.objects.filter(**base_filter, status__in=active_statuses).order_by('-created_at')[:8]
    orders = list(qs)
    if not orders:
        return JsonResponse({'orders': [], 'html': ''})

    meta = []
    status_labels = {
        'pending': 'En attente',
        'price_proposed': 'Prix proposé',
        'price_confirmed': 'Prix confirmé',
        'driver_assigned': 'Chauffeur assigné',
        'on_way': 'Chauffeur en route',
        'arrived': 'Chauffeur arrivé',
        'in_progress': 'Course en cours',
    }
    for o in orders:
        label = '#' + str(o.pk)
        if o.pickup and o.destination:
            p_raw = clean_address_display(o.pickup)
            d_raw = clean_address_display(o.destination)
            p = (p_raw[:18] + '…') if len(p_raw) > 18 else p_raw
            d = (d_raw[:18] + '…') if len(d_raw) > 18 else d_raw
            label = p + ' → ' + d
        meta.append({
            'id': o.pk,
            'label': label,
            'status': o.status,
            'status_label': status_labels.get(o.status, o.status),
            'client_status_label': _client_order_phase(o)['client_status_label'],
            'pickup': clean_address_display(o.pickup or ''),
            'destination': clean_address_display(o.destination or ''),
            'scheduled_at': o.scheduled_at.isoformat() if o.scheduled_at else None,
            'is_later': bool(o.is_later),
            'price': float(o.price) if o.price else None,
            'total_price': _order_total_price_float(o),
            'meeting_prompt_acknowledged': bool(o.meeting_prompt_acknowledged),
            'pickup_confirm_sent': bool(o.pickup_confirm_sent),
        })

    return JsonResponse({'orders': meta, 'html': ''})


def client_order_sheet(request, order_id):
    """GET /htmx/client/orders/<id>/sheet/ — single order fragment for sheet."""
    order, err = _get_order_for_client(request, order_id)
    if err:
        return err
    if order.status in ('completed', 'cancelled'):
        return HttpResponse(
            '<div style="padding:12px;text-align:center;color:#94a3b8;font-size:12px;">Course terminée ou annulée.</div>'
            '<script>if(window._loadDaxiSheetOrders)window._loadDaxiSheetOrders();</script>'
        )
    return _render_client_sheet_fragment(request, order)


def client_confirm_arrival(request, order_id):
    """POST /htmx/client/orders/<id>/arrived/ — client confirms arrival or submits rating."""
    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    rating = request.POST.get('rating')
    comment = (request.POST.get('comment') or '').strip()

    if order.status == 'completed' and rating:
        return _client_save_rating_response(request, order, rating, comment)

    if order.status != 'in_progress':
        if order.status == 'completed' and not rating:
            return _client_completed_order_card_html(request, order, with_rating_prompt=True)
        return _htmx_error('Statut incompatible — confirmez votre arrivée uniquement pendant la course.')

    order.status = 'completed'
    order.completed_at = timezone.now()
    order.save(update_fields=['status', 'completed_at'])

    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, 'completed')
    except Exception:
        pass

    _notify_ws(f'order_{order.pk}', 'order_completed', {'order_id': order.pk})
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'completed'})

    if rating:
        return _client_save_rating_response(request, order, rating, comment)

    return _client_completed_order_card_html(request, order, with_rating_prompt=True)


def client_submit_rating(request, order_id):
    """POST /htmx/client/orders/<id>/rating/ — note chauffeur après course terminée."""
    order, err = _get_order_for_client(request, order_id)
    if err:
        return err
    rating = request.POST.get('rating')
    comment = (request.POST.get('comment') or '').strip()
    if not rating:
        return _htmx_error('Sélectionnez un nombre d\'étoiles.')
    return _client_save_rating_response(request, order, rating, comment)


def _client_save_rating_response(request, order, rating, comment=''):
    try:
        stars = int(rating)
    except (TypeError, ValueError):
        return _htmx_error('Note invalide.')
    if stars < 1 or stars > 5:
        return _htmx_error('La note doit être entre 1 et 5.')
    if not order.driver_id:
        return _htmx_error('Aucun chauffeur à noter.')
    if DriverReview.objects.filter(order=order).exists():
        return _client_completed_order_card_html(request, order, with_rating_prompt=False)

    user = request.user if request.user.is_authenticated else None
    DriverReview.objects.create(
        driver=order.driver,
        user=user,
        order=order,
        rating=stars,
        comment=comment[:500],
    )
    order.driver.recalculate_rating()
    return _client_completed_order_card_html(request, order, with_rating_prompt=False, rating_saved=True)


def _client_completed_order_card_html(request, order, with_rating_prompt=False, rating_saved=False):
    od = _order_to_dict(order, request=request)
    rating_html = ''
    if rating_saved:
        rating_html = '<div class="daxi-client-rating-done">⭐ Merci pour votre évaluation !</div>'
    elif with_rating_prompt and _client_can_rate_order(order, request):
        from django.template.loader import render_to_string
        rating_html = render_to_string('htmx/_client_order_rating.html', {
            'order': order,
            'csrf_token': get_token(request),
        }, request=request)
    return HttpResponse(f'''
<div id="co-{order.pk}" class="daxi-order-completed-card">
  <div class="daxi-order-completed-card__bar"></div>
  <div class="daxi-order-completed-card__body">
    <div class="daxi-order-completed-card__hero">
      <div class="daxi-order-completed-card__icon">🏁</div>
      <div class="daxi-order-completed-card__title">Course terminée !</div>
      <div class="daxi-order-completed-card__route">{od["pickup"]} → {od["destination"]}</div>
      {f'<div class="daxi-order-completed-card__price">{format_price(od["price"])}</div>' if od.get("price") else ""}
    </div>
    {rating_html}
  </div>
</div>''', content_type='text/html')


def client_request_return_pickup(request, order_id):
    """POST /htmx/client/orders/<id>/request-return/ — client prêt pour le retour (aller-retour)."""
    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    if not is_round_trip_order(order):
        return _htmx_error('Cette action est réservée aux courses aller-retour.')

    if (order.status or '') != 'waiting_return':
        return _htmx_error('Vous pouvez demander le retour uniquement pendant l\'attente à destination.')

    if not order.round_trip_allow_driver_other_rides:
        return _htmx_error('Le chauffeur n\'est pas autorisé à prendre d\'autres courses durant l\'attente.')

    ready = request.POST.get('ready', '').strip().lower()
    if ready not in ('1', 'true', 'yes', 'on'):
        return _htmx_error('Confirmez que vous avez terminé et êtes prêt(e) à être repris(e).')

    if round_trip_pickup_request_pending(order):
        return _htmx_error('Votre chauffeur a déjà été alerté. Il reviendra dès que possible.')

    now = timezone.now()
    order.round_trip_pickup_requested_at = now
    order.round_trip_pickup_request_dismissed_at = None
    order.save(update_fields=['round_trip_pickup_requested_at', 'round_trip_pickup_request_dismissed_at'])

    try:
        from julmin_taxis.notify import notify_driver_return_pickup_requested
        notify_driver_return_pickup_requested(order)
    except Exception:
        pass

    pickup_short = clean_address_display(order.pickup) or order.pickup or 'le point de départ'
    client_name = order.client_name or 'Client'
    payload = {
        'order_id': order.pk,
        'client_name': client_name,
        'pickup': pickup_short,
        'message': f'{client_name} est prêt(e) pour le retour.',
    }
    if order.driver_id:
        _notify_ws(f'driver_{order.driver_id}', 'round_trip_pickup_requested', payload)
    _notify_ws(f'order_{order.pk}', 'round_trip_pickup_requested', payload)
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': order.status})

    return _render_client_sheet_fragment(request, order)


def driver_dismiss_return_request(request, order_id):
    """POST /htmx/driver/orders/<id>/dismiss-return-request/ — ferme l'alerte retour client."""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()

    try:
        order = Order.objects.get(pk=int(order_id), driver=driver)
    except (Order.DoesNotExist, ValueError):
        return _htmx_error('Commande introuvable')

    if not round_trip_pickup_request_pending(order):
        return _htmx_success('Alerte déjà fermée.')

    order.round_trip_pickup_request_dismissed_at = timezone.now()
    order.save(update_fields=['round_trip_pickup_request_dismissed_at'])

    _notify_ws(f'driver_{driver.pk}', 'round_trip_pickup_dismissed', {'order_id': order.pk})
    return _htmx_success('Alerte fermée — terminez votre course en cours puis revenez chercher le client.')


def _driver_return_recall_orders(driver):
    """Commandes aller-retour où le client a demandé le retour (alerte active)."""
    from django.db.models import F, Q
    qs = Order.objects.filter(
        driver=driver,
        status='waiting_return',
        round_trip_pickup_requested_at__isnull=False,
    ).filter(
        Q(round_trip_pickup_request_dismissed_at__isnull=True)
        | Q(round_trip_pickup_requested_at__gt=F('round_trip_pickup_request_dismissed_at'))
    ).order_by('-round_trip_pickup_requested_at')[:5]
    rows = []
    for o in qs:
        rows.append({
            'order_id': o.pk,
            'client_name': o.client_name or 'Client',
            'pickup': clean_address_display(o.pickup) or o.pickup or '',
            'destination': clean_address_display(o.destination) or o.destination or '',
            'requested_at': o.round_trip_pickup_requested_at.isoformat() if o.round_trip_pickup_requested_at else None,
        })
    return rows


def _client_photo_url(request, user):
    if user and user.photo:
        return request.build_absolute_uri(user.photo.url)
    return ''


def _client_enterprise_context(request):
    """Expose enterprise link state for client UI (sidebar, Mon compte)."""
    current_eid = request.session.get('current_enterprise_id') or request.session.get('enterprise_id')
    enterprise_ids = request.session.get('enterprise_ids') or []
    ent_name = None
    ent_status = None
    linked = None
    if current_eid:
        try:
            from enterprises.models import Enterprise
            ent = Enterprise.objects.get(pk=current_eid)
            ent_name = ent.name
            ent_status = ent.status
        except Exception:
            pass
    if request.user.is_authenticated and getattr(request.user, 'email', None):
        try:
            from enterprises.models import Enterprise
            email_ents = list(
                Enterprise.objects.filter(email=request.user.email.strip().lower()).order_by('-created_at')
            )
            if email_ents:
                linked = next((e for e in email_ents if e.status == 'approved'), None) or email_ents[0]
                if not ent_name:
                    ent_name = linked.name
                    ent_status = linked.status
        except Exception:
            pass
    has_enterprise = bool(current_eid or linked or enterprise_ids)
    if current_eid and ent_status == 'approved':
        enterprise_url = '/entreprise/dashboard/'
    else:
        enterprise_url = '/entreprise/'
    return {
        'has_enterprise': has_enterprise,
        'enterprise_name': ent_name,
        'enterprise_status': ent_status,
        'enterprise_url': enterprise_url,
        'enterprise_register_url': '/entreprise/?tab=register',
    }


def client_account(request):
    """GET /htmx/client/account/ — profile fragment for in-app overlay."""
    user = _client_auth_user(request)
    stats = {'total': 0, 'this_month': 0, 'pending': 0, 'completed': 0}
    if user:
        now = timezone.now()
        qs = Order.objects.filter(user=user)
        active_statuses = [
            'driver_assigned', 'on_way', 'arrived', 'in_progress',
            'pending', 'price_proposed', 'price_confirmed',
        ]
        stats = {
            'total': qs.count(),
            'this_month': qs.filter(created_at__year=now.year, created_at__month=now.month).count(),
            'pending': qs.filter(status__in=active_statuses).count(),
            'completed': qs.filter(status='completed').count(),
        }
    name = user.get_full_name() if user else ''
    initials = ''.join(p[0] for p in name.split()[:2]).upper() if name else '?'
    return render(request, 'htmx/client_account.html', {
        'is_authenticated': bool(user),
        'user_name': name or 'Utilisateur',
        'user_email': user.email if user else '',
        'user_phone': getattr(user, 'phone', '') or '',
        'user_id': (user.firebase_user_id if user and user.firebase_user_id else (str(user.pk) if user else '')),
        'user_photo': _client_photo_url(request, user),
        'initials': initials,
        'is_verified': getattr(user, 'is_verified', False) if user else False,
        'stats': stats,
        **_client_enterprise_context(request),
    })


def client_account_settings(request):
    """GET /htmx/client/account/settings/ — profil éditable (overlay in-app)."""
    user = request.user if request.user.is_authenticated else None
    name = user.get_full_name() if user else ''
    initials = ''.join(p[0] for p in name.split()[:2]).upper() if name else '?'
    return render(request, 'htmx/client_account_settings.html', {
        'is_authenticated': bool(user),
        'user_name': name or 'Utilisateur',
        'first_name': user.first_name if user else '',
        'last_name': user.last_name if user else '',
        'user_phone': getattr(user, 'phone', '') or '' if user else '',
        'user_id': (user.firebase_user_id if user and user.firebase_user_id else (str(user.pk) if user else '')),
        'user_photo': _client_photo_url(request, user),
        'initials': initials,
    })


def client_profile_update(request):
    """POST /htmx/client/profile/update/"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Non connecté'}, status=401)
    user = request.user
    first = request.POST.get('first_name', '').strip()
    last = request.POST.get('last_name', '').strip()
    phone_prefix = request.POST.get('phone_prefix', '').strip()
    phone_national = request.POST.get('phone_national', '').strip()
    phone = request.POST.get('phone', '').strip()
    pw = request.POST.get('password', '').strip()
    if first:
        user.first_name = first
    if last:
        user.last_name = last
    if phone_national or phone:
        combined = (phone_prefix + phone_national) if phone_national else phone
        normalized = _sanitize_phone(combined)
        if not normalized:
            return JsonResponse({'error': 'Numéro WhatsApp invalide.'}, status=400)
        user.phone = normalized
    if pw:
        if len(pw) < 6:
            return JsonResponse({'error': 'Mot de passe trop court (min. 6 caractères).'}, status=400)
        user.set_password(pw)
    user.save()
    return JsonResponse({
        'success': True,
        'user_name': user.get_full_name(),
        'first_name': user.first_name,
        'user_phone': user.phone,
    })


def client_profile_photo(request):
    """POST /htmx/client/profile/photo/"""
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Non connecté'}, status=401)
    photo = request.FILES.get('photo')
    if not photo:
        return JsonResponse({'error': 'Aucune photo fournie.'}, status=400)
    if photo.size > 5 * 1024 * 1024:
        return JsonResponse({'error': 'Fichier trop grand (max 5 Mo).'}, status=400)
    user = request.user
    user.photo = photo
    user.save(update_fields=['photo'])
    return JsonResponse({
        'success': True,
        'photo_url': _client_photo_url(request, user),
    })


def client_account_delete(request):
    """POST /htmx/client/account/delete/ — suppression définitive du compte client."""
    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non autorisée'}, status=405)
    if not request.user.is_authenticated:
        return JsonResponse({'error': 'Non connecté'}, status=401)
    confirm = (request.POST.get('confirm') or '').strip().lower()
    if confirm not in ('supprimer', 'delete', 'oui'):
        return JsonResponse({'error': 'Confirmation requise. Tapez SUPPRIMER.'}, status=400)
    user = request.user
    uid = user.pk
    try:
        from notifications.models import PushDevice
        PushDevice.objects.filter(user=user).delete()
    except Exception:
        pass
    logout(request)
    user.delete()
    return JsonResponse({'success': True, 'deleted_id': uid})


def client_order_stats(request):
    """GET /htmx/client/orders/stats/ — quick JSON stats for compte.html"""
    if not request.user.is_authenticated:
        return JsonResponse({'total': 0, 'this_month': 0, 'pending': 0, 'completed': 0})
    now = timezone.now()
    qs = Order.objects.filter(user=request.user)
    active_statuses = ['driver_assigned', 'on_way', 'arrived', 'in_progress', 'pending', 'price_proposed', 'price_confirmed']
    return JsonResponse({
        'total': qs.count(),
        'this_month': qs.filter(created_at__year=now.year, created_at__month=now.month).count(),
        'pending': qs.filter(status__in=active_statuses).count(),
        'completed': qs.filter(status='completed').count(),
    })


def client_order_receipt_pdf(request, order_id):
    """GET /htmx/client/orders/<id>/receipt.pdf — downloadable receipt."""
    from julmin_taxis.receipt_pdf import generate_order_receipt_pdf

    try:
        order = Order.objects.select_related('driver', 'enterprise').get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        return HttpResponse('Commande introuvable', status=404)

    if order.status != 'completed':
        return HttpResponse('Reçu disponible uniquement pour les courses terminées.', status=400)

    allowed = False
    if request.user.is_authenticated and order.user_id == request.user.pk:
        allowed = True
    guest_id = request.GET.get('guest_id', '') or request.session.get('guest_id', '')
    if guest_id and order.guest_id == guest_id:
        allowed = True
    if not allowed:
        return HttpResponse('Accès non autorisé', status=403)

    pdf_bytes = generate_order_receipt_pdf(order)
    response = HttpResponse(pdf_bytes, content_type='application/pdf')
    response['Content-Disposition'] = f'attachment; filename="daxi-recu-{order.pk}.pdf"'
    return response


def _render_wa_accept_html(*, title, message, tone='error', order_id=None, icon=None):
    """Page légère après clic lien WhatsApp (acceptation course)."""
    tones = {
        'error': ('#ef4444', icon or '❌'),
        'warning': ('#fbbf24', icon or 'ℹ️'),
        'success': ('#22c55e', icon or '✅'),
    }
    color, icon_char = tones.get(tone, tones['error'])
    order_link = f'/driver/#commande-{order_id}' if order_id else '/driver/'
    return f'''<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DAXI — {title}</title>
<style>body{{font-family:Inter,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}}
.card{{max-width:400px;background:#1e293b;border-radius:20px;padding:32px;text-align:center;border:1px solid rgba(148,163,184,.2);}}
.icon{{font-size:48px;margin-bottom:12px;}} h1{{font-size:20px;margin:0 0 12px;color:{color};}} p{{font-size:14px;line-height:1.6;color:#94a3b8;}}
a{{display:inline-block;margin-top:20px;padding:12px 24px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0f172a;text-decoration:none;border-radius:12px;font-weight:800;}}</style></head>
<body><div class="card"><div class="icon">{icon_char}</div><h1>{title}</h1><p>{message}</p>
<a href="{order_link}">Ouvrir l'app chauffeur</a></div></body></html>'''


def driver_wa_accept_page(request, order_id, token=None):
    """GET /wa/accept/<order_id>/[<token>/] — acceptation via lien WhatsApp signé."""
    from django.shortcuts import redirect
    from julmin_taxis.whatsapp_accept import accept_order_from_token

    token = (token or request.GET.get('sig') or request.GET.get('t') or '').strip()
    if not token:
        return driver_wa_accept_legacy_page(request, order_id)

    ok, msg, code = accept_order_from_token(order_id, token)
    if ok:
        return redirect(f'/driver/#commande-{order_id}')
    if code == 'already_taken':
        html = _render_wa_accept_html(
            title='Commande déjà acceptée',
            message=msg or 'Cette commande a déjà été acceptée par un autre chauffeur.',
            tone='warning',
            order_id=order_id,
        )
        return HttpResponse(html)
    if code in ('not_found', 'cancelled_by_client'):
        html = _render_wa_accept_html(
            title='Commande annulée',
            message=msg or 'Le client a annulé cette commande. Elle n\'est plus disponible.',
            tone='warning',
            order_id=order_id,
        )
        return HttpResponse(html)
    html = _render_wa_accept_html(
        title='Acceptation impossible',
        message=msg,
        tone='error',
        order_id=order_id,
    )
    return HttpResponse(html)


def driver_wa_accept_legacy_page(request, order_id):
    """GET /wa/accept/<order_id>/ — anciens liens Meta sans token (évite 404)."""
    sig = (request.GET.get('sig') or request.GET.get('t') or '').strip()
    if sig:
        return driver_wa_accept_page(request, order_id, sig)
    html = f'''<!DOCTYPE html><html lang="fr"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>DAXI — Lien expiré</title>
<style>body{{font-family:Inter,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px;}}
.card{{max-width:420px;background:#1e293b;border-radius:20px;padding:32px;text-align:center;border:1px solid rgba(148,163,184,.2);}}
h1{{font-size:20px;margin:0 0 12px;color:#fbbf24;}} p{{font-size:14px;line-height:1.6;color:#94a3b8;margin:0 0 10px;}}
a{{display:inline-block;margin-top:18px;padding:12px 24px;background:linear-gradient(135deg,#f59e0b,#d97706);color:#0f172a;text-decoration:none;border-radius:12px;font-weight:800;}}</style></head>
<body><div class="card"><h1>Lien à mettre à jour</h1>
<p>Ce bouton WhatsApp est obsolète pour la course #{order_id}.</p>
<p>Répondez <strong>J'accepte</strong> au message DAXI pour recevoir un nouveau lien, ou ouvrez l'app chauffeur.</p>
<a href="/driver/#commande-{order_id}">Ouvrir l'app chauffeur</a></div></body></html>'''
    return HttpResponse(html)


def driver_accept_link_page(request, order_id):
    """GET /driver/accept/<order_id>/ — bouton WhatsApp « J'accepte » (session ou ?sig=)."""
    sig = (request.GET.get('sig') or request.GET.get('t') or '').strip()
    if sig:
        return driver_wa_accept_page(request, order_id, sig)

    from django.shortcuts import redirect
    from drivers.models import Driver
    from orders.models import Order
    from julmin_taxis.whatsapp_accept import _accept_order_for_driver

    driver_id = request.session.get('driver_id')
    if not driver_id:
        return redirect(f'/driver/login/?next=/driver/accept/{order_id}/')

    try:
        driver = Driver.objects.get(pk=driver_id)
        order = Order.objects.get(pk=order_id)
    except (Driver.DoesNotExist, Order.DoesNotExist):
        return redirect('/driver/')

    ok, _msg, _code = _accept_order_for_driver(order, driver)
    return redirect(f'/driver/#commande-{order_id}')


def driver_accept_wa_from_raw(request, raw):
    """GET /driver/accept/<raw>/ — liens Meta mal formés ({{1}}114/token) ou sans route int."""
    from julmin_taxis.whatsapp_accept import parse_malformed_accept_raw

    order_id, token = parse_malformed_accept_raw(raw)
    if order_id:
        if token:
            return driver_wa_accept_page(request, order_id, token)
        return driver_wa_accept_legacy_page(request, order_id)

    from julmin_taxis.error_views import page_not_found
    return page_not_found(request)


def wa_meta_link_dispatch(request, raw):
    """Résout les liens Meta mal concaténés ({{1}} + suffixe ou URL double)."""
    from django.shortcuts import redirect
    from julmin_taxis.wa_meta_links import resolve_meta_link

    resolved = resolve_meta_link(raw)
    if not resolved:
        from julmin_taxis.error_views import page_not_found
        return page_not_found(request)

    kind, payload = resolved
    if kind == 'accept':
        token = payload.get('token') or ''
        if token:
            return driver_wa_accept_page(request, payload['order_id'], token)
        return driver_wa_accept_legacy_page(request, payload['order_id'])
    if kind == 'commande':
        return redirect(f'/driver/#commande-{payload["order_id"]}')
    if kind == 'recu':
        return client_receipt_short_link(request, payload['order_id'])
    if kind == 'compte':
        return redirect(f'/compte/?order={payload["order_id"]}')
    if kind == 'admin':
        return redirect('/admin-dashboard/#orders')
    return page_not_found(request)


def wa_accept_from_raw(request, raw):
    """GET /wa/accept/<raw>/ — même parsing que driver/accept pour liens Meta."""
    return wa_meta_link_dispatch(request, raw)


def driver_commande_from_raw(request, raw):
    """GET /driver/commande_<raw>/ — coords Meta mal formées."""
    from django.shortcuts import redirect
    from julmin_taxis.wa_meta_links import parse_malformed_commande_raw

    order_id = parse_malformed_commande_raw(raw)
    if order_id:
        return redirect(f'/driver/#commande-{order_id}')
    return wa_meta_link_dispatch(request, raw)


def client_receipt_from_raw(request, raw):
    """GET /recu_<raw>.pdf — reçu Meta mal formé."""
    from julmin_taxis.wa_meta_links import parse_malformed_receipt_raw

    order_id = parse_malformed_receipt_raw(raw)
    if order_id:
        return client_receipt_short_link(request, order_id)
    return wa_meta_link_dispatch(request, raw)


def driver_order_deep_link(request, order_id):
    """GET /driver/commande_<id>/ — lien WhatsApp coords / voir commande."""
    from django.shortcuts import redirect
    return redirect(f'/driver/#commande-{order_id}')


def client_receipt_short_link(request, order_id):
    """GET /recu_<id>.pdf — lien court WhatsApp reçu."""
    from django.shortcuts import redirect
    guest_q = request.GET.urlencode()
    url = f'/htmx/client/orders/{order_id}/receipt.pdf'
    if guest_q:
        url = f'{url}?{guest_q}'
    return redirect(url)


def _reject_duplicate_order(
    request, *, user, guest_id, pickup, destination,
    pickup_lat, pickup_lng, dest_lat, dest_lng, trip_type, passengers,
    order_date, order_time, client_phone='', is_later=False, service_plan='',
    enterprise_id=None,
):
    """Empêche 2 commandes identiques en moins de 20 secondes."""
    import hashlib
    from datetime import timedelta
    from django.core.cache import cache

    def _norm(s):
        return (s or '').strip().lower()

    fp_parts = [
        _norm(pickup), _norm(destination),
        str(getattr(user, 'pk', '') or ''), str(guest_id or ''),
        str(round(float(pickup_lat or 0), 4)), str(round(float(pickup_lng or 0), 4)),
        str(round(float(dest_lat or 0), 4)), str(round(float(dest_lng or 0), 4)),
        _norm(trip_type), str(passengers),
        str(order_date or ''), str(order_time or ''),
        _norm(client_phone), str(bool(is_later)), _norm(service_plan),
        str(enterprise_id or ''),
    ]
    fp = hashlib.sha256('|'.join(fp_parts).encode('utf-8')).hexdigest()
    cache_key = f'daxi_order_dup:{fp}'
    if cache.get(cache_key):
        return 'Une commande identique vient d\'être envoyée. Patientez quelques secondes.'

    since = timezone.now() - timedelta(seconds=20)
    dup_q = Order.objects.filter(
        created_at__gte=since,
        pickup=pickup.strip(),
        destination=destination.strip(),
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        destination_lat=dest_lat,
        destination_lng=dest_lng,
        trip_type=trip_type,
        passengers=passengers,
    )
    if enterprise_id:
        dup_q = dup_q.filter(enterprise_id=enterprise_id)
    elif user:
        dup_q = dup_q.filter(user=user)
    elif guest_id:
        dup_q = dup_q.filter(guest_id=guest_id, user__isnull=True)
    else:
        return None

    if dup_q.exists():
        cache.set(cache_key, 1, 20)
        return 'Une commande identique vient d\'être envoyée. Patientez quelques secondes.'

    cache.set(cache_key, 1, 20)
    return None


def client_create_order(request):
    """POST /htmx/client/order/create/
    Works for both authenticated users and anonymous guests (FingerprintJS guest_id).
    """
    pickup = request.POST.get('pickup', '').strip()
    destination = request.POST.get('destination', '').strip()
    pickup_lat = request.POST.get('pickup_lat', '').strip()
    pickup_lng = request.POST.get('pickup_lng', '').strip()

    if not pickup or not destination:
        return _htmx_error('Départ et destination requis')

    from julmin_taxis.client_debt import get_unpaid_debt
    if get_unpaid_debt(request):
        return _htmx_error(
            'Vous avez un solde dû à régler en ligne. Rechargez la page pour accéder au paiement.'
        )

                             
    if request.user.is_authenticated:
        order_user = request.user
        order_guest_id = ''
        client_name = request.user.get_full_name() or request.user.email
        client_email = request.user.email
        client_phone = getattr(request.user, 'phone', '') or request.POST.get('phone', '')
    else:
        order_user = None
        order_guest_id = request.POST.get('guest_id', '').strip() or request.session.get('guest_id', '')
        if not order_guest_id:
            return _htmx_error('Identifiant invité manquant. Veuillez réessayer.')
                                                         
        request.session['guest_id'] = order_guest_id
        client_name = request.POST.get('client_name', 'Client invité').strip() or 'Client invité'
        client_email = request.POST.get('client_email', '').strip()
        client_phone = request.POST.get('client_phone', '').strip() or request.POST.get('phone', '')

    from orders.models import client_is_blocked
    if client_is_blocked(
        user=order_user,
        email=client_email or (order_user.email if order_user else ''),
        phone=client_phone,
        guest_id=order_guest_id,
    ):
        return _htmx_error('Votre accès aux commandes est suspendu. Contactez le support DAXI.')

    order_date_str = request.POST.get('date', '').strip()
    order_time_str = request.POST.get('time', '').strip()
    order_date = None
    order_time = None

    if order_date_str:
        try:
            order_date = datetime.strptime(order_date_str, '%Y-%m-%d').date()
        except ValueError:
            pass

    if order_time_str:
        try:
            order_time = datetime.strptime(order_time_str, '%H:%M').time()
        except ValueError:
            pass

    pickup_lat = float(request.POST.get('pickup_lat', 0) or 0) or None
    pickup_lng = float(request.POST.get('pickup_lng', 0) or 0) or None
    dest_lat = float(request.POST.get('destination_lat', 0) or 0) or None
    dest_lng = float(request.POST.get('destination_lng', 0) or 0) or None

    has_pickup_coords = bool(pickup_lat and pickup_lng)
    has_dest_coords = bool(dest_lat and dest_lng)
    has_full_coords = has_pickup_coords and has_dest_coords

    if has_pickup_coords and not coords_in_covered_zone(pickup_lat, pickup_lng):
        return _htmx_error('DAXI ne couvre pas encore le point de départ sélectionné.')
    if has_dest_coords and not coords_in_covered_zone(dest_lat, dest_lng):
        return _htmx_error('DAXI ne couvre pas encore la destination sélectionnée.')

                                                            
    client_gps_lat = float(request.POST.get('client_gps_lat', 0) or 0) or None
    client_gps_lng = float(request.POST.get('client_gps_lng', 0) or 0) or None
    from julmin_taxis.gps_accuracy import parse_client_gps_accuracy
    client_gps_accuracy = parse_client_gps_accuracy(request.POST.get('client_gps_accuracy'))
    posted_acc = (request.POST.get('client_gps_accuracy') or '').strip()
    if posted_acc and client_gps_accuracy is None:
        client_gps_lat = None
        client_gps_lng = None
    elif not client_gps_lat and pickup_lat and pickup_lng and client_gps_accuracy is not None:
        client_gps_lat, client_gps_lng = pickup_lat, pickup_lng

    raw_trip = request.POST.get('trip_type', 'aller simple').strip()
    trip_type = 'round_trip' if 'retour' in raw_trip.lower() else 'one_way'

                                                                     
    scheduled_at = None
    is_later_order = False
    is_later_param = request.POST.get('is_later', '').strip().lower()
    if is_later_param in ('true', '1', 'yes') or request.POST.get('schedule_type', '') == 'later':
        is_later_order = True

    if is_later_order and (not order_date or not order_time):
        return _htmx_error('Veuillez indiquer la date et l\'heure pour une course programmée.')

    if order_date and order_time:
        try:
            import pytz
            ht = pytz.timezone('America/Port-au-Prince')
            naive_dt = datetime.combine(order_date, order_time)
            scheduled_at = ht.localize(naive_dt)
                                                                      
            now = timezone.now()
            if (scheduled_at - now).total_seconds() > 900:
                is_later_order = True
            else:
                is_later_order = False
        except Exception:
            pass

    passengers_raw = request.POST.get('passengerCount') or request.POST.get('passengers', '1')
    try:
        passengers = int(passengers_raw)
    except:
        passengers = 1

                                        
    enterprise_affiliate = None
    enterprise_commission_pct = None
    aff_id = request.session.get('enterprise_affiliate')
    if aff_id:
        try:
            from enterprises.models import Enterprise as _Ent
            enterprise_affiliate = _Ent.objects.get(pk=aff_id, status='approved')
            enterprise_commission_pct = enterprise_affiliate.commission_percent
        except Exception:
            enterprise_affiliate = None
    if enterprise_affiliate is None:
        aff_code = (
            request.POST.get('affiliate_code')
            or request.POST.get('ref')
            or ''
        ).strip()
        if aff_code:
            try:
                from enterprises.models import Enterprise as _Ent
                enterprise_affiliate = _Ent.objects.get(
                    affiliate_code__iexact=aff_code, status='approved'
                )
                enterprise_commission_pct = enterprise_affiliate.commission_percent
                request.session['enterprise_affiliate'] = enterprise_affiliate.pk
                request.session.modified = True
            except Exception:
                enterprise_affiliate = None

    passengers = int(request.POST.get('passengerCount', 1) or 1)

    wait_minutes = 0
    if trip_type == 'round_trip':
        try:
            wait_minutes = max(0, int(request.POST.get('round_trip_wait_minutes', 0) or 0))
        except (TypeError, ValueError):
            wait_minutes = 0
    allow_driver_other = (
        trip_type == 'round_trip'
        and wait_minutes > 30
        and request.POST.get('round_trip_allow_driver_other_rides', '').lower() in ('true', '1', 'yes', 'on')
    )

                                                                    
    service_plan = request.POST.get('service_plan', '').strip()
    order_notes = request.POST.get('notes', '').strip()
    plan_waypoints = request.POST.get('plan_waypoints', '').strip()
    if plan_waypoints:
        order_notes = _embed_plan_stops_in_notes(order_notes, plan_waypoints)
    from julmin_taxis.order_security import resolve_order_price_for_create
    fixed_price, is_fixed_plan = resolve_order_price_for_create(
        service_plan,
        pickup_lat, pickup_lng, dest_lat, dest_lng,
        trip_type=trip_type,
        passengers=passengers,
        wait_minutes=wait_minutes,
        allow_driver_other=allow_driver_other,
        enterprise_commission_pct=enterprise_commission_pct,
    )

    dup_msg = _reject_duplicate_order(
        request,
        user=order_user, guest_id=order_guest_id,
        pickup=pickup, destination=destination,
        pickup_lat=pickup_lat, pickup_lng=pickup_lng,
        dest_lat=dest_lat, dest_lng=dest_lng,
        trip_type=trip_type, passengers=passengers,
        order_date=order_date, order_time=order_time,
        client_phone=client_phone, is_later=is_later_order,
        service_plan=service_plan,
    )
    if dup_msg:
        return _htmx_error(dup_msg)

    meeting_lat = pickup_lat if has_pickup_coords else client_gps_lat
    meeting_lng = pickup_lng if has_pickup_coords else client_gps_lng

    order = Order.objects.create(
        user=order_user,
        guest_id=order_guest_id,
        client_name=client_name,
        client_email=client_email,
        client_phone=client_phone,
        pickup=pickup,
        destination=destination,
        pickup_lat=pickup_lat,
        pickup_lng=pickup_lng,
        destination_lat=dest_lat,
        destination_lng=dest_lng,
        meeting_lat=meeting_lat,
        meeting_lng=meeting_lng,
        date=order_date,
        time=order_time,
        scheduled_at=scheduled_at,
        is_later=is_later_order,
        client_gps_lat=client_gps_lat,
        client_gps_lng=client_gps_lng,
        client_gps_updated_at=timezone.now() if client_gps_lat else None,
        client_gps_accuracy=client_gps_accuracy,
        notes=order_notes,
        vehicle_type=request.POST.get('vehicle_type', 'economy'),
        trip_type=trip_type,
        round_trip_wait_minutes=wait_minutes,
        round_trip_allow_driver_other_rides=allow_driver_other,
        service_plan=service_plan,
        status='price_confirmed' if fixed_price else 'pending',
        price=fixed_price if fixed_price else None,
        price_confirmed=bool(fixed_price),
        passengers=passengers,
        enterprise=enterprise_affiliate,
        enterprise_commission_pct=enterprise_commission_pct,
    )
    if enterprise_affiliate:
        try:
            from lieux.services import refresh_enterprise_place_activity
            refresh_enterprise_place_activity(enterprise_affiliate)
        except Exception:
            pass
    request._daxi_order = order

                                                                
    if fixed_price:
        _notify_ws('admin', 'new_order_pending_accept', {'order_id': order.pk, 'pickup': pickup, 'destination': destination})
        try:
            from julmin_taxis.notify import notify_admin_new_order_event
            notify_admin_new_order_event(order)
        except Exception:
            pass
        _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'price_confirmed'})
        return render(request, 'htmx/client_price_proposal.html', {
            'order': _order_to_dict(order),
            'order_id': order.pk,
            'auto_price': fixed_price,
            'fixed_plan': True,
            'plan_name': service_plan,
            'distance_km': _haversine_km(pickup_lat, pickup_lng, dest_lat, dest_lng),
            'trip_type': trip_type,
            'passengers': passengers,
            'pickup': clean_address_display(pickup),
            'destination': clean_address_display(destination),
        })

                                                                                
    distance_km = None
    duration_min = None
    if has_full_coords:
        distance_km = _trip_distance_km(pickup_lat, pickup_lng, dest_lat, dest_lng)
        duration_min = _trip_duration_min(
            pickup_lat, pickup_lng, dest_lat, dest_lng,
            trip_type=trip_type, wait_minutes=wait_minutes,
        )

    if not fixed_price and has_full_coords:
        from pricing.services import apply_price_to_order
        price_result = apply_price_to_order(
            order,
            propose=False,
            enterprise_commission_pct=enterprise_commission_pct,
            actor_request=request,
        )
        if price_result:
            if price_result.distance_km is not None:
                distance_km = price_result.distance_km
            if price_result.duration_min is not None:
                duration_min = price_result.duration_min
        order.refresh_from_db()

    _notify_ws('admin', 'new_order_pending_accept', {
        'order_id': order.pk,
        'pickup': pickup,
        'destination': destination,
    })
    try:
        from julmin_taxis.notify import notify_admin_new_order_event, notify_coords_needed_event
        notify_admin_new_order_event(order)
        if not has_full_coords and (order.client_phone or '').strip():
            notify_coords_needed_event(order)
    except Exception:
        pass

    try:
        from julmin_taxis.notify import _dispatch_whatsapp
        _dispatch_whatsapp(order.pk, 'notify_client_order_received')
    except Exception:
        pass

    try:
        from julmin_taxis.presence import mark_order_client_action
        mark_order_client_action(order, 'order_created')
    except Exception:
        pass
    try:
        from julmin_taxis.notify import push_order_event
        push_order_event(order, 'order_created')
    except Exception:
        pass

    od = _order_to_dict(order)
    needs_whatsapp = not _order_has_contact_phone(request, order)
    if needs_whatsapp and not has_full_coords:
        return render(request, 'htmx/guest_phone_prompt.html', {
            'order': od,
            'next_step': 'post_order',
            'pending_coords': True,
        })

    if not has_full_coords:
        return render(request, 'htmx/client_order_pending_coords.html', {
            'order': od,
            'order_id': order.pk,
            'pickup': clean_address_display(pickup),
            'destination': clean_address_display(destination),
        })

    return render(request, 'htmx/client_price_proposal.html', {
        'order': od,
        'order_id': order.pk,
        'auto_price': float(order.price) if order.price else None,
        'distance_km': round(float(distance_km), 1) if distance_km else None,
        'duration_min': duration_min,
        'trip_type': trip_type,
        'passengers': passengers,
        'pickup': clean_address_display(pickup),
        'destination': clean_address_display(destination),
        'is_guest': not order_user,
    })


def client_submit_coords(request, order_id):
    """POST /htmx/client/orders/<id>/coords/ — backfill GPS from client when connexion was unstable."""
    from django.http import JsonResponse
    from julmin_taxis.address_utils import coords_in_covered_zone

    if request.method != 'POST':
        return JsonResponse({'ok': False, 'reason': 'method'}, status=405)

    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    if order.status in ('completed', 'cancelled'):
        return JsonResponse({'ok': False, 'reason': 'closed', 'status': order.status})

    if _order_has_full_coords(order):
        price = float(order.price) if order.price else None
        return JsonResponse({
            'ok': True,
            'complete': True,
            'status': order.status,
            'price': price,
        })

    def _parse_coord(*keys):
        for key in keys:
            raw = request.POST.get(key, '').strip()
            if raw:
                try:
                    return float(raw)
                except ValueError:
                    pass
        return None

    pickup_lat = _parse_coord('pickup_lat')
    pickup_lng = _parse_coord('pickup_lng')
    dest_lat = _parse_coord('dest_lat', 'destination_lat')
    dest_lng = _parse_coord('dest_lng', 'destination_lng')

    updated = False
    update_fields = ['updated_at']

    if not order.pickup_lat and pickup_lat is not None and pickup_lng is not None:
        if not _gps_coords_valid(pickup_lat, pickup_lng):
            return JsonResponse({'ok': False, 'reason': 'invalid_pickup'})
        if not coords_in_covered_zone(pickup_lat, pickup_lng):
            return JsonResponse({'ok': False, 'reason': 'pickup_outside_zone'})
        order.pickup_lat = pickup_lat
        order.pickup_lng = pickup_lng
        if order.meeting_lat is None:
            order.meeting_lat = pickup_lat
            order.meeting_lng = pickup_lng
            update_fields.extend(['meeting_lat', 'meeting_lng'])
        update_fields.extend(['pickup_lat', 'pickup_lng'])
        updated = True

    if not order.destination_lat and dest_lat is not None and dest_lng is not None:
        if not _gps_coords_valid(dest_lat, dest_lng):
            return JsonResponse({'ok': False, 'reason': 'invalid_dest'})
        if not coords_in_covered_zone(dest_lat, dest_lng):
            return JsonResponse({'ok': False, 'reason': 'dest_outside_zone'})
        order.destination_lat = dest_lat
        order.destination_lng = dest_lng
        update_fields.extend(['destination_lat', 'destination_lng'])
        updated = True

    if not updated:
        return JsonResponse({'ok': False, 'reason': 'no_coords'})

    order.save(update_fields=list(dict.fromkeys(update_fields)))

    if not _order_has_full_coords(order):
        _notify_ws(f'order_{order.pk}', 'coords_set', {
            'order_id': order.pk,
            'pickup_lat': order.pickup_lat,
            'pickup_lng': order.pickup_lng,
            'destination_lat': order.destination_lat,
            'destination_lng': order.destination_lng,
            'status': order.status,
        })
        return JsonResponse({'ok': True, 'partial': True, 'status': order.status})

    coords_payload = {
        'order_id': order.pk,
        'pickup_lat': order.pickup_lat,
        'pickup_lng': order.pickup_lng,
        'destination_lat': order.destination_lat,
        'destination_lng': order.destination_lng,
    }

    from julmin_taxis.service_plans import resolve_fixed_plan_price
    fixed_plan = resolve_fixed_plan_price(order.service_plan or '')

    if not fixed_plan and not _order_ready_for_driver_accept(order):
        from pricing.services import apply_price_to_order
        apply_price_to_order(order, propose=True, actor_request=request)
        order.refresh_from_db()

    _notify_ws(f'order_{order.pk}', 'coords_set', {
        **coords_payload,
        'status': order.status,
        'price': float(order.price) if order.price else None,
    })
    if order.status == 'price_proposed' and order.price:
        _notify_ws(f'order_{order.pk}', 'price_proposed', {
            'price': float(order.price),
            'total_price': _order_total_price_float(order),
            'order_id': order.pk,
            'status': 'price_proposed',
        })
        _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'price_proposed'})
        try:
            from julmin_taxis.notify import notify_order_status_now
            notify_order_status_now(order, 'price_proposed')
        except Exception:
            pass

    return JsonResponse({
        'ok': True,
        'complete': True,
        'status': order.status,
        'price': float(order.price) if order.price else None,
    })


def client_save_phone(request, order_id):
    """POST /htmx/client/orders/<id>/phone/ — guest WhatsApp number for notifications."""
    phone = request.POST.get('client_phone', '').strip() or request.POST.get('phone', '').strip()
    digits_only = request.POST.get('client_phone_local', '').strip()
    if digits_only:
        import re
        d = re.sub(r'\D', '', digits_only)
        if len(d) == 8:
            phone = '+509' + d
        elif d.startswith('509') and len(d) >= 11:
            phone = '+' + d
    phone = _sanitize_phone(phone)
    if not phone:
        return _htmx_error('Numéro requis (8 chiffres après +509)')

    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    order.client_phone = phone
    order.save(update_fields=['client_phone'])

    next_step = request.POST.get('next', 'payment')
    payment_method = request.POST.get('payment_method', 'in_person')
    if next_step == 'post_order':
        od = _order_to_dict(order)
        has_coords = bool(
            order.pickup_lat and order.pickup_lng
            and order.destination_lat and order.destination_lng
        )
        if not has_coords:
            try:
                from julmin_taxis.notify import notify_coords_needed_event
                notify_coords_needed_event(order)
            except Exception:
                pass
            return render(request, 'htmx/client_order_pending_coords.html', {
                'order': od,
                'order_id': order.pk,
                'pickup': clean_address_display(order.pickup),
                'destination': clean_address_display(order.destination),
            })
        if order.price and order.status == 'pending':
            return render(request, 'htmx/client_price_proposal.html', {
                'order': od,
                'order_id': order.pk,
                'auto_price': float(order.price),
                'pickup': clean_address_display(order.pickup),
                'destination': clean_address_display(order.destination),
            })
        return _render_client_sheet_fragment(request, order)
    if next_step == 'post_payment':
        return _render_client_sheet_fragment(request, order)
    if next_step == 'done':
        return HttpResponse(
            '<div style="background:#ecfdf5;border:1px solid #6ee7b7;color:#065f46;border-radius:12px;padding:14px 16px;font-size:13px;font-weight:600;text-align:center;">'
            '✅ Numéro enregistré — vous recevrez les notifications WhatsApp</div>',
            content_type='text/html'
        )

    if _order_needs_payment(order):
        from julmin_taxis.refund_policy import service_contract_html
        return render(request, 'htmx/client_payment_selection.html', {
            'order': _order_to_dict(order),
            'csrf_token': request.META.get('CSRF_COOKIE', ''),
            'contract_html': service_contract_html(),
            'payment_pending': bool(
                (order.payment_method or '').strip()
                and (order.payment_status or '') == 'pending'
            ),
        })

    return render(request, 'htmx/guest_phone_prompt.html', {
        'order': _order_to_dict(order),
        'next_step': 'done',
    })


def client_confirm_price(request, order_id):
    """POST /htmx/client/orders/<id>/confirm-price/
    Accepts both newly-created 'pending' orders (auto-price) and 'price_proposed' orders (admin price).
    Works for authenticated users and guests.
    """
    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    if order.status == 'price_confirmed':
        from julmin_taxis.refund_policy import service_contract_html
        return render(request, 'htmx/client_payment_selection.html', {
            'order': _order_to_dict(order),
            'csrf_token': request.META.get('CSRF_COOKIE', ''),
            'contract_html': service_contract_html(),
            'payment_pending': bool(
                (order.payment_method or '').strip()
                and (order.payment_status or '') == 'pending'
            ),
        })

    if order.status not in ('price_proposed', 'pending'):
        if order.status in ('driver_assigned', 'on_way', 'arrived', 'in_progress'):
            return _render_client_sheet_fragment(request, order)
        return _htmx_error('Aucun prix à confirmer')

    from julmin_taxis.presence import mark_order_client_action
    mark_order_client_action(order, 'price_confirmed')

    order.status = 'price_confirmed'
    order.price_confirmed = True
    order.save(update_fields=['status', 'price_confirmed'])

                                                      
    _notify_ws(f'order_{order.pk}', 'price_confirmed', {'order_id': order.pk, 'silent': True})
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'price_confirmed'})
    try:
        from julmin_taxis.notify import notify_client_accepted_price
        notify_client_accepted_price(order)
    except Exception:
        pass

    from julmin_taxis.refund_policy import service_contract_html
    return render(request, 'htmx/client_payment_selection.html', {
        'order': _order_to_dict(order),
        'csrf_token': request.META.get('CSRF_COOKIE', ''),
        'contract_html': service_contract_html(),
    })


def client_refuse_price(request, order_id):
    """POST /htmx/client/orders/<id>/refuse-price/ — refuse price or cancel before driver/payment."""
    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    if order.status in ('completed', 'cancelled'):
        return HttpResponse(
            f'<div id="daxi-refuse-done" data-order-id="{order.pk}" style="display:none;"></div>',
            content_type='text/html',
        )

    can_refuse_price = order.status in ('price_proposed', 'pending')
    can_cancel_pre_pay = (
        order.status == 'price_confirmed'
        and not order.driver_id
        and not _order_payment_confirmed(order)
    )
    if not can_refuse_price and not can_cancel_pre_pay:
        if _client_can_cancel_order(order):
            return _htmx_error(
                'Le tarif est déjà confirmé. Utilisez « Annuler la course » pour retirer cette commande.'
            )
        return HttpResponse(
            f'<div id="daxi-refuse-done" data-order-id="{order.pk}" style="display:none;"></div>',
            content_type='text/html',
        )

    from julmin_taxis.presence import mark_order_client_action
    mark_order_client_action(order, 'price_refused')

    order_id = order.pk
    _notify_ws('admin', 'order_deleted', {
        'order_id': order_id,
        'reason': 'Prix refusé par le client',
    })
    _notify_ws(f'order_{order_id}', 'price_refused', {'order_id': order_id})
    order.delete()

    return HttpResponse(
        f'<div id="daxi-refuse-done" data-order-id="{order_id}" style="display:none;"></div>',
        content_type='text/html',
    )


def client_cancel_order(request, order_id):
    """POST /htmx/client/orders/<id>/cancel/ — tant qu'aucun chauffeur n'a accepté."""
    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    if not _client_can_cancel_order(order):
        if order.driver_id or order.status in ('driver_assigned', 'on_way', 'arrived', 'in_progress'):
            return _htmx_error('Un chauffeur a déjà accepté — contactez le support pour annuler.')
        return _htmx_error('Cette commande ne peut plus être annulée')

    old_status = order.status
    from julmin_taxis.presence import mark_order_client_action
    mark_order_client_action(order, 'order_cancelled')

    order.status = 'cancelled'
    order.cancelled_at = timezone.now()
    order.save(update_fields=['status', 'cancelled_at'])

    from julmin_taxis.security_audit import log_status_change
    log_status_change(order, old_status, 'cancelled', request=request, source='client_cancel')
    try:
        from julmin_taxis.client_debt import maybe_record_cash_cancellation_debt
        maybe_record_cash_cancellation_debt(order, old_status)
    except Exception:
        pass

    _notify_ws(f'order_{order.pk}', 'order_cancelled', {'order_id': order.pk, 'status': 'cancelled'})
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'cancelled'})

    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, 'cancelled')
    except Exception:
        pass

    return HttpResponse(
        f'<div id="daxi-cancel-done" data-order-id="{order.pk}" style="display:none;"></div>'
        f'<script>if(window._daxiOnOrderCancelled)window._daxiOnOrderCancelled({order.pk});</script>',
        content_type='text/html',
    )


                                                                                 
               
                                                                                 

def client_chat_messages(request, order_id):
    """GET /htmx/client/chat/<order_id>/"""
                                                                  
    try:
        oid = int(order_id)
        if request.user.is_authenticated:
            order = Order.objects.get(pk=oid, user=request.user)
        else:
            gid = request.GET.get('guest_id', '') or request.POST.get('guest_id', '') or request.session.get('guest_id', '')
            if not gid:
                return _htmx_error('Connectez-vous pour accéder au chat.', 200)
                                                    
            if gid and not request.session.get('guest_id'):
                request.session['guest_id'] = gid
            order = Order.objects.get(pk=oid, guest_id=gid, user__isnull=True)
    except (Order.DoesNotExist, ValueError):
        return _htmx_error('Commande introuvable')

    messages = order.messages.order_by('timestamp')[:100]
    OrderMessage.objects.filter(order=order, sender_type='driver', is_read=False).update(is_read=True)
    return render(request, 'htmx/chat_messages.html', {
        'messages': _order_messages_for_scope(order, 'user', request),
        'order_id': order_id,
        'scope': 'user',
    })


def client_chat_send(request, order_id):
    """POST /htmx/client/chat/<order_id>/send/"""
    try:
        oid = int(order_id)
        if request.user.is_authenticated:
            order = Order.objects.get(pk=oid, user=request.user)
        else:
            gid = request.POST.get('guest_id', '') or request.GET.get('guest_id', '') or request.session.get('guest_id', '')
            if not gid:
                return _htmx_error('Session expirée. Reconnectez-vous.', 200)
                             
            if gid and not request.session.get('guest_id'):
                request.session['guest_id'] = gid
            order = Order.objects.get(pk=oid, guest_id=gid, user__isnull=True)
    except (Order.DoesNotExist, ValueError):
        return _htmx_error('Commande introuvable')

    parsed, err = _parse_chat_send(request)
    if err:
        return _htmx_error(err)
    reply_to = None
    if parsed['reply_to_id']:
        reply_to = OrderMessage.objects.filter(pk=parsed['reply_to_id'], order=order).first()
    msg = OrderMessage.objects.create(
        order=order,
        sender=request.user if request.user.is_authenticated else None,
        sender_type='user',
        sender_name=order.client_name if not request.user.is_authenticated else (request.user.get_full_name() or request.user.email),
        content=parsed['content'],
        image_url=parsed['image_url'],
        audio_url=parsed.get('audio_url', ''),
        message_type=parsed['message_type'],
        audio_duration_sec=parsed.get('audio_duration_sec'),
        reply_to=reply_to,
    )
    _notify_ws(f'order_{order.pk}', 'new_message', _chat_msg_payload(msg, request))
    try:
        from julmin_taxis.notify import push_notify_driver_message
        push_notify_driver_message(order)
    except Exception:
        pass

    messages = order.messages.order_by('timestamp')[:100]
    return render(request, 'htmx/chat_messages.html', {
        'messages': _order_messages_for_scope(order, 'user', request),
        'order_id': order_id,
        'scope': 'user',
    })


def client_unread_count(request, order_id):
    """GET /htmx/client/chat/<order_id>/unread/ — unread messages from driver"""
    try:
        oid = int(order_id)
        if request.user.is_authenticated:
            order = Order.objects.get(pk=oid, user=request.user)
        else:
            gid = request.GET.get('guest_id', '') or request.session.get('guest_id', '')
            if not gid:
                return JsonResponse({'unread': 0})
            order = Order.objects.get(pk=oid, guest_id=gid, user__isnull=True)
    except (Order.DoesNotExist, ValueError):
        return JsonResponse({'unread': 0})
    count = OrderMessage.objects.filter(order=order, sender_type='driver', is_read=False).count()
    return JsonResponse({'unread': count})


                                                                                 
       
                                                                                 

def forum_list(request):
    """GET /htmx/forum/ — list forum publications."""
    try:
        from forum.models import ForumPost
        posts = ForumPost.objects.filter(is_published=True).order_by('-created_at')[:20]
        return render(request, 'htmx/forum_list.html', {'posts': posts})
    except Exception:
        return render(request, 'htmx/forum_list.html', {'posts': []})


def forum_detail(request, post_id):
    """GET /htmx/forum/<id>/ — single post HTML."""
    try:
        from forum.models import ForumPost
        post = get_object_or_404(ForumPost, pk=post_id, is_published=True)
        return render(request, 'htmx/forum_detail.html', {'post': post})
    except Exception:
        return _htmx_error('Publication introuvable')


def forum_create(request):
    """POST /htmx/forum/create/"""
    gate = _admin_gate(request)
    if gate: return gate

    title = request.POST.get('title', '').strip()
    content = request.POST.get('content', '').strip()
    color = request.POST.get('color', '#6366f1').strip()

    if not title:
        return _htmx_error('Le titre est requis')

    try:
        from forum.models import ForumPost
        post = ForumPost.objects.create(
            title=title,
            content=content,
            color=color,
            is_published=True,
        )
        return _htmx_success(f'Publication "{title}" créée')
    except Exception as e:
        return _htmx_error(f'Erreur: {e}')


def forum_delete(request, post_id):
    """DELETE /htmx/forum/<id>/delete/"""
    gate = _admin_gate(request)
    if gate: return gate

    try:
        from forum.models import ForumPost
        post = get_object_or_404(ForumPost, pk=post_id)
        post.delete()
        return HttpResponse('', status=200)
    except Exception as e:
        return _htmx_error(f'Erreur: {e}')


                                                                                 
      
                                                                                 

def _blog_published_qs():
    from django.db.models import Q
    from django.utils import timezone
    from blog.models import BlogArticle
    now = timezone.now()
    return BlogArticle.objects.filter(
        Q(status=BlogArticle.STATUS_PUBLISHED) |
        Q(status=BlogArticle.STATUS_SCHEDULED, scheduled_at__lte=now)
    ).select_related('category').prefetch_related('tags')


def blog_list(request):
    """GET /htmx/blog/ — liste des articles publiés."""
    try:
        from django.db.models import Q
        from blog.models import BlogCategory, BlogTag
        qs = _blog_published_qs().order_by('-published_at')[:24]
        category = request.GET.get('category', '').strip()
        tag = request.GET.get('tag', '').strip()
        q = request.GET.get('q', '').strip()
        if category:
            qs = qs.filter(category__slug=category)
        if tag:
            qs = qs.filter(tags__slug=tag)
        if q:
            qs = qs.filter(
                Q(title__icontains=q) | Q(excerpt__icontains=q) | Q(content__icontains=q)
            )
        categories = BlogCategory.objects.filter(is_active=True).order_by('order', 'name')
        tags = BlogTag.objects.all().order_by('name')[:40]
        return render(request, 'htmx/blog_list.html', {
            'articles': qs.distinct(),
            'categories': categories,
            'tags': tags,
            'active_category': category,
            'active_tag': tag,
            'search_q': q,
        })
    except Exception:
        return render(request, 'htmx/blog_list.html', {
            'articles': [], 'categories': [], 'tags': [],
            'active_category': '', 'active_tag': '', 'search_q': '',
        })


def blog_detail(request, slug):
    """GET /htmx/blog/<slug>/ — fragment détail article."""
    try:
        article = get_object_or_404(_blog_published_qs(), slug=slug)
        article.increment_views()
        similar = _blog_published_qs().exclude(pk=article.pk)
        if article.category_id:
            similar = similar.filter(category_id=article.category_id)
        similar = similar.order_by('-published_at')[:4]
        return render(request, 'htmx/blog_detail.html', {
            'article': article,
            'similar': similar,
        })
    except Exception:
        return _htmx_error('Article introuvable')


def blog_article_page(request, slug):
    """Page SEO complète /blog/<slug>/"""
    try:
        article = get_object_or_404(_blog_published_qs(), slug=slug)
        article.increment_views()
        similar = _blog_published_qs().exclude(pk=article.pk)
        if article.category_id:
            similar = similar.filter(category_id=article.category_id)
        similar = similar.order_by('-published_at')[:4]
        return render(request, 'blog_article.html', {
            'article': article,
            'similar': similar,
        })
    except Exception:
        from django.http import Http404
        raise Http404('Article introuvable')


def blog_index_page(request):
    """Page /blog/ — liste complète."""
    return render(request, 'blog_index.html', {})


                                                                                 
                                   
                                                                                 

def check_card_unlock(request, order_id):
    """
    GET /htmx/order/<id>/unlock-check/
    Returns JSON indicating if the client contact info is unlocked (1h before departure).
    The driver page polls this endpoint every minute for scheduled orders.
    """
    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'unlocked': False, 'error': 'Non autorisé'}, status=401)

    try:
        order = Order.objects.get(pk=int(order_id), driver=driver)
    except (Order.DoesNotExist, ValueError):
        return JsonResponse({'unlocked': False, 'error': 'Commande introuvable'}, status=404)

                                                     
    if not order.date or not order.time:
        return JsonResponse({'unlocked': True, 'phone': order.client_phone, 'email': order.client_email})

    try:
        import pytz
        ht = pytz.timezone('America/Port-au-Prince')
        naive = datetime.combine(order.date, order.time)
        scheduled_dt = ht.localize(naive)
        unlock_dt = scheduled_dt - timedelta(hours=1)
        now = timezone.now()
        unlocked = now >= unlock_dt
    except Exception:
        unlocked = True

    response_data = {
        'unlocked': unlocked,
        'unlock_at': unlock_dt.isoformat() if not unlocked else None,
        'unlock_time_display': unlock_dt.strftime('%H:%M') if not unlocked else None,
    }
    if unlocked:
        response_data['phone'] = order.client_phone
        response_data['email'] = order.client_email

    return JsonResponse(response_data)


                                                                                 
                                                         
                                                                                 

def orders_feed(request):
    """
    GET /htmx/orders/feed/?last_updated=<timestamp>
    Returns HTML fragment with new/updated orders since last_updated.
    Used by pages that poll for real-time updates when WebSocket is unavailable.
    """
    try:
        from julmin_taxis.scheduled_tasks import run_scheduled_order_tasks
        run_scheduled_order_tasks()
    except Exception:
        pass

    scope = request.GET.get('scope', 'admin')

    if scope == 'admin' and not _is_admin_session(request):
        return JsonResponse({'error': 'Non autorisé'}, status=403)

    last_updated_str = request.GET.get('last_updated', '')
    try:
        last_dt = datetime.fromisoformat(last_updated_str)
        if timezone.is_naive(last_dt):
            last_dt = timezone.make_aware(last_dt)
    except (ValueError, TypeError):
        last_dt = timezone.now() - timedelta(seconds=30)

    qs = Order.objects.filter(updated_at__gte=last_dt).select_related('driver', 'user')[:20]
    orders_data = [_order_to_dict(o) for o in qs]
    now_iso = timezone.now().isoformat()

    return JsonResponse({
        'orders': orders_data,
        'server_time': now_iso,
        'count': len(orders_data),
    }, default=str)


                                                                             
                                     
                                                                             

from enterprises.models import Enterprise, EnterpriseChatMessage
from django.contrib.auth.hashers import make_password, check_password as _check_pw


def _enterprise_gate(request):
    eid = request.session.get("enterprise_id")
    if not eid:
        return _htmx_error("Entreprise non connectée.", 200)
    try:
        Enterprise.objects.get(pk=eid, status="approved")
        return None
    except Enterprise.DoesNotExist:
        return _htmx_error("Accès non autorisé.", 200)


def _get_enterprise(request):
    eid = request.session.get("current_enterprise_id") or request.session.get("enterprise_id")
    if not eid:
        return None
    try:
        return Enterprise.objects.get(pk=eid)
    except Enterprise.DoesNotExist:
        return None


def enterprise_register(request):
    if request.method != "POST":
        return _htmx_error("Méthode non supportée", 405)
    name  = request.POST.get("name", "").strip()
    phone = request.POST.get("phone", "").strip()
    email = request.POST.get("email", "").strip().lower()
    pwd   = request.POST.get("password", "")
    mode  = request.POST.get("mode", "shared_code").strip()
    notes = request.POST.get("presentation", "").strip()
    if not all([name, phone, email, pwd]):
        return _htmx_error("Tous les champs obligatoires doivent être remplis.", 200)
    if len(pwd) < 6:
        return _htmx_error("Le mot de passe doit contenir au moins 6 caractères.", 200)
    from julmin_taxis.reg_otp_cache import consume_registration_otp, validate_registration_otp
    from julmin_taxis.whatsapp_service import _normalize_phone
    otp = request.POST.get("otp", "").strip()
    phone_norm = _normalize_phone(phone)
    ok, otp_err = validate_registration_otp(email, otp, phone_norm=phone_norm, namespace='')
    if not ok:
        return _htmx_error(otp_err, 200)
    consume_registration_otp(email, namespace='')
                                                             
    if Enterprise.objects.filter(email=email, name=name).exists():
        return _htmx_error("Une entreprise avec ce nom existe déjà pour cet email.", 200)
                                                                           
    existing = Enterprise.objects.filter(email=email).first()
    if existing:
        if not _check_pw(pwd, existing.password_hash):
            return _htmx_error("Pour créer une nouvelle entreprise, utilisez le même mot de passe que votre compte principal.", 200)
        pwd_hash = existing.password_hash
    else:
        pwd_hash = make_password(pwd)
    ent = Enterprise.objects.create(
        name=name, phone=phone, email=email,
        password_hash=pwd_hash, mode=mode, presentation=notes,
    )
    all_ids = list(Enterprise.objects.filter(email=email).values_list('pk', flat=True))
    request.session["enterprise_id"] = ent.pk
    request.session["current_enterprise_id"] = ent.pk
    request.session["enterprise_ids"] = all_ids
    request.session.modified = True
    request.session.save()
    _notify_ws('admin', 'enterprise_pending', {'enterprise_id': ent.pk, 'name': ent.name})
    try:
        from julmin_taxis.notify import notify_admin_enterprise_pending_event
        notify_admin_enterprise_pending_event(ent)
    except Exception:
        pass
    return _htmx_success("Demande soumise avec succès ! Vous serez redirigé...")


def enterprise_login(request):
    if request.method != "POST":
        return _htmx_error("Méthode non supportée", 405)
    email = request.POST.get("email", "").strip().lower()
    pwd   = request.POST.get("password", "")
    if not email or not pwd:
        return JsonResponse({"error": "Email et mot de passe requis."})
    all_ents = list(Enterprise.objects.filter(email=email).order_by('-created_at'))
    if not all_ents:
        return JsonResponse({"error": "Aucun compte trouvé avec cet email."})
    if not _check_pw(pwd, all_ents[0].password_hash):
        return JsonResponse({"error": "Mot de passe incorrect."})
                                                                 
    current = (
        next((e for e in all_ents if e.status == 'approved'), None)
        or next((e for e in all_ents if e.status == 'pending'), None)
        or all_ents[0]
    )
    all_ids = [e.pk for e in all_ents]
    request.session["enterprise_id"] = current.pk
    request.session["current_enterprise_id"] = current.pk
    request.session["enterprise_ids"] = all_ids
    request.session.modified = True
    request.session.save()
    enterprises_data = [{"id": e.pk, "name": e.name, "status": e.status} for e in all_ents]
    rejection_reason = (current.admin_notes or '').strip() if current.status == 'rejected' else ''
    return JsonResponse({
        "enterprise_id": current.pk,
        "status": current.status,
        "rejection_reason": rejection_reason,
        "enterprises": enterprises_data,
    })


def enterprise_logout(request):
    request.session.pop("enterprise_id", None)
    request.session.pop("current_enterprise_id", None)
    request.session.pop("enterprise_ids", None)
    response = HttpResponse("", status=200)
    response["HX-Refresh"] = "true"
    return response


def enterprise_switch(request):
    if request.method != "POST":
        return _htmx_error("Méthode non supportée", 405)
    enterprise_ids = request.session.get("enterprise_ids", [])
    try:
        eid = int(request.POST.get("enterprise_id", 0))
    except (ValueError, TypeError):
        return _htmx_error("ID invalide.", 200)
    if eid not in enterprise_ids:
        return _htmx_error("Accès non autorisé.", 200)
    request.session["current_enterprise_id"] = eid
    request.session["enterprise_id"] = eid
    request.session.modified = True
    response = HttpResponse("OK", status=200)
    response["HX-Refresh"] = "true"
    return response


def enterprise_dashboard(request):
    ent = _get_enterprise(request)
    if not ent:
        return _htmx_error("Non connecté.", 200)
    if request.GET.get('wallet') == '1':
        return render(request, 'htmx/enterprise_wallet.html', _enterprise_wallet_context(ent))
                                  
    if not ent.affiliate_code:
        from enterprises.models import _gen_code
        ent.affiliate_code = _gen_code()
        ent.save(update_fields=['affiliate_code'])
    from django.conf import settings
    site_url = getattr(settings, "SITE_URL", "http://localhost:8000").rstrip('/')
    affiliate_url = f"{site_url}/?ref={ent.affiliate_code}"
    orders_qs = Order.objects.filter(enterprise=ent).select_related("driver").order_by("-created_at")[:20]
    orders_data = [_order_to_dict(o) for o in orders_qs]
    total_orders = Order.objects.filter(enterprise=ent).count()
    completed_qs = Order.objects.filter(enterprise=ent, status="completed")
    total_earnings = round(sum(
        float(o.price or 0) * float(o.enterprise_commission_pct or 0) / 100
        for o in completed_qs
    ), 2)
                                
    now = timezone.now()
    weekly_labels, weekly_orders_data, weekly_earn_data = [], [], []
    for i in range(6, -1, -1):
        day = now - timedelta(days=i)
        ds = day.replace(hour=0, minute=0, second=0, microsecond=0)
        de = day.replace(hour=23, minute=59, second=59, microsecond=999999)
        day_qs = Order.objects.filter(enterprise=ent, created_at__range=(ds, de))
        cnt = day_qs.count()
        earn = round(sum(
            float(o.price or 0) * float(o.enterprise_commission_pct or 0) / 100
            for o in day_qs if o.status == 'completed'
        ), 2)
        weekly_labels.append(day.strftime('%a'))
        weekly_orders_data.append(cnt)
        weekly_earn_data.append(earn)
                                                   
    all_ents = list(Enterprise.objects.filter(email=ent.email).values('pk', 'name', 'status', 'mode'))
    ent.chat_messages.filter(is_from_admin=True, is_read=False).update(is_read=True)
    chat_msgs = ent.chat_messages.all().order_by("created_at")
    return render(request, "htmx/enterprise_dashboard.html", {
        "enterprise": ent,
        "affiliate_url": affiliate_url,
        "orders": orders_data,
        "total_orders": total_orders,
        "total_earnings": total_earnings,
        "chat_messages": chat_msgs,
        "weekly_labels_json": json.dumps(weekly_labels),
        "weekly_orders_json": json.dumps(weekly_orders_data),
        "weekly_earn_json": json.dumps(weekly_earn_data),
        "all_enterprises_json": json.dumps(all_ents),
    })


def enterprise_chat(request):
    ent = _get_enterprise(request)
    if not ent:
        return _htmx_error("Non connecté.", 200)
    msgs = ent.chat_messages.all().order_by("created_at")
    ent.chat_messages.filter(is_from_admin=True, is_read=False).update(is_read=True)
    return render(request, "htmx/enterprise_chat.html", {"messages": msgs, "enterprise": ent})


def enterprise_chat_send(request):
    ent = _get_enterprise(request)
    if not ent:
        return _htmx_error("Non connecté.", 200)
    if request.method != "POST":
        return _htmx_error("Méthode non supportée", 405)
    msg = request.POST.get("message", "").strip()
    if not msg:
        return _htmx_error("Message vide.", 200)
    EnterpriseChatMessage.objects.create(enterprise=ent, message=msg, is_from_admin=False)
    msgs = ent.chat_messages.all().order_by("created_at")
    return render(request, "htmx/enterprise_chat.html", {"messages": msgs, "enterprise": ent})


def enterprise_create_order(request):
    gate = _enterprise_gate(request)
    if gate: return gate
    eid = request.session["enterprise_id"]
    ent = Enterprise.objects.get(pk=eid)
    if ent.mode != 'self_order':
        return _htmx_error("Votre compte utilise le mode lien partagé — vos clients commandent via votre lien.", 200)

    pickup       = request.POST.get("pickup", "").strip()
    destination  = request.POST.get("destination", "").strip()
    client_name  = request.POST.get("client_name", "").strip() or "Client Entreprise"
    client_phone = request.POST.get("client_phone", "").strip()
    notes        = request.POST.get("notes", "").strip()
    plan_waypoints = request.POST.get("plan_waypoints", "").strip()
    if plan_waypoints:
        notes = _embed_plan_stops_in_notes(notes, plan_waypoints)

    if not pickup or not destination:
        return _htmx_error("Départ et destination requis.", 200)

    pickup_lat = float(request.POST.get("pickup_lat", 0) or 0) or None
    pickup_lng = float(request.POST.get("pickup_lng", 0) or 0) or None
    dest_lat   = float(request.POST.get("destination_lat", 0) or 0) or None
    dest_lng   = float(request.POST.get("destination_lng", 0) or 0) or None

                                                                                       
    if not pickup_lat or not pickup_lng:
        if ent.address_lat and ent.address_lng:
            pickup_lat = float(ent.address_lat)
            pickup_lng = float(ent.address_lng)
            if not pickup:
                pickup = (ent.address_label or ent.name or '').strip()
        else:
            if ent.location_status == 'admin_help':
                return HttpResponse(
                    '<div class="ent-alert ent-alert-info"><i class="ri-time-line"></i>'
                    '<span>Votre demande d\'emplacement a été envoyée à l\'administrateur DAXI. '
                    'Il n\'a pas encore configuré votre point GPS.</span>'
                    '<a class="ent-alert-wa-btn" href="https://wa.me/50944969696?text='
                    + quote(
                        'Bonjour DAXI, je suis l\'entreprise « ' + (ent.name or '') + ' ». '
                        'J\'ai déjà demandé la configuration de mon emplacement mais je ne peux pas encore commander. '
                        'Pouvez-vous finaliser mon GPS ?'
                    )
                    + '" target="_blank" rel="noopener"><i class="ri-whatsapp-line"></i> Écrire à l\'admin</a></div>',
                    content_type='text/html',
                )
            return _htmx_error(
                "Configurez d'abord l'emplacement GPS de votre entreprise "
                "(fenêtre à l'ouverture du tableau de bord ou icône GPS à côté du départ).",
                200,
            )

    if not dest_lat or not dest_lng:
        return _htmx_error(
            "Veuillez sélectionner la destination dans les suggestions d'adresse "
            "(tapez l'adresse puis choisissez une proposition dans la liste).",
            200,
        )

    if not coords_in_covered_zone(pickup_lat, pickup_lng):
        return _htmx_error("DAXI ne couvre pas encore le point de départ sélectionné.", 200)
    if not coords_in_covered_zone(dest_lat, dest_lng):
        return _htmx_error("DAXI ne couvre pas encore la destination sélectionnée.", 200)

    raw_trip = request.POST.get("trip_type", "aller simple").strip()
    trip_type = 'round_trip' if raw_trip.lower() in ('round', 'aller-retour', 'aller retour') or 'retour' in raw_trip.lower() else 'one_way'

    order_date_str = request.POST.get("date", "").strip()
    order_time_str = request.POST.get("time", "").strip()
    order_date = None
    order_time = None
    scheduled_at = None
    is_later_order = request.POST.get("is_later", "").lower() in ('true', '1', 'yes')

    if order_date_str:
        try:
            order_date = datetime.strptime(order_date_str, '%Y-%m-%d').date()
        except ValueError:
            pass
    if order_time_str:
        try:
            order_time = datetime.strptime(order_time_str, '%H:%M').time()
        except ValueError:
            pass

    if is_later_order and (not order_date or not order_time):
        return _htmx_error("Veuillez indiquer la date et l'heure pour une course programmée.", 200)

    if order_date and order_time:
        try:
            import pytz
            ht = pytz.timezone('America/Port-au-Prince')
            scheduled_at = ht.localize(datetime.combine(order_date, order_time))
        except Exception:
            pass

    try:
        passengers = int(request.POST.get("passengers") or request.POST.get("passengerCount") or 1)
    except (TypeError, ValueError):
        passengers = 1

    wait_minutes = 0
    if trip_type == 'round_trip':
        try:
            wait_minutes = max(0, int(request.POST.get('round_trip_wait_minutes', 0) or 0))
        except (TypeError, ValueError):
            wait_minutes = 0
    allow_driver_other = (
        trip_type == 'round_trip'
        and wait_minutes > 30
        and request.POST.get('round_trip_allow_driver_other_rides', '').lower() in ('true', '1', 'yes', 'on')
    )

    service_plan = request.POST.get('service_plan', '').strip()
    from julmin_taxis.order_security import resolve_order_price_for_create
    fixed_price, is_fixed_plan = resolve_order_price_for_create(
        service_plan,
        pickup_lat, pickup_lng, dest_lat, dest_lng,
        trip_type=trip_type,
        passengers=passengers,
        wait_minutes=wait_minutes,
        allow_driver_other=allow_driver_other,
        enterprise_commission_pct=enterprise_commission_pct,
    )

    dup_msg = _reject_duplicate_order(
        request,
        user=None, guest_id='',
        pickup=pickup, destination=destination,
        pickup_lat=pickup_lat, pickup_lng=pickup_lng,
        dest_lat=dest_lat, dest_lng=dest_lng,
        trip_type=trip_type, passengers=passengers,
        order_date=order_date, order_time=order_time,
        client_phone=client_phone, is_later=is_later_order,
        service_plan=service_plan,
        enterprise_id=eid,
    )
    if dup_msg:
        return _htmx_error(dup_msg, 200)

    import uuid
    guest_id = str(uuid.uuid4())

    order = Order.objects.create(
        client_name=client_name, client_phone=client_phone,
        pickup=pickup, destination=destination,
        pickup_lat=pickup_lat, pickup_lng=pickup_lng,
        destination_lat=dest_lat, destination_lng=dest_lng,
        date=order_date, time=order_time, scheduled_at=scheduled_at,
        is_later=is_later_order,
        notes=notes, status='pending',
        trip_type=trip_type,
        round_trip_wait_minutes=wait_minutes,
        round_trip_allow_driver_other_rides=allow_driver_other,
        service_plan=service_plan,
        passengers=passengers,
        price=fixed_price if fixed_price else None,
        price_confirmed=False,
        guest_id=guest_id,
        enterprise=ent, enterprise_commission_pct=ent.commission_percent,
    )
    try:
        from lieux.services import refresh_enterprise_place_activity
        refresh_enterprise_place_activity(ent)
    except Exception:
        pass

    if not fixed_price and pickup_lat and pickup_lng and dest_lat and dest_lng:
        from pricing.services import apply_price_to_order
        try:
            apply_price_to_order(order, propose=False, actor_request=request)
        except Exception:
            pass

    _notify_ws("admin", "new_order", {"order_id": order.pk, "pickup": pickup, "destination": destination})
    try:
        from julmin_taxis.notify import notify_admin_new_order_event, push_order_event
        notify_admin_new_order_event(order)
        push_order_event(order, 'order_created')
    except Exception:
        pass
    orders_qs = Order.objects.filter(enterprise=ent).select_related("driver").order_by("-created_at")[:20]
    return render(request, "htmx/enterprise_orders.html", {
        "orders": [_order_to_dict(o) for o in orders_qs],
        "enterprise": ent,
        "success_msg": f"Commande {order.ref_code} créée avec succès !",
    })


def enterprise_orders(request):
    ent = _get_enterprise(request)
    if not ent:
        return _htmx_error("Non connecté.", 200)
    tab = request.GET.get("tab", "active")
    if tab == "history":
        qs = Order.objects.filter(enterprise=ent, status__in=["completed", "cancelled"])
    else:
        qs = Order.objects.filter(enterprise=ent).exclude(status__in=["completed", "cancelled"])
    orders = qs.select_related("driver").order_by("-created_at")[:40]
    from django.middleware.csrf import get_token
    return render(request, "htmx/enterprise_orders.html", {
        "orders": [_order_to_dict(o) for o in orders],
        "enterprise": ent,
        "mode": ent.mode,
        "tab": tab,
        "csrf_token": get_token(request),
    })


def enterprise_order_chat(request, order_id):
    order, err = _get_order_for_enterprise(request, order_id)
    if err:
        return err
    messages = order.messages.order_by('timestamp')[:100]
    return render(request, 'htmx/chat_messages.html', {
        'messages': _order_messages_for_scope(order, 'admin', request),
        'order_id': order.pk,
        'scope': 'enterprise',
    })


def enterprise_order_chat_send(request, order_id):
    order, err = _get_order_for_enterprise(request, order_id)
    if err:
        return err
    ent = _get_enterprise(request)
    parsed, perr = _parse_chat_send(request)
    if perr:
        return _htmx_error(perr)
    msg = OrderMessage.objects.create(
        order=order,
        sender_type='admin',
        sender_name=ent.name if ent else 'Entreprise',
        content=parsed['content'],
        image_url=parsed['image_url'],
        audio_url=parsed['audio_url'],
        message_type=parsed['message_type'],
        audio_duration_sec=parsed.get('audio_duration_sec'),
        reply_to_id=parsed['reply_to_id'],
    )
    _notify_ws(f'order_{order.pk}', 'new_message', {
        'id': msg.pk,
        'order_id': order.pk,
        'sender_type': 'admin',
        'sender_name': msg.sender_name,
    })
    messages = order.messages.order_by('timestamp')[:100]
    return render(request, 'htmx/chat_messages.html', {
        'messages': _order_messages_for_scope(order, 'admin', request),
        'order_id': order.pk,
        'scope': 'enterprise',
    })


def enterprise_contract_fragment(request):
    """GET — fragment HTML du contrat (modal entreprise)."""
    gate = _enterprise_gate(request)
    if gate:
        return gate
    from julmin_taxis.refund_policy import service_contract_html
    return HttpResponse(service_contract_html(), content_type='text/html')


def enterprise_order_checkout(request, order_id):
    """GET — affiche l'étape de finalisation (prix / paiement / lien client)."""
    order, err = _get_order_for_enterprise(request, order_id)
    if err:
        return err
    _ensure_enterprise_order_guest_id(order)
    from julmin_taxis.refund_policy import service_contract_html
    od = _order_to_dict(order)
    phase = _enterprise_checkout_phase(order)
    pay_url = _enterprise_client_pay_url(order, request)
    return render(request, 'htmx/enterprise_order_checkout.html', {
        'order': od,
        'order_id': order.pk,
        'phase': phase,
        'contract_html': service_contract_html(),
        'client_pay_url': pay_url,
        'can_cancel': _client_can_cancel_order(order),
        'csrf_token': request.META.get('CSRF_COOKIE', ''),
    })


def enterprise_confirm_price(request, order_id):
    """POST — l'entreprise accepte le prix proposé."""
    order, err = _get_order_for_enterprise(request, order_id)
    if err:
        return err
    if order.status != 'pending' or not order.price:
        return _htmx_error('Aucun prix à valider pour cette commande.', 200)
    order.status = 'price_confirmed'
    order.price_confirmed = True
    order.save(update_fields=['status', 'price_confirmed'])
    _notify_ws(f'order_{order.pk}', 'price_confirmed', {'order_id': order.pk, 'silent': True})
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'price_confirmed'})
    try:
        from julmin_taxis.notify import notify_client_accepted_price
        notify_client_accepted_price(order)
    except Exception:
        pass
    return enterprise_order_checkout(request, order_id)


def enterprise_payment_submit(request, order_id):
    """POST — choix payeur + méthode + contrat."""
    order, err = _get_order_for_enterprise(request, order_id)
    if err:
        return err
    if request.POST.get('contract_accepted') != '1':
        return _htmx_error('Veuillez accepter le contrat de service.', 200)
    if order.status != 'price_confirmed':
        return _htmx_error('Cette commande ne peut plus être payée.', 200)
    if _order_payment_confirmed(order):
        return enterprise_order_checkout(request, order_id)

    order.contract_accepted_at = timezone.now()
    payer = (request.POST.get('payer') or 'self').strip()
    method = (request.POST.get('method') or '').strip()

    if payer == 'driver':
        order.payment_method = 'in_person'
        order.payment_status = 'in_person'
        order.save(update_fields=['contract_accepted_at', 'payment_method', 'payment_status'])
        _cancel_unpaid_sibling_orders(order)
        _advance_to_driver_notified(order)
        return render(request, 'htmx/enterprise_order_checkout_done.html', {
            'order': _order_to_dict(order),
            'message': 'Paiement au chauffeur — recherche de chauffeur lancée.',
        })

    if method not in ('moncash', 'card'):
        return _htmx_error('Choisissez MonCash ou carte bancaire.', 200)

    if payer == 'client':
        _ensure_enterprise_order_guest_id(order)
        order.payment_method = method
        order.payment_status = 'pending'
        order.save(update_fields=['contract_accepted_at', 'payment_method', 'payment_status'])
        try:
            from julmin_taxis.notify import push_order_event
            push_order_event(order, 'enterprise_payment_link')
        except Exception:
            pass
        return enterprise_order_checkout(request, order_id)

                                
    order.payment_method = method
    order.payment_status = 'pending'
    order.save(update_fields=['contract_accepted_at', 'payment_method', 'payment_status'])

    if method == 'moncash':
        from julmin_taxis.payments import moncash_connect
        from django.conf import settings as _s
        if not moncash_connect.is_configured():
            return _htmx_error('MonCash temporairement indisponible.')
        site_url = getattr(_s, 'SITE_URL', 'http://localhost:8000').rstrip('/')
        return_url = f'{site_url}/payment/{order.pk}/moncash/return/'
        ref = moncash_connect.order_reference(order.pk)
        amount_htg = usd_to_htg(order.price)
        try:
            payment = moncash_connect.create_payment(
                amount_htg=amount_htg,
                reference_id=ref,
                return_url=return_url,
                customer_name=(order.client_name or '').strip(),
                customer_email='',
                idempotency_key=ref,
            )
        except moncash_connect.MonCashConnectError as exc:
            return _htmx_error(f'MonCash : {exc}')
        order.nowpayments_invoice_id = ref
        order.save(update_fields=['nowpayments_invoice_id'])
        payment_url = payment.get('paymentUrl', '')
        if not payment_url:
            return _htmx_error('URL MonCash indisponible.')
        return HttpResponse(
            f'<script>window.top.location.href = {json.dumps(payment_url)};</script>',
            content_type='text/html',
        )

    order.nowpayments_invoice_id = f'daxi-{order.pk}'
    order.save(update_fields=['nowpayments_invoice_id'])
    card_url = f'/payment/{order.pk}/card/?guest_id={order.guest_id}'
    return HttpResponse(
        f'<script>window.top.location.href = {json.dumps(card_url)};</script>',
        content_type='text/html',
    )


def enterprise_checkout_back(request, order_id):
    """POST — retour à l'étape précédente du parcours entreprise."""
    order, err = _get_order_for_enterprise(request, order_id)
    if err:
        return err
    phase = _enterprise_checkout_phase(order)
    if phase == 'await_client_pay':
        order.payment_method = ''
        order.payment_status = ''
        order.contract_accepted_at = None
        order.save(update_fields=['payment_method', 'payment_status', 'contract_accepted_at'])
    elif phase == 'choose_payment':
        order.status = 'pending'
        order.price_confirmed = False
        order.contract_accepted_at = None
        order.payment_method = ''
        order.payment_status = ''
        order.save(update_fields=['status', 'price_confirmed', 'contract_accepted_at', 'payment_method', 'payment_status'])
    else:
        return _htmx_error('Retour impossible à cette étape.', 200)
    return enterprise_order_checkout(request, order_id)


def enterprise_cancel_order(request, order_id):
    """POST — annuler une commande entreprise (tant qu'aucun chauffeur n'a accepté)."""
    order, err = _get_order_for_enterprise(request, order_id)
    if err:
        return err
    if not _client_can_cancel_order(order):
        return _htmx_error('Cette commande ne peut plus être annulée.', 200)
    old_status = order.status
    order.status = 'cancelled'
    order.cancelled_at = timezone.now()
    order.save(update_fields=['status', 'cancelled_at', 'updated_at'])
    from julmin_taxis.security_audit import log_status_change
    log_status_change(order, old_status, 'cancelled', request=request, source='enterprise_cancel')
    try:
        from julmin_taxis.client_debt import maybe_record_cash_cancellation_debt
        maybe_record_cash_cancellation_debt(order, old_status)
    except Exception:
        pass
    _notify_ws(f'order_{order.pk}', 'order_cancelled', {'order_id': order.pk, 'status': 'cancelled'})
    _notify_ws('admin', 'order_updated', {'order_id': order.pk, 'status': 'cancelled'})
    try:
        from julmin_taxis.notify import notify_order_status_now
        notify_order_status_now(order, 'cancelled')
    except Exception:
        pass
    ent = _get_enterprise(request)
    orders_qs = Order.objects.filter(enterprise=ent).exclude(status__in=['completed', 'cancelled']).select_related('driver').order_by('-created_at')[:40]
    return render(request, 'htmx/enterprise_orders.html', {
        'orders': [_order_to_dict(o) for o in orders_qs],
        'enterprise': ent,
        'mode': ent.mode,
        'tab': 'active',
        'success_msg': f'Commande {order.ref_code} annulée.',
    })


def enterprise_client_pay_page(request, order_id):
    """Page publique — le client paie une commande entreprise via lien/QR."""
    gid = (request.GET.get('g') or '').strip()
    if not gid:
        return HttpResponse('Lien de paiement invalide.', status=400)
    try:
        order = Order.objects.get(pk=int(order_id), guest_id=gid, enterprise__isnull=False)
    except (Order.DoesNotExist, ValueError):
        return HttpResponse('Commande introuvable.', status=404)
    if order.payment_status == 'paid':
        return render(request, 'payer/client_done.html', {'order': order, 'paid': True})
    if order.status != 'price_confirmed':
        return render(request, 'payer/client_done.html', {
            'order': order,
            'paid': False,
            'message': 'Cette commande n\'est pas encore prête pour le paiement.',
        })
    request.session['guest_id'] = gid
    preset_method = (request.GET.get('m') or order.payment_method or '').strip()
    from julmin_taxis.refund_policy import service_contract_html
    return render(request, 'payer/client_pay.html', {
        'order': _order_to_dict(order),
        'order_id': order.pk,
        'guest_id': gid,
        'preset_method': preset_method,
        'csrf_token': request.META.get('CSRF_COOKIE', ''),
        'contract_html': service_contract_html(),
    })


def enterprise_plans(request):
    """Renders the 6 DAXI service plan cards (same catalogue as the client site)
    for use inside the enterprise dashboard's 'Service plans' carousel."""
    ent = _get_enterprise(request)
    if not ent or ent.status != 'approved':
        return _htmx_error("Accès non autorisé.", 403)
    from julmin_taxis.service_plans import PLAN_CATALOG
    icons = {'1': 'ri-road-map-line', '2': 'ri-time-line', '3': 'ri-sun-line', '4': 'ri-moon-line', '5': 'ri-flight-land-line', '6': 'ri-vip-crown-line'}
    plans = []
    catalog = {}
    for pid in ('1', '2', '3', '4', '5', '6'):
        p = PLAN_CATALOG.get(pid, {})
        desc = p.get('description', '')
        entry = {
            'id': pid,
            'title': p.get('title', ''),
            'subtitle': p.get('subtitle', ''),
            'preview': desc[:180] + ('…' if len(desc) > 180 else ''),
            'description': desc,
            'ctaDesc': p.get('ctaDesc', ''),
            'features': p.get('features', []),
            'gallery': p.get('gallery', []),
            'hero': p.get('hero', ''),
            'price': p.get('price', ''),
            'pricing_mode': p.get('pricing_mode', 'dynamic'),
            'service_slug': p.get('service_slug', ''),
            'fixed_amount': p.get('fixed_amount'),
            'icon': icons.get(pid, 'ri-star-line'),
        }
        plans.append(entry)
        catalog[pid] = entry
    return render(request, "htmx/enterprise_plans_section.html", {
        "plans": plans,
        "plans_json": json.dumps(catalog, ensure_ascii=False),
    })


def enterprise_set_location(request):
    gate = _enterprise_gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)
    ent = _get_enterprise(request)
    if not ent:
        return _htmx_error('Entreprise non connectée.', 200)
    try:
        lat = float(request.POST.get('lat', '') or 0)
        lng = float(request.POST.get('lng', '') or 0)
    except (TypeError, ValueError):
        return _htmx_error('Coordonnées invalides.', 200)
    label = (request.POST.get('label') or ent.name or '').strip()
    if not lat or not lng:
        return _htmx_error('Veuillez placer votre entreprise sur la carte.', 200)
    if not coords_in_covered_zone(lat, lng):
        return _htmx_error('DAXI ne couvre pas encore cet emplacement.', 200)
    ent.address_lat = lat
    ent.address_lng = lng
    ent.address_label = label or ent.name
    ent.location_status = 'set'
    ent.location_set_at = timezone.now()
    ent.location_help_message = ''
    ent.location_help_requested_at = None
    ent.save(update_fields=[
        'address_lat', 'address_lng', 'address_label', 'location_status',
        'location_set_at', 'location_help_message', 'location_help_requested_at',
    ])
    try:
        from lieux.models import LieuxPlace
        from lieux.services import sync_place_coords_from_enterprise, register_place_gps
        for place in LieuxPlace.objects.filter(enterprise=ent):
            if sync_place_coords_from_enterprise(place):
                register_place_gps(place)
    except Exception:
        pass
    return render(request, 'htmx/enterprise_location_saved.html', {'enterprise': ent})


def enterprise_location_help(request):
    gate = _enterprise_gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)
    ent = _get_enterprise(request)
    if not ent:
        return _htmx_error('Entreprise non connectée.', 200)
    message = (request.POST.get('message') or '').strip()
    if len(message) < 10:
        return _htmx_error('Décrivez votre emplacement en quelques mots (min. 10 caractères).', 200)
    ent.location_status = 'admin_help'
    ent.location_help_message = message
    ent.location_help_requested_at = timezone.now()
    ent.save(update_fields=['location_status', 'location_help_message', 'location_help_requested_at'])
    _notify_ws('admin', 'enterprise_location_pending', {
        'enterprise_id': ent.pk,
        'name': ent.name,
        'message': message[:200],
    })
    try:
        from julmin_taxis.notify import notify_admin_enterprise_location_event
        notify_admin_enterprise_location_event(ent)
    except Exception:
        pass
    return render(request, 'htmx/enterprise_location_help_sent.html', {'enterprise': ent})


                                                                               

def _admin_enterprises_context(tab='approved'):
    from enterprises.models import Enterprise
    from orders.models import Order
    from django.db.models import Sum, Count, Q

    if tab not in ('pending', 'approved', 'rejected', 'locations'):
        tab = 'approved'
    if tab == 'locations':
        enterprises = Enterprise.objects.filter(
            status='approved',
            location_status='admin_help',
        ).order_by('-location_help_requested_at', '-created_at')
    else:
        enterprises = Enterprise.objects.filter(status=tab).order_by('-created_at')
    for ent in enterprises:
        ent.order_count = Order.objects.filter(enterprise=ent).count()
        ent.completed_order_count = Order.objects.filter(enterprise=ent, status='completed').count()
        ent.revenue_total = Order.objects.filter(
            enterprise=ent, status='completed'
        ).aggregate(s=Sum('price'))['s'] or 0
    stats = {
        'pending': Enterprise.objects.filter(status='pending').count(),
        'approved': Enterprise.objects.filter(status='approved').count(),
        'rejected': Enterprise.objects.filter(status='rejected').count(),
        'locations': Enterprise.objects.filter(status='approved', location_status='admin_help').count(),
        'total_orders': Order.objects.filter(enterprise__isnull=False).count(),
        'total_completed': Order.objects.filter(enterprise__isnull=False, status='completed').count(),
    }
    return {'enterprises': enterprises, 'tab': tab, 'stats': stats}


def admin_enterprises(request):
    gate = _admin_gate(request)
    if gate: return gate
    tab = request.GET.get("tab", "approved")
    ctx = _admin_enterprises_context(tab)
    ctx['csrf_token'] = get_token(request)
    return render(request, "htmx/admin_enterprises.html", ctx)


def admin_enterprise_approve(request, enterprise_id):
    gate = _admin_gate(request)
    if gate: return gate
    try:
        ent = Enterprise.objects.get(pk=enterprise_id)
    except Enterprise.DoesNotExist:
        return _htmx_error("Entreprise introuvable.", 200)
    commission = float(request.POST.get("commission_percent", 0) or 0)
    ent.status = "approved"
    ent.commission_percent = commission
    ent.approved_at = timezone.now()
    ent.save()
    EnterpriseChatMessage.objects.create(
        enterprise=ent, is_from_admin=True,
        message=f"Votre demande a été approuvée. Commission: {commission}%. Bienvenue dans le programme partenaire DAXI !"
    )
    ctx = _admin_enterprises_context("pending")
    ctx['success_msg'] = f"{ent.name} approuvé avec {commission}% de commission."
    ctx['csrf_token'] = get_token(request)
    return render(request, "htmx/admin_enterprises.html", ctx)


def admin_enterprise_reject(request, enterprise_id):
    gate = _admin_gate(request)
    if gate: return gate
    try:
        ent = Enterprise.objects.get(pk=enterprise_id)
    except Enterprise.DoesNotExist:
        return _htmx_error("Entreprise introuvable.", 200)
    reason = request.POST.get("reason", "").strip()
    if not reason:
        return _htmx_error("Motif du refus requis.", 200)
    ent.status = "rejected"
    ent.admin_notes = reason
    ent.save()
    EnterpriseChatMessage.objects.create(
        enterprise=ent, is_from_admin=True,
        message=f"Votre demande de partenariat a été refusée. Motif : {reason}"
    )
    ctx = _admin_enterprises_context("pending")
    ctx['csrf_token'] = get_token(request)
    return render(request, "htmx/admin_enterprises.html", ctx)


def admin_enterprise_set_location(request, enterprise_id):
    gate = _admin_gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)
    try:
        ent = Enterprise.objects.get(pk=enterprise_id)
    except Enterprise.DoesNotExist:
        return _htmx_error('Entreprise introuvable.', 200)
    try:
        lat = float(request.POST.get('lat', '') or 0)
        lng = float(request.POST.get('lng', '') or 0)
    except (TypeError, ValueError):
        return _htmx_error('Coordonnées invalides.', 200)
    label = (request.POST.get('label') or ent.name or '').strip()
    if not lat or not lng:
        return _htmx_error('Latitude et longitude requises.', 200)
    if not coords_in_covered_zone(lat, lng):
        return _htmx_error('Emplacement hors zone DAXI.', 200)
    ent.address_lat = lat
    ent.address_lng = lng
    ent.address_label = label or ent.name
    ent.location_status = 'set'
    ent.location_set_at = timezone.now()
    ent.location_help_message = ''
    ent.location_help_requested_at = None
    ent.save(update_fields=[
        'address_lat', 'address_lng', 'address_label', 'location_status',
        'location_set_at', 'location_help_message', 'location_help_requested_at',
    ])
    EnterpriseChatMessage.objects.create(
        enterprise=ent, is_from_admin=True,
        message=(
            f'Votre emplacement a été configuré par l\'équipe DAXI : {ent.address_label}. '
            'Vous pouvez maintenant commander avec ce point de départ.'
        ),
    )
    ctx = _admin_enterprises_context('locations')
    ctx['success_msg'] = f'Emplacement enregistré pour {ent.name}.'
    ctx['csrf_token'] = get_token(request)
    return render(request, 'htmx/admin_enterprises.html', ctx)


def admin_enterprise_chat(request, enterprise_id):
    gate = _admin_gate(request)
    if gate: return gate
    try:
        ent = Enterprise.objects.get(pk=enterprise_id)
    except Enterprise.DoesNotExist:
        return _htmx_error("Entreprise introuvable.", 200)
    msgs = ent.chat_messages.all().order_by("created_at")
    ent.chat_messages.filter(is_from_admin=False, is_read=False).update(is_read=True)
    return render(request, "htmx/admin_enterprise_chat.html", {"messages": msgs, "enterprise": ent})


def admin_enterprise_chat_send(request, enterprise_id):
    gate = _admin_gate(request)
    if gate: return gate
    try:
        ent = Enterprise.objects.get(pk=enterprise_id)
    except Enterprise.DoesNotExist:
        return _htmx_error("Entreprise introuvable.", 200)
    msg = request.POST.get("message", "").strip()
    if msg:
        EnterpriseChatMessage.objects.create(enterprise=ent, message=msg, is_from_admin=True)
    msgs = ent.chat_messages.all().order_by("created_at")
    return render(request, "htmx/admin_enterprise_chat.html", {"messages": msgs, "enterprise": ent})



def client_order_status(request, order_id):
    """GET /htmx/client/orders/<order_id>/status/ — full real-time state for polling."""
    try:
        order = Order.objects.select_related('driver').get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        order = Order.objects.select_related('driver').filter(firebase_uid=str(order_id)).first()
        if not order:
            return JsonResponse({'error': 'Order not found'}, status=404)

    driver = order.driver
    driver_lat = float(driver.latitude) if driver and driver.latitude else None
    driver_lng = float(driver.longitude) if driver and driver.longitude else None
    pickup_lat  = float(order.pickup_lat)  if order.pickup_lat  else None
    pickup_lng  = float(order.pickup_lng)  if order.pickup_lng  else None
    dest_lat    = float(order.destination_lat) if order.destination_lat else None
    dest_lng    = float(order.destination_lng) if order.destination_lng else None
    from julmin_taxis.meeting_point_utils import order_meeting_coords
    meeting_lat, meeting_lng = order_meeting_coords(order)

    data = {
        'order_id':       order.pk,
        'status':         order.status,
        'payment_status': order.payment_status or 'pending',
        'payment_method': order.payment_method or '',
        'driver_id':      driver.pk if driver else None,
        'driver_name':    order.driver_name or (driver.get_full_name() if driver else ''),
        'driver_lat':     driver_lat,
        'driver_lng':     driver_lng,
        'pickup_lat':     pickup_lat,
        'pickup_lng':     pickup_lng,
        'meeting_lat':    meeting_lat,
        'meeting_lng':    meeting_lng,
        'destination_lat': dest_lat,
        'destination_lng': dest_lng,
        'price':          float(order.price) if order.price else None,
        'total_price':    _order_total_price_float(order),
        'duration_actual_min': order.duration_minutes,
        'duration_estimated_min': (
            _trip_duration_min(
                pickup_lat, pickup_lng, dest_lat, dest_lng,
                order.trip_type, int(order.round_trip_wait_minutes or 0),
            )
            if pickup_lat and pickup_lng and dest_lat and dest_lng else None
        ),
        'has_coords':     bool(pickup_lat and dest_lat),
        **driver_public_dict(driver, order, request),
                                             
        'is_extended':    order.is_extended,
        'is_paused':      order.is_paused,
        'extra_km_price': float(order.extra_km_price or 0),
        'pause_price':    float(order.pause_price or 0),
    }

                                                                                             
    rdv_lat = meeting_lat or pickup_lat
    rdv_lng = meeting_lng or pickup_lng
    if driver_lat and driver_lng:
        km = None
        if order.status == 'arrived':
            data['eta_label'] = 'sur_place'
            if rdv_lat and rdv_lng:
                km = _haversine_km(driver_lat, driver_lng, rdv_lat, rdv_lng)
        elif order.status in ('driver_assigned', 'on_way') and rdv_lat and rdv_lng:
            km = _haversine_km(driver_lat, driver_lng, rdv_lat, rdv_lng)
        elif order.status == 'in_progress' and dest_lat and dest_lng:
            km = _haversine_km(driver_lat, driver_lng, dest_lat, dest_lng)
        if km is not None:
            data['dist_driver_target_km'] = round(km, 2)
            if order.status != 'arrived':
                data['eta_min'] = max(1, round(km / 30 * 60))

                                                              
    if order.date and order.time:
        try:
            import pytz
            ht = pytz.timezone('America/Port-au-Prince')
            naive = datetime.combine(order.date, order.time)
            sched = ht.localize(naive)
            seconds_until = (sched - timezone.now()).total_seconds()
            data['seconds_until'] = max(0, int(seconds_until))
            data['is_soon'] = seconds_until < 3600
        except Exception:
            pass

    return JsonResponse(data)


                                                                                 
             
                                                                                 

_SOS_ACTIVE_STATUSES = ('driver_assigned', 'on_way', 'arrived', 'in_progress')


def _trigger_order_sos(order, triggered_by: str):
    """Marque SOS, alerte admin (WS + WhatsApp + email). Client reçoit accusé réception."""
    import logging
    log = logging.getLogger(__name__)

    if order.sos_triggered_at:
        return False, 'SOS déjà signalé pour cette course.'
    if order.status not in _SOS_ACTIVE_STATUSES:
        return False, 'SOS disponible uniquement pendant une course active.'
    order.sos_triggered_at = timezone.now()
    order.sos_triggered_by = triggered_by
    order.save(update_fields=['sos_triggered_at', 'sos_triggered_by'])

    sos_payload = {
        'order_id': order.pk,
        'triggered_by': triggered_by,
        'client_name': order.client_name,
        'client_phone': order.client_phone,
        'pickup': order.pickup,
        'destination': order.destination,
        'driver_name': order.driver_name or (order.driver.get_full_name() if order.driver else ''),
        'driver_phone': (order.driver.phone if order.driver else '') or order.driver_phone,
        'status': order.status,
        'at': order.sos_triggered_at.isoformat(),
    }
    _notify_ws('admin', 'sos_alert', sos_payload)

    wa_sent = 0
    try:
        from julmin_taxis.whatsapp_service import notify_admin_sos_alert, notify_client_sos_ack
        wa_sent = notify_admin_sos_alert(order, triggered_by)
        if triggered_by == 'client':
            notify_client_sos_ack(order)
        if wa_sent == 0:
            log.error('SOS #%s: aucun message WhatsApp admin envoyé — vérifiez WHATSAPP_*', order.pk)
    except Exception as exc:
        log.exception('SOS #%s WhatsApp failed: %s', order.pk, exc)

    try:
        from django.core.mail import mail_admins
        mail_admins(
            subject=f'🆘 SOS URGENT — Course #{order.pk}',
            message=(
                f'Signalé par: {triggered_by.upper()}\n'
                f'Client: {order.client_name} ({order.client_phone})\n'
                f'Chauffeur: {sos_payload["driver_name"]} ({sos_payload["driver_phone"]})\n'
                f'Départ: {order.pickup}\n'
                f'Destination: {order.destination}\n'
                f'Statut: {order.status}\n'
            ),
            fail_silently=True,
        )
    except Exception:
        pass

    try:
        from julmin_taxis.notify import (
            push_notify_admin_sos, push_notify_sos_client_ack,
            _safe_push_driver, _safe_push_order,
        )
        push_notify_admin_sos(order, triggered_by)
        if order.driver_id:
            _safe_push_driver(order.driver, 'sos_alert', order)
        if triggered_by == 'client':
            push_notify_sos_client_ack(order)
        else:
            _safe_push_order(order, 'sos_alert')
    except Exception as exc:
        log.warning('SOS #%s push failed: %s', order.pk, exc)

    return True, 'SOS signalé — l\'équipe DAXI a été alertée immédiatement.'


def client_order_sos(request, order_id):
    """POST /htmx/client/orders/<id>/sos/ — alerte admin uniquement."""
    if request.method != 'POST':
        return HttpResponse('', status=405)
    try:
        order, err = _get_order_for_client(request, order_id)
        if err:
            return err
        ok, msg = _trigger_order_sos(order, 'client')
        if not ok:
            return _htmx_error(msg)
        order.refresh_from_db()
        from django.middleware.csrf import get_token
        o = _order_to_dict(order)
        return render(request, 'htmx/_client_order_compact.html', {
            'o': o, 'csrf_token': get_token(request), 'tab': 'active',
        })
    except Exception:
        import logging
        logging.getLogger(__name__).exception('client_order_sos failed for order %s', order_id)
        return _htmx_error('Erreur interne — réessayez dans un instant.')


def driver_order_sos(request, order_id):
    """POST /htmx/driver/orders/<id>/sos/ — alerte admin, pas le client."""
    if request.method != 'POST':
        return HttpResponse('', status=405)
    driver = _get_current_driver(request)
    if not driver:
        return _htmx_error('Non autorisé.')
    try:
        order = Order.objects.get(pk=order_id, driver=driver)
    except Order.DoesNotExist:
        return _htmx_error('Course introuvable.')
    ok, msg = _trigger_order_sos(order, 'driver')
    if not ok:
        return _htmx_error(msg)
    from django.middleware.csrf import get_token
    o = _order_to_dict(order)
    return render(request, 'htmx/_driver_order_row.html', {
        'o': o, 'tab': 'accepted', 'csrf_token': get_token(request),
    })


                                                                                 
              
                                                                                 

def _lost_object_order_dict(o: Order) -> dict:
    """Dict léger pour la page objet perdu (évite _order_to_dict complet)."""
    return {
        'id': o.pk,
        'pickup': o.pickup or '',
        'destination': o.destination or '',
        'pickup_display': clean_address_display(o.pickup or ''),
        'destination_display': clean_address_display(o.destination or ''),
        'created_display': _fmt_haiti(o.created_at),
    }


def client_lost_objects_page(request):
    """GET /htmx/client/lost-objects/ — choisir une course terminée pour signaler un objet."""
    from django.contrib.auth.models import AnonymousUser
    from django.middleware.csrf import get_token

    try:
        orders = []
        user = getattr(request, 'user', None) or AnonymousUser()
        guest_id = request.GET.get('guest_id', '').strip() or request.session.get('guest_id', '')
        if user.is_authenticated:
            orders = Order.objects.filter(
                user=user, status='completed',
            ).order_by('-created_at')[:40]
        elif guest_id:
            orders = Order.objects.filter(
                guest_id=guest_id, user__isnull=True, status='completed',
            ).order_by('-created_at')[:40]
        rows = []
        for o in orders:
            try:
                rows.append(_lost_object_order_dict(o))
            except Exception:
                import logging
                logging.getLogger(__name__).exception('lost object row #%s', o.pk)
        return render(request, 'htmx/client_lost_objects.html', {
            'orders': rows,
            'csrf_token': get_token(request),
            'guest_id': guest_id,
            'is_authenticated': user.is_authenticated,
        })
    except Exception:
        import logging
        logging.getLogger(__name__).exception('client_lost_objects_page failed')
        return HttpResponse(
            '<div style="padding:24px;text-align:center;color:#6b7280;font-size:13px;">'
            'Impossible de charger pour le moment. '
            '<button type="button" onclick="window._loadClientLostObjectPage && window._loadClientLostObjectPage()" '
            'style="display:block;margin:12px auto 0;padding:10px 18px;border:none;border-radius:10px;background:#f59e0b;color:#000;font-weight:700;cursor:pointer;">Réessayer</button>'
            '</div>',
            status=200,
        )


def client_report_lost_object(request, order_id):
    """POST /htmx/client/orders/<id>/lost-object/ — report a lost item after a trip."""
    if request.method != 'POST':
        return _htmx_error('Méthode non supportée', 405)

    order, err = _get_order_for_client(request, order_id)
    if err:
        return err

    if order.status != 'completed':
        return _htmx_error('Signalement disponible uniquement pour les courses terminées.')

    description = request.POST.get('description', '').strip()
    if len(description) < 5:
        return _htmx_error('Décrivez l\'objet perdu (minimum 5 caractères).')

    user = request.user if request.user.is_authenticated else None
    if not user and order.user_id:
        user = order.user

    item, created = LostObject.objects.get_or_create(
        order=order,
        defaults={'user': user, 'description': description, 'driver_handled': False},
    )
    if not created:
        item.description = description
        if user and not item.user_id:
            item.user = user
        item.status = 'reported'
        item.driver_handled = False
        item.driver_handled_at = None
        item.save()

    _notify_ws('admin', 'lost_object_reported', {
        'order_id': order.pk,
        'item_id': item.pk,
        'description': description[:120],
    })
    try:
        from julmin_taxis.notify import notify_admin_lost_object_event
        notify_admin_lost_object_event(order, description)
    except Exception:
        pass
    if order.driver_id:
        _notify_ws(f'driver_{order.driver_id}', 'lost_object_reported', {
            'order_id': order.pk,
            'item_id': item.pk,
            'description': description[:120],
        })

    return HttpResponse(
        '<div style="padding:10px 14px;background:rgba(99,102,241,0.1);border:1px solid rgba(99,102,241,0.3);'
        'border-radius:10px;color:#6366f1;font-size:12px;font-weight:700;">'
        '✅ Objet signalé — le chauffeur et notre équipe ont été notifiés.</div>',
        content_type='text/html',
    )


def driver_lost_objects(request):
    """GET /htmx/driver/lost-objects/ — objets oubliés à traiter."""
    driver = _get_current_driver(request)
    if not driver:
        return _driver_redirect()
    items = LostObject.objects.filter(
        order__driver=driver,
        driver_handled=False,
        status='reported',
    ).select_related('order', 'user').order_by('-created_at')[:30]
    return render(request, 'htmx/driver_lost_objects.html', {
        'items': [{
            'id': i.pk,
            'order_id': i.order_id,
            'description': i.description,
            'pickup': i.order.pickup,
            'destination': i.order.destination,
            'client_name': i.order.client_name,
            'client_phone': i.order.client_phone,
            'created_at': i.created_at,
        } for i in items],
        'pending_count': items.count(),
        'csrf_token': get_token(request),
    })


def driver_lost_object_handled(request, item_id):
    """POST /htmx/driver/lost-objects/<id>/handled/"""
    if request.method != 'POST':
        return HttpResponse('', status=405)
    driver = _get_current_driver(request)
    if not driver:
        return _htmx_error('Non autorisé.')
    try:
        item = LostObject.objects.select_related('order').get(
            pk=item_id, order__driver=driver,
        )
    except LostObject.DoesNotExist:
        return _htmx_error('Signalement introuvable.')
    item.driver_handled = True
    item.driver_handled_at = timezone.now()
    item.save(update_fields=['driver_handled', 'driver_handled_at', 'updated_at'])
    return driver_lost_objects(request)


def admin_lost_objects(request):
    """GET /htmx/admin/lost-objects/"""
    gate = _admin_gate(request)
    if gate:
        return gate
    items = LostObject.objects.select_related('order', 'order__driver', 'user').order_by('-created_at')[:100]
    return render(request, 'htmx/admin_lost_objects.html', {
        'items': items,
        'pending_count': LostObject.objects.filter(status='reported', driver_handled=False).count(),
        'csrf_token': get_token(request),
    })


def _admin_sos_order_payload(order: Order) -> dict:
    """Détails complets commande SOS pour le panneau admin."""
    from julmin_taxis.live_map_utils import client_tracking_status, driver_tracking_status
    from julmin_taxis.currency_utils import format_price

    data = _order_to_dict(order)
    data['sos_triggered_at'] = order.sos_triggered_at
    data['sos_triggered_at_display'] = _fmt_haiti(order.sos_triggered_at) if order.sos_triggered_at else ''
    data['payment_method_display'] = order.get_payment_method_display() if order.payment_method else ''
    data['payment_status_display'] = order.get_payment_status_display()
    data['vehicle_type_display'] = order.get_vehicle_type_display()
    data['client_email'] = order.client_email or ''
    data['client_phone'] = order.client_phone or data.get('client_phone') or ''
    data['guest_id'] = order.guest_id or ''
    data['description'] = order.description or ''
    data['service_plan'] = order.service_plan or ''
    data['round_trip_allow_driver_other_rides'] = bool(order.round_trip_allow_driver_other_rides)
    data['pickup_coords_set_by_driver'] = order.pickup_coords_set_by_driver
    data['dest_coords_set_by_driver'] = order.dest_coords_set_by_driver
    data['enterprise_commission_pct'] = order.enterprise_commission_pct
    data['driver_status'] = order.driver.status if order.driver else ''
    data['driver_status_display'] = order.driver.get_status_display() if order.driver else ''
    data['client_gps_lat'] = order.client_gps_lat
    data['client_gps_lng'] = order.client_gps_lng
    data['client_tracking'] = client_tracking_status(order)
    data['driver_tracking'] = driver_tracking_status(order.driver)
    data['is_sos_active'] = order.status in _SOS_ACTIVE_STATUSES
    data['price_display'] = format_price(order.price) if order.price else '—'
    data['total_price_display'] = format_price(data['total_price']) if data.get('total_price') else '—'
    data['pause_price_display'] = format_price(order.pause_price) if order.pause_price else ''
    data['extra_km_price_display'] = format_price(order.extra_km_price) if order.extra_km_price else ''
    return data


def admin_sos_alerts(request):
    """GET /htmx/admin/sos-alerts/ — courses avec SOS actif."""
    gate = _admin_gate(request)
    if gate:
        return gate
    qs = Order.objects.filter(
        sos_triggered_at__isnull=False,
    ).select_related('driver', 'enterprise').order_by('-sos_triggered_at')[:50]
    orders = [_admin_sos_order_payload(o) for o in qs]
    return render(request, 'htmx/admin_sos_alerts.html', {
        'orders': orders,
        'active_count': Order.objects.filter(
            sos_triggered_at__isnull=False,
            status__in=_SOS_ACTIVE_STATUSES,
        ).count(),
        'csrf_token': get_token(request),
    })


def admin_lost_object_status(request, item_id):
    """POST /htmx/admin/lost-objects/<id>/status/ — update lost-object status."""
    gate = _admin_gate(request)
    if gate:
        return gate

    new_status = request.POST.get('status', '').strip()
    if new_status not in ('found', 'returned', 'reported'):
        return _htmx_error('Statut invalide')

    try:
        item = LostObject.objects.select_related('order').get(pk=item_id)
    except LostObject.DoesNotExist:
        return _htmx_error('Signalement introuvable')

    item.status = new_status
    item.save(update_fields=['status', 'updated_at'])

    return HttpResponse(
        f'<div id="lost-object-{item.pk}" style="padding:8px 12px;background:#ecfdf5;border-radius:8px;'
        f'color:#047857;font-size:12px;font-weight:700;">'
        f'✅ Commande #{item.order_id} — {item.get_status_display()}</div>',
        content_type='text/html',
    )


                                                                                 
                                          
                                                                                 

def admin_assistance_escalations(request):
    """GET /htmx/admin/assistance/ — escalated chatbot sessions for admin."""
    gate = _admin_gate(request)
    if gate:
        return gate

    sessions = ChatSession.objects.filter(
        is_escalated=True, is_resolved=False
    ).order_by('-updated_at')[:50]

    if not sessions:
        return HttpResponse(
            '<div style="padding:24px;text-align:center;color:#9ca3af;">'
            '✅ Aucune escalade en attente.</div>',
            content_type='text/html',
        )

    rows = []
    for s in sessions:
        last = s.messages.order_by('-timestamp').first()
        user_label = s.user.get_full_name() if s.user else (s.guest_id or f'Session #{s.pk}')
        rows.append(
            f'<div id="assist-{s.pk}" style="border:1px solid #e5e7eb;border-radius:12px;padding:14px;margin-bottom:12px;background:#fff;">'
            f'<div style="font-weight:700;color:#111827;">{user_label}</div>'
            f'<div style="font-size:12px;color:#6b7280;margin:4px 0;">Session #{s.pk} · {s.updated_at:%d/%m %H:%M}</div>'
            f'<div style="font-size:13px;color:#374151;background:#f9fafb;border-radius:8px;padding:10px;margin:8px 0;">'
            f'{(last.content[:200] if last else "—")}</div>'
            f'<form hx-post="/htmx/admin/assistance/{s.pk}/reply/" hx-target="#assist-{s.pk}" hx-swap="outerHTML" '
            f'style="display:flex;gap:6px;margin-bottom:8px;">'
            f'<input name="content" placeholder="Répondre..." required '
            f'style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:8px 10px;font-size:12px;">'
            f'<button type="submit" style="background:#667eea;color:#fff;border:none;border-radius:8px;padding:8px 12px;font-size:12px;font-weight:700;cursor:pointer;">Envoyer</button>'
            f'</form>'
            f'<button hx-post="/htmx/admin/assistance/{s.pk}/resolve/" hx-target="#assist-{s.pk}" hx-swap="outerHTML" '
            f'style="background:#10b981;color:#fff;border:none;border-radius:8px;padding:6px 12px;font-size:11px;font-weight:700;cursor:pointer;">'
            f'Marquer résolu</button></div>'
        )
    return HttpResponse(''.join(rows), content_type='text/html')


def admin_assistance_reply(request, session_id):
    gate = _admin_gate(request)
    if gate:
        return gate
    content = request.POST.get('content', '').strip()
    if not content:
        return _htmx_error('Message requis.')
    try:
        session = ChatSession.objects.get(pk=session_id)
    except ChatSession.DoesNotExist:
        return _htmx_error('Session introuvable.')
    ChatMessage.objects.create(session=session, role='admin', content=content)
    return HttpResponse(
        f'<div id="assist-{session.pk}" style="padding:10px 14px;background:#ecfdf5;border-radius:8px;color:#047857;font-size:12px;font-weight:700;">'
        f'✅ Réponse envoyée à {session.user or session.guest_id or "client"}</div>',
        content_type='text/html',
    )


def admin_assistance_resolve(request, session_id):
    gate = _admin_gate(request)
    if gate:
        return gate
    try:
        session = ChatSession.objects.get(pk=session_id)
    except ChatSession.DoesNotExist:
        return _htmx_error('Session introuvable.')
    session.is_resolved = True
    session.save(update_fields=['is_resolved', 'updated_at'])
    return HttpResponse(
        f'<div id="assist-{session.pk}" style="padding:10px 14px;background:#f3f4f6;border-radius:8px;color:#6b7280;font-size:12px;">'
        f'✅ Session #{session.pk} résolue</div>',
        content_type='text/html',
    )


                                                                                 
                                                             
                                                                                 

def driver_danger_zone_check(request):
    """POST /htmx/driver/danger-check/ — lat, lng, order_id (optionnel)."""
    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'ok': False, 'error': 'non_auth'}, status=403)

    try:
        lat = float(request.POST.get('lat', ''))
        lng = float(request.POST.get('lng', ''))
    except (TypeError, ValueError):
        return JsonResponse({'ok': False, 'error': 'coords'}, status=400)

    from pricing.zone_alerts import process_order_zone_alerts

    hits, emitted = [], []
    order_id = request.POST.get('order_id', '').strip()
    client_notified = False
    if order_id:
        try:
            order = Order.objects.get(pk=int(order_id), driver=driver)
            hits, emitted = process_order_zone_alerts(order, lat, lng)
            client_notified = bool(emitted)
        except (Order.DoesNotExist, ValueError):
            pass
    else:
        from pricing.geo_utils import find_nearby_alert_zones
        from pricing.zone_alerts import _zone_snapshot
        hits = find_nearby_alert_zones(lat, lng, _zone_snapshot())

    return JsonResponse({
        'ok': True,
        'danger': any(h.get('is_danger') for h in hits),
        'zones': hits,
        'alerts': emitted,
        'client_notified': client_notified,
    })


                                                                                 
                                              
                                                                                 

def _order_share_status_label(status, order=None):
    if order and is_round_trip_order(order):
        phase = round_trip_phase(order)
        st = status or (order.status if order else '')
        if st == 'waiting_return':
            return 'Attente avant le retour'
        if st == 'in_progress' and phase == 'return':
            return 'Retour vers le départ'
        if st == 'in_progress':
            return 'Aller vers la destination'
    labels = {
        'driver_assigned': 'Chauffeur assigné',
        'on_way': 'En route vers vous',
        'arrived': 'Chauffeur sur place',
        'in_progress': 'Course en cours',
        'waiting_return': 'Attente avant le retour',
        'completed': 'Course terminée',
        'cancelled': 'Annulée',
    }
    return labels.get(status, status)


def _get_order_by_share_token(token):
    if not token or len(token) < 8:
        return None
    try:
        return Order.objects.select_related('driver').get(share_token=token)
    except Order.DoesNotExist:
        return None


def _trip_share_card_profile(order: Order) -> dict:
    """Profil visuel de la carte de suivi selon type de course / forfait."""
    plan_key = _service_plan_key(order.service_plan or '')
    trip = (order.trip_type or 'one_way').lower()
    is_round = trip in ('round_trip', 'aller-retour') or 'retour' in trip

    profiles = {
        'ville-a-ville': {
            'card_type': 'ville', 'theme': 'ville',
            'icon': 'ri-road-map-line', 'title': 'Course ville à ville',
            'subtitle': 'Trajet inter-villes · confort DAXI', 'badge': 'Ville à ville',
        },
        'demi-journee': {
            'card_type': 'demi', 'theme': 'demi',
            'icon': 'ri-time-line', 'title': 'Demi-journée',
            'subtitle': 'Forfait ~4 h · mise à disposition', 'badge': 'Demi-journée',
        },
        'journee-complete': {
            'card_type': 'journee', 'theme': 'journee',
            'icon': 'ri-sun-line', 'title': 'Journée complète',
            'subtitle': 'Forfait journée · multi-arrêts', 'badge': 'Journée',
        },
        'elegance-night': {
            'card_type': 'night', 'theme': 'night',
            'icon': 'ri-moon-clear-line', 'title': 'Élégance Night',
            'subtitle': 'Soirée premium · chauffeur dédié', 'badge': 'Night',
        },
        'accueil-aeroport-cap': {
            'card_type': 'airport', 'theme': 'airport',
            'icon': 'ri-flight-land-line', 'title': 'Accueil aéroport',
            'subtitle': 'Cap-Haïtien · panneau nominatif', 'badge': 'Aéroport',
        },
        'business-vip': {
            'card_type': 'vip', 'theme': 'vip',
            'icon': 'ri-vip-crown-line', 'title': 'Business / VIP',
            'subtitle': 'Service premium sur mesure', 'badge': 'VIP',
        },
    }

    if plan_key and plan_key in profiles:
        p = dict(profiles[plan_key])
    elif is_round:
        p = {
            'card_type': 'roundtrip', 'theme': 'roundtrip',
            'icon': 'ri-arrow-left-right-line', 'title': 'Course aller-retour',
            'subtitle': 'Retour inclus' + (
                f' · attente {order.round_trip_wait_minutes} min'
                if order.round_trip_wait_minutes else ''
            ),
            'badge': 'Aller-retour',
        }
    else:
        p = {
            'card_type': 'oneway', 'theme': 'oneway',
            'icon': 'ri-car-line', 'title': 'Course aller simple',
            'subtitle': 'Trajet direct · prix au km', 'badge': 'Aller simple',
        }

    if order.is_later:
        p['badge'] = (p.get('badge') or 'Course') + ' · Programmée'
        p['subtitle'] = (p.get('subtitle') or '') + ' · départ planifié'

    return p


_VEHICLE_TYPE_LABELS = {
    'economy': 'Économique', 'premium': 'Confort', 'comfort': 'Confort',
    'suv': 'SUV', 'van': 'Fourgon', 'luxury': 'Luxe', 'moto': 'Moto',
}

_PAYMENT_METHOD_LABELS = {
    'in_person': 'Paiement sur place', 'moncash': 'MonCash', 'card': 'Carte bancaire',
}


def _trip_share_payload(order, request=None):
    """Données JSON complètes pour page / API / WebSocket de suivi proche."""
    from julmin_taxis.htmx_views_tracking import _order_track_dict
    from julmin_taxis.meeting_point_utils import order_meeting_coords

    driver = order.driver
    drv = driver_public_dict(driver, order, request)
    track = _order_track_dict(order)
    phase = _client_order_phase(order)
    plan_key = _service_plan_key(order.service_plan or '')
    profile = _trip_share_card_profile(order)
    airport_sign, airport_landing = _parse_plan_airport_meta(order.notes or '')
    rdv_lat, rdv_lng = order_meeting_coords(order)
    eta_min = track.get('eta_driver_client')
    if eta_min:
        eta_min = max(1, int(eta_min / 60))

    base_price = _order_total_price_float(order)
    try:
        pause_price = float(order.pause_price or 0)
    except (TypeError, ValueError):
        pause_price = 0.0
    try:
        extra_price = float(order.extra_km_price or 0)
    except (TypeError, ValueError):
        extra_price = 0.0

    sched_display = None
    if order.scheduled_at:
        sched_display = timezone.localtime(order.scheduled_at).strftime('%d/%m/%Y %H:%M')
    elif order.date:
        sched_display = order.date.strftime('%d/%m/%Y')
        if order.time:
            sched_display += ' ' + order.time.strftime('%H:%M')

    return {
        'order_id': order.pk,
        'status': order.status,
        'status_label': _order_share_status_label(order.status, order),
        'status_pipeline_index': phase.get('pipeline_index', -1),
        'waiting_title': phase.get('client_waiting_title', ''),
        'waiting_detail': phase.get('client_waiting_detail', ''),
        'waiting_kind': phase.get('client_waiting_kind', 'default'),
        'pickup': clean_address_display(order.pickup),
        'destination': clean_address_display(order.destination),
        'pickup_lat': order.pickup_lat,
        'pickup_lng': order.pickup_lng,
        'dest_lat': order.destination_lat,
        'dest_lng': order.destination_lng,
        'meeting_lat': rdv_lat,
        'meeting_lng': rdv_lng,
        'client_lat': track.get('client_lat'),
        'client_lng': track.get('client_lng'),
        'driver_lat': track.get('driver_lat'),
        'driver_lng': track.get('driver_lng'),
        'driver_heading': getattr(driver, 'heading', None) if driver else None,
        **drv,
        'driver_vehicle': drv.get('driver_vehicle_label') or drv.get('driver_vehicle') or '',
        'price': base_price,
        'base_price': float(order.price or 0) if order.price else base_price,
        'pause_price': pause_price,
        'extra_km_price': extra_price,
        'eta_minutes': eta_min,
        'eta_driver_client_display': track.get('eta_driver_client_display'),
        'eta_total_display': track.get('eta_total_display'),
        'distance_driver_client': track.get('distance_driver_client'),
        'distance_client_destination': track.get('distance_client_destination'),
        'share_active': order.status not in ('cancelled', 'completed'),
        'client_name': order.client_name or 'Client',
        'trip_type': order.trip_type or 'one_way',
        'passengers': order.passengers or 1,
        'payment_method': order.payment_method,
        'payment_method_label': _PAYMENT_METHOD_LABELS.get(order.payment_method or '', order.payment_method or ''),
        'vehicle_type': order.vehicle_type,
        'vehicle_type_label': _VEHICLE_TYPE_LABELS.get(order.vehicle_type or 'economy', order.vehicle_type or ''),
        'is_later': order.is_later,
        'is_later_active': track.get('is_later_active'),
        'time_until_scheduled': track.get('time_until_scheduled'),
        'scheduled_at': order.scheduled_at.isoformat() if order.scheduled_at else None,
        'scheduled_display': sched_display,
        'service_plan': order.service_plan,
        'service_plan_key': plan_key,
        'plan_pipeline_variant': plan_pipeline_variant(plan_key),
        'service_plan_display': _service_plan_display(order.service_plan),
        'service_plan_hint': SERVICE_PLAN_HINTS.get(plan_key, ''),
        'is_plan_order': bool(plan_key),
        'is_service_plan': plan_key in _FIXED_SERVICE_PLAN_KEYS,
        'plan_stops': _parse_plan_stops(order),
        'plan_itinerary': _parse_plan_itinerary(order),
        'plan_occasion': _parse_plan_occasion(order.notes or ''),
        'airport_sign': airport_sign,
        'airport_landing': airport_landing,
        'round_trip_wait_minutes': int(order.round_trip_wait_minutes or 0),
        'round_trip_allow_driver_other_rides': bool(order.round_trip_allow_driver_other_rides),
        'is_round_trip': is_round_trip_order(order),
        'round_trip_phase': round_trip_phase(order),
        'round_trip_wait_remaining_seconds': round_trip_wait_remaining_seconds(order),
        'round_trip_nav_target': (
            'pickup' if order.status == 'in_progress' and round_trip_phase(order) == 'return'
            else ('destination' if order.status == 'in_progress' else (
                'waiting' if order.status == 'waiting_return' else 'pickup'
            ))
        ),
        'is_paused': bool(order.is_paused),
        'is_extended': bool(order.is_extended),
        'sos_triggered': bool(order.sos_triggered_at),
        'sos_by': order.sos_triggered_by or '',
        'card_type': profile['card_type'],
        'card_theme': profile['theme'],
        'card_icon': profile['icon'],
        'card_title': profile['title'],
        'card_subtitle': profile['subtitle'],
        'card_badge': profile['badge'],
        'updated_at': order.updated_at.isoformat() if order.updated_at else None,
    }


def trip_share_page(request, token):
    order = _get_order_by_share_token(token)
    if not order:
        return render(request, 'trip_share.html', {'error': True}, status=404)
    if order.status in ('pending', 'price_proposed', 'cancelled'):
        return render(request, 'trip_share.html', {'error': True, 'invalid': True}, status=403)
    driver = order.driver
    drv = driver_public_dict(driver, order, request)
    payload = _trip_share_payload(order, request)
    return render(request, 'trip_share.html', {
        'order': order,
        'token': token,
        'order_id': order.pk,
        'share_payload': payload,
        **drv,
        'driver_vehicle': drv.get('driver_vehicle_label') or drv.get('driver_vehicle') or '',
        'status_label': _order_share_status_label(order.status, order),
        'google_maps_key': getattr(settings, 'GOOGLE_MAPS_API_KEY', ''),
    })


def trip_share_api(request, token):
    order = _get_order_by_share_token(token)
    if not order:
        return JsonResponse({'error': 'not_found'}, status=404)
    if order.status in ('cancelled',) and order.updated_at and (timezone.now() - order.updated_at).days > 1:
        return JsonResponse({'error': 'expired'}, status=410)
    return JsonResponse(_trip_share_payload(order, request))


def client_share_trip(request, order_id):
    """POST /htmx/client/orders/<id>/share/ — génère lien de suivi pour proches."""
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'Méthode non autorisée'}, status=405)
    try:
        oid = int(order_id)
        order, err = _get_order_for_client(request, oid)
        if err:
            if 'Session expirée' in (getattr(err, 'content', b'') or b'').decode('utf-8', errors='ignore'):
                return JsonResponse({'ok': False, 'error': 'Session expirée — reconnectez-vous'}, status=403)
            return JsonResponse({'ok': False, 'error': 'Commande introuvable'}, status=404)
    except (ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'Commande introuvable'}, status=404)
    except Exception:
        import logging
        logging.getLogger(__name__).exception('client_share_trip lookup failed for order %s', order_id)
        return JsonResponse({'ok': False, 'error': 'Erreur interne'}, status=500)

    if order.status not in ('price_confirmed', 'driver_assigned', 'on_way', 'arrived', 'in_progress', 'completed'):
        return JsonResponse({'ok': False, 'error': 'Course non partageable à ce stade'}, status=400)

    try:
        token = order.ensure_share_token()
    except Exception:
        import logging
        logging.getLogger(__name__).exception('ensure_share_token failed for order %s', order_id)
        return JsonResponse({'ok': False, 'error': 'Impossible de générer le lien'}, status=500)

    site_url = getattr(settings, 'SITE_URL', request.build_absolute_uri('/')).rstrip('/')
    url = f'{site_url}/track/{token}/'
    return JsonResponse({'ok': True, 'url': url, 'token': token})


def driver_share_trip(request, order_id):
    """POST /htmx/driver/orders/<id>/share/ — lien de suivi pour proches."""
    if request.method != 'POST':
        return JsonResponse({'ok': False, 'error': 'Méthode non autorisée'}, status=405)
    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'ok': False, 'error': 'Non authentifié'}, status=401)
    try:
        order = Order.objects.get(pk=int(order_id), driver=driver)
    except (Order.DoesNotExist, ValueError, TypeError):
        return JsonResponse({'ok': False, 'error': 'Commande introuvable'}, status=404)

    if order.status not in ('driver_assigned', 'on_way', 'arrived', 'in_progress', 'completed'):
        return JsonResponse({'ok': False, 'error': 'Course non partageable à ce stade'}, status=400)

    try:
        token = order.ensure_share_token()
    except Exception:
        import logging
        logging.getLogger(__name__).exception('driver_share_trip ensure_share_token failed for order %s', order_id)
        return JsonResponse({'ok': False, 'error': 'Impossible de générer le lien'}, status=500)

    site_url = getattr(settings, 'SITE_URL', request.build_absolute_uri('/')).rstrip('/')
    url = f'{site_url}/track/{token}/'
    return JsonResponse({'ok': True, 'url': url, 'token': token})


                                                                                 
                              
                                                                                 

def _driver_cash_commission_stats(driver):
    """Commission cash due to admin, already paid, and remaining balance."""
    return driver.get_cash_commission_stats()


def _driver_withdrawal_paid_ids():
    import re
    paid = set()
    from drivers.models import DriverWalletTransaction
    for note in DriverWalletTransaction.objects.filter(
        transaction_type='withdrawal_paid',
    ).values_list('note', flat=True):
        m = re.search(r'ref #(\d+)', note or '')
        if m:
            paid.add(int(m.group(1)))
    return paid


def _driver_withdrawal_effective_status(tx, paid_ids=None):
    if tx.admin_status in ('paid', 'rejected'):
        return tx.admin_status
    paid_ids = paid_ids if paid_ids is not None else _driver_withdrawal_paid_ids()
    if tx.pk in paid_ids:
        return 'paid'
    return 'pending'


def _driver_withdrawal_display(tx):
    method = tx.payout_method or 'moncash'
    phone = tx.payout_phone or ''
    if not phone and tx.note:
        import re
        m = re.search(r'vers (.+)$', tx.note.strip())
        if m:
            phone = m.group(1).strip()
        if not tx.payout_method:
            m2 = re.search(r'retrait (\w+)', tx.note, re.I)
            if m2:
                method = m2.group(1).lower()
    return {
        'id': tx.pk,
        'driver_id': tx.driver_id,
        'driver_name': tx.driver.get_full_name() or tx.driver.phone or f'Chauffeur #{tx.driver_id}',
        'driver_phone': tx.driver.phone or '',
        'amount': abs(tx.amount),
        'payout_method': method,
        'payout_method_label': 'MonCash' if method == 'moncash' else 'NatCash',
        'phone': phone,
        'created_at': tx.created_at,
        'note': tx.note,
        'status': _driver_withdrawal_effective_status(tx),
    }


def admin_withdrawals(request):
    """GET /htmx/admin/withdrawals/ — retraits chauffeurs, entreprises, commissions."""
    gate = _admin_gate(request)
    if gate:
        return gate

    from decimal import Decimal as _D
    from drivers.models import DriverWalletTransaction
    from enterprises.models import EnterpriseWithdrawal

    tab = request.GET.get('tab', 'driver')
    status_filter = request.GET.get('status', 'pending')
    paid_ids = _driver_withdrawal_paid_ids()

    ctx = {
        'tab': tab,
        'status_filter': status_filter,
        'success_msg': request.GET.get('ok', ''),
    }

    driver_requests = DriverWalletTransaction.objects.filter(
        transaction_type='withdrawal_request',
    ).select_related('driver').order_by('-created_at')[:150]

    driver_withdrawals = []
    for tx in driver_requests:
        st = _driver_withdrawal_effective_status(tx, paid_ids)
        if status_filter == 'pending' and st != 'pending':
            continue
        if status_filter == 'paid' and st != 'paid':
            continue
        if status_filter == 'rejected' and st != 'rejected':
            continue
        if status_filter == 'all':
            pass
        driver_withdrawals.append(_driver_withdrawal_display(tx))

    ctx['driver_withdrawals'] = driver_withdrawals
    ctx['driver_stats'] = {
        'pending': sum(1 for tx in driver_requests if _driver_withdrawal_effective_status(tx, paid_ids) == 'pending'),
        'paid': sum(1 for tx in driver_requests if _driver_withdrawal_effective_status(tx, paid_ids) == 'paid'),
        'rejected': sum(1 for tx in driver_requests if _driver_withdrawal_effective_status(tx, paid_ids) == 'rejected'),
    }

    ent_qs = EnterpriseWithdrawal.objects.select_related('enterprise').order_by('-created_at')
    if status_filter != 'all':
        ent_qs = ent_qs.filter(status=status_filter) if status_filter in ('pending', 'paid', 'rejected') else ent_qs.filter(status='pending')
    ctx['enterprise_withdrawals'] = [{
        'id': w.pk,
        'enterprise_id': w.enterprise_id,
        'enterprise_name': w.enterprise.name,
        'enterprise_email': w.enterprise.email,
        'amount': w.amount,
        'payout_method': w.payout_method,
        'payout_method_label': w.get_payout_method_display(),
        'phone': w.phone,
        'status': w.status,
        'status_label': w.get_status_display(),
        'admin_note': w.admin_note,
        'created_at': w.created_at,
        'paid_at': w.paid_at,
    } for w in ent_qs[:100]]
    ctx['enterprise_stats'] = {
        'pending': EnterpriseWithdrawal.objects.filter(status='pending').count(),
        'paid': EnterpriseWithdrawal.objects.filter(status='paid').count(),
        'rejected': EnterpriseWithdrawal.objects.filter(status='rejected').count(),
    }

    commission_rows = []
    moncash_payments = []
    drivers_with_activity = Driver.objects.filter(
        Q(wallet_transactions__transaction_type='debit_moncash') |
        Q(orders__payment_method='in_person', orders__status='completed')
    ).distinct().order_by('firstname', 'lastname')[:200]

    for driver in drivers_with_activity:
        total_due, paid, owed = _driver_cash_commission_stats(driver)
        if total_due <= 0 and paid <= 0:
            continue
        commission_rows.append({
            'driver_id': driver.pk,
            'driver_name': driver.get_full_name() or driver.phone or f'Chauffeur #{driver.pk}',
            'driver_phone': driver.phone or '',
            'commission_rate': float(driver.commission_rate or 20),
            'total_due': total_due,
            'paid': paid,
            'owed': owed,
        })

    commission_rows.sort(key=lambda r: (r['owed'] <= 0, -float(r['owed']), r['driver_name'].lower()))

    recent_moncash = DriverWalletTransaction.objects.filter(
        transaction_type='debit_moncash',
    ).select_related('driver').order_by('-created_at')[:40]
    for tx in recent_moncash:
        moncash_payments.append({
            'id': tx.pk,
            'driver_id': tx.driver_id,
            'driver_name': tx.driver.get_full_name() or tx.driver.phone or f'Chauffeur #{tx.driver_id}',
            'amount': abs(tx.amount),
            'note': tx.note,
            'created_at': tx.created_at,
        })

    ctx['commission_rows'] = commission_rows
    ctx['moncash_payments'] = moncash_payments
    ctx['commission_stats'] = {
        'drivers_owing': sum(1 for r in commission_rows if r['owed'] > 0),
        'total_owed': sum(float(r['owed']) for r in commission_rows if r['owed'] > 0),
        'total_paid': sum(float(r['paid']) for r in commission_rows),
    }

    return render(request, 'htmx/admin_withdrawals.html', ctx)


def admin_driver_withdrawal_action(request, tx_id):
    """POST /htmx/admin/withdrawals/driver/<tx_id>/ — pay or reject driver withdrawal."""
    gate = _admin_gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return HttpResponse('', status=405)

    from decimal import Decimal as _D
    from drivers.models import DriverWalletTransaction

    action = (request.POST.get('action') or '').strip().lower()
    admin_note = (request.POST.get('admin_note') or '').strip()

    tx = get_object_or_404(
        DriverWalletTransaction.objects.select_related('driver'),
        pk=tx_id,
        transaction_type='withdrawal_request',
    )
    status = _driver_withdrawal_effective_status(tx)
    if status != 'pending':
        return _htmx_error('Cette demande a déjà été traitée.')

    amount = abs(tx.amount)
    driver = tx.driver

    from django.conf import settings as dj_settings
    dual_min = getattr(dj_settings, 'FINANCE_WITHDRAWAL_DUAL_APPROVAL_MIN', 5000)
    if action == 'pay' and float(amount) >= float(dual_min):
        if (request.POST.get('finance_confirm') or '').strip().lower() not in ('1', 'yes', 'oui', 'true'):
            return _htmx_error(
                f'Retrait ≥ {dual_min} HTG : confirmez avec finance_confirm=oui (double validation).'
            )

    if action == 'pay':
        tx.admin_status = 'paid'
        tx.note = (tx.note or '') + (f'\n[Admin] Payé — {admin_note}' if admin_note else '\n[Admin] Payé')
        tx.save(update_fields=['admin_status', 'note'])
        DriverWalletTransaction.objects.create(
            driver=driver,
            transaction_type='withdrawal_paid',
            amount=_D('0.00'),
            balance_after=driver.wallet_balance or _D('0.00'),
            note=f"Retrait payé via {(tx.payout_method or 'moncash').upper()} — ref #{tx.pk} — {format_price(amount, 2)}",
        )
        msg = 'Retrait chauffeur marqué comme payé.'
    elif action == 'reject':
        tx.admin_status = 'rejected'
        tx.note = (tx.note or '') + (f'\n[Admin] Refusé — {admin_note}' if admin_note else '\n[Admin] Refusé')
        tx.save(update_fields=['admin_status', 'note'])
        driver.wallet_balance = (driver.wallet_balance or _D('0.00')) + amount
        driver.save(update_fields=['wallet_balance'])
        DriverWalletTransaction.objects.create(
            driver=driver,
            transaction_type='adjustment',
            amount=amount,
            balance_after=driver.wallet_balance,
            note=f'Retrait refusé — remboursement ref #{tx.pk}' + (f' — {admin_note}' if admin_note else ''),
        )
        msg = 'Demande de retrait refusée — solde remboursé au chauffeur.'
    else:
        return _htmx_error('Action invalide.')

    from julmin_taxis.security_audit import log_wallet
    log_wallet(
        driver,
        f'admin_withdrawal_{action}',
        request=request,
        old_value=str(tx.admin_status if action == 'pay' else 'pending'),
        new_value=str(action),
    )

    try:
        from julmin_taxis.notify import _safe_push_driver
        ev = 'withdrawal_approved' if action == 'pay' else 'withdrawal_rejected'
        _safe_push_driver(driver, ev)
    except Exception:
        pass

    tab = request.POST.get('tab', 'driver')
    status_filter = request.POST.get('status', 'pending')
    resp = render(request, 'htmx/admin_withdrawals.html', _admin_withdrawals_context(tab, status_filter, msg))
    return resp


def admin_enterprise_withdrawal_action(request, withdrawal_id):
    """POST /htmx/admin/withdrawals/enterprise/<id>/ — pay or reject enterprise withdrawal."""
    gate = _admin_gate(request)
    if gate:
        return gate
    if request.method != 'POST':
        return HttpResponse('', status=405)

    from enterprises.models import EnterpriseWithdrawal

    action = (request.POST.get('action') or '').strip().lower()
    admin_note = (request.POST.get('admin_note') or '').strip()

    w = get_object_or_404(EnterpriseWithdrawal.objects.select_related('enterprise'), pk=withdrawal_id)
    if w.status != 'pending':
        return _htmx_error('Cette demande a déjà été traitée.')

    if action == 'pay':
        w.status = 'paid'
        w.paid_at = timezone.now()
        if admin_note:
            w.admin_note = admin_note
        w.save(update_fields=['status', 'paid_at', 'admin_note'])
        msg = 'Retrait entreprise marqué comme payé.'
    elif action == 'reject':
        w.status = 'rejected'
        if admin_note:
            w.admin_note = admin_note
        w.save(update_fields=['status', 'admin_note'])
        msg = 'Demande de retrait entreprise refusée.'
    else:
        return _htmx_error('Action invalide.')

    try:
        from julmin_taxis.notify import _safe_push_enterprise
        ev = 'withdrawal_approved' if action == 'pay' else 'order_updated'
        _safe_push_enterprise(w.enterprise, ev)
    except Exception:
        pass

    tab = request.POST.get('tab', 'enterprise')
    status_filter = request.POST.get('status', 'pending')
    return render(request, 'htmx/admin_withdrawals.html', _admin_withdrawals_context(tab, status_filter, msg))


def _admin_withdrawals_context(tab, status_filter, success_msg=''):
    """Build context dict for admin_withdrawals template (reuse after POST actions)."""
    from drivers.models import DriverWalletTransaction
    from enterprises.models import EnterpriseWithdrawal

    paid_ids = _driver_withdrawal_paid_ids()
    driver_requests = DriverWalletTransaction.objects.filter(
        transaction_type='withdrawal_request',
    ).select_related('driver').order_by('-created_at')[:150]

    driver_withdrawals = []
    for tx in driver_requests:
        st = _driver_withdrawal_effective_status(tx, paid_ids)
        if status_filter == 'pending' and st != 'pending':
            continue
        if status_filter == 'paid' and st != 'paid':
            continue
        if status_filter == 'rejected' and st != 'rejected':
            continue
        if status_filter not in ('pending', 'paid', 'rejected', 'all'):
            continue
        driver_withdrawals.append(_driver_withdrawal_display(tx))

    ent_qs = EnterpriseWithdrawal.objects.select_related('enterprise').order_by('-created_at')
    if status_filter in ('pending', 'paid', 'rejected'):
        ent_qs = ent_qs.filter(status=status_filter)

    commission_rows = []
    drivers_with_activity = Driver.objects.filter(
        Q(wallet_transactions__transaction_type='debit_moncash') |
        Q(orders__payment_method='in_person', orders__status='completed')
    ).distinct().order_by('firstname', 'lastname')[:200]
    for driver in drivers_with_activity:
        total_due, paid, owed = _driver_cash_commission_stats(driver)
        if total_due <= 0 and paid <= 0:
            continue
        commission_rows.append({
            'driver_id': driver.pk,
            'driver_name': driver.get_full_name() or driver.phone or f'Chauffeur #{driver.pk}',
            'driver_phone': driver.phone or '',
            'commission_rate': float(driver.commission_rate or 20),
            'total_due': total_due,
            'paid': paid,
            'owed': owed,
        })
    commission_rows.sort(key=lambda r: (r['owed'] <= 0, -float(r['owed']), r['driver_name'].lower()))

    recent_moncash = DriverWalletTransaction.objects.filter(
        transaction_type='debit_moncash',
    ).select_related('driver').order_by('-created_at')[:40]

    return {
        'tab': tab,
        'status_filter': status_filter,
        'success_msg': success_msg,
        'driver_withdrawals': driver_withdrawals,
        'driver_stats': {
            'pending': sum(1 for tx in driver_requests if _driver_withdrawal_effective_status(tx, paid_ids) == 'pending'),
            'paid': sum(1 for tx in driver_requests if _driver_withdrawal_effective_status(tx, paid_ids) == 'paid'),
            'rejected': sum(1 for tx in driver_requests if _driver_withdrawal_effective_status(tx, paid_ids) == 'rejected'),
        },
        'enterprise_withdrawals': [{
            'id': w.pk,
            'enterprise_id': w.enterprise_id,
            'enterprise_name': w.enterprise.name,
            'enterprise_email': w.enterprise.email,
            'amount': w.amount,
            'payout_method': w.payout_method,
            'payout_method_label': w.get_payout_method_display(),
            'phone': w.phone,
            'status': w.status,
            'status_label': w.get_status_display(),
            'admin_note': w.admin_note,
            'created_at': w.created_at,
            'paid_at': w.paid_at,
        } for w in ent_qs[:100]],
        'enterprise_stats': {
            'pending': EnterpriseWithdrawal.objects.filter(status='pending').count(),
            'paid': EnterpriseWithdrawal.objects.filter(status='paid').count(),
            'rejected': EnterpriseWithdrawal.objects.filter(status='rejected').count(),
        },
        'commission_rows': commission_rows,
        'moncash_payments': [{
            'id': tx.pk,
            'driver_id': tx.driver_id,
            'driver_name': tx.driver.get_full_name() or tx.driver.phone or f'Chauffeur #{tx.driver_id}',
            'amount': abs(tx.amount),
            'note': tx.note,
            'created_at': tx.created_at,
        } for tx in recent_moncash],
        'commission_stats': {
            'drivers_owing': sum(1 for r in commission_rows if r['owed'] > 0),
            'total_owed': sum(float(r['owed']) for r in commission_rows if r['owed'] > 0),
            'total_paid': sum(float(r['paid']) for r in commission_rows),
        },
    }


                                                                                 
                                        
                                                                                 

def enterprise_withdrawal_request(request):
    """POST /htmx/enterprise/wallet/withdraw/"""
    ent = _get_enterprise(request)
    if not ent:
        return _htmx_error('Non connecté.', 200)
    if request.method != 'POST':
        return HttpResponse('', status=405)

    from enterprises.models import EnterpriseWithdrawal
    from decimal import Decimal as _D

    amount_str = request.POST.get('amount', '').strip()
    phone = _sanitize_phone(request.POST.get('phone', '').strip())
    payout_method = (request.POST.get('payout_method') or 'moncash').strip().lower()
    if payout_method not in ('moncash', 'natcash'):
        payout_method = 'moncash'

    try:
        amount = _D(amount_str).quantize(_D('0.01'))
        if amount <= 0:
            raise ValueError
    except Exception:
        return _htmx_error('Montant invalide.')

    if not phone:
        return _htmx_error('Numéro de téléphone invalide.')

    completed = Order.objects.filter(enterprise=ent, status='completed')
    total_earnings = _D(str(round(sum(
        float(o.price or 0) * float(o.enterprise_commission_pct or 0) / 100
        for o in completed
    ), 2)))
    withdrawn = _D(str(sum(
        float(w.amount) for w in ent.withdrawals.filter(status__in=['pending', 'paid'])
    )))
    available = max(_D('0'), total_earnings - withdrawn)
    if amount > available:
        return _htmx_error(f'Solde insuffisant. Disponible: {format_price(available, 2)}')

    EnterpriseWithdrawal.objects.create(
        enterprise=ent,
        amount=amount,
        payout_method=payout_method,
        phone=phone,
    )
    _notify_ws('admin', 'enterprise_withdrawal', {
        'enterprise_id': ent.pk,
        'enterprise_name': ent.name,
        'amount': str(amount),
        'phone': phone,
        'payout_method': payout_method,
    })
    try:
        from julmin_taxis.whatsapp_service import notify_admin_withdrawal_request
        notify_admin_withdrawal_request(
            'Entreprise', ent.name, payout_method.upper(), phone, amount,
        )
    except Exception:
        pass
    return render(request, 'htmx/enterprise_wallet.html', _enterprise_wallet_context(ent))


def _enterprise_wallet_context(ent):
    from enterprises.models import EnterpriseWithdrawal
    from decimal import Decimal as _D
    completed = Order.objects.filter(enterprise=ent, status='completed')
    total_earnings = round(sum(
        float(o.price or 0) * float(o.enterprise_commission_pct or 0) / 100
        for o in completed
    ), 2)
    withdrawn = sum(float(w.amount) for w in ent.withdrawals.filter(status__in=['pending', 'paid']))
    available = max(0, total_earnings - withdrawn)
    return {
        'enterprise': ent,
        'total_earnings': total_earnings,
        'available_balance': round(available, 2),
        'withdrawals': EnterpriseWithdrawal.objects.filter(enterprise=ent).order_by('-created_at')[:10],
        'pending_withdrawal': ent.withdrawals.filter(status='pending').first(),
    }
