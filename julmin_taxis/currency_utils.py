"""Affichage unifié des montants en dollars ($) et conversion MonCash/HatexCard."""
from decimal import Decimal, ROUND_HALF_UP


def get_usd_htg_rate():
    """Taux configurable par l'admin (1 USD = N HTG)."""
    from orders.models import SystemConfig
    return Decimal(str(SystemConfig.get().usd_htg_rate))


def usd_to_htg(usd_amount):
    """Convertit un montant USD en HTG entier pour MonCash / HatexCard."""
    rate = get_usd_htg_rate()
    usd = Decimal(str(usd_amount or 0))
    htg = (usd * rate).quantize(Decimal('1'), rounding=ROUND_HALF_UP)
    return max(1, int(htg))


def format_price(value, decimals=2):
    """Formate un montant en dollars ($) pour l'affichage client. Retourne '—' si valeur absente."""
    if value is None or value == '':
        return '—'
    try:
        amount = float(value)
    except (TypeError, ValueError):
        return '—'
    d = int(decimals) if decimals is not None else 2
    if d <= 0:
        return f'${amount:.0f}'
    return f'${amount:.{d}f}'
