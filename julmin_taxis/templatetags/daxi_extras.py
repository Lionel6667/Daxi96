from datetime import timedelta

from django import template
from django.utils import timezone

register = template.Library()

_FRENCH_MONTHS = (
    '', 'janvier', 'février', 'mars', 'avril', 'mai', 'juin',
    'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre',
)


@register.filter
def daxi_coord(value):
    """Coordonnée GPS pour data-attributes HTML — point décimal, jamais virgule locale."""
    if value is None or value == '':
        return ''
    try:
        return str(float(value))
    except (TypeError, ValueError):
        return ''


@register.filter
def daxi_price(value):
    if value is None or value == '':
        return '—'
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return str(value)
    if amount == int(amount):
        return f'${int(amount)}'
    return f'${amount:,.2f}'.replace(',', '\u00a0')


@register.filter
def daxi_time(value):
    """Heure locale Haïti (America/Port-au-Prince) — format H:i partout."""
    if not value:
        return ''
    if timezone.is_aware(value):
        value = timezone.localtime(value)
    return value.strftime('%H:%M')


@register.filter
def daxi_date_key(value):
    """Clé jour locale (Y-m-d) pour regrouper les messages chat."""
    if not value:
        return ''
    if timezone.is_aware(value):
        value = timezone.localtime(value)
    return value.strftime('%Y-%m-%d')


@register.filter
def daxi_chat_day(value):
    """Libellé de jour pour séparateurs chat — Aujourd'hui, Hier, ou date."""
    if not value:
        return ''
    if timezone.is_aware(value):
        value = timezone.localtime(value)
    d = value.date() if hasattr(value, 'date') else value
    today = timezone.localtime(timezone.now()).date()
    if d == today:
        return "Aujourd'hui"
    if d == today - timedelta(days=1):
        return 'Hier'
    label = f'{d.day} {_FRENCH_MONTHS[d.month]}'
    if d.year != today.year:
        label += f' {d.year}'
    return label


@register.filter
def daxi_wait_duration(minutes):
    """Durée d'attente aller-retour — ex. 90 → « 1h30 », 60 → « 1 heure »."""
    if minutes is None or minutes == '':
        return ''
    try:
        m = int(minutes)
    except (TypeError, ValueError):
        return ''
    if m <= 0:
        return ''
    if m == 60:
        return '1 heure'
    if m == 120:
        return '2 heures'
    h, rem = divmod(m, 60)
    if h and rem:
        return f'{h}h{rem:02d}'
    if h:
        return f'{h} heures' if h > 1 else '1 heure'
    return f'{m} minutes'


@register.filter
def daxi_audio_dur(sec):
    """Durée audio M:SS."""
    if not sec:
        return ''
    try:
        sec = max(0, int(sec))
    except (TypeError, ValueError):
        return ''
    return f'{sec // 60}:{sec % 60:02d}'


@register.filter
def daxi_chat_preview(msg):
    """Aperçu court d'un message (texte, photo, vocal)."""
    if not msg:
        return 'Message'
    content = (getattr(msg, 'content', None) or '').strip()
    if content:
        return content[:80]
    if getattr(msg, 'image_url', None) or getattr(msg, 'message_type', '') == 'image':
        return 'Photo'
    if getattr(msg, 'audio_url', None) or getattr(msg, 'message_type', '') == 'audio':
        dur = getattr(msg, 'audio_duration_sec', None)
        if dur and int(dur) > 0:
            sec = int(dur)
            return f'Message vocal ({sec // 60}:{sec % 60:02d})'
        return 'Message vocal'
    return 'Message'
