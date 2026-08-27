"""MonCashConnect REST API — pay-create, pay-status, webhook verification."""
from __future__ import annotations

import hashlib
import hmac
import logging
import time
from typing import Any

import requests
from django.conf import settings

logger = logging.getLogger(__name__)

DEFAULT_BASE = 'https://hvlmeoqyxaguzcujpmit.supabase.co/functions/v1'


class MonCashConnectError(Exception):
    def __init__(self, message: str, status_code: int = 400, code: str = ''):
        super().__init__(message)
        self.status_code = status_code
        self.code = code


def _base_url() -> str:
    return (getattr(settings, 'MONCASH_CONNECT_BASE_URL', '') or DEFAULT_BASE).rstrip('/')


def _secret_key() -> str:
    return getattr(settings, 'MONCASH_CONNECT_SECRET_KEY', '') or ''


def _webhook_secret() -> str:
    return getattr(settings, 'MONCASH_CONNECT_WEBHOOK_SECRET', '') or ''


def is_configured() -> bool:
    return bool(_secret_key())


def _headers(idempotency_key: str | None = None) -> dict[str, str]:
    headers = {
        'Authorization': f'Bearer {_secret_key()}',
        'Content-Type': 'application/json',
    }
    if idempotency_key:
        headers['Idempotency-Key'] = idempotency_key
    return headers


def _parse_error(resp: requests.Response) -> MonCashConnectError:
    try:
        data = resp.json()
        msg = data.get('error') or data.get('message') or resp.text[:300]
        code = data.get('code', '')
    except Exception:
        msg = resp.text[:300] or f'HTTP {resp.status_code}'
        code = ''
    return MonCashConnectError(msg, resp.status_code, code)


def order_reference(order_id: int) -> str:
    return f'daxi-{order_id}'


def create_payment(
    *,
    amount_htg: int,
    reference_id: str,
    return_url: str,
    customer_name: str = '',
    customer_email: str = '',
    idempotency_key: str | None = None,
) -> dict[str, Any]:
    if not is_configured():
        raise MonCashConnectError('MonCashConnect non configuré', 503)
    amount_htg = int(amount_htg)
    if amount_htg < 1:
        raise MonCashConnectError('Montant invalide', 400)

    payload: dict[str, Any] = {
        'amount': amount_htg,
        'referenceId': reference_id,
        'returnUrl': return_url,
    }
    if customer_name:
        payload['customerName'] = customer_name
    if customer_email:
        payload['customerEmail'] = customer_email

    resp = requests.post(
        f'{_base_url()}/pay-create',
        headers=_headers(idempotency_key or reference_id),
        json=payload,
        timeout=30,
    )
    if resp.status_code == 409:
        status = get_payment_status(reference_id)
        if status.get('status') == 'pending' and status.get('paymentUrl'):
            return status
    if not resp.ok:
        raise _parse_error(resp)
    return resp.json()


def get_payment_status(reference_id: str) -> dict[str, Any]:
    if not is_configured():
        raise MonCashConnectError('MonCashConnect non configuré', 503)
    resp = requests.get(
        f'{_base_url()}/pay-status',
        headers=_headers(),
        params={'referenceId': reference_id},
        timeout=20,
    )
    if not resp.ok:
        raise _parse_error(resp)
    return resp.json()


def verify_webhook(body: bytes, signature: str, timestamp: str) -> bool:
    secret = _webhook_secret()
    if not secret or not signature or not body:
        return False
    try:
        ts = int(timestamp)
        if abs(time.time() - ts) > 300:
            return False
    except (TypeError, ValueError):
        return False

    expected_hex = hmac.new(secret.encode('utf-8'), body, hashlib.sha256).hexdigest()
    provided = signature.strip()
    if provided.startswith('sha256='):
        provided = provided[7:]
    return hmac.compare_digest(expected_hex, provided)


def mark_order_paid_from_reference(reference: str) -> int | None:
    """Return order pk if marked paid, else None."""
    from orders.models import Order
    from julmin_taxis.payment_security import mark_order_paid

    if not reference or not reference.startswith('daxi-'):
        return None
    try:
        order_id = int(reference.split('-', 1)[1])
    except (IndexError, ValueError):
        return None
    try:
        order = Order.objects.get(pk=order_id)
    except Order.DoesNotExist:
        return None
    if mark_order_paid(order, 'moncash', reference, source='moncash_webhook'):
        return order.pk
    return order.pk
