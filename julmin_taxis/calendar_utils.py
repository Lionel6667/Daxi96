"""Calendrier — rattachement des commandes à un jour (date, programmé, création)."""
from __future__ import annotations

from datetime import date, datetime, time as dt_time, timedelta

from django.db.models import Q
from django.utils import timezone

FRENCH_MONTH_NAMES = [
    '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
]


def _as_local_date(dt):
    if dt is None:
        return None
    if timezone.is_aware(dt):
        return timezone.localtime(dt).date()
    return dt.date()


def resolve_order_calendar_date(order):
    """Jour d'affichage d'une commande sur le calendrier."""
    date_val = getattr(order, 'date', None)
    if date_val is None and isinstance(order, dict):
        date_val = order.get('date')
    if date_val:
        return date_val

    scheduled = getattr(order, 'scheduled_at', None)
    if scheduled is None and isinstance(order, dict):
        scheduled = order.get('scheduled_at')
    sched_day = _as_local_date(scheduled)
    if sched_day:
        return sched_day

    created = getattr(order, 'created_at', None)
    if created is None and isinstance(order, dict):
        created = order.get('created_at')
    return _as_local_date(created)


def calendar_month_bounds(year, month):
    month_start = date(year, month, 1)
    if month == 12:
        month_end = date(year + 1, 1, 1)
    else:
        month_end = date(year, month + 1, 1)
    tz = timezone.get_current_timezone()
    start_aware = timezone.make_aware(datetime.combine(month_start, dt_time.min), tz)
    end_aware = timezone.make_aware(datetime.combine(month_end, dt_time.min), tz)
    return month_start, month_end, start_aware, end_aware


def calendar_month_order_qs(qs, year, month):
    month_start, month_end, start_aware, end_aware = calendar_month_bounds(year, month)
    return qs.filter(
        Q(date__gte=month_start, date__lt=month_end)
        | Q(created_at__gte=start_aware, created_at__lt=end_aware)
        | Q(scheduled_at__gte=start_aware, scheduled_at__lt=end_aware)
    )


def calendar_day_bounds(selected_date):
    tz = timezone.get_current_timezone()
    day_start = timezone.make_aware(datetime.combine(selected_date, dt_time.min), tz)
    return day_start, day_start + timedelta(days=1)


def calendar_day_order_qs(qs, selected_date):
    day_start, day_end = calendar_day_bounds(selected_date)
    return qs.filter(
        Q(date=selected_date)
        | Q(created_at__gte=day_start, created_at__lt=day_end)
        | Q(scheduled_at__gte=day_start, scheduled_at__lt=day_end)
    )


ACTIVE_CALENDAR_STATUSES = frozenset({
    'pending', 'price_proposed', 'price_confirmed',
    'driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return',
})


def orders_on_calendar_day(qs, selected_date):
    """Commandes du jour + courses encore actives si on consulte aujourd'hui."""
    candidates = list(calendar_day_order_qs(qs, selected_date))
    matched = {}
    for o in candidates:
        if resolve_order_calendar_date(o) == selected_date:
            matched[o.pk] = o

    today = timezone.localdate()
    if selected_date == today:
        for o in qs.filter(status__in=ACTIVE_CALENDAR_STATUSES):
            matched[o.pk] = o

    return list(matched.values())


def build_calendar_day_data(orders, year, month):
    day_data = {}
    for o in orders:
        d = resolve_order_calendar_date(o)
        if not d or d.year != year or d.month != month:
            continue
        key = d.day
        status = o.status if hasattr(o, 'status') else o.get('status')
        if key not in day_data:
            day_data[key] = {
                'total': 0, 'pending': 0, 'completed': 0,
                'ongoing': 0, 'cancelled': 0,
            }
        day_data[key]['total'] += 1
        if status in ('pending', 'price_proposed', 'price_confirmed'):
            day_data[key]['pending'] += 1
        elif status == 'completed':
            day_data[key]['completed'] += 1
        elif status == 'cancelled':
            day_data[key]['cancelled'] += 1
        elif status in ('driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return'):
            day_data[key]['ongoing'] += 1
    return day_data


def format_calendar_date_fr(d):
    if not d:
        return ''
    return f'{d.day} {FRENCH_MONTH_NAMES[d.month]} {d.year}'
