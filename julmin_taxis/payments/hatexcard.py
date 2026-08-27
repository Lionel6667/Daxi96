"""HatexCard public payments API — server-side card charges + webhook verification."""
from __future__ import annotations

import hashlib
import hmac
import logging
import re
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

API_URL = 'https://hatexcard.com/api/public/payments'


class HatexCardError(Exception):
    def __init__(self, message: str, status_code: int = 400, payload: dict | None = None):
        super().__init__(message)
        self.status_code = status_code
        self.payload = payload or {}


def _api_key() -> str:
    return (getattr(settings, 'HATEXCARD_API_KEY', '') or '').strip()


def _webhook_secret() -> str:
    return getattr(settings, 'HATEXCARD_WEBHOOK_SECRET', '') or ''


def is_configured() -> bool:
    return bool(_api_key())


def user_facing_error(
    raw: str = '',
    payload: dict | None = None,
    status_code: int = 0,
) -> str:
    """Mappe une erreur passerelle vers un message client clair (FR)."""
    payload = payload if isinstance(payload, dict) else {}
    chunks: list[str] = [raw or '']
    for key in (
        'error', 'message', 'detail', 'reason', 'code',
        'error_code', 'decline_code', 'decline_reason', 'status',
    ):
        val = payload.get(key)
        if val is not None and val != '':
            chunks.append(str(val))
    nested = payload.get('data')
    if isinstance(nested, dict):
        for key in ('error', 'message', 'reason', 'code'):
            val = nested.get(key)
            if val is not None and val != '':
                chunks.append(str(val))
    blob = ' '.join(chunks).lower()

    if status_code in (401, 403):
        return (
            'Paiement par carte temporairement indisponible. '
            'Utilisez MonCash ou contactez le support DAXI.'
        )
    if status_code >= 500:
        return (
            'Le service de paiement carte est indisponible pour le moment. '
            'Réessayez ou payez avec MonCash.'
        )

    funds_hints = (
        'insufficient', 'not enough', 'no funds', 'fonds', 'balance',
        'ase lajan', 'pa gen ase', 'insufficient_funds', 'nsf',
        'limit exceeded', 'overlimit',
    )
    if payload.get('balances') is not None or any(h in blob for h in funds_hints):
        return "Fonds insuffisants. Cette carte n'a pas assez d'argent pour payer la course."

    
    
    return (
        'Les informations de la carte sont incorrectes. '
        'Vérifiez le numéro, la date et le CVV, ou utilisez une autre carte / MonCash.'
    )


def _normalize_exp(exp: str) -> str:
    exp = (exp or '').strip().replace(' ', '')
    if re.match(r'^\d{2}/\d{2}$', exp):
        return exp
    if re.match(r'^\d{4}$', exp):
        return f'{exp[:2]}/{exp[2:]}'
    return exp


def charge_card(
    *,
    amount_htg: int,
    order_id: str,
    card_number: str,
    exp: str,
    cvv: str,
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    if not is_configured():
        raise HatexCardError('HatexCard non configuré', 503)

    card_number = re.sub(r'\D', '', card_number or '')
    cvv = re.sub(r'\D', '', cvv or '')
    exp = _normalize_exp(exp)

    if len(card_number) < 13 or len(card_number) > 19:
        raise HatexCardError('Numéro de carte invalide', 400)
    if not re.match(r'^\d{2}/\d{2}$', exp):
        raise HatexCardError('Date d\'expiration invalide (MM/AA)', 400)
    if len(cvv) < 3 or len(cvv) > 4:
        raise HatexCardError('CVV invalide', 400)

    amount_htg = int(amount_htg)
    if amount_htg < 1:
        raise HatexCardError('Montant invalide', 400)

    headers = {
        'Authorization': f'Bearer {_api_key()}',
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotency_key or f'{order_id}-v1',
    }
    payload = {
        'amount': amount_htg,
        'currency': 'HTG',
        'order_id': order_id,
        'card_info': {
            'number': card_number,
            'exp': exp,
            'cvv': cvv,
        },
    }

    resp = requests.post(API_URL, headers=headers, json=payload, timeout=45)
    try:
        data = resp.json()
    except Exception:
        data = {'error': resp.text[:300] or f'HTTP {resp.status_code}'}

    if not resp.ok:
        err = data.get('error') or data.get('message') or f'HTTP {resp.status_code}'
        logger.warning(
            '[HatexCard] charge failed HTTP %s order=%s: %s',
            resp.status_code, order_id, err,
        )
        raise HatexCardError(
            user_facing_error(str(err), data, resp.status_code),
            resp.status_code,
            data,
        )

    ok = data.get('success')
    if ok is None:
        ok = data.get('ok')
    txn = data.get('transaction_id') or data.get('id') or ''
    if ok is False or (not ok and not txn):
        raw = data.get('error') or data.get('message') or 'Paiement refusé'
        raise HatexCardError(user_facing_error(str(raw), data, 402), 402, data)

    return data


def verify_webhook(body: bytes, signature: str) -> bool:
    secret = _webhook_secret()
    if not secret or not signature or not body:
        return False
    expected = hmac.new(secret.encode('utf-8'), body, hashlib.sha256).hexdigest()
    provided = signature.strip()
    if provided.startswith('sha256='):
        provided = provided[7:]
    return hmac.compare_digest(expected, provided)


def mark_order_paid_from_order_id(order_id: str, transaction_id: str = '') -> int | None:
    from orders.models import Order
    from julmin_taxis.payment_security import mark_order_paid

    ref = (order_id or '').strip()
    if ref.startswith('daxi-'):
        try:
            pk = int(ref.split('-', 1)[1])
        except (IndexError, ValueError):
            return None
    else:
        try:
            pk = int(ref)
        except ValueError:
            return None

    try:
        order = Order.objects.get(pk=pk)
    except Order.DoesNotExist:
        return None
    if mark_order_paid(order, 'card', transaction_id, source='hatexcard_webhook'):
        return order.pk
    return order.pk
