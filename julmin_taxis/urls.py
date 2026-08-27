from django.contrib import admin
from django.urls import path, include, re_path
from django.conf import settings
from django.conf.urls.static import static
from django.views.generic import TemplateView, RedirectView
from django.views import View
from django.http import HttpResponse, FileResponse
from django.db.models import F
import os
import json
import mimetypes
from julmin_taxis.htmx_views import driver_wa_accept_page, driver_accept_link_page, driver_order_deep_link, client_receipt_short_link, trip_share_page, trip_share_api, blog_article_page, blog_index_page, enterprise_client_pay_page
from julmin_taxis.whatsapp_test_views import whatsapp_test_logs_api, whatsapp_test_page
from julmin_taxis.payment_views import (
    card_payment_page,
    card_payment_charge,
    moncash_payment_return,
    debt_moncash_return,
    driver_commission_moncash_return,
    moncash_webhook,
    hatexcard_webhook,
)
from admin_panel.views import admin_dashboard_page
from julmin_taxis.whatsapp_webhook_views import whatsapp_webhook
from julmin_taxis.legal_views import data_deletion_page, privacy_policy_page
from julmin_taxis.wellknown_views import android_assetlinks, apple_app_site_association
from julmin_taxis.robots_views import robots_txt


                                                                                             
ORIGINAL_ROOT = str(settings.BASE_DIR)


def _get_django_context_script(page_name):
    """
    Build a <script> tag that injects Django model data into the page as JS variables.
    This replaces Firebase real-time loading with pre-loaded server-side data.
    """
    try:
        from orders.models import Order
        from drivers.models import Driver
        from firebase_db.views import _order_to_firebase, _driver_to_firebase
        from django.db.models import Count, Q

                                   
        pending_orders = {}
        for o in Order.objects.filter(
            status__in=['pending', 'price_proposed', 'price_confirmed']
        ).select_related('driver').order_by('-created_at')[:50]:
            key = o.firebase_uid if o.firebase_uid else f'django_{o.pk}'
            pending_orders[key] = _order_to_firebase(o)

                                                      
        confirmed_orders = {}
        for o in Order.objects.filter(
            status__in=['driver_assigned', 'on_way', 'arrived', 'in_progress']
        ).select_related('driver').order_by('-created_at')[:50]:
            key = o.firebase_uid if o.firebase_uid else f'django_{o.pk}'
            confirmed_orders[key] = _order_to_firebase(o)

                                      
        completed_orders = {}
        for o in Order.objects.filter(
            status__in=['completed', 'cancelled']
        ).select_related('driver').order_by('-created_at')[:20]:
            key = o.firebase_uid if o.firebase_uid else f'django_{o.pk}'
            completed_orders[key] = _order_to_firebase(o)

                                                               
        drivers = {}
        driver_qs = Driver.objects.filter(is_blocked=False).annotate(
            rides_done=Count('orders', filter=Q(orders__status='completed'))
        ).order_by('-rating', '-completed_trips', '-rides_done')[:100]
        for d in driver_qs:
            key = d.firebase_uid if d.firebase_uid else f'django_{d.pk}'
            fb = _driver_to_firebase(d)
            fb['completedTrips'] = max(int(d.completed_trips or 0), int(d.rides_done or 0))
            drivers[key] = fb

        config = {
            'googleMapsApiKey': settings.GOOGLE_MAPS_API_KEY,
            'siteUrl': getattr(settings, 'SITE_URL', 'http://localhost:8000'),
            'page': page_name,
            'appApi': '/api/app/',
        }
        try:
            from orders.models import SystemConfig
            config['usdHtgRate'] = float(SystemConfig.get().usd_htg_rate)
        except Exception:
            config['usdHtgRate'] = 130.0

        lines = [
            '<script id="django-preload-data">',
            '// Data pre-loaded from Django - no Firebase needed',
            f'window.DJANGO_PRELOAD = window.DJANGO_PRELOAD || {{}};',
            f'window.DJANGO_PRELOAD.commande = {json.dumps(pending_orders, default=str)};',
            f'window.DJANGO_PRELOAD.commande_confirmed = {json.dumps(confirmed_orders, default=str)};',
            f'window.DJANGO_PRELOAD.commande_completed = {json.dumps(completed_orders, default=str)};',
            f'window.DJANGO_PRELOAD.drivers = {json.dumps(drivers, default=str)};',
            f'window.DJANGO_CONFIG = {json.dumps(config)};',
                                                                                           
            f'window.GOOGLE_MAPS_API_KEY = {json.dumps(settings.GOOGLE_MAPS_API_KEY)};',
            '</script>',
        ]
        return '\n'.join(lines)
    except Exception as e:
                                                  
        return f'<script>/* Django preload error: {e} */window.DJANGO_PRELOAD={{}};</script>'


def _is_social_crawler(request) -> bool:
    ua = (request.META.get('HTTP_USER_AGENT') or '').lower()
    return any(
        token in ua
        for token in (
            'facebookexternalhit',
            'facebot',
            'meta-externalagent',
            'whatsapp',
            'twitterbot',
            'linkedinbot',
            'slackbot',
        )
    )


class ServeOriginalPage(View):
    """
    Serves original HTML pages directly from the project root.
    Injects a Django data preload script so the page starts with fresh data
    from the Django database — no Firebase dependency at all.
    """
    filename = None
    page_name = None

    def get(self, request, *args, **kwargs):
        from django.shortcuts import redirect
        filepath = os.path.join(ORIGINAL_ROOT, self.filename)
        try:
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

                                          
            inject = _get_django_context_script(self.page_name or self.filename)

                                                                        
            from django.middleware.csrf import get_token
            csrf_token = get_token(request)

                                           
            current_eid = request.session.get("current_enterprise_id") or request.session.get("enterprise_id")
            enterprise_ids = request.session.get("enterprise_ids", [current_eid] if current_eid else [])
            ent_status = None
            ent_mode = None
            _ent_obj = None
            if current_eid:
                try:
                    from enterprises.models import Enterprise
                    _ent_obj = Enterprise.objects.get(pk=current_eid)
                    ent_status = _ent_obj.status
                    ent_mode = _ent_obj.mode
                except Exception:
                    _ent_obj = None
                    ent_status = None
                    ent_mode = None
                                                                                                
            _linked_ent = None
            if request.user.is_authenticated and getattr(request.user, 'email', None):
                try:
                    from enterprises.models import Enterprise
                    _email_ents = list(
                        Enterprise.objects.filter(email=request.user.email.strip().lower()).order_by('-created_at')
                    )
                    if _email_ents and not current_eid:
                        _linked_ent = next((e for e in _email_ents if e.status == 'approved'), None) or _email_ents[0]
                    elif _email_ents and not _ent_obj:
                        _linked_ent = _email_ents[0]
                except Exception:
                    _linked_ent = None
            _has_enterprise = bool(current_eid or _linked_ent or (enterprise_ids and len(enterprise_ids) > 0))
            _ent_display_name = (_ent_obj.name if _ent_obj else None) or (_linked_ent.name if _linked_ent else None)
            _ent_display_status = ent_status or (_linked_ent.status if _linked_ent else None)
            if current_eid and _ent_display_status == 'approved':
                _enterprise_url = '/entreprise/dashboard/'
            else:
                _enterprise_url = '/entreprise/'
            driver_id = request.session.get("driver_id")
            driver_name = None
            driver_photo = None
            driver_is_verified = True
            if driver_id:
                try:
                    from drivers.models import Driver
                    d = Driver.objects.get(pk=driver_id)
                    driver_name = d.get_full_name()
                    driver_photo = d.photo.url if d.photo else None
                    driver_is_verified = bool(d.is_verified)
                    driver_nav_pref_mode = d.nav_pref_mode or 'ask'
                    driver_nav_pref_app = d.nav_pref_app or 'google'
                except Exception:
                    driver_nav_pref_mode = 'ask'
                    driver_nav_pref_app = 'google'
            else:
                driver_nav_pref_mode = 'ask'
                driver_nav_pref_app = 'google'

            client_user = None
            if self.page_name == 'client':
                if not request.session.get('is_admin') and not request.session.get('driver_id'):
                    u = request.user
                    if u.is_authenticated and not getattr(u, 'is_staff', False):
                        client_user = u

            session_data = {
                "is_admin": bool(request.session.get("is_admin")),
                "driver_id": driver_id,
                "driver_name": driver_name,
                "driver_photo": driver_photo,
                "driver_is_verified": driver_is_verified,
                "nav_pref_mode": driver_nav_pref_mode if driver_id else 'ask',
                "nav_pref_app": driver_nav_pref_app if driver_id else 'google',
                "is_authenticated": client_user is not None if self.page_name == 'client' else request.user.is_authenticated,
                "user_name": client_user.get_full_name() if client_user else (request.user.get_full_name() if request.user.is_authenticated and self.page_name != 'client' else None),
                "first_name": client_user.first_name if client_user else (request.user.first_name if request.user.is_authenticated and self.page_name != 'client' else None),
                "user_id": getattr(client_user, 'firebase_user_id', None) if client_user else (getattr(request.user, 'firebase_user_id', None) if request.user.is_authenticated and self.page_name != 'client' else None),
                "user_email": client_user.email if client_user else (request.user.email if request.user.is_authenticated and self.page_name != 'client' else None),
                "user_phone": getattr(client_user, 'phone', '') if client_user else (getattr(request.user, 'phone', '') if request.user.is_authenticated and self.page_name != 'client' else None),
                "csrf_token": csrf_token,
                "enterprise_id": current_eid,
                "current_enterprise_id": current_eid,
                "enterprise_ids": enterprise_ids,
                "enterprise_status": ent_status,
                "enterprise_mode": ent_mode,
                "enterprise_name": _ent_display_name if _has_enterprise else (_ent_obj.name if _ent_obj else None),
                "has_enterprise": _has_enterprise,
                "enterprise_url": _enterprise_url,
        "enterprise_register_url": "/entreprise/?tab=register",
                "enterprise_address_lat": _ent_obj.address_lat if _ent_obj else None,
                "enterprise_address_lng": _ent_obj.address_lng if _ent_obj else None,
                "enterprise_address_label": (_ent_obj.address_label if _ent_obj and _ent_obj.address_label else (_ent_obj.name if _ent_obj else None)),
                "enterprise_location_status": _ent_obj.location_status if _ent_obj else None,
                "enterprise_needs_location": bool(
                    _ent_obj and _ent_obj.status == 'approved' and _ent_obj.location_status == 'unset'
                ),
                "google_maps_key": getattr(__import__('django.conf', fromlist=['settings']).settings, 'GOOGLE_MAPS_API_KEY', ''),
            }
                                                                                      
            _safe_json = json.dumps(session_data).replace('</', r'<\/')
            session_inject = f'<script>window.DJANGO_SESSION = {_safe_json};</script>'
            _maps_key = getattr(__import__('django.conf', fromlist=['settings']).settings, 'GOOGLE_MAPS_API_KEY', '')
            _maps_cfg = json.dumps({'googleMapsApiKey': _maps_key})
            _django_settings = __import__('django.conf', fromlist=['settings']).settings
            _fb_cfg = json.dumps(getattr(_django_settings, 'FIREBASE_WEB_CONFIG', {}) or {})
            _fb_vapid = json.dumps(getattr(_django_settings, 'FIREBASE_WEB_VAPID_KEY', '') or '')
            maps_head_inject = (
                f'<script id="django-maps-key">'
                f'window.GOOGLE_MAPS_API_KEY={json.dumps(_maps_key)};'
                f'window.DJANGO_CONFIG=window.DJANGO_CONFIG||{_maps_cfg};'
                f'window.DAXI_FIREBASE_CONFIG={_fb_cfg};'
                f'window.DAXI_FIREBASE_VAPID_KEY={_fb_vapid};'
                f'</script>'
            )
            favicon_inject = ''
            if 'daxi-logo-gold' not in content and 'rel="icon"' not in content.lower():
                from django.template.loader import render_to_string
                favicon_inject = render_to_string('partials/daxi_favicon.html')

            if self.page_name == 'enterprise_dashboard':
                                                       
                if not current_eid or not _ent_obj:
                    return redirect('/entreprise/')
                if _ent_obj.status != 'approved':
                    return redirect('/entreprise/')
                                                                                           

            elif self.page_name == 'admin' and request.session.get('is_admin'):
                                                       
                content = content.replace(
                    '<div id="main-interface" class="hidden" style="display:none;">',
                    '<div id="main-interface" style="display:block;">',
                    1
                )
                content = content.replace(
                    '<section id="login-section"',
                    '<section id="login-section" style="display:none;"',
                    1
                )

            elif self.page_name == 'admin':
                                                                                                  
                content = content.replace(
                    '<div id="main-interface" class="hidden" style="display:none;">',
                    '<div id="main-interface" class="hidden" style="display:none;" hx-disable>',
                    1
                )

            elif self.page_name == 'enterprise':
                if current_eid and _ent_obj:
                    ent = _ent_obj
                                                                      
                    if ent.status == 'approved':
                        return redirect('/entreprise/dashboard/')
                                                      
                    content = content.replace(
                        '<div id="enterprise-hero">',
                        '<div id="enterprise-hero" style="display:none;">',
                        1
                    )
                    content = content.replace(
                        'id="enterprise-auth-section"',
                        'id="enterprise-auth-section" style="display:none;"',
                        1
                    )
                    content = content.replace(
                        'id="enterprise-pending-section" class="ent-page" style="display:none;"',
                        f'id="enterprise-pending-section" class="ent-page" style="display:{"block" if ent.status == "pending" else "none"};"',
                        1
                    )
                    content = content.replace(
                        'id="enterprise-dashboard-section" style="display:none;"',
                        f'id="enterprise-dashboard-section" style="display:{"block" if ent.status == "approved" else "none"};"',
                        1
                    )
                    content = content.replace(
                        'id="enterprise-rejected-section" class="ent-page" style="display:none;"',
                        f'id="enterprise-rejected-section" class="ent-page" style="display:{"block" if ent.status == "rejected" else "none"};"',
                        1
                    )
                                                      
                    if ent.mode == 'self_order':
                        content = content.replace(
                            'id="ent-booking-section" style="display:none; padding:14px 16px 0;"',
                            'id="ent-booking-section" style="display:block; padding:14px 16px 0;"',
                            1
                        )
                        content = content.replace(
                            'id="ent-plans-section" style="display:none; padding:14px 16px 0;"',
                            'id="ent-plans-section" style="display:block; padding:14px 16px 0;"',
                            1
                        )

            elif self.page_name == 'driver' and request.session.get('driver_id'):
                content = content.replace(
                    '<div id="main-interface" class="hidden" style="display:none;">',
                    '<div id="main-interface" style="display:block;">',
                    1
                )

            elif self.page_name == 'driver':
                                                            
                return redirect('/driver/login/')

            elif self.page_name == 'driver_login':
                if request.session.get('driver_id'):
                    return redirect('/driver/')
                if '<base ' not in content.lower():
                    content = content.replace('<head>', '<head>\n    <base href="/">', 1)


                                                                              
            if self.page_name == 'client':
                ref_code = request.GET.get('ref', '').strip()
                if ref_code:
                    try:
                        from enterprises.models import Enterprise
                        ent = Enterprise.objects.get(affiliate_code=ref_code, status='approved')
                        request.session['enterprise_affiliate'] = ent.pk
                        request.session.modified = True
                        Enterprise.objects.filter(pk=ent.pk).update(
                            link_clicks=F('link_clicks') + 1
                        )
                        try:
                            from lieux.services import refresh_enterprise_place_activity
                            refresh_enterprise_place_activity(ent)
                        except Exception:
                            pass
                    except Exception:
                        pass

                                                                                         
                                                                                             
            from julmin_taxis.native_shell import inject_native_head, is_native_request

            cap_inject = is_native_request(request)
            if cap_inject:
                content = inject_native_head(content)

            if '</head>' in content:
                content = content.replace('</head>', favicon_inject + session_inject + '\n' + maps_head_inject + '\n</head>', 1)
            else:
                content = session_inject + '\n' + maps_head_inject + '\n' + content
            if '</body>' in content:
                content = content.replace('</body>', inject + '\n</body>', 1)
            else:
                content = content + '\n' + inject

            if self.page_name == 'client':
                try:
                    from julmin_taxis.client_debt import get_unpaid_debt
                    from django.template.loader import render_to_string
                    debt = get_unpaid_debt(request)
                    if debt and request.GET.get('debt_paid') != '1':
                        block = render_to_string('htmx/client_debt_block.html', {
                            'debt': debt,
                            'csrf_token': csrf_token,
                            'guest_id': request.session.get('guest_id', ''),
                        }, request=request)
                        if '</body>' in content:
                            content = content.replace('</body>', block + '\n</body>', 1)
                        else:
                            content = content + block
                except Exception:
                    pass

            resp = HttpResponse(content, content_type='text/html; charset=utf-8')
            if cap_inject or _is_social_crawler(request):
                resp['Cache-Control'] = 'no-store, no-cache, must-revalidate, max-age=0'
                resp['Pragma'] = 'no-cache'
                resp['Expires'] = '0'
            return resp
        except FileNotFoundError:
            return HttpResponse(f'File not found: {self.filename}', status=404)


class ServeOriginalAsset(View):
    """
    Serves static assets (images, js, css, json) from the Django project root.
    Handles paths like /assets/js/..., /sw.js, /manifest.json, etc.
    """
    def get(self, request, path='', **kwargs):
        path = path.lstrip('/')
        if '..' in path or path.startswith('/'):
            return HttpResponse('Forbidden', status=403)

        cap_www = os.path.join(ORIGINAL_ROOT, 'clients', 'daxi-capacitor', 'www')
        candidates = [
            os.path.join(ORIGINAL_ROOT, path),
            os.path.join(settings.BASE_DIR, path),
            os.path.join(cap_www, path),
        ]
        filepath = None
        for candidate in candidates:
            if not os.path.isfile(candidate):
                continue
            real = os.path.realpath(candidate)
            allowed_roots = [
                os.path.realpath(ORIGINAL_ROOT),
                os.path.realpath(settings.BASE_DIR),
                os.path.realpath(cap_www),
            ]
            if any(real.startswith(root + os.sep) or real == root for root in allowed_roots):
                filepath = real
                break

        if not filepath:
                                                                                
                                                                                
                                                                                
            ext = os.path.splitext(path)[1].lower()
            if ext in {'.png', '.jpg', '.jpeg', '.gif', '.jfif', '.webp', '.svg', '.ico'}:
                transparent_png = (
                    b'\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01'
                    b'\x08\x06\x00\x00\x00\x1f\x15\xc4\x89\x00\x00\x00\rIDATx\x9cc`\x00\x00\x00\x02'
                    b'\x00\x01\xe2!\xbc3\x00\x00\x00\x00IEND\xaeB`\x82'
                )
                return HttpResponse(transparent_png, content_type='image/png', status=200)
            return HttpResponse(f'Not found: {path}', status=404)
        mime_type, _ = mimetypes.guess_type(filepath)
        mime_type = mime_type or 'application/octet-stream'
        return FileResponse(open(filepath, 'rb'), content_type=mime_type)


urlpatterns = [
    path('robots.txt', robots_txt, name='robots-txt'),
    path('.well-known/assetlinks.json', android_assetlinks, name='android-assetlinks'),
    path('.well-known/assetlinks.json/', android_assetlinks, name='android-assetlinks-slash'),
    path('.well-known/apple-app-site-association', apple_app_site_association, name='apple-app-site-association'),
    path('.well-known/apple-app-site-association/', apple_app_site_association, name='apple-app-site-association-slash'),
                           
    path('webhook/', whatsapp_webhook, name='whatsapp_webhook'),

    path('favicon.ico', RedirectView.as_view(url='/assets/images/daxi-logo-gold.png', permanent=True)),

    path('django-admin/', admin.site.urls),

                                                        
    path('htmx/', include('julmin_taxis.htmx_urls')),

                   
    path('api/app/', include('julmin_taxis.app_api_urls')),
    path('api/auth/', include('accounts.urls')),
    path('api/orders/', include('orders.urls')),
    path('api/drivers/', include('drivers.urls')),
    path('api/chat/', include('chat.urls')),
    path('api/notifications/', include('notifications.urls')),
    path('api/forum/', include('forum.urls')),
    path('api/blog/', include('blog.urls')),
    path('api/chatbot/', include('chatbot.urls')),
    path('api/admin-panel/', include('admin_panel.urls')),

                              
    path('api/fb/', include('firebase_db.urls')),

                            
    path('api/pricing/', include('pricing.urls')),
    path('api/mobile/bootstrap/', __import__('julmin_taxis.mobile_views', fromlist=['mobile_bootstrap']).mobile_bootstrap, name='mobile-bootstrap'),
    path('api/mobile/cache-manifest/', __import__('julmin_taxis.mobile_views', fromlist=['mobile_cache_manifest']).mobile_cache_manifest, name='mobile-cache-manifest'),
    path('api/mobile/gps-batch/', __import__('julmin_taxis.mobile_views', fromlist=['mobile_gps_batch']).mobile_gps_batch, name='mobile-gps-batch'),
    path('api/mobile/outbox/', __import__('julmin_taxis.mobile_outbox', fromlist=['mobile_outbox']).mobile_outbox, name='mobile-outbox'),
    path('api/mobile/driver-access/', __import__('julmin_taxis.mobile_views', fromlist=['mobile_driver_access']).mobile_driver_access, name='mobile-driver-access'),
    path('api/client/recent-places/', __import__('julmin_taxis.mobile_views', fromlist=['client_recent_places']).client_recent_places, name='client-recent-places'),
    path('api/client/service-plans/', __import__('julmin_taxis.mobile_views', fromlist=['client_service_plans']).client_service_plans, name='client-service-plans'),
    path('api/places/catalog/', __import__('julmin_taxis.places_api', fromlist=['places_catalog']).places_catalog, name='places-catalog'),
    path('api/places/autocomplete/', __import__('julmin_taxis.places_api', fromlist=['places_autocomplete']).places_autocomplete, name='places-autocomplete'),
    path('api/places/similar/', __import__('julmin_taxis.places_api', fromlist=['places_similar']).places_similar, name='places-similar'),
    path('api/places/details/', __import__('julmin_taxis.places_api', fromlist=['places_details']).places_details, name='places-details'),
    path('api/geo/', include('geo.urls')),
    path('htmx/lieux/', include('lieux.urls')),

                                   
    path('api/translations/', include('chatbot.translation_urls')),

                                                                          
    path('', ServeOriginalPage.as_view(filename='vubez2.html', page_name='client'), name='home'),
                                                                               
    path('payment/<int:order_id>/card/', card_payment_page, name='card-payment-page'),
    path('payment/<int:order_id>/card/charge/', card_payment_charge, name='card-payment-charge'),
    path('payment/<int:order_id>/moncash/return/', moncash_payment_return, name='moncash-payment-return'),
    path('payment/debt/<int:debt_id>/moncash/return/', debt_moncash_return, name='debt-moncash-return'),
    path('payment/driver-commission/<int:payment_id>/moncash/return/', driver_commission_moncash_return, name='driver-commission-moncash-return'),
    path('payment/moncash/webhook/', moncash_webhook, name='moncash-webhook'),
    path('moncash/webhook/', moncash_webhook, name='moncash-webhook-alias'),
    path('carte/webhook/', hatexcard_webhook, name='hatexcard-webhook'),
    path('blog/', blog_index_page, name='blog-index'),
    path('blog/<slug:slug>/', blog_article_page, name='blog-article'),
    path('compte/', ServeOriginalPage.as_view(filename='compte.html', page_name='client'), name='compte'),
    path('admin-dashboard/', admin_dashboard_page, name='admin_dashboard'),
    path('driver/', ServeOriginalPage.as_view(filename='driver_home.html', page_name='driver'), name='driver_dashboard'),
    path('driver/login/', ServeOriginalPage.as_view(filename='driver_login.html', page_name='driver_login'), name='driver_login'),
    path('assistance/', TemplateView.as_view(template_name='assistance.html'), name='assistance'),
    path('politique-confidentialite/', privacy_policy_page, name='privacy_policy'),
    path('privacy-policy/', privacy_policy_page, name='privacy_policy_en'),
    path('suppression-donnees/', data_deletion_page, name='data_deletion'),
    path('data-deletion/', data_deletion_page, name='data_deletion_en'),
    path('entreprise/', ServeOriginalPage.as_view(filename='entreprise.html', page_name='enterprise'), name='enterprise_login'),
    path('entreprise/dashboard/', ServeOriginalPage.as_view(filename='entreprise_dashboard.html', page_name='enterprise_dashboard'), name='enterprise_dashboard'),
    path('payer/<int:order_id>/', enterprise_client_pay_page, name='enterprise-client-pay'),
    path('wa/accept/<int:order_id>/<str:token>/', driver_wa_accept_page, name='wa-driver-accept'),
    path('driver/accept/<int:order_id>/', driver_accept_link_page, name='driver-accept-link'),
    re_path(r'^driver/commande_(?P<order_id>\d+)/$', driver_order_deep_link, name='driver-order-deeplink'),
    re_path(r'^recu_(?P<order_id>\d+)\.pdf$', client_receipt_short_link, name='client-receipt-short'),
    path('track/<str:token>/', trip_share_page, name='trip-share'),
    path('api/track/<str:token>/', trip_share_api, name='trip-share-api'),
    path('test-whatsapp/', whatsapp_test_page, name='test_whatsapp'),
    path('test-whatsapp/logs/', whatsapp_test_logs_api, name='test_whatsapp_logs'),
    path('__errors__/<int:code>/', __import__('julmin_taxis.error_views', fromlist=['error_preview']).error_preview, name='error-preview'),

                                                                        
    re_path(r'^(?P<path>(?!api/|static/|media/|django-admin/|\.well-known/).*\.(png|jpg|jpeg|gif|jfif|webp|svg|ico|js|css|json|txt|pdf|woff|woff2|ttf|eot|mp3|mp4|wav))$',
            ServeOriginalAsset.as_view(), name='original-asset'),
]

urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
if settings.DEBUG:
    from django.contrib.staticfiles.urls import staticfiles_urlpatterns
    urlpatterns += staticfiles_urlpatterns()
else:
    urlpatterns += static(settings.STATIC_URL, document_root=settings.STATIC_ROOT)

# Branded HTTP error handlers (active when DEBUG=False)
handler400 = 'julmin_taxis.error_views.bad_request'
handler403 = 'julmin_taxis.error_views.permission_denied'
handler404 = 'julmin_taxis.error_views.page_not_found'
handler500 = 'julmin_taxis.error_views.server_error'
