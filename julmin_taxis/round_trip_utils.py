"""Helpers pour le cycle de vie des courses aller-retour."""
from django.utils import timezone


def is_round_trip_order(order):
    tt = (getattr(order, 'trip_type', None) or '').lower().strip()
    return tt in ('round_trip', 'aller-retour', 'aller retour') or 'retour' in tt


def round_trip_phase(order):
    return (getattr(order, 'round_trip_phase', None) or '').strip()


def round_trip_can_take_other_rides(order):
    """Chauffeur libre pour d'autres courses pendant l'attente au retour."""
    if (order.status or '') != 'waiting_return':
        return False
    if not getattr(order, 'round_trip_allow_driver_other_rides', False):
        return False
    return int(getattr(order, 'round_trip_wait_minutes', 0) or 0) >= 30


def round_trip_wait_remaining_seconds(order):
    started = getattr(order, 'round_trip_wait_started_at', None)
    if (order.status or '') != 'waiting_return' or not started:
        return None
    total = int(getattr(order, 'round_trip_wait_minutes', 0) or 0) * 60
    if total <= 0:
        return None
    elapsed = (timezone.now() - started).total_seconds()
    return max(0, int(total - elapsed))


def round_trip_pickup_request_pending(order):
    """True si le client a demandé le retour et le chauffeur n'a pas encore fermé l'alerte."""
    requested = getattr(order, 'round_trip_pickup_requested_at', None)
    if not requested:
        return False
    dismissed = getattr(order, 'round_trip_pickup_request_dismissed_at', None)
    if not dismissed:
        return True
    return requested > dismissed


def order_pipeline_index(order, status=None):
    """Index pipeline UI — étendu pour aller-retour (0–9 au lieu de 0–7)."""
    status = (status or order.status or '').strip()
    if not is_round_trip_order(order):
        one_way = (
            'pending', 'price_proposed', 'price_confirmed', 'driver_assigned',
            'on_way', 'arrived', 'in_progress', 'completed',
        )
        try:
            return one_way.index(status)
        except ValueError:
            return -1

    phase = round_trip_phase(order)
    mapping = {
        'pending': 0,
        'price_proposed': 1,
        'price_confirmed': 2,
        'driver_assigned': 3,
        'on_way': 4,
        'arrived': 5,
        'in_progress': 8 if phase == 'return' else 6,
        'waiting_return': 7,
        'completed': 9,
        'cancelled': -1,
    }
    return mapping.get(status, -1)


def round_trip_nav_target(order):
    """
    Cible navigation chauffeur : pickup | destination | waiting.
    """
    status = (order.status or '').strip()
    phase = round_trip_phase(order)
    if status in ('driver_assigned', 'on_way', 'arrived'):
        return 'pickup'
    if status == 'waiting_return':
        return 'waiting'
    if status == 'in_progress':
        return 'pickup' if phase == 'return' else 'destination'
    return None
