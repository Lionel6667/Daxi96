"""Vérifie l'envoi de tous les templates WhatsApp Meta (actifs + en examen)."""
import time

from django.core.management.base import BaseCommand

from julmin_taxis.whatsapp_meta_catalog import META_NOT_CREATED, META_TEMPLATES


class Command(BaseCommand):
    help = 'Teste chaque template Meta configuré dans le code Daxi'

    def add_arguments(self, parser):
        parser.add_argument('--phone', default='50940615883', help='Numéro WhatsApp de test')
        parser.add_argument('--delay', type=float, default=2.0, help='Pause entre envois (sec)')
        parser.add_argument('--dry-run', action='store_true', help='Affiche sans envoyer')
        parser.add_argument('--only', default='', help='Filtre sur le nom du template')

    def handle(self, *args, **options):
        phone = options['phone']
        delay = max(1.0, float(options['delay'] or 2))
        dry = options['dry_run']
        only = (options.get('only') or '').strip().lower()

        from julmin_taxis.whatsapp_service import send_template

        samples = {
            'nouvelle_commande': [
                'Jean Baptiste', 'Cap-Haïtien', 'Labadee', '$15.00', '2.3 km',
            ],
            'otp_whatsapp': [
                'Raymond',
                'Votre code de vérification Daxi est : 847291. Ne le partagez avec personne.',
            ],
            'demande_paiment': ['Chauffeur', 'Jean Baptiste', 'MonCash', phone, '50.00'],
            'commande_entreprise': ['Entreprise Test', '8.50', '220.00'],
            'course_terminer_chauffeur': ['Jean Baptiste', '12.50', '145.00'],
            'chauffeur_valide': ['Jean Baptiste'],
            'sos_client': ['Raymond'],
            'chauffeur_en_route': ['Raymond', 'Jean Baptiste', '5'],
            'welcome_client': ['Raymond'],
            'course_terminee': ['Raymond', 'Cap-Haïtien', 'Labadee'],
            'chauffeur_arrive': [
                'Raymond', 'Cap-Haïtien', 'Labadee', 'Jean Baptiste', 'Toyota Corolla',
            ],
            'prix_propose': ['Raymond', 'Cap-Haïtien', 'Labadee', '$15.00'],
            'chauffeur_assigne': [
                'Raymond', 'Jean Baptiste', 'Toyota Corolla', 'Cap-Haïtien', 'Labadee', '$15.00',
            ],
            'pause_course': ['Raymond', '2.50'],
            'rappel_course': ['Raymond', 'Cap-Haïtien', 'Labadee', '25/07/2026 08:00'],
            'recu_course': [
                'Raymond', '$15.00', '#1234',
            ],
            'sos_admin': [
                '#1234', 'CLIENT', 'Raymond', 'Jean Baptiste', 'Cap-Haïtien', 'Labadee',
            ],
            'nouvelle_commande_admin': [
                '#1234', 'Raymond', 'Cap-Haïtien', 'Labadee', '$15.00',
            ],
            'objet_oublie_admin': [
                '#1234', 'Raymond', 'Jean Baptiste', 'Téléphone oublié',
            ],
            'entreprise_en_attente': [
                'Hotel Labadee', phone, 'contact@hotel.com', 'Code partagé',
            ],
            'entreprise_emplacement': [
                'Hotel Labadee', 'Besoin aide pour configurer le point de départ',
            ],
            'chauffeur_a_valider': [
                'Jean Baptiste', 'Toyota Corolla', phone, 'Cap-Haïtien',
            ],
            'commande_attente_coords': [
                'Marc', '#30', 'Jean', 'Limonade', 'Cap-Haitien',
            ],
        }

        items = list(META_TEMPLATES.items())
        if only:
            items = [(k, v) for k, v in items if only in k or only in v['name']]

        ok_count = 0
        self.stdout.write(self.style.MIGRATE_HEADING(f'\n=== Templates configurés ({len(items)}) ==='))
        for key, meta in items:
            tpl = meta['name']
            params = samples.get(key, ['Test'] * meta['params'])
            header = meta.get('header_params')
            status = meta.get('status', 'active')
            label = ', '.join(meta['labels'])
            tag = '[ACTIF]' if status == 'active' else '[EXAMEN]'
            if dry:
                self.stdout.write(f'  {tag} {tpl} ({len(params)} vars) -> {label}')
                continue
            kwargs = {'header_params': header} if header else {}
            ok = send_template(phone, tpl, params, lang_fallback=False, **kwargs)
            st = self.style.SUCCESS('OK') if ok else self.style.ERROR('ÉCHEC (examen Meta ou params)')
            self.stdout.write(f'  {tag} {tpl}: {st}  [{label}]')
            if ok:
                ok_count += 1
            time.sleep(delay)

        if META_NOT_CREATED:
            self.stdout.write(self.style.WARNING('\n=== Pas encore créés sur Meta ==='))
            for s in META_NOT_CREATED:
                self.stdout.write(f'  - {s} (texte libre)')

        if not dry:
            self.stdout.write(self.style.SUCCESS(
                f'\nRésultat : {ok_count}/{len(items)} envoyés à {phone}'
            ))
