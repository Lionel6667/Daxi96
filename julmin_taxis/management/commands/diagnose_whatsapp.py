"""Diagnostic WhatsApp — templates Meta, compte, livraisons webhook."""
import json
import re
import urllib.error
import urllib.request

from django.conf import settings
from django.core.management.base import BaseCommand

from julmin_taxis.whatsapp_delivery import format_delivery_error, recent_delivery_log
from julmin_taxis.whatsapp_meta_catalog import META_NOT_CREATED, META_TEMPLATES


class Command(BaseCommand):
    help = 'Diagnostique la config WhatsApp Daxi (templates, compte, livraisons)'

    def add_arguments(self, parser):
        parser.add_argument('--phone', default='', help='Numéro à vérifier (optionnel)')

    def handle(self, *args, **options):
        token = (getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '') or '').strip()
        phone_id = (getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '') or '').strip()
        waba_id = (getattr(settings, 'WHATSAPP_WABA_ID', '') or '').strip()
        site_url = (getattr(settings, 'SITE_URL', '') or '').strip().rstrip('/')

        if not token or not phone_id:
            self.stderr.write(self.style.ERROR('WHATSAPP_ACCESS_TOKEN ou WHATSAPP_PHONE_NUMBER_ID manquant'))
            return

        base = 'https://graph.facebook.com/v25.0'

        def get(url):
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    return resp.status, json.loads(resp.read().decode())
            except urllib.error.HTTPError as exc:
                return exc.code, json.loads(exc.read().decode() or '{}')

        if not waba_id:
            code, waba_probe = get(f'{base}/{phone_id}?fields=whatsapp_business_account')
            if code == 200:
                waba_obj = waba_probe.get('whatsapp_business_account') or {}
                waba_id = (waba_obj.get('id') or '').strip()
                if waba_id:
                    self.stdout.write(self.style.WARNING(
                        f'  WHATSAPP_WABA_ID manquant dans .env — détecté automatiquement : {waba_id}'
                    ))

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== Compte expéditeur ==='))
        code, data = get(
            f'{base}/{phone_id}'
            f'?fields=display_phone_number,verified_name,quality_rating,'
            f'messaging_limit_tier,status,name_status,new_name_status,platform_type,'
            f'account_mode,code_verification_status,is_pin_enabled'
        )
        if code == 200:
            self.stdout.write(f"  Numero : {data.get('display_phone_number', '?')}")
            self.stdout.write(f"  Nom    : {data.get('verified_name', '?')}")
            self.stdout.write(f"  Statut : {data.get('status', '?')} | Qualite : {data.get('quality_rating', '?')}")
            self.stdout.write(f"  Limite : {data.get('messaging_limit_tier', '?')} | Mode : {data.get('account_mode', '?')}")
            self.stdout.write(f"  Nom affiche : {data.get('name_status', '?')}")
            verify = data.get('code_verification_status', '?')
            self.stdout.write(f"  Verification code : {verify}")
            self.stdout.write(f"  PIN 2FA actif : {data.get('is_pin_enabled', '?')}")

            if verify == 'EXPIRED':
                self.stdout.write(self.style.ERROR(
                    '\n  BLOCAGE CRITIQUE : code_verification_status = EXPIRED\n'
                    '  Meta accepte les requetes API (accepted) mais ne livre pas les messages.\n'
                    '  Solution : re-verifier le numero dans WhatsApp Manager puis re-enregistrer via API.'
                ))
            if data.get('status') != 'CONNECTED':
                self.stdout.write(self.style.ERROR('  Le numero n est pas CONNECTED — messages bloques.'))
        else:
            self.stderr.write(self.style.ERROR(f'  Erreur phone_id HTTP {code}: {data}'))

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== Webhook attendu ==='))
        webhook_url = f'{site_url}/webhook/' if site_url else '(SITE_URL non défini)'
        self.stdout.write(f'  URL : {webhook_url}')
        self.stdout.write('  Meta > App > Webhooks > champs : messages (obligatoire pour statuts failed/delivered)')

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== Templates dans le code vs Meta ==='))
        meta_by_name = {}
        if waba_id:
            code, tpl_data = get(
                f'{base}/{waba_id}/message_templates'
                f'?limit=100&fields=name,status,category,language'
            )
            if code == 200:
                for tpl in tpl_data.get('data', []):
                    if tpl.get('language') == 'fr':
                        meta_by_name[tpl['name']] = tpl
            else:
                self.stderr.write(self.style.WARNING(f'  WABA {waba_id} HTTP {code} — ajoutez WHATSAPP_WABA_ID dans .env'))
        else:
            self.stderr.write(self.style.WARNING('  WHATSAPP_WABA_ID absent — impossible de lister les templates Meta'))

        for key, meta in META_TEMPLATES.items():
            tpl_name = meta['name']
            local_status = meta.get('status', 'active')
            remote = meta_by_name.get(tpl_name)
            if remote:
                remote_status = remote.get('status', '?')
                category = remote.get('category', '?')
                ok = remote_status == 'APPROVED'
                tag = self.style.SUCCESS('OK Meta') if ok else self.style.WARNING(f'Meta={remote_status}')
                self.stdout.write(f'  [{local_status}] {tpl_name}: {tag} ({category})')
            elif local_status == 'active':
                self.stdout.write(self.style.ERROR(f'  [active] {tpl_name}: ABSENT sur Meta (fr)'))
            else:
                self.stdout.write(f'  [pending] {tpl_name}: pas encore sur Meta')

        if META_NOT_CREATED:
            self.stdout.write(self.style.WARNING('\n=== Jamais créés sur Meta (texte libre = bloqué sans opt-in) ==='))
            for s in META_NOT_CREATED:
                self.stdout.write(f'  - {s}')

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== Dernières livraisons (webhook) ==='))
        log = recent_delivery_log(15)
        if not log:
            self.stdout.write(self.style.WARNING(
                '  Aucun statut reçu — le webhook ne remonte probablement pas à Django.\n'
                '  Vérifiez ngrok + URL callback Meta + abonnement au champ messages.'
            ))
        else:
            for row in log:
                errs = row.get('errors') or []
                err_txt = '; '.join(format_delivery_error(e) for e in errs) if errs else ''
                line = f"  {row.get('status')} -> {row.get('recipient')} wamid={row.get('wamid', '')[:24]}"
                if err_txt:
                    line += f' | {err_txt}'
                if row.get('status') == 'failed':
                    self.stdout.write(self.style.ERROR(line))
                elif row.get('status') in ('delivered', 'read', 'sent'):
                    self.stdout.write(self.style.SUCCESS(line))
                else:
                    self.stdout.write(line)

        phone = (options.get('phone') or '').strip()
        if phone:
            from julmin_taxis.whatsapp_service import _normalize_phone
            norm = _normalize_phone(phone)
            self.stdout.write(self.style.MIGRATE_HEADING(f'\n=== Numéro test {norm} ==='))
            self.stdout.write('  Si API renvoie accepted mais 0 message reçu, consultez les erreurs failed ci-dessus.')
            self.stdout.write('  Les templates pending/absents ne partent jamais (repli texte = fenêtre 24h requise).')

        self.stdout.write(self.style.MIGRATE_HEADING('\n=== Actions requises ==='))
        if code == 200 and data.get('code_verification_status') == 'EXPIRED':
            self.stdout.write(self.style.ERROR(
                '  PRIORITE 1 : Re-verifier + re-enregistrer le numero +50955969696 dans Meta\n'
                '    WhatsApp Manager > Numero > Verifier a nouveau\n'
                '    Puis API POST /{phone_id}/register avec pin 6 chiffres (max 10 essais / 72h)'
            ))
        self.stdout.write('  2. Moyen de paiement actif dans Meta Business (facturation WhatsApp)')
        self.stdout.write('  3. Webhook messages : ' + (webhook_url or 'SITE_URL'))
        self.stdout.write('  4. Recategoriser templates transactionnels en UTILITAIRE (pas Marketing)')
        self.stdout.write('  5. WHATSAPP_WABA_ID dans .env')
