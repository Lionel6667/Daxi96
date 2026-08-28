"""OTP d'inscription partagé entre workers (Redis) — client, entreprise, chauffeur."""
from __future__ import annotations

from django.core.cache import cache

DEFAULT_OTP_TTL = 600
VERIFIED_TTL = 1800


def _keys(email: str, namespace: str = '') -> dict[str, str]:
    base = (email or '').strip().lower()
    ns = (namespace or '').strip('_')
    if ns:
        prefix = f'reg_otp_{ns}_'
    else:
        prefix = 'reg_otp_'
    return {
        'otp': f'{prefix}{base}',
        'phone': f'{prefix}phone_{base}',
        'verified': f'{prefix}verified_{base}',
    }


def store_registration_otp(
    email: str,
    otp: str,
    *,
    phone_norm: str = '',
    namespace: str = '',
    ttl: int = DEFAULT_OTP_TTL,
) -> None:
    keys = _keys(email, namespace)
    cache.set(keys['otp'], otp, timeout=ttl)
    if phone_norm:
        cache.set(keys['phone'], phone_norm, timeout=ttl)
    cache.delete(keys['verified'])


def mark_registration_verified(email: str, *, namespace: str = '', ttl: int = VERIFIED_TTL) -> None:
    keys = _keys(email, namespace)
    cache.set(keys['verified'], True, timeout=ttl)


def is_registration_verified(email: str, *, namespace: str = '') -> bool:
    return bool(cache.get(_keys(email, namespace)['verified']))


def validate_registration_otp(
    email: str,
    otp: str,
    *,
    phone_norm: str | None = None,
    namespace: str = '',
) -> tuple[bool, str]:
    code = (otp or '').strip()
    if not code:
        return False, 'Code OTP requis.'
    keys = _keys(email, namespace)
    if cache.get(keys['verified']):
        if phone_norm:
            stored_phone = cache.get(keys['phone'])
            if stored_phone and stored_phone != phone_norm:
                return False, 'Le numéro ne correspond pas au code envoyé.'
        return True, ''
    stored = cache.get(keys['otp'])
    if not stored:
        return False, 'Code expiré — renvoyez un nouveau code.'
    if code != stored:
        return False, 'Code OTP incorrect.'
    if phone_norm:
        stored_phone = cache.get(keys['phone'])
        if stored_phone and stored_phone != phone_norm:
            return False, 'Le numéro ne correspond pas au code envoyé.'
    return True, ''


def consume_registration_otp(email: str, *, namespace: str = '') -> None:
    keys = _keys(email, namespace)
    cache.delete(keys['otp'])
    cache.delete(keys['phone'])
    cache.delete(keys['verified'])
