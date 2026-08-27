"""
Compress raster images for web delivery (JPEG/WebP, resized caps).
Logos Daxi are always skipped to preserve PNG transparency.
Usage: python manage.py optimize_web_images [--dry-run] [--max-width 1600]
"""
from __future__ import annotations

import io
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

try:
    from PIL import Image, ImageOps
except ImportError:                    
    Image = None
    ImageOps = None

RASTER_EXT = {'.jpg', '.jpeg', '.png', '.webp', '.gif'}
SKIP_DIRS = {'venv', 'node_modules', '.git', '__pycache__', 'migrations'}
LOGO_SKIP = {
    'daxi-app-icon', 'daxi-icon-gold', 'daxi-logo', 'daxi-logo-gold',
    'daxi-logo-dark', 'logo', 'daxi_',
}


def _is_logo(path: Path) -> bool:
    stem = path.stem.lower()
    if stem in LOGO_SKIP:
        return True
    if stem.startswith('daxi-logo') or stem.startswith('daxi-icon') or stem == 'daxi-app-icon':
        return True
    return False


def _has_alpha(im: Image.Image) -> bool:
    if im.mode in ('RGBA', 'LA'):
        return True
    if im.mode == 'P' and 'transparency' in im.info:
        return True
    return False


class Command(BaseCommand):
    help = 'Optimize images for web (resize + compression). Skips Daxi logos.'

    def add_arguments(self, parser):
        parser.add_argument('--dry-run', action='store_true', help='Report only, do not write files.')
        parser.add_argument('--max-width', type=int, default=1600, help='Max width in pixels (default 1600).')
        parser.add_argument('--jpeg-quality', type=int, default=82, help='JPEG quality 1-95 (default 82).')
        parser.add_argument('--webp-quality', type=int, default=80, help='WebP quality 1-95 (default 80).')

    def handle(self, *args, **options):
        if Image is None:
            self.stderr.write(self.style.ERROR('Pillow is required. pip install Pillow'))
            return

        base = Path(settings.BASE_DIR)
        roots = [
            base / 'assets' / 'images',
            base / 'static',
            base / 'villes',
            base / 'media',
        ]
        dry = options['dry_run']
        max_w = options['max_width']
        jq = options['jpeg_quality']
        wq = options['webp_quality']

        total_saved = 0
        touched = 0
        skipped_logos = 0

        for root in roots:
            if not root.is_dir():
                continue
            for path in root.rglob('*'):
                if not path.is_file():
                    continue
                if any(part in SKIP_DIRS for part in path.parts):
                    continue
                if path.suffix.lower() not in RASTER_EXT:
                    continue
                if _is_logo(path):
                    skipped_logos += 1
                    continue

                try:
                    before = path.stat().st_size
                    with Image.open(path) as im:
                        im = ImageOps.exif_transpose(im)
                        alpha = _has_alpha(im)

                        if alpha:
                            if im.mode != 'RGBA':
                                im = im.convert('RGBA')
                        elif im.mode != 'RGB':
                            im = im.convert('RGB')

                        w, h = im.size
                        if w > max_w:
                            nh = int(h * (max_w / w))
                            im = im.resize((max_w, nh), Image.Resampling.LANCZOS)

                        ext = path.suffix.lower()
                        buf = io.BytesIO()
                        if ext == '.png' and alpha:
                            im.save(buf, format='PNG', optimize=True, compress_level=9)
                        elif ext in ('.jpg', '.jpeg'):
                            if alpha:
                                im = im.convert('RGB')
                            im.save(buf, format='JPEG', quality=jq, optimize=True, progressive=True)
                        elif ext == '.png':
                            im.save(buf, format='PNG', optimize=True, compress_level=9)
                        elif ext == '.webp':
                            im.save(buf, format='WEBP', quality=wq, method=6, lossless=alpha)
                        elif ext == '.gif':
                            im.save(buf, format='GIF', optimize=True)
                        else:
                            if alpha:
                                im = im.convert('RGB')
                            im.save(buf, format='JPEG', quality=jq, optimize=True, progressive=True)

                        data = buf.getvalue()
                        if len(data) >= before * 0.97:
                            continue

                        if dry:
                            self.stdout.write(
                                f'[dry-run] {path.relative_to(base)} '
                                f'{before // 1024}KB -> {len(data) // 1024}KB'
                            )
                        else:
                            path.write_bytes(data)
                            self.stdout.write(
                                self.style.SUCCESS(
                                    f'Optimized {path.relative_to(base)} '
                                    f'({before // 1024}KB -> {len(data) // 1024}KB)'
                                )
                            )
                        total_saved += before - len(data)
                        touched += 1
                except Exception as exc:
                    self.stderr.write(self.style.WARNING(f'Skip {path}: {exc}'))

        if skipped_logos:
            self.stdout.write(f'Skipped {skipped_logos} logo file(s) (transparency preserved).')
        if touched:
            self.stdout.write(self.style.SUCCESS(
                f'Done — {touched} file(s), saved ~{total_saved // 1024} KB'
            ))
        else:
            self.stdout.write('No images optimized (none found or already optimal).')
