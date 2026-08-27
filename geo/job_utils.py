"""Écritures DB pour les jobs d'import — évite « database is locked » sur SQLite."""
from __future__ import annotations

import time
from typing import Any

from django.db import OperationalError, close_old_connections
from django.utils import timezone

_JOB_UPDATE_FIELDS = (
    'logs', 'updated_at', 'stage', 'status', 'progress_pct',
    'bytes_done', 'bytes_total', 'items_done', 'items_total',
    'speed_bps', 'eta_seconds',
    'files_done', 'files_total', 'error_message', 'finished_at', 'started_at',
)


def bg_db_setup() -> None:
    close_old_connections()


def save_with_retry(obj, *, update_fields: list[str] | None = None, max_retries: int = 12) -> None:
    for attempt in range(max_retries):
        try:
            if update_fields is not None:
                obj.save(update_fields=update_fields)
            else:
                obj.save()
            return
        except OperationalError as exc:
            msg = str(exc).lower()
            if 'locked' not in msg and 'busy' not in msg:
                raise
            close_old_connections()
            time.sleep(min(0.25 * (2 ** attempt), 5.0))


class JobWriter:
    """Bufferise logs/progression — une seule écriture DB toutes les ~2 s."""

    def __init__(self, job_id: int, flush_interval: float = 2.0):
        from geo.models import DownloadJob
        self.job_id = job_id
        self.flush_interval = flush_interval
        self._last_flush = 0.0
        self._dirty = False
        self.extra: dict = {}
        self.job = DownloadJob.objects.select_related('zone').get(pk=job_id)

    def reload(self) -> None:
        from geo.models import DownloadJob
        self.job = DownloadJob.objects.select_related('zone').get(pk=self.job_id)

    def log(self, message: str, level: str = 'info', *, force_flush: bool = False) -> None:
        logs = list(self.job.logs or [])
        logs.append({
            'ts': timezone.now().isoformat(),
            'level': level,
            'message': message,
        })
        self.job.logs = logs[-500:]
        self._dirty = True
        self._maybe_flush(force=force_flush or level == 'error')

    def update(self, *, force: bool = False, **fields: Any) -> None:
        for key, val in fields.items():
            setattr(self.job, key, val)
        self._dirty = True
        self._maybe_flush(force=force)

    def _maybe_flush(self, *, force: bool = False) -> None:
        now = time.time()
        if not force and not self._dirty:
            return
        if not force and (now - self._last_flush) < self.flush_interval:
            return
        self.flush()

    def flush(self) -> None:
        if not self._dirty:
            return
        save_with_retry(self.job, update_fields=list(_JOB_UPDATE_FIELDS))
        self._dirty = False
        self._last_flush = time.time()
