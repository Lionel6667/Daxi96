"""Envoie une notification FCM de test (app fermée = payload notification + HIGH)."""
from django.contrib.auth import get_user_model
from django.core.management.base import BaseCommand

from notifications.fcm_service import _load_service_account, send_push
from notifications.models import PushDevice


class Command(BaseCommand):
    help = 'Vérifie la config FCM et envoie un push de test (fonctionne app fermée)'

    def add_arguments(self, parser):
        parser.add_argument('--user', default='', help='email ou username du destinataire')
        parser.add_argument('--token', default='', help='token FCM brut (sinon dernier device actif)')
        parser.add_argument('--title', default='DAXI test')
        parser.add_argument('--body', default='Si tu vois ça app fermée, les push sont OK.')
        parser.add_argument('--dry-run', action='store_true')

    def handle(self, *args, **options):
        sa = _load_service_account()
        if not sa:
            self.stderr.write(self.style.ERROR(
                'FCM non configuré: mets FCM_SERVICE_ACCOUNT_JSON (Railway) '
                'ou FCM_SERVICE_ACCOUNT_PATH (fichier local).'
            ))
            return
        self.stdout.write(self.style.SUCCESS(
            f"Service account OK ({sa.get('client_email', '?')}, project={sa.get('project_id', '?')})"
        ))

        token = (options.get('token') or '').strip()
        user_key = (options.get('user') or '').strip()
        if not token and user_key:
            User = get_user_model()
            user = (
                User.objects.filter(email__iexact=user_key).first()
                or User.objects.filter(username__iexact=user_key).first()
            )
            if not user:
                self.stderr.write(self.style.ERROR(f'Utilisateur introuvable: {user_key}'))
                return
            device = (
                PushDevice.objects.filter(user=user, is_active=True)
                .order_by('-updated_at', '-id')
                .first()
            )
            if not device:
                self.stderr.write(self.style.ERROR(
                    f'Aucun PushDevice actif pour {user_key}. Ouvre l’app, accepte les notifs.'
                ))
                return
            token = device.token
            self.stdout.write(f'Device: platform={getattr(device, "platform", "?")} id={device.pk}')

        if not token:
            device = PushDevice.objects.filter(is_active=True).order_by('-updated_at', '-id').first()
            if not device:
                self.stderr.write(self.style.ERROR('Aucun token: --user, --token, ou device en base.'))
                return
            token = device.token
            self.stdout.write(
                f'Device récent: user={getattr(device.user, "username", "?")} id={device.pk}'
            )

        if options['dry_run']:
            self.stdout.write(f'Dry-run OK — token …{token[-12:]}')
            return

        ok, result = send_push(
            token,
            {'title': options['title'], 'body': options['body']},
            data={'type': 'test_push', 'urgent': '1'},
            urgent=True,
            channel='daxi_urgent',
        )
        if ok:
            self.stdout.write(self.style.SUCCESS(f'Push envoyé: {result}'))
        else:
            self.stderr.write(self.style.ERROR(f'Échec: {result}'))
