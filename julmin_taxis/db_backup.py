"""Sauvegarde auto de la base — SQLite (copie atomique) ou PostgreSQL (pg_dump)."""
from __future__ import annotations

import gzip
import logging
import os
import shutil
import sqlite3
import subprocess
import time
from datetime import datetime, timedelta
from pathlib import Path

from django.conf import settings
from django.core.cache import cache

logger = logging.getLogger(__name__)

_STAMP_NAME = '.last-backup'
_LOCK_KEY = 'daxi_db_backup_lock'


def backup_dir() -> Path:
    raw = getattr(settings, 'BACKUP_DIR', None)
    path = Path(raw) if raw else Path(settings.BASE_DIR) / 'backups'
    path.mkdir(parents=True, exist_ok=True)
    return path


def _interval_hours() -> int:
    try:
        return max(1, int(getattr(settings, 'BACKUP_INTERVAL_HOURS', 24)))
    except (TypeError, ValueError):
        return 24


def _keep_days() -> int:
    try:
        return max(1, int(getattr(settings, 'BACKUP_KEEP_DAYS', 14)))
    except (TypeError, ValueError):
        return 14


def _gzip_file(src: Path, dest: Path) -> None:
    with src.open('rb') as fin, gzip.open(dest, 'wb', compresslevel=6) as fout:
        shutil.copyfileobj(fin, fout, length=1024 * 1024)


def _backup_sqlite(dest_gz: Path) -> int:
    db_path = Path(settings.DATABASES['default']['NAME'])
    if not db_path.is_file():
        raise FileNotFoundError(f'Base SQLite introuvable: {db_path}')
    tmp_db = dest_gz.with_suffix('.sqlite3.tmp')
    src = sqlite3.connect(str(db_path), timeout=60)
    try:
        dst = sqlite3.connect(str(tmp_db))
        try:
            src.backup(dst)
        finally:
            dst.close()
    finally:
        src.close()
    try:
        _gzip_file(tmp_db, dest_gz)
    finally:
        tmp_db.unlink(missing_ok=True)
    return dest_gz.stat().st_size


def _backup_postgres(dest_gz: Path) -> int:
    cfg = settings.DATABASES['default']
    env = os.environ.copy()
    if cfg.get('PASSWORD'):
        env['PGPASSWORD'] = str(cfg['PASSWORD'])
    args = [
        'pg_dump',
        '--no-owner',
        '--no-acl',
        '-h', str(cfg.get('HOST') or 'localhost'),
        '-p', str(cfg.get('PORT') or '5432'),
        '-U', str(cfg.get('USER') or 'daxi'),
        '-d', str(cfg.get('NAME') or 'daxi'),
        '-F', 'c',
    ]
    tmp = dest_gz.with_suffix('.dump.tmp')
    with tmp.open('wb') as fh:
        proc = subprocess.run(args, stdout=fh, stderr=subprocess.PIPE, env=env, timeout=600)
    if proc.returncode != 0:
        tmp.unlink(missing_ok=True)
        err = (proc.stderr or b'').decode('utf-8', 'replace')[:300]
        raise RuntimeError(f'pg_dump a échoué: {err or proc.returncode}')
    try:
        _gzip_file(tmp, dest_gz)
    finally:
        tmp.unlink(missing_ok=True)
    return dest_gz.stat().st_size


def rotate_old_backups() -> int:
    folder = backup_dir()
    cutoff = time.time() - (_keep_days() * 86400)
    removed = 0
    for item in folder.glob('daxi-db-*.gz'):
        try:
            if item.stat().st_mtime < cutoff:
                item.unlink()
                removed += 1
        except OSError:
            pass
    return removed


def run_backup(*, force: bool = False, upload: bool | None = None) -> dict:
    if not getattr(settings, 'BACKUP_ENABLED', True) and not force:
        return {'ok': False, 'skipped': True, 'reason': 'disabled'}

    engine = (settings.DATABASES['default'].get('ENGINE') or '').lower()
    stamp = datetime.now().strftime('%Y%m%d-%H%M%S')
    folder = backup_dir()
    if 'sqlite' in engine:
        dest = folder / f'daxi-db-{stamp}.sqlite3.gz'
        kind = 'sqlite'
        size = _backup_sqlite(dest)
    elif 'postgresql' in engine or 'postgis' in engine:
        dest = folder / f'daxi-db-{stamp}.pgdump.gz'
        kind = 'postgres'
        size = _backup_postgres(dest)
    else:
        return {'ok': False, 'reason': f'moteur inconnu: {engine}'}

    (folder / _STAMP_NAME).write_text(datetime.now().isoformat(), encoding='utf-8')
    removed = rotate_old_backups()
    remote_url = ''
    upload_err = ''
    should_upload = upload if upload is not None else getattr(settings, 'BACKUP_UPLOAD_CLOUDINARY', True)
    if should_upload:
        remote_url, upload_err = _upload_backup_remote(dest, stamp)
    logger.info('[Backup] %s %s (%s octets, purge=%s, remote=%s)', kind, dest.name, size, removed, bool(remote_url))
    result = {
        'ok': True,
        'kind': kind,
        'file': str(dest),
        'bytes': size,
        'purged': removed,
        'remote_url': remote_url,
    }
    if upload_err and should_upload:
        result['upload_error'] = upload_err
    return result


def _upload_backup_remote(dest: Path, stamp: str) -> tuple[str, str]:
    from julmin_taxis.media_utils import cloudinary_configured, upload_raw_file_to_cloudinary
    if not cloudinary_configured():
        return '', 'Cloudinary non configuré — backup local uniquement (disque éphémère Railway)'
    folder = getattr(settings, 'BACKUP_CLOUDINARY_FOLDER', 'daxi/backups/db')
    public_id = f'daxi-db-{stamp}'
    url, err = upload_raw_file_to_cloudinary(dest, folder=folder, public_id=public_id)
    if url:
        return url, ''
    return '', err or 'upload failed'


def maybe_run_auto_backup() -> dict:
    if not getattr(settings, 'BACKUP_ENABLED', True):
        return {'skipped': True, 'reason': 'disabled'}
    stamp_file = backup_dir() / _STAMP_NAME
    hours = _interval_hours()
    if stamp_file.is_file() and not _stamp_is_stale(stamp_file, hours):
        return {'skipped': True, 'reason': 'fresh'}
    if not cache.add(_LOCK_KEY, 1, timeout=700):
        return {'skipped': True, 'reason': 'lock'}
    try:
        return run_backup()
    except Exception as exc:
        logger.warning('[Backup] échec: %s', exc)
        return {'ok': False, 'error': str(exc)}
    finally:
        cache.delete(_LOCK_KEY)


def _stamp_is_stale(stamp_file: Path, hours: int) -> bool:
    try:
        raw = stamp_file.read_text(encoding='utf-8').strip()
        last = datetime.fromisoformat(raw)
        return datetime.now() - last >= timedelta(hours=hours)
    except Exception:
        return True
