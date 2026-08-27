"""Scheduled order tasks (LATER → NOW, WhatsApp rappels 1h) — sans cron externe obligatoire."""
from __future__ import annotations

import logging
import threading
import time

from django.core.cache import cache
from django.utils import timezone

logger = logging.getLogger(__name__)

_LOCK_KEY = 'daxi_sched_tasks_lock'
_TICK_KEY = 'daxi_sched_tasks_last_tick'
_INTERVAL_SEC = 60
_scheduler_started = False


def run_scheduled_order_tasks(force: bool = False) -> dict:
    """
    Transitionne les courses LATER et envoie les rappels WhatsApp (~1h avant).
    Protégé par verrou cache (une exécution / ~55s max sur tout le cluster).
    """
    now = timezone.now()
    if not force:
        last = cache.get(_TICK_KEY)
        if last:
            try:
                if (now - last).total_seconds() < 55:
                    return {'skipped': True, 'reason': 'throttle'}
            except Exception:
                pass
        if not cache.add(_LOCK_KEY, 1, timeout=90):
            return {'skipped': True, 'reason': 'lock'}

    transitioned = 0
    reminded = 0
    try:
        from julmin_taxis.htmx_views_tracking import check_gps_reminders, check_later_transitions

        transitioned = check_later_transitions() or 0
        reminded = check_gps_reminders() or 0
        cache.set(_TICK_KEY, now, timeout=300)
        if transitioned or reminded:
            logger.info(
                '[ScheduledTasks] transitioned=%s reminders=%s',
                transitioned, reminded,
            )
    except Exception as exc:
        logger.warning('[ScheduledTasks] failed: %s', exc)
    finally:
        if not force:
            cache.delete(_LOCK_KEY)

    return {'skipped': False, 'transitioned': transitioned, 'reminded': reminded}


def _scheduler_loop():
    while True:
        try:
            run_scheduled_order_tasks()
        except Exception as exc:
            logger.warning('[ScheduledTasks] loop error: %s', exc)
        try:
            from julmin_taxis.db_backup import maybe_run_auto_backup
            maybe_run_auto_backup()
        except Exception as exc:
            logger.warning('[Backup] loop error: %s', exc)
        time.sleep(_INTERVAL_SEC)


def start_background_scheduler():
    """Daemon thread — une boucle / minute (complète les polls HTTP)."""
    global _scheduler_started
    if _scheduler_started:
        return
    _scheduler_started = True
    t = threading.Thread(target=_scheduler_loop, daemon=True, name='daxi-scheduler')
    t.start()
    logger.info('[ScheduledTasks] background scheduler started (every %ss)', _INTERVAL_SEC)
