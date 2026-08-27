#!/usr/bin/env python3
"""Déplace les fichiers legacy (non servis par Django) vers legacy/html/ et legacy/js/."""
from __future__ import annotations

import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LEGACY_HTML = ROOT / 'legacy' / 'html'
LEGACY_JS = ROOT / 'legacy' / 'js'

KEEP_HTML = {
    'vubez2.html', 'compte.html', 'driver_home.html', 'driver_login.html',
    'entreprise.html', 'entreprise_dashboard.html', 'test_whatsapp.html',
}

KEEP_JS = {
    'manifest.json', 'sw.js', 'firebase-messaging-sw.js',
    'daxi-frequent-routes-data.js', 'daxi-frequent-routes-map.js',
    'daxi-haiti-explorer-data.js', 'daxi-haiti-explorer-map.js',
    'daxi-push-register.js', 'gps-precision-engine.js',
}

LEGACY_JS_NAMES = {
    'admin-consolidated.js', 'admin-enhancements.js', 'chat-system.js',
    'NOTIFICATION_INTEGRATION_CODE.js', 'script.js',
}


def move(src: Path, dest: Path) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists():
        return
    shutil.move(str(src), str(dest))
    print(f'  -> {dest.relative_to(ROOT)}')


def main() -> None:
    LEGACY_HTML.mkdir(parents=True, exist_ok=True)
    LEGACY_JS.mkdir(parents=True, exist_ok=True)

    for f in ROOT.glob('*.html'):
        if f.name not in KEEP_HTML:
            move(f, LEGACY_HTML / f.name)

    for f in ROOT.glob('*.js'):
        if f.name not in KEEP_JS:
            dest_dir = LEGACY_JS if f.name in LEGACY_JS_NAMES else LEGACY_HTML.parent / 'js'
            move(f, dest_dir / f.name)

    
    parent = ROOT.parent
    if parent.is_dir():
        for f in parent.iterdir():
            if f.is_file() and f.suffix in {'.py', '.bak', '.txt', '.zip', '.apk'}:
                move(f, ROOT / 'legacy' / f.name)
            elif f.is_dir() and f.name in {'plan 3', 'plan1', 'plan2', 'plan4', 'plan5', 'villes', '.vscode'}:
                dest = ROOT / 'legacy' / f.name.replace(' ', '_')
                if not dest.exists():
                    shutil.move(str(f), str(dest))
                    print(f'  -> legacy/{dest.name}/')

    
    villes = ROOT / 'villes'
    villes.mkdir(exist_ok=True)
    readme = villes / 'README.txt'
    if not readme.exists():
        readme.write_text(
            'Photos des villes pour les itinéraires fréquents (daxi-frequent-routes).\n'
            'Structure: villes/NomVille/photo.jpg\n',
            encoding='utf-8',
        )
        print('  -> villes/README.txt')

    print('Done.')


if __name__ == '__main__':
    main()
