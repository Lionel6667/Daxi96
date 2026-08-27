#!/usr/bin/env python3
"""Standalone path verifier — run: python scripts/verify_paths.py"""
import os
import re
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'julmin_taxis.settings')

import django  
django.setup()

from django.conf import settings  

SERVED_HTML = [
    'vubez2.html', 'compte.html', 'driver_home.html', 'driver_login.html',
    'entreprise.html', 'entreprise_dashboard.html', 'test_whatsapp.html',
]
ROOT_ASSETS = [
    'manifest.json', 'sw.js', 'firebase-messaging-sw.js',
    'daxi-frequent-routes-data.js', 'daxi-frequent-routes-map.js',
    'daxi-haiti-explorer-data.js', 'daxi-haiti-explorer-map.js',
    'daxi-push-register.js', 'gps-precision-engine.js',
]
SHARED = [
    'assets/js/tailwindcss-3.4.16.js', 'assets/js/htmx.min.js',
    'assets/css/remixicon.min.css',
]
STATIC_JS = [
    'static/js/daxi-phone.js', 'static/js/daxi-offline.js',
    'static/js/firebase-shim.js', 'static/js/api.js',
]
BAD_PATTERNS = [
    (r'\.\./phpscript', 'parent phpscript ref'),
    (r'julmin_taxis_django[/\\]static', 'nested julmin_taxis_django/static'),
    (r'BASE_DIR\.parent', 'BASE_DIR.parent'),
    (r'dirname\(settings\.BASE_DIR\)', 'ORIGINAL_ROOT parent'),
]


def main():
    base = Path(settings.BASE_DIR)
    errors, warnings = [], []

    print(f'BASE_DIR = {base}\n')

    for f in SERVED_HTML + ROOT_ASSETS + SHARED + STATIC_JS:
        p = base / f
        if p.is_file():
            print(f'  OK  {f}')
        elif f in SHARED + STATIC_JS:
            warnings.append(f'Missing (optional): {f}')
        else:
            errors.append(f'Missing: {f}')

    fcm = getattr(settings, 'FCM_SERVICE_ACCOUNT_PATH', '')
    if fcm and Path(fcm).is_file():
        print(f'  OK  FCM {fcm}')
    else:
        warnings.append(f'FCM absent: {fcm}')

    villes = base / 'villes'
    if villes.is_dir() and any(villes.rglob('*')):
        n = sum(1 for x in villes.rglob('*') if x.is_file())
        print(f'  OK  villes/ ({n} files)')
    else:
        warnings.append('villes/ empty (route photos)')

    skip_names = {'validate_project_paths.py', 'verify_paths.py', 'audit_all_paths.py'}
    for sub in ['julmin_taxis', 'scripts', 'clients/daxi-android/scripts']:
        root = base / sub
        if not root.is_dir():
            continue
        for fp in root.rglob('*'):
            if fp.name in skip_names or fp.suffix not in {'.py', '.ps1', '.kt'} or 'build' in fp.parts:
                continue
            text = fp.read_text(encoding='utf-8', errors='ignore')
            for pat, label in BAD_PATTERNS:
                if re.search(pat, text):
                    errors.append(f'{label} in {fp.relative_to(base)}')

    print()
    for w in warnings:
        print(f'  WARN  {w}')
    for e in errors:
        print(f'  ERR   {e}')

    if errors:
        print(f'\nFAILED — {len(errors)} error(s)')
        return 1
    print(f'\nPASSED — {len(warnings)} warning(s)')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
