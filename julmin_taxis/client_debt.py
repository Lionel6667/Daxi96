"""Dettes client (remboursements / pénalités à régler en ligne).

Le blocage « Paiement requis » est une mesure sévère : on n'affiche une dette
que si elle est prouvée (commande annulée, paiement espèces, frais > 0,
annulation initiée par le client / l'entreprise). En cas de doute : rien.
"""
from decimal import Decimal

CLIENT_CANCEL_SOURCES = frozenset({'client_cancel', 'enterprise_cancel'})
CLIENT_CANCEL_ACTORS = frozenset({'client', 'guest', 'enterprise'})
MIN_GUEST_ID_LEN = 8


def _guest_id(request):
    return (
        request.POST.get('guest_id', '')
        or request.GET.get('guest_id', '')
        or request.session.get('guest_id', '')
    ).strip()


def _request_owns_order(request, order):
    if order is None:
        return False
    if request.user.is_authenticated:
        return order.user_id == request.user.id
    gid = _guest_id(request)
    if not gid or len(gid) < MIN_GUEST_ID_LEN:
        return False
    return (not order.user_id) and order.guest_id == gid


def _request_owns_debt(request, debt):
    if debt is None:
        return False
    if request.user.is_authenticated:
        return debt.user_id == request.user.id
    gid = _guest_id(request)
    if not gid or len(gid) < MIN_GUEST_ID_LEN:
        return False
    return (not debt.user_id) and debt.guest_id == gid


def _cancel_was_client_initiated(order):
    """Preuve d'annulation client/entreprise via le journal de sécurité."""
    from orders.models import SecurityLog

    logs = (
        SecurityLog.objects.filter(
            order=order,
            action='STATUS_CHANGE',
            new_value='cancelled',
        )
        .order_by('-created_at')[:8]
    )
    for log in logs:
        meta = log.metadata if isinstance(log.metadata, dict) else {}
        source = str(meta.get('source') or '')
        if source in CLIENT_CANCEL_SOURCES and log.actor_type in CLIENT_CANCEL_ACTORS:
            return True
    return False


def _status_before_cancel(order):
    from orders.models import SecurityLog

    log = (
        SecurityLog.objects.filter(
            order=order,
            action='STATUS_CHANGE',
            new_value='cancelled',
        )
        .order_by('-created_at')
        .first()
    )
    if log and log.old_value:
        return str(log.old_value).strip()
    return None


def _fee_still_due(order, amount_usd):
    from julmin_taxis.refund_policy import compute_cancellation_fee

    if (order.payment_method or '') != 'in_person':
        return False
    if order.status != 'cancelled':
        return False
    snapshot = _status_before_cancel(order)
    if not snapshot:
        return False
    order._cancel_fee_status_snapshot = snapshot
    fee = compute_cancellation_fee(order)
    if fee <= 0:
        return False
    try:
        return Decimal(amount_usd).quantize(Decimal('0.01')) == fee
    except Exception:
        return False


def is_enforceable_debt(debt, request):
    """True seulement si on peut prouver que le client doit vraiment payer."""
    if not debt or debt.is_paid:
        return False
    if not debt.amount_usd or Decimal(debt.amount_usd) <= 0:
        return False
    if not _request_owns_debt(request, debt):
        return False
    order = getattr(debt, 'order', None)
    if order is None and getattr(debt, 'order_id', None):
        try:
            order = debt.order
        except Exception:
            order = None
    if order is None:
        return False
    if not _request_owns_order(request, order):
        return False
    if not _cancel_was_client_initiated(order):
        return False
    return _fee_still_due(order, debt.amount_usd)


def get_unpaid_debt(request):
    from orders.models import ClientPaymentDebt

    qs = ClientPaymentDebt.objects.filter(is_paid=False).select_related('order')
    if request.user.is_authenticated:
        qs = qs.filter(user=request.user)
    else:
        gid = _guest_id(request)
        if not gid or len(gid) < MIN_GUEST_ID_LEN:
            return None
        qs = qs.filter(guest_id=gid, user__isnull=True)

    for debt in qs.order_by('-created_at')[:12]:
        if is_enforceable_debt(debt, request):
            return debt
    return None


def create_debt_from_order(order, amount_usd: Decimal, reason: str):
    from orders.models import ClientPaymentDebt

    amount_usd = Decimal(amount_usd)
    if amount_usd <= 0:
        return None
    existing = ClientPaymentDebt.objects.filter(order=order, is_paid=False).first()
    if existing:
        return existing
    return ClientPaymentDebt.objects.create(
        user=order.user,
        guest_id=order.guest_id or '',
        order=order,
        amount_usd=amount_usd,
        reason=reason,
        is_paid=False,
    )


def maybe_record_cash_cancellation_debt(order, status_before_cancel: str, *, skip: bool = False):
    """
    Si le client avait choisi le paiement espèces et qu'une retenue s'applique,
    créer une dette en ligne à régler.
    Ne pas appeler pour une annulation initiée par l'admin (skip=True ou admin_refuse).
    """
    if skip:
        return None
    if (order.payment_method or '') != 'in_person':
        return None
    order._cancel_fee_status_snapshot = status_before_cancel
    from julmin_taxis.refund_policy import compute_cancellation_fee
    fee = compute_cancellation_fee(order)
    if fee <= 0:
        return None
    reason = (
        f'Frais d\'annulation commande #{order.pk} '
        f'({status_before_cancel.replace("_", " ")}) — paiement espèces'
    )
    return create_debt_from_order(order, fee, reason)
