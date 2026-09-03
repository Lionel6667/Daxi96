"""Présence chauffeur — en ligne si GPS récent ou session active (app/WS)."""
from __future__ import annotations

from django.utils import timezone

ONLINE_GPS_MAX_AGE_SECONDS = 180
ONLINE_SESSION_MAX_AGE_SECONDS = 180


def _gps_age_seconds(driver, now):
    if not driver.location_updated_at:
        return None
    return (now - driver.location_updated_at).total_seconds()


def _seconds_since(dt, now):
    if not dt:
        return None
    return (now - dt).total_seconds()


def format_duration_ago_fr(seconds):
    """Durée relative lisible : 5 min, 2 h 15 min, 3 j."""
    seconds = int(max(0, seconds))
    if seconds < 60:
        return "moins d'une minute"
    mins = seconds // 60
    if mins < 60:
        return f'{mins} min'
    hours = mins // 60
    rem_mins = mins % 60
    if hours < 48:
        if rem_mins:
            return f'{hours} h {rem_mins} min'
        return f'{hours} h'
    days = hours // 24
    return f'{days} jour{"s" if days > 1 else ""}'


def resolve_driver_last_seen_at(driver):
    """Dernière activité connue (GPS, app ouverte, statut actif)."""
    candidates = []
    for attr in ('last_seen_at', 'location_updated_at'):
        dt = getattr(driver, attr, None)
        if dt:
            candidates.append(dt)
    if (
        not candidates
        and driver.status in ('available', 'busy')
        and driver.status_updated_at
    ):
        candidates.append(driver.status_updated_at)
    return max(candidates) if candidates else None


def _is_gps_fresh(driver, now):
    gps_age = _gps_age_seconds(driver, now)
    return gps_age is not None and gps_age <= ONLINE_GPS_MAX_AGE_SECONDS


def _is_ws_live(driver):
    from julmin_taxis.presence import is_driver_online
    return is_driver_online(driver)


def _is_session_live(driver, now):
    """App ouverte ou activité récente avec statut disponible/occupé."""
    db_status = driver.status or 'offline'
    if db_status not in ('available', 'busy'):
        return False
    if _is_ws_live(driver):
        return True
    last_seen = resolve_driver_last_seen_at(driver)
    if not last_seen:
        return False
    age = _seconds_since(last_seen, now)
    return age is not None and age <= ONLINE_SESSION_MAX_AGE_SECONDS


def touch_driver_last_seen(driver, now=None, *, save=False):
    """Marque le chauffeur comme actif (app ouverte, WS, statut en ligne)."""
    now = now or timezone.now()
    driver.last_seen_at = now
    if save:
        driver.save(update_fields=['last_seen_at'])
    return now


def touch_driver_location_seen(driver, now=None, *, save=False):
    """Marque une position GPS reçue (signal le plus fiable de présence)."""
    now = now or timezone.now()
    driver.location_updated_at = now
    driver.last_seen_at = now
    if save:
        driver.save(update_fields=['location_updated_at', 'last_seen_at'])
    return now


def offline_presence_label(driver, now=None):
    """Libellé admin quand le chauffeur n'est pas en ligne."""
    now = now or timezone.now()
    last_seen = resolve_driver_last_seen_at(driver)
    if not last_seen:
        return 'Jamais connecté'
    ago_secs = int((now - last_seen).total_seconds())
    return f'Était en ligne il y a {format_duration_ago_fr(ago_secs)}'


def get_driver_presence(driver, now=None):
    """
    Retourne la présence réelle du chauffeur.
    En ligne = GPS récent OU (statut actif + app/WS/activité récente).
    """
    now = now or timezone.now()
    db_status = driver.status or 'offline'
    gps_age = _gps_age_seconds(driver, now)
    gps_fresh = _is_gps_fresh(driver, now)
    last_seen = resolve_driver_last_seen_at(driver)

    if db_status == 'offline':
        is_online = False
    else:
        is_online = gps_fresh or _is_session_live(driver, now)

    if is_online:
        if db_status == 'busy':
            presence_status = 'busy'
            availability = 'busy'
        else:
            presence_status = 'available'
            availability = 'available'

        if gps_fresh:
            since = format_duration_ago_fr(int(gps_age))
            if db_status == 'busy':
                status_label = f'Occupé — connecté ({since})'
            else:
                status_label = f'Connecté — disponible ({since})'
        else:
            seen_age = _seconds_since(last_seen, now) or 0
            since = format_duration_ago_fr(int(seen_age))
            if db_status == 'busy':
                status_label = f'Occupé — GPS inactif (vu il y a {since})'
            else:
                status_label = f'En ligne — GPS en attente (vu il y a {since})'
    else:
        status_label = offline_presence_label(driver, now)
        presence_status = 'offline'
        availability = 'offline'

    return {
        'is_online': is_online,
        'presence_status': presence_status,
        'availability': availability,
        'status_label': status_label,
        'last_seen_at': last_seen,
        'gps_age_seconds': int(gps_age) if gps_age is not None else None,
    }


ACTIVE_ORDER_STATUSES = (
    'driver_assigned',
    'on_way',
    'arrived',
    'in_progress',
    'waiting_return',
)


def driver_has_active_order(driver):
    from julmin_taxis.models import Order
    return Order.objects.filter(driver_id=driver.pk, status__in=ACTIVE_ORDER_STATUSES).exists()


def sync_driver_status_from_orders(driver):
    """Disponible/occupé selon les courses actives. Ne force pas un hors-ligne en ligne."""
    now = timezone.now()
    if driver_has_active_order(driver):
        new_status = 'busy'
    elif (driver.status or 'offline') == 'offline':
        new_status = 'offline'
    else:
        new_status = 'available'

    fields = []
    if driver.status != new_status:
        driver.status = new_status
        driver.status_updated_at = now
        fields.extend(['status', 'status_updated_at'])
    touch_driver_last_seen(driver, now)
    fields.append('last_seen_at')
    driver.save(update_fields=list(dict.fromkeys(fields)))
    return new_status


def open_driver_online_status(driver):
    """Ouvre la session chauffeur (app boot) : disponible, ou occupé si course active."""
    now = timezone.now()
    new_status = 'busy' if driver_has_active_order(driver) else 'available'
    driver.status = new_status
    driver.status_updated_at = now
    touch_driver_last_seen(driver, now)
    driver.save(update_fields=['status', 'status_updated_at', 'last_seen_at'])
    return new_status
