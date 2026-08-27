"""
Vérifie que tous les chemins critiques du projet existent après consolidation.
Usage: python manage.py validate_project_paths
"""
import os
import re
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand


                                                             
SERVED_HTML = [
    'vubez2.html',
    'compte.html',
    'driver_home.html',
    'driver_login.html',
    'entreprise.html',
    'entreprise_dashboard.html',
    'test_whatsapp.html',
]

                                                
ROOT_ASSETS = [
    'manifest.json',
    'sw.js',
    'firebase-messaging-sw.js',
    'daxi-frequent-routes-data.js',
    'daxi-frequent-routes-map.js',
    'daxi-haiti-explorer-data.js',
    'daxi-haiti-explorer-map.js',
    'daxi-push-register.js',
    'gps-precision-engine.js',
]

                        
SHARED_ASSETS = [
    'assets/js/tailwindcss-3.4.16.js',
    'assets/js/htmx.min.js',
    'assets/js/aos.js',
    'assets/css/remixicon.min.css',
    'assets/css/aos.css',
]

                                         
DJANGO_STATIC = [
    'static/js/daxi-phone.js',
    'static/js/daxi-offline.js',
    'static/js/daxi-recent-places.js',
    'static/js/daxi-push-register.js',
    'static/js/firebase-shim.js',
    'static/js/api.js',
]

                   
EXPECTED_DIRS = [
    'assets',
    'static',
    'templates',
    'secrets',
    'data',
    'villes',
    'clients/daxi-android',
    'legacy/phpscript',
]


class Command(BaseCommand):
    help = 'Vérifie que tous les chemins critiques existent (post-consolidation)'

    def handle(self, *args, **options):
        base = Path(settings.BASE_DIR)
        errors = []
        warnings = []

        self.stdout.write(f'BASE_DIR = {base}')
        self.stdout.write(f'ORIGINAL_ROOT = {base} (self-contained)\n')

        for d in EXPECTED_DIRS:
            p = base / d
            if p.is_dir():
                self.stdout.write(self.style.SUCCESS(f'  [OK] dir  {d}/'))
            else:
                errors.append(f'Dossier manquant: {d}/')

        for f in SERVED_HTML + ROOT_ASSETS:
            p = base / f
            if p.is_file():
                self.stdout.write(self.style.SUCCESS(f'  [OK] file  {f}'))
            else:
                errors.append(f'Fichier manquant: {f}')

        for f in SHARED_ASSETS + DJANGO_STATIC:
            p = base / f
            if p.is_file():
                self.stdout.write(self.style.SUCCESS(f'  [OK] file  {f}'))
            else:
                warnings.append(f'Asset manquant (fallback transparent PNG possible): {f}')

                     
        fcm = getattr(settings, 'FCM_SERVICE_ACCOUNT_PATH', '')
        fcm_json_env = (getattr(settings, 'FCM_SERVICE_ACCOUNT_JSON', '') or '').strip()
        sa_ok = False
        if fcm_json_env:
            try:
                import json as _json
                data = _json.loads(fcm_json_env)
                if data.get('client_email') and data.get('private_key') and data.get('token_uri'):
                    sa_ok = True
                    self.stdout.write(self.style.SUCCESS(
                        f'  [OK] FCM   FCM_SERVICE_ACCOUNT_JSON ({data.get("project_id", "?")})'
                    ))
                else:
                    errors.append('FCM_SERVICE_ACCOUNT_JSON invalide (clés manquantes)')
            except Exception as exc:
                errors.append(f'FCM_SERVICE_ACCOUNT_JSON non parsable: {exc}')
        elif fcm and Path(fcm).is_file():
            try:
                import json as _json
                data = _json.loads(Path(fcm).read_text(encoding='utf-8'))
                if data.get('client_email') and data.get('private_key') and data.get('token_uri'):
                    sa_ok = True
                    self.stdout.write(self.style.SUCCESS(
                        f'  [OK] FCM   {fcm} ({data.get("project_id", "?")})'
                    ))
                else:
                    errors.append(f'FCM service account JSON incomplet: {fcm}')
            except Exception as exc:
                errors.append(
                    f'FCM service account illisible/corrompu: {fcm} ({exc}). '
                    'Re-télécharge depuis Firebase → Service Accounts.'
                )
        if not sa_ok and not any('FCM' in e for e in errors):
            warnings.append(
                f'FCM service account absent/invalide: {fcm or "(pas de path)"} '
                '(push app fermée désactivées — mets un JSON valide ou FCM_SERVICE_ACCOUNT_JSON)'
            )

        gs = base / 'clients' / 'daxi-capacitor' / 'android' / 'app' / 'google-services.json'
        if gs.is_file():
            try:
                import json as _json
                g = _json.loads(gs.read_text(encoding='utf-8'))
                android_num = str((g.get('project_info') or {}).get('project_number') or '')
                web_num = str((getattr(settings, 'FIREBASE_WEB_CONFIG', {}) or {}).get('messagingSenderId') or '')
                pkg = ''
                clients = (g.get('client') or [])
                if clients:
                    pkg = str(((clients[0].get('client_info') or {}).get('android_client_info') or {}).get('package_name') or '')
                if pkg and pkg != 'com.daxipro.daxi':
                    warnings.append(f'google-services package_name={pkg} (attendu com.daxipro.daxi)')
                elif pkg:
                    self.stdout.write(self.style.SUCCESS(f'  [OK] FCM   google-services package={pkg}'))
                if android_num and web_num and android_num != web_num:
                    warnings.append(
                        f'Firebase project_number mismatch: Android={android_num} '
                        f'vs FIREBASE_WEB_MESSAGING_SENDER_ID={web_num} '
                        '(tokens FCM peuvent échouer — aligne sur le même projet Firebase)'
                    )
                else:
                    self.stdout.write(self.style.SUCCESS(
                        f'  [OK] FCM   google-services project_number={android_num or "?"}'
                    ))
            except Exception as exc:
                warnings.append(f'google-services.json illisible: {exc}')
        else:
            warnings.append('google-services.json absent (clients/daxi-capacitor/android/app/)')

        try:
            from julmin_taxis.wellknown_views import android_fingerprints, assetlinks_body
            fps = android_fingerprints()
            self.stdout.write(self.style.SUCCESS(
                f'  [OK] App Links assetlinks fingerprints ({len(fps)}): ' + ', '.join(fps[:3]) + ('…' if len(fps) > 3 else '')
            ))
            if len(fps) < 2:
                warnings.append('assetlinks: une seule empreinte SHA — ajoute release + debug pour dev et store')
            body = assetlinks_body()
            pkg = str(((body[0] or {}).get('target') or {}).get('package_name') or '')
            if pkg != 'com.daxipro.daxi':
                warnings.append(f'assetlinks package_name={pkg} (attendu com.daxipro.daxi)')
        except Exception as exc:
            warnings.append(f'assetlinks check failed: {exc}')

                                         
        villes = base / 'villes'
        if villes.is_dir() and any(villes.rglob('*')):
            count = sum(1 for _ in villes.rglob('*') if _.is_file())
            self.stdout.write(self.style.SUCCESS(f'  [OK] villes/ ({count} fichiers)'))
        else:
            warnings.append('Dossier villes/ vide ou absent (photos itinéraires fréquents)')

                                                                                     
        bad_patterns = [
            (r'\.\./phpscript', 'Référence parent phpscript'),
            (r'julmin_taxis_django[/\\]static', 'Chemin imbriqué julmin_taxis_django/static'),
            (r'BASE_DIR\.parent', 'BASE_DIR.parent (ancien layout)'),
            (r'dirname\(settings\.BASE_DIR\)', 'ORIGINAL_ROOT parent (ancien layout)'),
        ]
        scan_dirs = ['julmin_taxis', 'scripts', 'clients/daxi-android/scripts']
        scan_ext = {'.py', '.ps1', '.bat', '.sh', '.kt'}
        skip_names = {'validate_project_paths.py', 'verify_paths.py', 'audit_all_paths.py'}
        for sub in scan_dirs:
            root = base / sub
            if not root.is_dir():
                continue
            for fp in root.rglob('*'):
                if fp.name in skip_names or fp.suffix not in scan_ext or 'build' in fp.parts:
                    continue
                try:
                    text = fp.read_text(encoding='utf-8', errors='ignore')
                except Exception:
                    continue
                for pat, label in bad_patterns:
                    if re.search(pat, text):
                        rel = fp.relative_to(base)
                        errors.append(f'{label} dans {rel}')

        self.stdout.write('')
        for w in warnings:
            self.stdout.write(self.style.WARNING(f'  [WARN] {w}'))
        for e in errors:
            self.stdout.write(self.style.ERROR(f'  [ERR]  {e}'))

        if errors:
            self.stdout.write(self.style.ERROR(f'\n{len(errors)} erreur(s) — chemins cassés détectés.'))
            raise SystemExit(1)
        self.stdout.write(self.style.SUCCESS(f'\nValidation OK ({len(warnings)} avertissement(s)).'))
