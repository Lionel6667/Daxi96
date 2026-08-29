"""Envoie un message WhatsApp test avec lien d'acceptation signe."""
from django.core.management.base import BaseCommand, CommandError

from drivers.models import Driver
from orders.models import Order
from julmin_taxis.whatsapp_service import (
    _accept_url,
    _first_name,
    _graph_send_text,
    _send_nouvelle_commande_template,
    send_template,
    template_name,
)


class Command(BaseCommand):
    help = 'Test WhatsApp acceptation: template nouvelle_commande, sinon OTP avec lien signe.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--phone',
            default='+50940615883',
            help='Numero WhatsApp cible (defaut: +50940615883)',
        )
        parser.add_argument(
            '--order-id',
            type=int,
            help='ID commande (sinon derniere price_confirmed ou derniere commande)',
        )

    def handle(self, *args, **options):
        phone = (options['phone'] or '').strip()
        if not phone:
            raise CommandError('Numero requis')

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
            raise CommandError('Aucun chauffeur verifie disponible pour signer le lien')

        name = _first_name(driver.firstname or driver.get_full_name() or 'Chauffeur', 'Test')
        accept_url = _accept_url(order.pk, driver.pk)
        ok = False
        mode = ''

        ok = _send_nouvelle_commande_template(phone, order, name, driver)
        if ok:
            mode = 'template nouvelle_commande (bouton accept)'

        if not ok:
            info = (
                f'Test acceptation course #{order.pk}. '
                f'Cliquez pour accepter : {accept_url}'
            )
            ok = send_template(
                phone,
                template_name('otp_whatsapp'),
                [name, info],
                lang_fallback=True,
            )
            if ok:
                mode = 'template OTP (lien signe dans le message)'

        if not ok:
            msg = (
                f'DAXI test acceptation course #{order.pk}\n\n'
                f'Lien : {accept_url}'
            )
            ok = _graph_send_text(phone, msg)
            if ok:
                mode = 'texte libre (fenetre 24h requise)'

        if ok:
            self.stdout.write(self.style.SUCCESS(
                f'WhatsApp test ({mode}) -> {phone}\n'
                f'  Commande #{order.pk}, chauffeur #{driver.pk} ({driver.get_full_name()})\n'
                f'  Lien : {accept_url}'
            ))
        else:
            self.stdout.write(self.style.ERROR(
                f'Echec envoi WhatsApp a {phone}\n'
                f'  Lien attendu : {accept_url}'
            ))
