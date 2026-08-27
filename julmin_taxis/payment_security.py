"""Paiement — marquage payé uniquement via passerelles vérifiées."""
from __future__ import annotations

from django.core.exceptions import PermissionDenied

ALLOWED_PAYMENT_SOURCES = frozenset({
    'moncash_webhook',
    'moncash_return',
    'hatexcard_webhook',
    'hatexcard_charge',
    'transak_webhook',
})


def mark_order_paid(
    order,
    payment_method: str,
    txn_id: str = '',
    source: str = '',
    request=None,
):
    if source not in ALLOWED_PAYMENT_SOURCES:
        raise PermissionDenied('Source de paiement non autorisée.')

    old_status = order.payment_status
    if old_status == 'paid':
        return False

    order.payment_status = 'paid'
    order.payment_method = payment_method
    if txn_id:
        order.nowpayments_payment_id = txn_id
    order.save(update_fields=['payment_status', 'payment_method', 'nowpayments_payment_id'])

    try:
        from julmin_taxis.security_audit import log_payment
        log_payment(order, old_status, 'paid', request=request, source=source, txn_id=txn_id)
    except Exception:
        pass

    return True
