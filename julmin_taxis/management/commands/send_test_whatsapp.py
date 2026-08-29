"""Envoie un message WhatsApp test « nouvelle commande » ou lien d'acceptation signé."""
from django.core.management.base import BaseCommand, CommandError

from drivers.models import Driver
from orders.models import Order
from julmin_taxis.whatsapp_service import (
    _accept_url,
    _first_name,
    _graph_send_text,
    _send_nouvelle_commande_template,
)


class Command(BaseCommand):
    help = 'Envoie un test WhatsApp avec lien d\'acceptation signé (template ou texte de secours).'

    def add_arguments(self, parser):
        parser.add_argument(
            '--phone',
            default='+50940615883',
            help='Numéro WhatsApp cible (défaut: +50940615883)',
        )
        parser.add_argument(
            '--order-id',
            type=int,
            help='ID commande (sinon dernière price_confirmed ou dernière commande)',
        )
        parser.add_argument(
            '--text-only',
            action='store_true',
            help='Force l\'envoi texte libre avec le lien signé (sans template Meta)',
        )

    def handle(self, *args, **options):
        phone = (options['phone'] or '').strip()
        if not phone:
            raise CommandError('Numéro requis')

        if options.get('order_id'):
            try:
                order = Order.objects.get(pk=options['order_id'])
            except Order.DoesNotExist:
                raise CommandError(f'Commande #{options["order_id"]} introuvable')
        else:
            order = Order.objects.filter(status='price_confirmed').order_by('-pk').first()
            if not order:
                order = Order.objects.order_by('-pk').first()
            if not order:
                raise CommandError('Aucune commande en base')

        driver = (
            Driver.objects.filter(is_verified=True, is_blocked=False)
            .exclude(phone='')
            .order_by('-pk')
            .first()
        )
        if not driver:
            raise CommandError('Aucun chauffeur vérifié disponible pour signer le lien d\'acceptation')

        name = _first_name(driver.firstname or driver.get_full_name() or 'Chauffeur', 'Test')
        accept_url = _accept_url(order.pk, driver.pk)
        ok = False
        mode = 'texte'

        if not options.get('text_only'):
            ok = _send_nouvelle_commande_template(phone, order, name, driver)
            if ok:
                mode = 'template nouvelle_commande'

        if not ok:
            msg = (
                f'🚖 *DAXI — Test acceptation course #{order.pk}*\n\n'
                f'Bonjour {name},\n\n'
                f'Cliquez pour accepter cette course :\n{accept_url}'
            )
            ok = _graph_send_text(phone, msg)
            mode = 'texte libre (lien signé)'

        if ok:
            self.stdout.write(self.style.SUCCESS(
                f'WhatsApp test ({mode}) -> {phone}\n'
                f'  Commande #{order.pk}, chauffeur #{driver.pk} ({driver.get_full_name()})\n'
                f'  Lien : {accept_url}'
            ))
        else:
            self.stdout.write(self.style.ERROR(
                f'Échec envoi WhatsApp à {phone} — voir les logs serveur (token Meta, credentials)\n'
                f'  Lien attendu : {accept_url}'
            ))
