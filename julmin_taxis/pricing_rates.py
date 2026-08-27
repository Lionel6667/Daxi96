"""Lecture centralisée des tarifs pause / attente."""
from decimal import Decimal


def get_pause_rate_per_5min():
    """Tarif pause chauffeur ($/5 min) — PricingConfig puis repli SystemConfig."""
    try:
        from pricing.models import PricingConfig
        cfg = PricingConfig.get_active()
        if cfg.pause_price_per_5min is not None:
            return cfg.pause_price_per_5min
    except Exception:
        pass
    from orders.models import SystemConfig
    return SystemConfig.get().wait_rate_per_5min


def sync_system_pause_rate(rate=None):
    """Aligne SystemConfig sur PricingConfig (compat. code existant)."""
    from orders.models import SystemConfig
    if rate is None:
        rate = get_pause_rate_per_5min()
    obj = SystemConfig.get()
    obj.wait_rate_per_5min = Decimal(str(rate))
    obj.save(update_fields=['wait_rate_per_5min'])
