"""Page de test WhatsApp — envoi template + logs API / webhook."""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request

from django.conf import settings
from django.core.cache import cache
from django.http import HttpResponseForbidden, JsonResponse
from django.shortcuts import render
from django.views.decorators.http import require_GET, require_http_methods

from julmin_taxis.whatsapp_delivery import recent_delivery_log, recent_raw_webhook_log
from julmin_taxis.whatsapp_service import _normalize_phone

SEND_LOG_KEY = 'wa_test_send_log'
SEND_LOG_MAX = 30

TEST_TEMPLATES = {
    'hello_world': {
        'label': 'hello_world (en_US, Meta demo)',
        'name': 'hello_world',
        'lang': 'en_US',
        'components': [],
        'note': 'Souvent bloque sur numeros production (erreur 131058).',
    },
    'course_terminee': {
        'label': 'course_terminee (fr, Utilitaire)',
        'name': 'course_terminee',
        'lang': 'fr',
        'components': [{
            'type': 'body',
            'parameters': [
                {'type': 'text', 'text': 'Raymond'},
                {'type': 'text', 'text': 'Cap-Haitien'},
                {'type': 'text', 'text': 'Labadee'},
            ],
        }],
    },
    'chauffeur_en_route': {
        'label': 'chauffeur_en_route (fr, Marketing)',
        'name': 'chauffeur_en_route',
        'lang': 'fr',
        'components': [{
            'type': 'body',
            'parameters': [
                {'type': 'text', 'text': 'Raymond'},
                {'type': 'text', 'text': 'Jean Test'},
                {'type': 'text', 'text': '5'},
            ],
        }],
    },
    'welcome_client': {
        'label': 'welcome_client (fr, header DAXI)',
        'name': 'welcome_client',
        'lang': 'fr',
        'components': [
            {'type': 'header', 'parameters': [{'type': 'text', 'text': 'DAXI'}]},
            {'type': 'body', 'parameters': [{'type': 'text', 'text': 'Raymond'}]},
        ],
    },
}


def _allowed(request) -> bool:
    if getattr(settings, 'DEBUG', False):
        return True
    user = getattr(request, 'user', None)
    return bool(user and user.is_authenticated and getattr(user, 'is_staff', False))


def _graph(method: str, url: str, payload: dict | None = None) -> dict:
    token = (getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '') or '').strip()
    headers = {'Authorization': f'Bearer {token}'}
    data = None
    if payload is not None:
        headers['Content-Type'] = 'application/json'
        data = json.dumps(payload).encode('utf-8')
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    started = time.time()
    try:
        with urllib.request.urlopen(req, timeout=25) as resp:
            raw = resp.read().decode('utf-8', errors='replace')
            body = json.loads(raw) if raw else {}
            return {
                'ok': 200 <= resp.status < 300,
                'http_status': resp.status,
                'body': body,
                'raw': raw,
                'elapsed_ms': int((time.time() - started) * 1000),
                'error': None,
            }
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode('utf-8', errors='replace')
        try:
            body = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            body = {'_raw': raw}
        return {
            'ok': False,
            'http_status': exc.code,
            'body': body,
            'raw': raw,
            'elapsed_ms': int((time.time() - started) * 1000),
            'error': str(exc),
        }
    except Exception as exc:
        return {
            'ok': False,
            'http_status': 0,
            'body': {},
            'raw': '',
            'elapsed_ms': int((time.time() - started) * 1000),
            'error': str(exc),
        }


def _phone_status() -> dict:
    phone_id = (getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '') or '').strip()
    if not phone_id:
        return {'error': 'WHATSAPP_PHONE_NUMBER_ID manquant'}
    fields = (
        'display_phone_number,verified_name,name_status,new_name_status,status,'
        'quality_rating,code_verification_status,account_mode,messaging_limit_tier,'
        'platform_type,is_pin_enabled'
    )
    base = 'https://graph.facebook.com/v25.0'
    return _graph('GET', f'{base}/{phone_id}?fields={fields}')


def _append_send_log(entry: dict) -> None:
    log = cache.get(SEND_LOG_KEY) or []
    log.insert(0, entry)
    cache.set(SEND_LOG_KEY, log[:SEND_LOG_MAX], timeout=86400 * 7)


def _send_template(to_phone: str, tpl_key: str) -> dict:
    phone_id = (getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '') or '').strip()
    meta = TEST_TEMPLATES.get(tpl_key) or TEST_TEMPLATES['hello_world']
    to_norm = _normalize_phone(to_phone)
    payload = {
        'messaging_product': 'whatsapp',
        'to': to_norm,
        'type': 'template',
        'template': {
            'name': meta['name'],
            'language': {'code': meta['lang']},
        },
    }
    if meta.get('components'):
        payload['template']['components'] = meta['components']

    url = f'https://graph.facebook.com/v25.0/{phone_id}/messages'
    result = _graph('POST', url, payload)
    entry = {
        'ts': int(time.time()),
        'to': to_norm,
        'template': tpl_key,
        'request': payload,
        'response': result,
    }
    _append_send_log(entry)
    return entry


@require_http_methods(['GET', 'POST'])
def whatsapp_test_page(request):
    if not _allowed(request):
        return HttpResponseForbidden('Page test WhatsApp — DEBUG ou staff uniquement.')

    phone = (request.POST.get('phone') or request.GET.get('phone') or '50940615883').strip()
    tpl_key = (request.POST.get('template') or 'hello_world').strip()
    if tpl_key not in TEST_TEMPLATES:
        tpl_key = 'hello_world'

    send_result = None
    wamid = ''
    msg_status = ''
    api_error = ''
    if request.method == 'POST' and request.POST.get('action') == 'send':
        send_result = _send_template(phone, tpl_key)
        body = (send_result.get('response') or {}).get('body') or {}
        msgs = body.get('messages') or []
        if msgs:
            wamid = msgs[0].get('id', '')
            msg_status = msgs[0].get('message_status', '')
        err = body.get('error') or {}
        api_error = err.get('message', '')

    phone_status = _phone_status()
    delivery_log = recent_delivery_log(25)
    raw_webhook_log = recent_raw_webhook_log(15)
    send_history = cache.get(SEND_LOG_KEY) or []

    verify_local = None
    if request.method == 'POST' and request.POST.get('action') == 'ping_webhook':
        import urllib.request
        verify_token = (getattr(settings, 'WHATSAPP_VERIFY_TOKEN', '') or 'daxi_verify_2026').strip()
        url = f"https://repacking-shorts-vocalist.ngrok-free.dev/webhook/?hub.mode=subscribe&hub.verify_token={verify_token}&hub.challenge=local_ping"
        try:
            with urllib.request.urlopen(url, timeout=10) as resp:
                verify_local = {'ok': True, 'status': resp.status, 'body': resp.read().decode()[:200]}
        except Exception as exc:
            verify_local = {'ok': False, 'error': str(exc)}

    ctx = {
        'phone': phone,
        'tpl_key': tpl_key,
        'templates': TEST_TEMPLATES,
        'phone_id': getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', ''),
        'site_url': getattr(settings, 'SITE_URL', ''),
        'webhook_url': 'https://repacking-shorts-vocalist.ngrok-free.dev/webhook/',
        'verify_token': (getattr(settings, 'WHATSAPP_VERIFY_TOKEN', '') or 'daxi_verify_2026').strip(),
        'send_result': send_result,
        'wamid': wamid,
        'msg_status': msg_status,
        'api_error': api_error,
        'send_request_json': json.dumps(send_result.get('request'), indent=2, ensure_ascii=False) if send_result else '',
        'send_result_json': json.dumps(send_result.get('response'), indent=2, ensure_ascii=False) if send_result else '',
        'phone_status_json': json.dumps(phone_status, indent=2, ensure_ascii=False),
        'delivery_log_json': json.dumps(delivery_log, indent=2, ensure_ascii=False),
        'raw_webhook_log_json': json.dumps(raw_webhook_log, indent=2, ensure_ascii=False),
        'send_history_json': json.dumps(send_history, indent=2, ensure_ascii=False),
        'verify_local': verify_local,
        'verify_local_json': json.dumps(verify_local, indent=2) if verify_local else '',
        'code_verification_expired': (
            phone_status.get('body', {}).get('code_verification_status') == 'EXPIRED'
            if phone_status.get('ok') else False
        ),
    }
    return render(request, 'whatsapp_test.html', ctx)


@require_GET
def whatsapp_test_logs_api(request):
    """Polling JSON — statuts webhook + historique envois."""
    if not _allowed(request):
        return JsonResponse({'error': 'forbidden'}, status=403)
    return JsonResponse({
        'delivery_log': recent_delivery_log(25),
        'raw_webhook_log': recent_raw_webhook_log(15),
        'send_history': cache.get(SEND_LOG_KEY) or [],
        'ts': int(time.time()),
    })
