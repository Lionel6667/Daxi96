"""
Middleware sécurité — en-têtes HTTP, rate limiting, durcissement.
"""
from django.conf import settings
from django.http import HttpResponse, JsonResponse

from julmin_taxis.security_utils import rate_limit_request


                                                 


RATE_LIMITED_PATHS = (
    ('/htmx/admin/login/', 'admin_login', 8, 300),
    ('/htmx/driver/login/', 'driver_login', 8, 300),
    ('/htmx/driver/register/send-otp/', 'driver_otp', 3, 3600),
    ('/htmx/driver/register/verify-otp/', 'driver_otp_verify', 12, 600),
    ('/htmx/client/login/', 'client_login', 8, 300),
    ('/htmx/client/login-by-id/', 'client_login', 8, 300),
    ('/api/auth/login/', 'api_auth_login', 15, 300),
    ('/api/auth/register/', 'api_auth_register', 10, 300),
    ('/api/auth/token/refresh/', 'api_auth_refresh', 40, 300),
    ('/api/auth/forgot-password/', 'api_otp', 5, 3600),
    ('/api/auth/send-reset-code/', 'api_otp', 5, 3600),
    ('/api/auth/verify-reset-code/', 'api_auth_reset', 15, 600),
    ('/api/auth/reset-password/', 'api_auth_reset', 15, 600),
    ('/api/auth/verify-otp/', 'api_auth_otp', 15, 600),
    ('/api/auth/resend-otp/', 'api_otp', 5, 3600),
    ('/payment/', 'payment', 30, 600),
    ('/htmx/client/order/create/', 'order_create', 6, 120),
    ('/htmx/client/order/', 'order_mutate', 60, 600),
    ('/htmx/enterprise/orders/create', 'enterprise_order', 10, 60),
    ('/api/fb/', 'firebase_api', 120, 60),
    ('/api/pricing/', 'pricing_api', 60, 60),
    ('/htmx/admin/withdrawals/', 'admin_withdrawal', 30, 600),
    ('/htmx/driver/wallet/withdraw/', 'driver_withdraw', 5, 3600),
    ('/htmx/enterprise/wallet/withdraw/', 'enterprise_withdraw', 5, 3600),
    ('/htmx/driver/location/', 'driver_gps', 120, 60),
    ('/ws/', 'websocket_connect', 60, 60),
)


class SecurityHeadersMiddleware:
    """En-têtes OWASP — actifs en dev et prod (CSP assouplie si DEBUG)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response['X-Content-Type-Options'] = 'nosniff'
        response['X-Frame-Options'] = getattr(settings, 'X_FRAME_OPTIONS', 'SAMEORIGIN')
        response['Referrer-Policy'] = getattr(settings, 'SECURE_REFERRER_POLICY', 'strict-origin-when-cross-origin')
        response['Permissions-Policy'] = (
            'camera=(), microphone=(self), geolocation=(self), payment=(), usb=()'
        )
        hybrid = (
            request.META.get('HTTP_X_DAXI_HYBRID') == '1'
            or request.META.get('HTTP_X_DAXI_NATIVE') == '1'
        )
        origin = request.META.get('HTTP_ORIGIN', '')
        capacitor_origin = origin in (
            'https://localhost',
            'http://localhost',
            'capacitor://localhost',
            'ionic://localhost',
        )
        if not settings.DEBUG:
            if hybrid or capacitor_origin:
                response['Cross-Origin-Resource-Policy'] = 'cross-origin'
            else:
                response['Cross-Origin-Opener-Policy'] = 'same-origin'
                response['Cross-Origin-Resource-Policy'] = 'same-site'
        csp = getattr(settings, 'CONTENT_SECURITY_POLICY', None)
        if csp:
            response['Content-Security-Policy'] = csp
        return response


class RateLimitMiddleware:
    """Limitation de débit sur endpoints sensibles (brute force, credential stuffing)."""

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        path = request.path
        if '/webhook' in path:
            return self.get_response(request)
        
        if '/card/charge/' in path:
            allowed, retry = rate_limit_request(request, 'card_charge', 8, 900)
            if not allowed:
                msg = f'Trop de tentatives. Réessayez dans {retry} secondes.'
                return JsonResponse({'success': False, 'error': msg, 'detail': msg}, status=429)
            return self.get_response(request)
        for prefix, scope, max_calls, window in RATE_LIMITED_PATHS:
            if not (path.startswith(prefix) or path == prefix.rstrip('/')):
                continue
            if scope == 'order_mutate' and path.startswith('/htmx/client/order/create'):
                continue
            allowed, retry = rate_limit_request(request, scope, max_calls, window)
            if not allowed:
                msg = f'Trop de tentatives. Réessayez dans {retry} secondes.'
                if request.headers.get('HX-Request'):
                    return HttpResponse(
                        f'<div class="daxi-htmx-error" style="padding:12px;color:#ef4444;font-weight:700;">{msg}</div>',
                        status=429,
                        content_type='text/html',
                    )
                if path.startswith('/api/'):
                    return JsonResponse({'detail': msg}, status=429)
                return HttpResponse(msg, status=429)
            break
        return self.get_response(request)


CAPACITOR_ORIGINS = frozenset({
    'https://localhost',
    'http://localhost',
    'capacitor://localhost',
    'ionic://localhost',
})


class CapacitorCrossOriginCookieMiddleware:
    """WebView Capacitor (Origin https://localhost) → Django (autre host) = cross-site.

    Les cookies session/CSRF restent SameSite=Lax pour le site web (même site).
    Pour l'origine Capacitor uniquement, on force SameSite=None; Secure afin que
    credentials: include envoie réellement les cookies. Sans cela le navigateur
    ignore le cookie Lax sur un fetch cross-origin.

    X-Daxi-Native / X-Daxi-Hybrid identifient l'app ; ils ne désactivent pas CSRF.
    """

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        origin = request.META.get('HTTP_ORIGIN', '') or ''
        capacitor = origin in CAPACITOR_ORIGINS
        if capacitor and request.method in ('GET', 'HEAD'):
            from django.middleware.csrf import get_token
            get_token(request)
        response = self.get_response(request)
        if not capacitor:
            return response
        self._set_cross_site_cookies(response)
        token = request.META.get('CSRF_COOKIE') or getattr(request, 'META', {}).get('CSRF_COOKIE')
        if token and request.method != 'OPTIONS':
            response['X-CSRFToken'] = token
        return response

    def _set_cross_site_cookies(self, response):
        from django.conf import settings as dj
        names = {
            getattr(dj, 'SESSION_COOKIE_NAME', 'sessionid'),
            getattr(dj, 'CSRF_COOKIE_NAME', 'csrftoken'),
        }
        for name in names:
            if name in response.cookies:
                morsel = response.cookies[name]
                morsel['samesite'] = 'None'
                morsel['secure'] = True


class StaffHtmxCsrfExemptMiddleware:
    """Mutations admin authentifiées : pas de blocage CSRF (JWT + session vérifiés dans les vues).

    Capacitor n'est plus exempté : session + cookie CSRF SameSite=None + header X-CSRFToken.
    """

    _STAFF_API_PREFIXES = (
        '/htmx/admin/',
        '/api/admin-panel/',
        '/api/orders/',
        '/api/drivers/',
    )

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        if request.method in ('POST', 'PUT', 'PATCH', 'DELETE'):
            path = request.path or ''
            if any(path.startswith(p) for p in self._STAFF_API_PREFIXES):
                try:
                    from julmin_taxis.htmx_views import _is_admin_authenticated
                    if _is_admin_authenticated(request):
                        request._dont_enforce_csrf_checks = True
                except Exception:
                    pass
        return self.get_response(request)
