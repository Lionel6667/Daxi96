"""
Utilitaires de sécurité DAXI — validation, rate limiting, auth helpers.
"""
from __future__ import annotations

import hashlib
import re
import secrets
import time
from typing import Optional, Tuple

from django.conf import settings
from django.core.cache import cache

                                                                                 

def _client_ip(request) -> str:
    forwarded = (request.META.get('HTTP_X_FORWARDED_FOR') or '').split(',')[0].strip()
    if forwarded:
        return forwarded
    return request.META.get('REMOTE_ADDR', 'unknown')


def rate_limit_key(scope: str, ident: str) -> str:
    return f'daxi_rl:{scope}:{ident}'


def check_rate_limit(scope: str, ident: str, max_calls: int, window_sec: int) -> Tuple[bool, int]:
    """
    Return (allowed, retry_after_seconds).
    Sliding window via cache TTL.
    """
    key = rate_limit_key(scope, ident)
    data = cache.get(key)
    now = time.time()
    if not data:
        cache.set(key, {'count': 1, 'start': now}, window_sec)
        return True, 0
    count = int(data.get('count', 0)) + 1
    start = float(data.get('start', now))
    elapsed = now - start
    if elapsed >= window_sec:
        cache.set(key, {'count': 1, 'start': now}, window_sec)
        return True, 0
    if count > max_calls:
        return False, max(1, int(window_sec - elapsed))
    cache.set(key, {'count': count, 'start': start}, int(window_sec - elapsed) or window_sec)
    return True, 0


def rate_limit_request(request, scope: str, max_calls: int, window_sec: int) -> Tuple[bool, int]:
    ident = _client_ip(request)
    user = getattr(request, 'user', None)
    if user is not None and getattr(user, 'is_authenticated', False):
        ident = f'u{user.pk}:{ident}'
    return check_rate_limit(scope, ident, max_calls, window_sec)


                                                                               

def admin_password_candidates() -> list[str]:
    """Mots de passe admin acceptés (env + override session runtime)."""
    candidates = []
    primary = (getattr(settings, 'ADMIN_PASSWORD', '') or '').strip()
    if primary:
        candidates.append(primary)
    legacy = (getattr(settings, 'ADMIN_PASSWORD_LEGACY', '') or '').strip()
    if legacy and legacy not in candidates:
        candidates.append(legacy)
                                                                                                 
    if getattr(settings, 'DEBUG', False) and not candidates:
        candidates.append('Julm1n234')
    return candidates


def verify_admin_password(plain: str, session=None) -> bool:
    if not plain:
        return False
    plain = plain.strip()
    if session:
        override = (session.get('admin_password_override') or '').strip()
        if override and secrets.compare_digest(plain, override):
            return True
    for stored in admin_password_candidates():
        if secrets.compare_digest(plain, stored):
            return True
        if secrets.compare_digest(_sha256_hex(plain), stored):
            return True
        if secrets.compare_digest(plain, _sha256_hex(stored)):
            return True
    return False


def _sha256_hex(value: str) -> str:
    return hashlib.sha256(value.strip().encode('utf-8')).hexdigest()


                                                                                 

_GUEST_ID_RE = re.compile(r'^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$', re.I)
_GUEST_ID_FPJS_RE = re.compile(r'^fpjs_[a-zA-Z0-9_-]+$', re.I)
_GUEST_ID_FP_RE = re.compile(r'^fp_[a-zA-Z0-9_-]+$', re.I)
_GUEST_ID_GENERIC_RE = re.compile(r'^[a-zA-Z0-9_-]{8,100}$')


def normalize_guest_id(raw: Optional[str]) -> str:
    """Normalise un identifiant invité (UUID, FingerprintJS fpjs_*, fallback fp_*)."""
    gid = (raw or '').strip()
    if not gid:
        return ''
    if _GUEST_ID_RE.match(gid):
        return gid.lower()
    if _GUEST_ID_FPJS_RE.match(gid) or _GUEST_ID_FP_RE.match(gid):
        return gid
    if _GUEST_ID_GENERIC_RE.match(gid):
        return gid
    return ''


def guest_ids_match(a: Optional[str], b: Optional[str]) -> bool:
    na, nb = normalize_guest_id(a), normalize_guest_id(b)
    if not na or not nb:
        return False
    return secrets.compare_digest(na, nb)


                                                                                 

ALLOWED_IMAGE_MIMES = frozenset({
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
    'application/octet-stream',
})
ALLOWED_AUDIO_MIMES = frozenset({
    'audio/webm', 'audio/ogg', 'audio/mpeg', 'audio/mp4', 'audio/wav',
    'audio/aac', 'audio/x-m4a', 'audio/m4a', 'audio/3gpp', 'audio/amr',
    'video/webm', 'video/mp4', 'application/octet-stream',
})
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_AUDIO_BYTES = 12 * 1024 * 1024
MAX_CAR_IMAGE_BYTES = 5 * 1024 * 1024


def validate_upload(file_obj, *, allowed_mimes: frozenset, max_bytes: int) -> Optional[str]:
    if not file_obj:
        return 'Fichier manquant.'
    size = getattr(file_obj, 'size', 0) or 0
    if size > max_bytes:
        return f'Fichier trop volumineux (max {max_bytes // (1024 * 1024)} Mo).'
    content_type = (getattr(file_obj, 'content_type', '') or '').split(';')[0].strip().lower()
    if content_type and content_type not in allowed_mimes:
        return 'Type de fichier non autorisé.'
    name = (getattr(file_obj, 'name', '') or '').lower()
    if name.endswith(('.exe', '.php', '.js', '.html', '.svg', '.htm', '.sh', '.bat', '.cmd')):
        return 'Extension de fichier interdite.'
    return None


def safe_media_ext(file_obj, default: str = '.bin') -> str:
    import os
    ext = os.path.splitext(getattr(file_obj, 'name', '') or '')[1].lower()
    allowed = {'.jpg', '.jpeg', '.png', '.webp', '.gif', '.webm', '.ogg', '.mp3', '.wav', '.m4a'}
    return ext if ext in allowed else default
