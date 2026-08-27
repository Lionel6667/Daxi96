"""Liste les modèles WhatsApp approuvés sur le compte Meta."""
import json
import re
import urllib.error
import urllib.request

from django.conf import settings
from django.core.management.base import BaseCommand


class Command(BaseCommand):
    help = 'Affiche les message templates WhatsApp du WABA configuré'

    def handle(self, *args, **options):
        token = (getattr(settings, 'WHATSAPP_ACCESS_TOKEN', '') or '').strip()
        waba_id = (getattr(settings, 'WHATSAPP_WABA_ID', '') or '').strip()
        phone_id = (getattr(settings, 'WHATSAPP_PHONE_NUMBER_ID', '') or '').strip()
        if not token:
            self.stderr.write('WHATSAPP_ACCESS_TOKEN manquant dans .env')
            return

        base = 'https://graph.facebook.com/v25.0'

        def get(url):
            req = urllib.request.Request(url, headers={'Authorization': f'Bearer {token}'})
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    return json.loads(resp.read().decode())
            except urllib.error.HTTPError as exc:
                self.stderr.write(f'HTTP {exc.code}: {exc.read().decode()[:600]}')
                return None

        wabas = []
        if waba_id:
            wabas.append({'id': waba_id, 'name': 'WHATSAPP_WABA_ID (.env)'})

        waba_r = get(f'{base}/me/whatsapp_business_accounts?fields=id,name') or {}
        wabas += waba_r.get('data', [])

        if not wabas:
            me = get(f'{base}/me/businesses?fields=id,name') or {}
            for biz in me.get('data', []):
                w2 = get(f'{base}/{biz["id"]}/owned_whatsapp_business_accounts?fields=id,name') or {}
                wabas += w2.get('data', [])

        if not wabas:
            self.stderr.write(
                'WHATSAPP_WABA_ID introuvable — ajoutez-le dans .env ou liez le System User au WABA.\n'
                'Modèles : https://business.facebook.com/wa/manage/message-templates/'
            )
            return

        seen = set()
        for waba in wabas:
            wid = waba.get('id')
            if not wid or wid in seen:
                continue
            seen.add(wid)
            self.stdout.write(self.style.MIGRATE_HEADING(f'\nWABA {waba.get("name", "?")} ({wid})'))

            data = get(
                f'{base}/{wid}/message_templates'
                f'?limit=100&fields=name,status,category,language,components'
            )
            if not data:
                continue

            for tpl in data.get('data', []):
                parts = []
                for comp in tpl.get('components', []):
                    ctype = comp.get('type', '')
                    text = comp.get('text', '') or ''
                    nvars = len(re.findall(r'\{\{\d+\}\}', text))
                    if ctype == 'HEADER' and comp.get('format') == 'TEXT':
                        parts.append(f'HEADER({nvars}): {text[:80]}')
                    elif ctype == 'BODY':
                        parts.append(f'BODY({nvars}): {text[:120]}')
                    elif ctype == 'FOOTER':
                        parts.append(f'FOOTER: {text[:60]}')
                detail = ' | '.join(parts) if parts else '(sans texte)'
                self.stdout.write(
                    f"  {tpl.get('name')} | {tpl.get('status')} | lang={tpl.get('language')} | {detail}"
                )

        self.stdout.write(
            '\nRéglage langue : WHATSAPP_TEMPLATE_LANG dans .env doit correspondre à lang= ci-dessus.'
        )
