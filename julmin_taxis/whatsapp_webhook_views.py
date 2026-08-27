"""Webhook WhatsApp Cloud API (Meta) — verification GET + evenements POST."""
from __future__ import annotations

import json
import logging

from django.conf import settings
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_http_methods

from julmin_taxis.whatsapp_service import process_webhook_payload

logger = logging.getLogger(__name__)


def _verify_token() -> str:
    return (getattr(settings, 'WHATSAPP_VERIFY_TOKEN', '') or 'daxi_verify_2026').strip()


@csrf_exempt
@require_http_methods(['GET', 'POST'])
def whatsapp_webhook(request):
    if request.method == 'GET':
        mode = request.GET.get('hub.mode', '')
        token = request.GET.get('hub.verify_token', '')
        challenge = request.GET.get('hub.challenge', '')
        expected = _verify_token()

        if mode == 'subscribe' and token == expected:
            logger.info('WEBHOOK_VERIFIED challenge=%s', challenge[:32])
            
            return HttpResponse(challenge, content_type='text/plain', status=200)

        logger.warning(
            'WEBHOOK_VERIFY_FAILED mode=%r token_match=%s expected=%r',
            mode,
            token == expected,
            expected,
        )
        return HttpResponse('Forbidden', status=403, content_type='text/plain')

    try:
        raw_body = request.body.decode('utf-8', errors='replace')
        data = json.loads(raw_body) if raw_body else {}
        from julmin_taxis.whatsapp_delivery import record_webhook_raw
        record_webhook_raw(data, source='meta')
        process_webhook_payload(data)
    except Exception:
        logger.exception('Erreur traitement webhook WhatsApp POST')
    return HttpResponse('OK', status=200, content_type='text/plain')
