"""Firebase Cloud Messaging helpers (HTTP v1 + legacy fallback)."""
import json
import time
from pathlib import Path

import jwt
import requests
from django.conf import settings


_token_cache = {'token': None, 'expires_at': 0}


def _load_service_account():
    raw = (getattr(settings, 'FCM_SERVICE_ACCOUNT_JSON', '') or '').strip()
    if raw:
        try:
            data = json.loads(raw)
            if data.get('client_email') and data.get('private_key') and data.get('token_uri'):
                return data
        except Exception:
            pass
    path = getattr(settings, 'FCM_SERVICE_ACCOUNT_PATH', '')
    if not path:
        return None
    p = Path(path)
    if not p.is_file():
        return None
    try:
        data = json.loads(p.read_text(encoding='utf-8'))
    except Exception:
        return None
    if not data.get('client_email') or not data.get('private_key') or not data.get('token_uri'):
        return None
    return data


def _get_fcm_access_token():
    now = time.time()
    if _token_cache['token'] and _token_cache['expires_at'] > now + 60:
        return _token_cache['token']

    sa = _load_service_account()
    if not sa:
        return None

    assertion = jwt.encode(
        {
            'iss': sa['client_email'],
            'scope': 'https://www.googleapis.com/auth/firebase.messaging',
            'aud': sa['token_uri'],
            'iat': int(now),
            'exp': int(now) + 3600,
        },
        sa['private_key'],
        algorithm='RS256',
    )

    resp = requests.post(
        sa['token_uri'],
        data={
            'grant_type': 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            'assertion': assertion,
        },
        timeout=15,
    )
    if resp.status_code != 200:
        return None

    payload = resp.json()
    token = payload.get('access_token')
    expires_in = int(payload.get('expires_in', 3600))
    _token_cache['token'] = token
    _token_cache['expires_at'] = now + expires_in
    return token


def _is_unregistered_error(status_code, body):
    text = str(body or '').lower()
    if any(m in text for m in (
        'unregistered',
        'notregistered',
        'registration-token-not-registered',
        'requested entity was not found',
    )):
        return True
    return False


def _send_fcm_v1(token, notification, data=None, *, silent=False, urgent=False, channel=None):
    sa = _load_service_account()
    if not sa:
        return False, 'Service account not configured'

    access_token = _get_fcm_access_token()
    if not access_token:
        return False, 'Unable to obtain FCM access token'

    project_id = sa.get('project_id') or getattr(settings, 'FCM_PROJECT_ID', '')
    if not project_id:
        return False, 'Missing FCM project id'

    payload = {k: str(v) for k, v in (data or {}).items()}
    link = payload.get('deep_link') or payload.get('url', '/')
    ntype = payload.get('type') or payload.get('event') or ''
    is_sos = ntype in ('sos', 'sos_alert', 'sos_ack') or payload.get('event') == 'sos_alert'
    is_urgent = urgent or is_sos or payload.get('urgent') in ('1', 'true', 'yes')
    if channel in ('daxi_orders', 'daxi_urgent', 'daxi_sos'):
        channel_id = channel
    else:
        channel_id = 'daxi_sos' if is_sos else ('daxi_urgent' if is_urgent else 'daxi_orders')
    title = notification.get('title', 'Notification')
    body = notification.get('body', '')

    if silent:
        message = {
            'message': {
                'token': token,
                'data': payload,
                'android': {'priority': 'NORMAL'},
                'apns': {
                    'headers': {'apns-priority': '5', 'apns-push-type': 'background'},
                    'payload': {'aps': {'content-available': 1}},
                },
            }
        }
    else:
        aps = {
            'alert': {'title': title, 'body': body},
            'sound': 'default',
            'badge': 1,
        }
        if is_sos:
            aps['interruption-level'] = 'time-sensitive'
        message = {
            'message': {
                'token': token,
                'notification': {'title': title, 'body': body},
                'data': payload,
                'android': {
                    'priority': 'HIGH',
                    'ttl': '3600s' if is_sos else '86400s',
                    'notification': {
                        'channel_id': channel_id,
                        'sound': 'default',
                        'default_vibrate_timings': True,
                        'notification_priority': 'PRIORITY_MAX' if is_urgent else 'PRIORITY_HIGH',
                    },
                },
                'apns': {
                    'headers': {
                        'apns-priority': '10',
                        'apns-push-type': 'alert',
                    },
                    'payload': {'aps': aps},
                },
                'webpush': {
                    'fcm_options': {'link': link},
                    'notification': {
                        'icon': notification.get('icon', '/assets/images/daxi-logo-gold.png'),
                    },
                },
            }
        }

    resp = requests.post(
        f'https://fcm.googleapis.com/v1/projects/{project_id}/messages:send',
        headers={
            'Authorization': f'Bearer {access_token}',
            'Content-Type': 'application/json',
        },
        json=message,
        timeout=15,
    )
    if resp.status_code == 200:
        return True, resp.json()
    err_body = resp.text[:400]
    if _is_unregistered_error(resp.status_code, err_body):
        return False, 'UNREGISTERED'
    return False, err_body


def _send_fcm_legacy(token, notification, data=None):
    server_key = getattr(settings, 'FCM_SERVER_KEY', '')
    if not server_key:
        return False, 'FCM server key not configured'

    payload = {
        'to': token,
        'notification': {
            'title': notification.get('title', 'Notification'),
            'body': notification.get('body', ''),
            'icon': notification.get('icon', '/img/logo.png'),
            'click_action': notification.get('url', '/'),
        },
        'data': {k: str(v) for k, v in (data or {}).items()},
        'priority': 'high',
    }

    resp = requests.post(
        'https://fcm.googleapis.com/fcm/send',
        headers={
            'Authorization': f'key={server_key}',
            'Content-Type': 'application/json',
        },
        json=payload,
        timeout=15,
    )
    if resp.status_code == 200:
        return True, resp.json()
    return False, resp.text[:300]


def send_push(token, notification, data=None, *, silent=False, urgent=False, channel=None):
    """Send a push notification; tries HTTP v1 first, then legacy API."""
    if not token:
        return False, 'Missing device token'

    ok, result = _send_fcm_v1(
        token, notification, data, silent=silent, urgent=urgent, channel=channel
    )
    if ok:
        return True, result

    ok, result = _send_fcm_legacy(token, notification, data)
    return ok, result
