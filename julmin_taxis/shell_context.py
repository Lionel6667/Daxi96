"""Session / config pour shells Capacitor locaux (chauffeur, entreprise, admin)."""

import json

from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from django.middleware.csrf import get_token


def build_shell_session(request, page_name='client'):
    """Reproduit window.DJANGO_SESSION injecté par ServeOriginalPage."""
    user = getattr(request, 'user', None) or AnonymousUser()
    csrf_token = get_token(request)

    current_eid = request.session.get('current_enterprise_id') or request.session.get('enterprise_id')
    enterprise_ids = request.session.get('enterprise_ids', [current_eid] if current_eid else [])
    ent_status = None
    ent_mode = None
    ent_obj = None
    if current_eid:
        try:
            from enterprises.models import Enterprise
            ent_obj = Enterprise.objects.get(pk=current_eid)
            ent_status = ent_obj.status
            ent_mode = ent_obj.mode
        except Exception:
            ent_obj = None

    linked_ent = None
    if user.is_authenticated and getattr(user, 'email', None):
        try:
            from enterprises.models import Enterprise
            email_ents = list(
                Enterprise.objects.filter(email=user.email.strip().lower()).order_by('-created_at')
            )
            if email_ents and not current_eid:
                linked_ent = next((e for e in email_ents if e.status == 'approved'), None) or email_ents[0]
            elif email_ents and not ent_obj:
                linked_ent = email_ents[0]
        except Exception:
            linked_ent = None

    has_enterprise = bool(current_eid or linked_ent or (enterprise_ids and len(enterprise_ids) > 0))
    ent_display_name = (ent_obj.name if ent_obj else None) or (linked_ent.name if linked_ent else None)
    ent_display_status = ent_status or (linked_ent.status if linked_ent else None)
    if current_eid and ent_display_status == 'approved':
        enterprise_url = '/entreprise/dashboard/'
    else:
        enterprise_url = '/entreprise/'

    driver_id = request.session.get('driver_id')
    driver_name = None
    driver_photo = None
    driver_is_verified = True
    driver_nav_pref_mode = 'ask'
    driver_nav_pref_app = 'google'
    if driver_id:
        try:
            from drivers.models import Driver
            d = Driver.objects.get(pk=driver_id)
            driver_name = d.get_full_name()
            from julmin_taxis.driver_display_utils import _driver_photo_url
            driver_photo = _driver_photo_url(d, request=request) or None
            driver_is_verified = bool(d.is_verified)
            driver_nav_pref_mode = d.nav_pref_mode or 'ask'
            driver_nav_pref_app = d.nav_pref_app or 'google'
        except Exception:
            pass

    client_user = None
    if page_name == 'client':
        if not request.session.get('is_admin') and not request.session.get('driver_id'):
            if user.is_authenticated and not getattr(user, 'is_staff', False):
                client_user = user

    is_auth = (
        client_user is not None
        if page_name == 'client'
        else user.is_authenticated
    )

    return {
        'is_admin': bool(request.session.get('is_admin')),
        'driver_id': driver_id,
        'driver_name': driver_name,
        'driver_photo': driver_photo,
        'driver_is_verified': driver_is_verified,
        'nav_pref_mode': driver_nav_pref_mode if driver_id else 'ask',
        'nav_pref_app': driver_nav_pref_app if driver_id else 'google',
        'is_authenticated': is_auth,
        'user_name': (
            client_user.get_full_name()
            if client_user
            else (user.get_full_name() if user.is_authenticated and page_name != 'client' else None)
        ),
        'first_name': (
            client_user.first_name
            if client_user
            else (user.first_name if user.is_authenticated and page_name != 'client' else None)
        ),
        'user_id': (
            getattr(client_user, 'firebase_user_id', None)
            if client_user
            else (
                getattr(user, 'firebase_user_id', None)
                if user.is_authenticated and page_name != 'client'
                else None
            )
        ),
        'user_email': (
            client_user.email
            if client_user
            else (user.email if user.is_authenticated and page_name != 'client' else None)
        ),
        'user_phone': (
            getattr(client_user, 'phone', '')
            if client_user
            else (getattr(user, 'phone', '') if user.is_authenticated and page_name != 'client' else None)
        ),
        'csrf_token': csrf_token,
        'enterprise_id': current_eid,
        'current_enterprise_id': current_eid,
        'enterprise_ids': enterprise_ids,
        'enterprise_status': ent_status,
        'enterprise_rejection_reason': (
            (ent_obj.admin_notes or '').strip()
            if ent_obj and ent_obj.status == 'rejected'
            else None
        ),
        'enterprise_mode': ent_mode,
        'enterprise_name': ent_display_name if has_enterprise else (ent_obj.name if ent_obj else None),
        'has_enterprise': has_enterprise,
        'enterprise_url': enterprise_url,
        'enterprise_register_url': '/entreprise/?tab=register',
        'enterprise_address_lat': ent_obj.address_lat if ent_obj else None,
        'enterprise_address_lng': ent_obj.address_lng if ent_obj else None,
        'enterprise_address_label': (
            ent_obj.address_label
            if ent_obj and ent_obj.address_label
            else (ent_obj.name if ent_obj else None)
        ),
        'enterprise_location_status': ent_obj.location_status if ent_obj else None,
        'enterprise_needs_location': bool(
            ent_obj and ent_obj.status == 'approved' and ent_obj.location_status == 'unset'
        ),
        'google_maps_key': getattr(settings, 'GOOGLE_MAPS_API_KEY', ''),
    }


def shell_context_redirect(request, page_name):
    """Redirections auth comme ServeOriginalPage."""
    page = (page_name or '').strip().lower()
    if page in ('driver', 'driver_home'):
        if not request.session.get('driver_id'):
            return '/driver/login/'
    elif page in ('driver_login',):
        if request.session.get('driver_id'):
            return '/driver/'
    elif page in ('enterprise_dashboard', 'enterprise-dashboard'):
        current_eid = request.session.get('current_enterprise_id') or request.session.get('enterprise_id')
        if not current_eid:
            return '/entreprise/'
        try:
            from enterprises.models import Enterprise
            ent = Enterprise.objects.get(pk=current_eid)
            if ent.status != 'approved':
                return '/entreprise/'
        except Exception:
            return '/entreprise/'
    elif page in ('admin', 'admin_dashboard', 'admin-dashboard'):
        if not request.session.get('is_admin'):
            return '/'
    return None


def shell_context_payload(request, page_name='client'):
    redirect = shell_context_redirect(request, page_name)
    session = build_shell_session(request, page_name=page_name)
    fb_cfg = getattr(settings, 'FIREBASE_WEB_CONFIG', {}) or {}
    maps_key = session.get('google_maps_key') or ''
    return {
        'ok': True,
        'page': page_name,
        'redirect': redirect,
        'session': session,
        'google_maps_api_key': maps_key,
        'firebase_config': fb_cfg,
        'firebase_vapid': getattr(settings, 'FIREBASE_WEB_VAPID_KEY', '') or '',
        'django_config': {'googleMapsApiKey': maps_key, 'appApi': '/api/app/'},
    }
