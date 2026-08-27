"""Traitement des actions mobile hors ligne (file d'attente → handlers Django existants)."""
from __future__ import annotations

import json
import logging
from django.core.cache import cache
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

logger = logging.getLogger(__name__)

IDEMPOTENCY_TTL = 60 * 60 * 24 * 7  


def _idempotency_key(client_id: str) -> str:
    return f'mobile_outbox:{client_id}'


def _already_processed(client_id: str) -> bool:
    if not client_id:
        return False
    return cache.get(_idempotency_key(client_id)) is not None


def _mark_processed(client_id: str, result: dict) -> None:
    if client_id:
        cache.set(_idempotency_key(client_id), result, IDEMPOTENCY_TTL)


def _process_item(request, item: dict) -> dict:
    client_id = str(item.get('id') or '').strip()
    if _already_processed(client_id):
        return {'id': client_id, 'ok': True, 'duplicate': True}

    action = str(item.get('type') or '').strip()
    payload = item.get('payload') or {}
    if isinstance(payload, str):
        try:
            payload = json.loads(payload)
        except json.JSONDecodeError:
            payload = {}

    try:
        if action == 'htmx_post':
            result = _replay_htmx_post(request, payload)
        elif action == 'htmx_form':
            result = _replay_htmx_form(request, payload)
        elif action == 'driver_gps':
            result = _process_driver_gps(request, payload)
        else:
            return {'id': client_id, 'ok': False, 'error': f'Type inconnu: {action}'}
        out = {'id': client_id, 'ok': True, 'result': result}
        _mark_processed(client_id, out)
        return out
    except Exception as exc:
        logger.exception('outbox item failed: %s', action)
        return {'id': client_id, 'ok': False, 'error': str(exc)}


def _replay_htmx_post(request, payload: dict) -> dict:
    """Rejoue un POST HTMX via la stack Django interne."""
    from django.test import RequestFactory
    from django.contrib.sessions.middleware import SessionMiddleware
    from django.contrib.auth.middleware import AuthenticationMiddleware

    path = str(payload.get('path') or '').strip()
    if not path.startswith('/htmx/'):
        raise ValueError('Chemin HTMX invalide')
    body = payload.get('body') or {}
    if isinstance(body, str):
        import urllib.parse
        body = dict(urllib.parse.parse_qsl(body))

    factory = RequestFactory()
    req = factory.post(path, data=body)
    req.session = request.session
    req.user = request.user
    req.COOKIES.update(request.COOKIES)

    SessionMiddleware(lambda r: None).process_request(req)
    AuthenticationMiddleware(lambda r: None).process_request(req)

    from django.urls import resolve
    match = resolve(path)
    response = match.func(req, *match.args, **match.kwargs)
    status = getattr(response, 'status_code', 200)
    if status >= 400:
        content = getattr(response, 'content', b'').decode('utf-8', errors='replace')[:500]
        raise ValueError(content or f'HTTP {status}')
    return {'status': status}


def _replay_htmx_form(request, payload: dict) -> dict:
    return _replay_htmx_post(request, payload)


def _process_driver_gps(request, payload: dict) -> dict:
    from julmin_taxis.htmx_views import _get_current_driver, driver_update_location
    from django.test import RequestFactory

    driver = _get_current_driver(request)
    if not driver:
        raise PermissionError('Chauffeur non authentifié')

    factory = RequestFactory()
    req = factory.post('/htmx/driver/location/', data={
        'lat': payload.get('lat'),
        'lng': payload.get('lng'),
        'speed': payload.get('speed', ''),
        'heading': payload.get('heading', ''),
    })
    req.session = request.session
    req.user = request.user
    req.COOKIES.update(request.COOKIES)

    response = driver_update_location(req)
    status = getattr(response, 'status_code', 200)
    if status >= 400:
        raise ValueError(f'GPS rejeté ({status})')
    return {'status': status}


@csrf_exempt
@require_http_methods(['POST'])
def mobile_outbox(request):
    """POST /api/mobile/outbox/ — synchronise les actions en file d'attente."""
    try:
        data = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        return JsonResponse({'ok': False, 'error': 'JSON invalide'}, status=400)

    items = data if isinstance(data, list) else data.get('items', [])
    if not isinstance(items, list):
        return JsonResponse({'ok': False, 'error': 'items doit être une liste'}, status=400)

    results = [_process_item(request, item) for item in items[:50]]
    ok_count = sum(1 for r in results if r.get('ok'))
    return JsonResponse({
        'ok': True,
        'processed': len(results),
        'succeeded': ok_count,
        'results': results,
    })
