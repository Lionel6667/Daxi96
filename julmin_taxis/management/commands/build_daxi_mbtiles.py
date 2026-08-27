"""
Génère un pack MBTiles Haïti (zones DAXI) pour cartes hors ligne Android.

Usage:
    python manage.py build_daxi_mbtiles
    python manage.py build_daxi_mbtiles --zoom-min 8 --zoom-max 11
"""
from __future__ import annotations

import math
import sqlite3
import time
import urllib.request
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand


DAXI_BOUNDS = {
    'north': 20.15,
    'south': 18.0,
    'west': -74.8,
    'east': -71.6,
}

TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
USER_AGENT = 'DaxiTaxis/1.2 (+https://daxipro.com; offline-maps)'


def _deg2tile(lat: float, lng: float, zoom: int) -> tuple[int, int]:
    lat_rad = math.radians(lat)
    n = 2 ** zoom
    x = int((lng + 180.0) / 360.0 * n)
    y = int((1.0 - math.asinh(math.tan(lat_rad)) / math.pi) / 2.0 * n)
    return x, y


def _tile_range(bounds: dict, zoom: int) -> tuple[int, int, int, int]:
    x_min, y_max = _deg2tile(bounds['south'], bounds['west'], zoom)
    x_max, y_min = _deg2tile(bounds['north'], bounds['east'], zoom)
    return x_min, x_max, y_min, y_max


def _create_mbtiles(path: Path) -> sqlite3.Connection:
    if path.exists():
        path.unlink()
    conn = sqlite3.connect(str(path))
    conn.execute('CREATE TABLE metadata (name TEXT, value TEXT)')
    conn.execute(
        'CREATE TABLE tiles ('
        'zoom_level INTEGER, tile_column INTEGER, tile_row INTEGER, tile_data BLOB)'
    )
    conn.execute(
        'CREATE UNIQUE INDEX tile_index ON tiles (zoom_level, tile_column, tile_row)'
    )
    conn.executemany(
        'INSERT INTO metadata (name, value) VALUES (?, ?)',
        [
            ('name', 'DAXI Haiti'),
            ('type', 'baselayer'),
            ('version', '1'),
            ('description', 'OpenStreetMap tiles for Haiti — DAXI offline maps'),
            ('format', 'png'),
            ('bounds', '-74.8,18.0,-71.6,20.15'),
            ('center', '-72.3,19.5,9'),
            ('minzoom', '8'),
            ('maxzoom', '12'),
            ('attribution', '© OpenStreetMap contributors'),
        ],
    )
    return conn


def _download_tile(z: int, x: int, y: int) -> bytes | None:
    url = TILE_URL.format(z=z, x=x, y=y)
    req = urllib.request.Request(url, headers={'User-Agent': USER_AGENT})
    try:
        with urllib.request.urlopen(req, timeout=20) as resp:
            if resp.status != 200:
                return None
            return resp.read()
    except Exception:
        return None


class Command(BaseCommand):
    help = 'Télécharge les tuiles OSM Haïti et crée static/maps/haiti.mbtiles'

    def add_arguments(self, parser):
        parser.add_argument('--zoom-min', type=int, default=8)
        parser.add_argument('--zoom-max', type=int, default=11)
        parser.add_argument('--output', type=str, default='haiti.mbtiles')
        parser.add_argument('--delay', type=float, default=0.12, help='Pause entre requêtes (s)')

    def handle(self, *args, **options):
        maps_dir = Path(settings.BASE_DIR) / 'static' / 'maps'
        maps_dir.mkdir(parents=True, exist_ok=True)
        out_path = maps_dir / options['output']
        z_min = options['zoom_min']
        z_max = options['zoom_max']
        delay = options['delay']

        conn = _create_mbtiles(out_path)
        total = 0
        saved = 0
        skipped = 0

        for z in range(z_min, z_max + 1):
            x_min, x_max, y_min, y_max = _tile_range(DAXI_BOUNDS, z)
            for x in range(x_min, x_max + 1):
                for y in range(y_min, y_max + 1):
                    total += 1
                    tms_y = (2 ** z - 1) - y
                    existing = conn.execute(
                        'SELECT 1 FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?',
                        (z, x, tms_y),
                    ).fetchone()
                    if existing:
                        skipped += 1
                        continue
                    data = _download_tile(z, x, y)
                    if data:
                        conn.execute(
                            'INSERT INTO tiles (zoom_level, tile_column, tile_row, tile_data) VALUES (?,?,?,?)',
                            (z, x, tms_y, data),
                        )
                        saved += 1
                    if delay > 0:
                        time.sleep(delay)
                    if total % 50 == 0:
                        conn.commit()
                        self.stdout.write(f'  z{z} — {saved}/{total} tuiles…')

        conn.commit()
        conn.close()
        size_mb = out_path.stat().st_size / (1024 * 1024)
        self.stdout.write(self.style.SUCCESS(
            f'OK {out_path} - {saved} tuiles ({size_mb:.1f} Mo), {skipped} ignorees'
        ))
