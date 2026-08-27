"""Suivi livraison WhatsApp + replis vers templates Meta réellement actifs."""
from __future__ import annotations

import logging
import time

from django.core.cache import cache

logger = logging.getLogger(__name__)

DELIVERY_LOG_KEY = 'wa_delivery_log'
RAW_WEBHOOK_LOG_KEY = 'wa_webhook_raw_log'
DELIVERY_LOG_MAX = 80
RAW_WEBHOOK_LOG_MAX = 40


ACTIVE_TEMPLATE_FALLBACKS = {
    'prix_propose': None,
    'prix_confirme': None,
    'chauffeur_assigne': 'chauffeur_en_route',
    'course_demarree': None,
    'course_annulee': None,
    'pause_course': None,
    'rappel_course': None,
    'recu_course': 'course_terminee',
    'sos_admin': 'sos_client',
    'nouvelle_commande_admin': 'nouvelle_commande',
    'objet_oublie_admin': None,
    'entreprise_en_attente': None,
    'entreprise_emplacement': None,
    'chauffeur_a_valider': 'chauffeur_valide',
    'commande_attente_coords': None,
    'chat_escalade': None,
}


FALLBACK_BODY_BUILDERS = {
    'chauffeur_assigne': lambda params: [
        params[0] if params else 'Client',
        params[1] if len(params) > 1 else 'Votre chauffeur',
        '5',
    ],
    'recu_course': lambda params: [
        params[0] if params else 'Client',
        params[1] if len(params) > 2 else (params[1] if len(params) > 1 else '—'),
        params[2] if len(params) > 2 else '—',
    ],
    'sos_admin': lambda params: [params[2] if len(params) > 2 else 'Client'],
    'nouvelle_commande_admin': lambda params: [
        params[1] if len(params) > 1 else 'Admin',
        params[2] if len(params) > 2 else '—',
        params[3] if len(params) > 3 else '—',
        params[4] if len(params) > 4 else '—',
        '—',
    ],
    'chauffeur_a_valider': lambda params: [params[0] if params else 'Chauffeur'],
}


def record_delivery_status(payload: dict) -> None:
    """Persiste les statuts webhook Meta pour diagnostic (cache 24h)."""
    entry = {
        'ts': int(time.time()),
        'status': payload.get('status', ''),
        'recipient': payload.get('recipient_id', ''),
        'wamid': payload.get('id', ''),
        'errors': payload.get('errors') or [],
    }
    log = cache.get(DELIVERY_LOG_KEY) or []
    log.insert(0, entry)
    cache.set(DELIVERY_LOG_KEY, log[:DELIVERY_LOG_MAX], timeout=86400)


def record_webhook_raw(data: dict, source: str = 'meta') -> None:
    """Journal brut de chaque POST webhook (debug)."""
    entry = {
        'ts': int(time.time()),
        'source': source,
        'object': data.get('object', ''),
        'entry_count': len(data.get('entry') or []),
        'payload': data,
    }
    log = cache.get(RAW_WEBHOOK_LOG_KEY) or []
    log.insert(0, entry)
    cache.set(RAW_WEBHOOK_LOG_KEY, log[:RAW_WEBHOOK_LOG_MAX], timeout=86400 * 7)


def recent_raw_webhook_log(limit: int = 15) -> list:
    log = cache.get(RAW_WEBHOOK_LOG_KEY) or []
    return log[:limit]


def recent_delivery_log(limit: int = 20) -> list:
    log = cache.get(DELIVERY_LOG_KEY) or []
    return log[:limit]


def format_delivery_error(err: dict) -> str:
    code = err.get('code', '')
    title = err.get('title', '')
    details = err.get('message', '') or err.get('error_data', {}).get('details', '')
    return f'{code} {title}: {details}'.strip()


def situation_has_active_template(situation: str) -> bool:
    from julmin_taxis.whatsapp_meta_catalog import META_NOT_CREATED, META_TEMPLATES

    if situation in META_NOT_CREATED:
        return False
    meta = META_TEMPLATES.get(situation) or {}
    return meta.get('status') == 'active'


def fallback_situation(situation: str) -> str | None:
    if situation_has_active_template(situation):
        return situation
    return ACTIVE_TEMPLATE_FALLBACKS.get(situation)


def fallback_body_params(situation: str, body_params: list, fallback_situation_name: str) -> list:
    builder = FALLBACK_BODY_BUILDERS.get(situation)
    if builder:
        return builder(body_params or [])
    return list(body_params or [])
