"""Dispatch notifications after DB commit — avoids blocking HTTP and missed sends on timeout."""
from __future__ import annotations

import logging
import threading

from django.db import connection, transaction

logger = logging.getLogger(__name__)


def run_after_commit(func, *args, **kwargs):
    """Run *func* in a background thread once the current transaction commits."""

    def _worker():
        fn_name = getattr(func, '__name__', repr(func))
        logger.info('[NotifyDispatch] start %s args=%s', fn_name, args[:2] if args else ())
        try:
            func(*args, **kwargs)
            logger.info('[NotifyDispatch] done %s', fn_name)
        except Exception:
            logger.exception('[NotifyDispatch] %s failed', fn_name)

    def _schedule():
        threading.Thread(target=_worker, daemon=True, name='daxi-notify').start()

    try:
        if connection.in_atomic_block:
            transaction.on_commit(_schedule)
        else:
            _schedule()
    except Exception:
        _schedule()
