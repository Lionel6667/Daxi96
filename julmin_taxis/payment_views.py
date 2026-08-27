"""Payment pages and webhooks — MonCashConnect + HatexCard."""
from __future__ import annotations

import json
import logging

from django.conf import settings
from django.http import HttpResponse, JsonResponse
from django.shortcuts import redirect, render
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt, ensure_csrf_cookie
from django.views.decorators.http import require_http_methods

from orders.models import Order
from julmin_taxis.payments import hatexcard, moncash_connect
from julmin_taxis.htmx_views import _advance_to_driver_notified, _get_order_for_client
from julmin_taxis.currency_utils import format_price, usd_to_htg

logger = logging.getLogger(__name__)


def _order_amount_htg(order: Order) -> int:
    """Montant HTG pour passerelles de paiement (conversion depuis USD)."""
    if not order.price:
        return 0
    return usd_to_htg(order.price)


def _get_order_for_payment_page(
    request,
    order_id: int,
    extra_guest_id: str = '',
) -> Order | None:
    try:
        if request.user.is_authenticated:
            return Order.objects.get(pk=int(order_id), user=request.user)
        guest_id = (
            (extra_guest_id or '').strip()
            or request.GET.get('guest_id', '').strip()
            or request.POST.get('guest_id', '').strip()
            or request.session.get('guest_id', '').strip()
        )
        if not guest_id:
            return None
        return Order.objects.get(pk=int(order_id), guest_id=guest_id, user__isnull=True)
    except (Order.DoesNotExist, ValueError):
        return None


@ensure_csrf_cookie
def card_payment_page(request, order_id):
    """GET /payment/<order_id>/card/ — HatexCard card form (HTG)."""
    order = _get_order_for_payment_page(request, order_id)
    if not order:
        return redirect('/?error=session_expired')
    if order.payment_status == 'paid':
        return redirect('/?payment=already_paid')
    if order.status != 'price_confirmed':
        return redirect('/?error=payment_unavailable')

    amount_htg = _order_amount_htg(order)
    amount_display = format_price(order.price)
    guest_id = order.guest_id or request.GET.get('guest_id', '')
    if guest_id and not request.user.is_authenticated:
        request.session['guest_id'] = guest_id

    theme = (request.GET.get('theme') or '').strip().lower()
    if theme not in ('light', 'dark'):
        theme = 'dark'
    ctx = {
        'order': order,
        'amount_display': amount_display,
        'amount_htg': amount_htg,
        'guest_id': guest_id,
        'config_error': False,
        'service_error': False,
        'embed': request.GET.get('embed') == '1',
        'theme': theme,
    }

    if not hatexcard.is_configured():
        ctx['config_error'] = True
        return render(request, 'payment/card_payment.html', ctx)

    order.payment_method = 'card'
    order.payment_status = 'pending'
    order.nowpayments_invoice_id = f'daxi-{order.pk}'
    order.save(update_fields=['payment_method', 'payment_status', 'nowpayments_invoice_id'])

    return render(request, 'payment/card_payment.html', ctx)


@require_http_methods(['POST'])
def card_payment_charge(request, order_id):
    """POST /payment/<order_id>/card/charge/ — server-side HatexCard charge."""
    try:
        body = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        body = {}

    guest_from_body = (body.get('guest_id') or '').strip()
    order = _get_order_for_payment_page(request, order_id, extra_guest_id=guest_from_body)
    if not order:
        return JsonResponse({'success': False, 'error': 'Session expirée. Rechargez la page de paiement.'}, status=403)
    if order.payment_status == 'paid':
        return JsonResponse({'success': True, 'already_paid': True})
    if order.status != 'price_confirmed':
        return JsonResponse({'success': False, 'error': 'Paiement non disponible.'}, status=400)

    card_number = (body.get('card_number') or '').strip()
    exp = (body.get('exp') or '').strip()
    cvv = (body.get('cvv') or '').strip()

    try:
        result = hatexcard.charge_card(
            amount_htg=_order_amount_htg(order),
            order_id=f'daxi-{order.pk}',
            card_number=card_number,
            exp=exp,
            cvv=cvv,
            idempotency_key=f'daxi-{order.pk}-charge',
        )
    except hatexcard.HatexCardError as exc:
        payload = exc.payload or {}
        if exc.status_code == 401:
            logger.error('[HatexCard] API 401 — clé API invalide ou refusée: %s', payload)
        msg = hatexcard.user_facing_error(str(exc), payload, exc.status_code)
        http_status = 400 if exc.status_code in (401, 403) else (
            exc.status_code if 400 <= exc.status_code < 500 else 400
        )
        return JsonResponse({
            'success': False,
            'error': msg,
        }, status=http_status)

    txn_id = result.get('transaction_id') or result.get('id') or ''
    from julmin_taxis.payment_security import mark_order_paid
    mark_order_paid(order, 'card', txn_id, source='hatexcard_charge', request=request)
    _advance_to_driver_notified(order)

    return JsonResponse({
        'success': True,
        'transaction_id': txn_id,
        'debited_from': result.get('debited_from'),
    })


def moncash_payment_return(request, order_id):
    """GET /payment/<order_id>/moncash/return/ — after MonCash redirect."""
    order = _get_order_for_payment_page(request, order_id)
    if not order:
        return redirect('/?error=session_expired')

    ref = moncash_connect.order_reference(order.pk)
    paid = False
    error_msg = ''

    if moncash_connect.is_configured():
        try:
            status_data = moncash_connect.get_payment_status(ref)
            if status_data.get('status') == 'completed':
                paid = True
                from julmin_taxis.payment_security import mark_order_paid
                txn = status_data.get('moncashTransactionId') or ref
                mark_order_paid(order, 'moncash', txn, source='moncash_return', request=request)
                _advance_to_driver_notified(order)
            elif status_data.get('status') == 'failed':
                error_msg = status_data.get('failureReason') or 'Paiement MonCash échoué.'
                order.payment_status = 'failed'
                order.save(update_fields=['payment_status'])
                try:
                    from julmin_taxis.notify import push_order_event
                    push_order_event(order, 'payment_failed')
                except Exception:
                    pass
        except moncash_connect.MonCashConnectError as exc:
            logger.warning('[MonCash] return status check failed: %s', exc)
            error_msg = 'Vérification du paiement en cours…'

    return render(request, 'payment/moncash_return.html', {
        'order': order,
        'paid': paid,
        'error_msg': error_msg,
        'guest_id': order.guest_id or request.GET.get('guest_id', ''),
    })


def debt_moncash_return(request, debt_id):
    """GET /payment/debt/<debt_id>/moncash/return/ — après paiement d'une dette."""
    from orders.models import ClientPaymentDebt
    try:
        debt = ClientPaymentDebt.objects.get(pk=int(debt_id), is_paid=False)
    except (ClientPaymentDebt.DoesNotExist, ValueError):
        return redirect('/?debt=unknown')

    ref = debt.payment_reference or f'daxi-debt-{debt.pk}'
    paid = False
    if moncash_connect.is_configured():
        try:
            status_data = moncash_connect.get_payment_status(ref)
            if status_data.get('status') == 'completed':
                paid = True
                debt.is_paid = True
                debt.paid_at = timezone.now()
                debt.save(update_fields=['is_paid', 'paid_at'])
        except moncash_connect.MonCashConnectError as exc:
            logger.warning('[MonCash] debt return: %s', exc)

    if paid:
        return redirect('/?debt_paid=1')
    return redirect('/?debt_pending=1')


def driver_commission_moncash_return(request, payment_id):
    """GET /payment/driver-commission/<id>/moncash/return/ — après paiement commission chauffeur."""
    from drivers.models import DriverCommissionPayment
    from julmin_taxis.htmx_views import _complete_driver_commission_payment

    try:
        payment = DriverCommissionPayment.objects.select_related('driver').get(pk=int(payment_id))
    except (DriverCommissionPayment.DoesNotExist, ValueError):
        return redirect('/driver/?commission=unknown')

    ref = payment.payment_reference or f'daxi-drvcomm-{payment.pk}'
    paid = payment.is_paid
    if not paid and moncash_connect.is_configured():
        try:
            status_data = moncash_connect.get_payment_status(ref)
            if status_data.get('status') == 'completed':
                _complete_driver_commission_payment(payment)
                paid = True
        except moncash_connect.MonCashConnectError as exc:
            logger.warning('[MonCash] driver commission return: %s', exc)

    if paid:
        return redirect('/driver/?commission_paid=1')
    return redirect('/driver/?commission_pending=1')


@csrf_exempt
@require_http_methods(['POST'])
def moncash_webhook(request):
    """POST /payment/moncash/webhook/ — MonCashConnect HMAC webhook."""
    body = request.body
    signature = request.headers.get('X-MCC-Signature', '')
    timestamp = request.headers.get('X-MCC-Timestamp', '')

    if not moncash_connect.verify_webhook(body, signature, timestamp):
        return HttpResponse('Invalid signature', status=400)

    try:
        payload = json.loads(body.decode('utf-8'))
    except json.JSONDecodeError:
        return HttpResponse('Bad JSON', status=400)

    event = payload.get('event', '')
    reference = payload.get('reference', '')

    if event == 'payment.completed' and reference:
        if reference.startswith('daxi-drvcomm-'):
            from drivers.models import DriverCommissionPayment
            from julmin_taxis.htmx_views import _complete_driver_commission_payment
            try:
                pay_id = int(reference.split('-', 2)[2])
                payment = DriverCommissionPayment.objects.get(pk=pay_id)
                _complete_driver_commission_payment(payment)
            except (DriverCommissionPayment.DoesNotExist, ValueError, IndexError):
                pass
        else:
            order_pk = moncash_connect.mark_order_paid_from_reference(reference)
            if order_pk:
                try:
                    order = Order.objects.get(pk=order_pk)
                    _advance_to_driver_notified(order)
                except Order.DoesNotExist:
                    pass

    return HttpResponse('OK', status=200)


@csrf_exempt
@require_http_methods(['GET', 'HEAD', 'POST'])
def hatexcard_webhook(request):
    """GET/HEAD /carte/webhook/ — ping de vérification HatexCard.
    POST /carte/webhook/ — paiement confirmé (payment.success).
    """
    if request.method in ('GET', 'HEAD'):
        return HttpResponse('OK', status=200, content_type='text/plain')

    body = request.body
    if not body or not body.strip():
        return HttpResponse('OK', status=200, content_type='text/plain')

    signature = (
        request.headers.get('X-Hatex-Signature', '')
        or request.headers.get('X-Signature', '')
        or request.headers.get('X-Webhook-Signature', '')
    )

    if settings.HATEXCARD_WEBHOOK_SECRET and not hatexcard.verify_webhook(body, signature):
        return HttpResponse('Invalid signature', status=400)

    try:
        payload = json.loads(body.decode('utf-8'))
    except json.JSONDecodeError:
        return HttpResponse('Bad JSON', status=400)

    event = payload.get('event', '') or payload.get('type', '')
    order_id = payload.get('order_id', '') or payload.get('reference', '')
    txn_id = payload.get('transaction_id', '') or payload.get('id', '')

    if event in ('payment.success', 'payment.completed', 'payment_success') and order_id:
        order_pk = hatexcard.mark_order_paid_from_order_id(str(order_id), str(txn_id))
        if order_pk:
            try:
                order = Order.objects.get(pk=order_pk)
                _advance_to_driver_notified(order)
            except Order.DoesNotExist:
                pass

    return HttpResponse('OK', status=200)
