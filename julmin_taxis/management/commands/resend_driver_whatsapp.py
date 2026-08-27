"""Renvoyer la notification WhatsApp « nouvelle commande » aux chauffeurs."""
from django.core.cache import cache
from django.core.management.base import BaseCommand, CommandError

from orders.models import Order
from julmin_taxis.htmx_views import _advance_to_driver_notified, _order_payment_confirmed


class Command(BaseCommand):
    help = 'Renvoie WhatsApp nouvelle_commande aux chauffeurs (après renouvellement du token Meta)'

    def add_arguments(self, parser):
        parser.add_argument('order_ids', nargs='+', type=int, help='ID(s) de commande')
        parser.add_argument('--force', action='store_true', help='Ignore le cache anti-doublon')

    def handle(self, *args, **options):
        for order_id in options['order_ids']:
            try:
                order = Order.objects.get(pk=order_id)
            except Order.DoesNotExist:
                raise CommandError(f'Commande #{order_id} introuvable')

            if options['force']:
                cache.delete(f'daxi_drivers_notified:{order_id}')

            if not _order_payment_confirmed(order):
                self.stdout.write(self.style.WARNING(
                    f'#{order_id}: paiement non confirmé ({order.payment_status}) — notification ignorée'
                ))
                continue

            if order.status != 'price_confirmed':
                self.stdout.write(self.style.WARNING(
                    f'#{order_id}: status={order.status} (attendu price_confirmed)'
                ))

            _advance_to_driver_notified(order)
            self.stdout.write(self.style.SUCCESS(f'#{order_id}: tentative d\'envoi effectuée — voir les logs serveur'))
