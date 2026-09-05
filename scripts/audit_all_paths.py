#!/usr/bin/env python3
"""
Audit exhaustif des chemins locaux référencés dans le code actif.
Usage: python scripts/audit_all_paths.py
"""
from __future__ import annotations

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

BASE = Path(settings.BASE_DIR)

SERVED_HTML = [
    'vubez2.html', 'compte.html', 'driver_home.html', 'driver_login.html',
    'entreprise.html', 'entreprise_dashboard.html', 'test_whatsapp.html',
]

ROOT_JS = [
    'manifest.json', 'sw.js', 'firebase-messaging-sw.js',
    'daxi-frequent-routes-data.js', 'daxi-frequent-routes-map.js',
    'daxi-haiti-explorer-data.js', 'daxi-haiti-explorer-map.js',
    'daxi-push-register.js',
]

STATIC_REQUIRED = [
    'static/js/daxi-phone.js', 'static/js/daxi-offline.js',
    'static/js/firebase-shim.js', 'static/js/daxi-countdown.js',
    'static/js/daxi-auto-i18n.js',
    'static/js/gps-precision-engine.js',
]

ASSETS_REQUIRED = [
    'assets/js/tailwindcss-3.4.16.js', 'assets/js/htmx.min.js',
    'assets/js/aos.js', 'assets/css/remixicon.min.css', 'assets/css/aos.css',
]


LOCAL_REF = re.compile(
    r'''(?:src|href|url\(\s*["']?)\s*["']?'''
    r'(?!https?:|//|data:|#|mailto:|tel:|javascript:)'
    r'([^"\'>\s\)]+)["\']?''',
    re.IGNORECASE,
)
SCRIPT_SRC = re.compile(r'<script[^>]+src=["\']([^"\']+)["\']', re.IGNORECASE)

BAD_CODE = [
    (re.compile(r'\.\./phpscript'), 'ref ../phpscript'),
    (re.compile(r'BASE_DIR\.parent'), 'BASE_DIR.parent'),
    (re.compile(r'dirname\(settings\.BASE_DIR\)'), 'ORIGINAL_ROOT parent'),
    (re.compile(r'Julmin Taxis \(2\)'), 'old parent folder name'),
]


def resolve_ref(ref: str) -> Path | None:
    ref = ref.split('?')[0].strip()
    if not ref or ref.startswith('{{'):
        return None
    if ref.startswith('/'):
        ref = ref.lstrip('/')
    return BASE / ref.replace('/', os.sep)


def audit_html(path: Path) -> list[str]:
    errors = []
    text = path.read_text(encoding='utf-8', errors='ignore')
    refs = set()
    for m in LOCAL_REF.finditer(text):
        refs.add(m.group(1))
    for m in SCRIPT_SRC.finditer(text):
        refs.add(m.group(1))
    for ref in refs:
        if ref.startswith(('http://', 'https://', '//', 'htmx/', 'api/', 'django-admin/')):
            continue
        p = resolve_ref(ref)
        if p is None:
            continue
        if p.suffix.lower() in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.jfif', '.svg', '.ico', '.woff', '.woff2'}:
            if not p.is_file():
                
                pass
        elif p.suffix.lower() in {'.js', '.css', '.json'}:
            if not p.is_file():
                errors.append(f'{path.name}: missing {ref}')
    return errors


def main() -> int:
    errors: list[str] = []
    warnings: list[str] = []

    print(f'Auditing BASE_DIR = {BASE}\n')

    for f in SERVED_HTML + ROOT_JS + STATIC_REQUIRED + ASSETS_REQUIRED:
        p = BASE / f
        if p.is_file():
            print(f'  OK  {f}')
        elif f in ASSETS_REQUIRED or f.startswith('static/'):
            warnings.append(f'Optional/missing: {f}')
        else:
            errors.append(f'Required missing: {f}')

    for html in SERVED_HTML:
        hp = BASE / html
        if hp.is_file():
            errors.extend(audit_html(hp))

    for tpl in (BASE / 'templates').rglob('*.html'):
        if 'legacy' in tpl.parts:
            continue
        for e in audit_html(tpl):
            if 'missing static/' in e or 'missing assets/' in e:
                errors.append(f'template {tpl.relative_to(BASE)}: {e.split(": ", 1)[-1]}')

    scan = ['julmin_taxis', 'scripts', 'clients/daxi-android/scripts', 'clients/daxi-android/app/src/main/java']
    skip_names = {'validate_project_paths.py', 'verify_paths.py', 'audit_all_paths.py', 'organize_legacy.py'}
    for sub in scan:
        root = BASE / sub
        if not root.is_dir():
            continue
        for fp in root.rglob('*'):
            if fp.name in skip_names or fp.suffix not in {'.py', '.ps1', '.kt', '.ts'} or 'build' in fp.parts:
                continue
            text = fp.read_text(encoding='utf-8', errors='ignore')
            for pat, label in BAD_CODE:
                if pat.search(text):
                    errors.append(f'{label} in {fp.relative_to(BASE)}')

    fcm = getattr(settings, 'FCM_SERVICE_ACCOUNT_PATH', '')
    if fcm and Path(fcm).is_file():
        print(f'  OK  FCM {fcm}')
    else:
        warnings.append(f'FCM absent: {fcm}')

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
