"""Authentification staff pour vues HTML / iframe (JWT + session)."""
from django.contrib.auth.models import AnonymousUser
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication


class OptionalJWTAuthentication(JWTAuthentication):
    """JWT optionnel — n'émet pas 401 si le token est absent ou expiré."""

    def authenticate(self, request):
        header = self.get_header(request)
        if header is None:
            return None
        raw_token = self.get_raw_token(header)
        if raw_token is None:
            return None
        try:
            validated_token = self.get_validated_token(raw_token)
        except Exception:
            return None
        return self.get_user(validated_token), validated_token


def django_request_user(request):
    """Utilisateur sur la requête WSGI (session middleware), pas le wrapper DRF anonyme."""
    inner = getattr(request, '_request', request)
    return getattr(inner, 'user', None)


def user_is_staff(request):
    """True si session admin, utilisateur staff, ou JWT valide (query / header)."""
    inner = getattr(request, '_request', request)
    if getattr(inner, 'session', None) and inner.session.get('is_admin'):
        return True
    for candidate in (django_request_user(request), getattr(request, 'user', None)):
        if candidate and candidate.is_authenticated and candidate.is_staff:
            return True

    token = request.GET.get('token', '').strip()
    if not token:
        auth = request.META.get('HTTP_AUTHORIZATION', '')
        if auth.startswith('Bearer '):
            token = auth[7:].strip()

    if not token:
        return False

    try:
        from rest_framework_simplejwt.tokens import AccessToken
        from django.contrib.auth import get_user_model
        validated = AccessToken(token)
        u = get_user_model().objects.get(pk=validated['user_id'])
        return u.is_staff
    except Exception:
        return False


def staff_user_from_token(token):
    try:
        from rest_framework_simplejwt.tokens import AccessToken
        from django.contrib.auth import get_user_model
        validated = AccessToken(token)
        return get_user_model().objects.get(pk=validated['user_id'])
    except Exception:
        return AnonymousUser()


def resolve_staff_user(request):
    """Utilisateur staff authentifié (session Django ou JWT Bearer)."""
    inner = getattr(request, '_request', request)
    if getattr(inner, 'session', None) and inner.session.get('is_admin'):
        for candidate in (django_request_user(request), getattr(request, 'user', None)):
            if candidate and candidate.is_authenticated and getattr(candidate, 'is_staff', False):
                return candidate
        from django.contrib.auth import get_user_model
        return get_user_model().objects.filter(is_staff=True).order_by('-is_superuser', 'id').first()

    for candidate in (django_request_user(request), getattr(request, 'user', None)):
        if candidate and candidate.is_authenticated and getattr(candidate, 'is_staff', False):
            return candidate
    auth = request.META.get('HTTP_AUTHORIZATION', '')
    if auth.startswith('Bearer '):
        token = auth[7:].strip()
        if token:
            u = staff_user_from_token(token)
            if u and getattr(u, 'is_authenticated', False) and getattr(u, 'is_staff', False):
                return u
    return None
