"""Helpers for admin live map — visibilité client/chauffeur."""
from datetime import datetime, timedelta

from django.utils import timezone

                                                           
CLIENT_TRACK_STATUSES = frozenset({
    'driver_assigned', 'on_way', 'arrived', 'in_progress',
})

GPS_LIVE_THRESHOLD_MINUTES = 5


def format_duration_minutes(mins):
    """Durée lisible : min (< 60), heures (< 48 h), jours au-delà."""
    if mins is None:
        return ''
    mins = max(0, int(mins))
    if mins < 60:
        return f'{mins} min'
    hours = mins // 60
    if hours < 48:
        return f'{hours} h'
    return f'{hours // 24} j'


def minutes_since(dt, now=None):
    if not dt:
        return None
    now = now or timezone.now()
    if timezone.is_naive(dt):
        dt = timezone.make_aware(dt, timezone.get_current_timezone())
    return max(0, int((now - dt).total_seconds() // 60))


def _gps_is_live(updated_at, now=None):
    if not updated_at:
        return False
    now = now or timezone.now()
    if timezone.is_naive(updated_at):
        updated_at = timezone.make_aware(updated_at, timezone.get_current_timezone())
    return (now - updated_at).total_seconds() <= GPS_LIVE_THRESHOLD_MINUTES * 60


def client_tracking_status(order, now=None):
    """Statut position client pour admin SOS / carte."""
    now = now or timezone.now()
    has_live_gps = (
        order.client_gps_lat is not None
        and order.client_gps_lng is not None
    )
    if has_live_gps:
        live = _gps_is_live(order.client_gps_updated_at, now)
        offline_mins = minutes_since(order.client_gps_updated_at, now)
        offline_display = format_duration_minutes(offline_mins) if offline_mins is not None else ''
        return {
            'online': live,
            'lat': order.client_gps_lat,
            'lng': order.client_gps_lng,
            'source': 'gps',
            'last_seen_at': order.client_gps_updated_at,
            'offline_minutes': 0 if live else offline_mins,
            'offline_duration': '' if live else offline_display,
            'label': (
                'GPS client en direct'
                if live
                else f'Client hors ligne depuis {offline_display}'
                if offline_display
                else 'GPS client expiré'
            ),
        }

    if order.pickup_lat is not None and order.pickup_lng is not None:
        pickup_offline = minutes_since(order.created_at, now)
        return {
            'online': False,
            'lat': order.pickup_lat,
            'lng': order.pickup_lng,
            'source': 'pickup',
            'last_seen_at': order.created_at,
            'offline_minutes': pickup_offline,
            'offline_duration': format_duration_minutes(pickup_offline),
            'label': 'Pas de GPS live — dernière position = départ enregistré',
        }

    return {
        'online': False,
        'lat': None,
        'lng': None,
        'source': 'unknown',
        'last_seen_at': None,
        'offline_minutes': None,
        'label': 'Position client inconnue',
    }


def driver_tracking_status(driver, now=None):
    """Statut position chauffeur pour admin SOS / carte."""
    if not driver:
        return {
            'online': False,
            'lat': None,
            'lng': None,
            'status': '',
            'last_seen_at': None,
            'offline_minutes': None,
            'label': 'Aucun chauffeur assigné',
        }

    now = now or timezone.now()
    loc_updated = getattr(driver, 'location_updated_at', None) or driver.updated_at
    status_updated = getattr(driver, 'status_updated_at', None) or driver.updated_at
    has_coords = driver.latitude is not None and driver.longitude is not None
    loc_live = _gps_is_live(loc_updated, now) if has_coords else False
    is_offline = driver.status == 'offline'

    if is_offline:
        offline_mins = minutes_since(status_updated, now)
        offline_display = format_duration_minutes(offline_mins)
        return {
            'online': False,
            'lat': driver.latitude,
            'lng': driver.longitude,
            'status': driver.status,
            'last_seen_at': loc_updated if has_coords else status_updated,
            'offline_minutes': offline_mins,
            'offline_duration': offline_display,
            'label': (
                f'Chauffeur hors ligne depuis {offline_display}'
                if offline_display
                else 'Chauffeur hors ligne'
            ),
        }

    if has_coords and loc_live:
        return {
            'online': True,
            'lat': driver.latitude,
            'lng': driver.longitude,
            'status': driver.status,
            'last_seen_at': loc_updated,
            'offline_minutes': 0,
            'label': f'Chauffeur en ligne ({driver.get_status_display()})',
        }

    offline_mins = minutes_since(loc_updated, now) if has_coords else None
    offline_display = format_duration_minutes(offline_mins) if offline_mins is not None else ''
    return {
        'online': False,
        'lat': driver.latitude,
        'lng': driver.longitude,
        'status': driver.status,
        'last_seen_at': loc_updated if has_coords else None,
        'offline_minutes': offline_mins,
        'offline_duration': offline_display,
        'label': (
            f'Position chauffeur figée depuis {offline_display} ({driver.get_status_display()})'
            if offline_display
            else f'Position chauffeur inconnue ({driver.get_status_display()})'
        ),
    }


def order_scheduled_dt(order):
    """Datetime prévu de la course (scheduled_at ou date+time)."""
    if order.scheduled_at:
        return order.scheduled_at
    if order.date and order.time:
        dt = datetime.combine(order.date, order.time)
        if timezone.is_naive(dt):
            dt = timezone.make_aware(dt, timezone.get_current_timezone())
        return dt
    return None


def should_show_client_on_map(order, now=None):
    """
    Afficher la position client sur la carte admin :
    - Course « maintenant » : dès qu'une course active a des coords client.
    - Course programmée : à partir de 30 min avant le départ (et après).
    """
    now = now or timezone.now()
    if order.status not in CLIENT_TRACK_STATUSES:
        return False

    lat, lng = client_map_coords(order)
    if lat is None or lng is None:
        return False

    if not order.is_later:
        return True

    sched = order_scheduled_dt(order)
    if not sched:
        return True

    return (sched - now).total_seconds() <= 30 * 60


def client_map_coords(order):
    """Coords client live (GPS) ou repli sur pickup géolocalisé."""
    lat = order.client_gps_lat
    lng = order.client_gps_lng
    if lat is not None and lng is not None:
        return lat, lng
    if order.pickup_lat is not None and order.pickup_lng is not None:
        pickup_text = (order.pickup or '').lower()
        if not pickup_text or any(x in pickup_text for x in (
            'position actuelle', 'ma position', 'current location', 'my location',
        )) or order.status in CLIENT_TRACK_STATUSES:
            return order.pickup_lat, order.pickup_lng
    return None, None
