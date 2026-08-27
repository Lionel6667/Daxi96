"""Utilitaires géographiques — zones danger, distance au polygone."""
from __future__ import annotations

import math


def _haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _point_segment_distance_m(px: float, py: float, ax: float, ay: float, bx: float, by: float) -> float:
    dx, dy = bx - ax, by - ay
    if dx == 0 and dy == 0:
        return _haversine_m(py, px, ay, ax)
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    cx, cy = ax + t * dx, ay + t * dy
    return _haversine_m(py, px, cy, cx)


def _ring_coords(polygon: dict) -> list[tuple[float, float]]:
    coords = polygon.get('coordinates') if isinstance(polygon, dict) else None
    if not coords:
        return []
    ring = coords[0] if coords and isinstance(coords[0][0], (list, tuple)) else coords
    out = []
    for pt in ring:
        if len(pt) >= 2:
            out.append((float(pt[0]), float(pt[1])))
    return out


def point_in_polygon(lng: float, lat: float, polygon: dict) -> bool:
    ring = _ring_coords(polygon)
    if len(ring) < 3:
        return False
    inside = False
    j = len(ring) - 1
    for i in range(len(ring)):
        xi, yi = ring[i]
        xj, yj = ring[j]
        if ((yi > lat) != (yj > lat)) and (
            lng < (xj - xi) * (lat - yi) / (yj - yi + 1e-12) + xi
        ):
            inside = not inside
        j = i
    return inside


def distance_to_polygon_m(lng: float, lat: float, polygon: dict) -> float:
    ring = _ring_coords(polygon)
    if len(ring) < 2:
        return float('inf')
    if point_in_polygon(lng, lat, polygon):
        return 0.0
    best = float('inf')
    for i in range(len(ring)):
        ax, ay = ring[i]
        bx, by = ring[(i + 1) % len(ring)]
        d = _point_segment_distance_m(lng, lat, ax, ay, bx, by)
        if d < best:
            best = d
    return best


DANGER_APPROACH_M = 500.0
SITUATION_APPROACH_M = 100.0
BANNER_MS_DANGER = 6000
BANNER_MS_SITUATION = 4000


def _tag_get(tag, key, default=None):
    if isinstance(tag, dict):
        return tag.get(key, default)
    return getattr(tag, key, default)


def _default_tag_message(tag, zone_name: str) -> str:
    name = (_tag_get(tag, 'name') or zone_name or 'cette zone').strip()
    if _tag_get(tag, 'is_danger'):
        return f'Zone sensible « {name} ». Ralentissez et restez vigilant.'
    return f'Attention : {name.lower()}.'


def _tag_message(tag, zone_name: str) -> str:
    msg = (_tag_get(tag, 'alert_message') or '').strip()
    return msg or _default_tag_message(tag, zone_name)


def find_nearby_alert_zones(
    lat: float,
    lng: float,
    zones: list,
    *,
    danger_m: float = DANGER_APPROACH_M,
    situation_m: float = SITUATION_APPROACH_M,
) -> list[dict]:
    """Une alerte par zone, messages combinés. Danger à 500 m, autres notifs à 100 m."""
    hits = []
    for z in zones:
        poly = z.get('polygon') if isinstance(z, dict) else getattr(z, 'polygon', None)
        if not poly:
            continue
        tags = z.get('tags', []) if isinstance(z, dict) else list(z.tags.all())
        if not tags:
            continue
        dist = distance_to_polygon_m(lng, lat, poly)
        danger_tags = [t for t in tags if _tag_get(t, 'is_danger')]
        notify_tags = [
            t for t in tags
            if (_tag_get(t, 'notify_on_approach') or _tag_get(t, 'is_danger'))
            and not _tag_get(t, 'is_danger')
        ]
        has_danger = bool(danger_tags) and dist <= danger_m
        has_info = bool(notify_tags) and dist <= situation_m
        if not has_danger and not has_info:
            continue
        
        included = []
        if has_danger:
            included.extend(danger_tags)
            included.extend(notify_tags)
        else:
            included.extend(notify_tags)
        messages = []
        seen = set()
        for tag in included:
            msg = _tag_message(tag, z.get('name') if isinstance(z, dict) else z.name)
            key = msg.casefold()
            if key in seen:
                continue
            seen.add(key)
            messages.append(msg)
        if not messages:
            continue
        is_danger = bool(danger_tags)
        hits.append({
            'zone_id': z.get('id') if isinstance(z, dict) else z.pk,
            'zone_name': z.get('name') if isinstance(z, dict) else z.name,
            'distance_m': round(dist),
            'inside': dist == 0,
            'is_danger': is_danger,
            'severity': 'danger' if is_danger else 'info',
            'messages': messages,
            'alert_message': ' · '.join(messages),
            'ttl_ms': BANNER_MS_DANGER if is_danger else BANNER_MS_SITUATION,
        })
    hits.sort(key=lambda x: (0 if x['is_danger'] else 1, x['distance_m']))
    return hits


def find_nearby_danger_zones(lat: float, lng: float, zones: list, threshold_m: float = DANGER_APPROACH_M) -> list[dict]:
    """Compat : zones danger à moins de threshold_m (défaut 500 m)."""
    return [
        hit for hit in find_nearby_alert_zones(lat, lng, zones, danger_m=threshold_m, situation_m=0)
        if hit.get('is_danger')
    ]

