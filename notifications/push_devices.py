"""Enregistrement et résolution des tokens FCM/APNs (utilisateurs, invités, chauffeurs)."""
from __future__ import annotations

import logging

from django.conf import settings
from django.utils import timezone

logger = logging.getLogger(__name__)


def upsert_push_device(
    token: str,
    *,
    user=None,
    guest_id: str = '',
    driver=None,
    enterprise=None,
    platform: str = '',
    device_id: str = '',
) -> None:
    token = (token or '').strip()
    if not token or len(token) < 20:
        return
    from .models import PushDevice

    guest_id = (guest_id or '').strip()
    device_id = (device_id or '').strip()[:80]
    now = timezone.now()
    defaults = {
        'platform': (platform or '')[:20],
        'device_id': device_id,
        'is_active': True,
        'last_used_at': now,
    }
    if user and getattr(user, 'is_authenticated', False):
        defaults['user'] = user
        if guest_id:
            defaults['guest_id'] = guest_id
    elif guest_id:
        defaults['guest_id'] = guest_id
    if driver:
        defaults['driver'] = driver
    if enterprise:
        defaults['enterprise'] = enterprise
    PushDevice.objects.update_or_create(token=token, defaults=defaults)

    if device_id:
        PushDevice.objects.filter(device_id=device_id).exclude(token=token).update(is_active=False)

    bound_user = defaults.get('user')
    if bound_user and hasattr(bound_user, 'fcm_token') and bound_user.fcm_token != token:
        bound_user.fcm_token = token
        bound_user.save(update_fields=['fcm_token'])
    if driver and hasattr(driver, 'fcm_token') and driver.fcm_token != token:
        driver.fcm_token = token
        driver.save(update_fields=['fcm_token'])


def deactivate_push_token(token: str) -> None:
    token = (token or '').strip()
    if not token:
        return
    from .models import PushDevice
    PushDevice.objects.filter(token=token).update(is_active=False)


def _active_tokens(qs) -> list[str]:
    return _tokens_from_devices(qs)


def _tokens_from_devices(qs) -> list[str]:
    """Un token par appareil (device_id) — le plus récent gagne."""
    rows = list(
        qs.filter(is_active=True).values('token', 'device_id', 'platform', 'last_used_at')
    )
    by_device: dict[str, dict] = {}
    loose: list[dict] = []
    for r in rows:
        tok = (r.get('token') or '').strip()
        if not tok:
            continue
        did = (r.get('device_id') or '').strip()
        if did:
            prev = by_device.get(did)
            if not prev or (r.get('last_used_at') or 0) > (prev.get('last_used_at') or 0):
                by_device[did] = r
        else:
            loose.append(r)
    seen: set[str] = set()
    out: list[str] = []
    for r in list(by_device.values()) + loose:
        t = (r.get('token') or '').strip()
        if t and t not in seen:
            seen.add(t)
            out.append(t)
    return out


def _legacy_field_token(obj) -> str:
    tok = (getattr(obj, 'fcm_token', None) or '').strip()
    return tok if len(tok) >= 20 else ''


def tokens_for_order_client(order) -> list[str]:
    """Tokens FCM du client — un par appareil, pas de leftover guest si le compte a déjà un token."""
    from .models import PushDevice

    if order.user_id:
        user = order.user
        tokens = _tokens_from_devices(PushDevice.objects.filter(user=user))
        if tokens:
            return tokens
        legacy = _legacy_field_token(user)
        if legacy:
            return [legacy]
    gid = (getattr(order, 'guest_id', None) or '').strip()
    if gid:
        tokens = _tokens_from_devices(PushDevice.objects.filter(guest_id=gid, user__isnull=True))
        if tokens:
            return tokens
    return []


def tokens_for_driver(driver) -> list[str]:
    from .models import PushDevice

    if not driver:
        return []
    tokens = _tokens_from_devices(PushDevice.objects.filter(driver=driver))
    if tokens:
        return tokens
    legacy = _legacy_field_token(driver)
    return [legacy] if legacy else []


def tokens_for_enterprise(enterprise) -> list[str]:
    from .models import PushDevice

    if not enterprise:
        return []
    return _tokens_from_devices(PushDevice.objects.filter(enterprise=enterprise))


def tokens_for_admin_staff() -> list[str]:
    """Tokens FCM des comptes staff + ADMIN_FCM_TOKENS (env, séparés par virgules)."""
    from django.contrib.auth import get_user_model
    from .models import PushDevice

    found: set[str] = set()
    raw = getattr(settings, 'ADMIN_FCM_TOKENS', '') or ''
    for t in raw.split(','):
        t = t.strip()
        if len(t) >= 20:
            found.add(t)
    User = get_user_model()
    staff_ids = list(User.objects.filter(is_staff=True).values_list('pk', flat=True))
    for t in _tokens_from_devices(PushDevice.objects.filter(user_id__in=staff_ids)):
        found.add(t)
    users_with_devices = set(
        PushDevice.objects.filter(user_id__in=staff_ids, is_active=True).values_list('user_id', flat=True)
    )
    for u in User.objects.filter(is_staff=True).exclude(pk__in=users_with_devices):
        tok = _legacy_field_token(u)
        if tok:
            found.add(tok)
    return [t for t in found if t]


def tokens_for_user(user) -> list[str]:
    from .models import PushDevice
    if not user:
        return []
    tokens = _tokens_from_devices(PushDevice.objects.filter(user=user))
    if tokens:
        return tokens
    legacy = _legacy_field_token(user)
    return [legacy] if legacy else []


EVENT_TO_TYPE = {
    'new_order': 'new_order',
    'new_order_pending_accept': 'new_order',
    'driver_assigned': 'order_accepted',
    'arrived': 'driver_arrived',
    'cancelled': 'order_cancelled',
    'order_cancelled': 'order_cancelled',
    'sos_alert': 'sos',
    'sos_ack': 'sos',
}

TYPE_TO_CHANNEL = {
    'new_order': 'daxi_orders',
    'order_accepted': 'daxi_orders',
    'driver_arrived': 'daxi_urgent',
    'order_cancelled': 'daxi_urgent',
    'sos': 'daxi_sos',
}


def envelope_push_data(event: str, *, order=None, url: str = '', extra: dict | None = None) -> dict:
    ntype = EVENT_TO_TYPE.get(event, event)
    data = {'event': str(event or ''), 'type': ntype}
    if order is not None and getattr(order, 'pk', None):
        data['order_id'] = str(order.pk)
        if not url:
            url = f'/#courses/{order.pk}'
    if url:
        data['url'] = url
        data['deep_link'] = url
        data['link'] = url
    if extra:
        data.update({k: str(v) for k, v in extra.items() if v is not None})
    if 'deep_link' not in data and data.get('url'):
        data['deep_link'] = data['url']
    return data


def send_push(
    *,
    user=None,
    driver=None,
    enterprise=None,
    guest_id: str = '',
    title: str,
    body: str,
    data: dict | None = None,
    channel: str | None = None,
    silent: bool = False,
    urgent: bool = False,
) -> int:
    """Envoie un push à tous les appareils actifs de la cible (user / chauffeur / guest)."""
    tokens: list[str] = []
    if user is not None:
        tokens.extend(tokens_for_user(user))
    if driver is not None:
        tokens.extend(tokens_for_driver(driver))
    if enterprise is not None:
        tokens.extend(tokens_for_enterprise(enterprise))
    if guest_id:
        from .models import PushDevice
        tokens.extend(_active_tokens(PushDevice.objects.filter(guest_id=guest_id.strip(), user__isnull=True)))
    
    seen: set[str] = set()
    uniq = []
    for t in tokens:
        if t not in seen:
            seen.add(t)
            uniq.append(t)
    return send_push_tokens(uniq, title, body, data, silent=silent, urgent=urgent, channel=channel)


def send_push_tokens(tokens, title: str, body: str, data: dict | None = None, *, silent: bool = False, urgent: bool = False, channel: str | None = None) -> int:
    """Envoie une notification push à une liste de tokens. Retourne le nombre de succès."""
    from .fcm_service import send_push as send_fcm

    data = {k: str(v) for k, v in (data or {}).items()}
    ntype = data.get('type') or data.get('event') or ''
    if not channel:
        channel = TYPE_TO_CHANNEL.get(ntype) or ('daxi_sos' if ntype in ('sos', 'sos_alert') else None)
    if urgent:
        data['urgent'] = '1'
    site = getattr(settings, 'SITE_URL', '').rstrip('/') or ''
    if site and 'url' not in data:
        data['url'] = site + '/'
    sent = 0
    for token in tokens:
        try:
            ok, result = send_fcm(
                token,
                {'title': title, 'body': body, 'url': data.get('url', '/')},
                data,
                silent=silent,
                urgent=urgent,
                channel=channel,
            )
            if ok:
                sent += 1
                try:
                    from .models import PushDevice
                    PushDevice.objects.filter(token=token).update(last_used_at=timezone.now(), is_active=True)
                except Exception:
                    pass
            else:
                err = str(result or '')
                if err == 'UNREGISTERED' or 'unregistered' in err.lower() or 'notregistered' in err.lower():
                    deactivate_push_token(token)
                    logger.info('[Push] token deactivated (unregistered)')
                else:
                    logger.warning('[Push] send failed: %s', err[:200])
        except Exception as exc:
            logger.warning('[Push] send failed: %s', exc)
    return sent
