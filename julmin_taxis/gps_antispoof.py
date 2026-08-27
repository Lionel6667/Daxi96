"""
Anti-GPS spoofing léger — rejette téléportations et vitesses impossibles.
"""
from __future__ import annotations

import math
import time
from typing import Optional, Tuple

from django.core.cache import cache


_MAX_SPEED_MS = 50.0

_MIN_DISTANCE_M = 15.0

_TRUST_INITIAL = 100
_TRUST_PENALTY_REJECT = 25
_TRUST_PENALTY_SUSPICIOUS = 10
_TRUST_MIN = 0
_TRUST_MAX = 100


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return r * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def _cache_key(driver_id: int) -> str:
    return f'daxi_gps_last:{driver_id}'


def _trust_key(driver_id: int) -> str:
    return f'daxi_gps_trust:{driver_id}'


def get_gps_trust_score(driver_id: int) -> int:
    return int(cache.get(_trust_key(driver_id), _TRUST_INITIAL) or _TRUST_INITIAL)


def validate_driver_gps(
    driver_id: int,
    lat: float,
    lng: float,
    reported_speed_ms: Optional[float] = None,
) -> Tuple[bool, str, int]:
    """
    Return (accepted, reason, trust_score).
  Rejette si vitesse implicite > seuil ou téléportation.
    """
    now = time.time()
    key = _cache_key(driver_id)
    last = cache.get(key)
    trust = get_gps_trust_score(driver_id)

    if last:
        last_lat, last_lng, last_ts = last
        dt = max(now - float(last_ts), 0.001)
        dist_m = _haversine_m(last_lat, last_lng, lat, lng)
        if dist_m >= _MIN_DISTANCE_M:
            speed_ms = dist_m / dt
            if speed_ms > _MAX_SPEED_MS:
                trust = max(_TRUST_MIN, trust - _TRUST_PENALTY_REJECT)
                cache.set(_trust_key(driver_id), trust, 86400)
                return False, f'gps_speed_impossible:{speed_ms:.0f}m/s', trust
            if reported_speed_ms and reported_speed_ms > _MAX_SPEED_MS:
                trust = max(_TRUST_MIN, trust - _TRUST_PENALTY_SUSPICIOUS)
                cache.set(_trust_key(driver_id), trust, 86400)
                return False, 'gps_reported_speed_impossible', trust

    cache.set(key, (lat, lng, now), 3600)
    if trust < _TRUST_MAX:
        trust = min(_TRUST_MAX, trust + 1)
        cache.set(_trust_key(driver_id), trust, 86400)
    return True, 'ok', trust
