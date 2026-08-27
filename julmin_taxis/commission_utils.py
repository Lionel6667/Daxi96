"""Commission chauffeur — taux global depuis la tarification."""
from decimal import Decimal


def get_default_driver_commission_rate():
    from pricing.models import PricingConfig
    config = PricingConfig.get_active()
    return config.default_driver_commission_rate or Decimal('80.00')


def commission_admin_deduction(rate):
    return round(100 - float(rate or 0), 2)
