"""
Module de routage — récupère le trajet réel entre deux points via OSRM.
"""
import math
import logging
import requests
from django.conf import settings

logger = logging.getLogger(__name__)

OSRM_BASE_URL = getattr(
    settings, 'OSRM_BASE_URL',
    'http://router.project-osrm.org'
)
OSRM_TIMEOUT = getattr(settings, 'OSRM_TIMEOUT', 10)


def get_route(origin_lat: float, origin_lng: float,
              dest_lat: float, dest_lng: float) -> dict:
    """Route principale OSRM."""
    try:
        url = (
            f"{OSRM_BASE_URL}/route/v1/driving/"
            f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
            f"?overview=full&geometries=geojson&steps=false"
        )
        resp = requests.get(url, timeout=OSRM_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if data.get('code') != 'Ok' or not data.get('routes'):
            raise ValueError(f"OSRM returned: {data.get('code')}")
        return _parse_osrm_route(data['routes'][0], 'osrm')
    except Exception as e:
        logger.warning(f"OSRM routing failed ({e}), falling back to straight-line")
        return _straight_line_route(origin_lat, origin_lng, dest_lat, dest_lng)


def get_route_alternatives(origin_lat: float, origin_lng: float,
                           dest_lat: float, dest_lng: float,
                           max_alternatives: int = 3) -> list:
    """Retourne plusieurs itinéraires OSRM."""
    try:
        url = (
            f"{OSRM_BASE_URL}/route/v1/driving/"
            f"{origin_lng},{origin_lat};{dest_lng},{dest_lat}"
            f"?overview=full&geometries=geojson&steps=false"
            f"&alternatives=true&number={max(1, min(max_alternatives, 3))}"
        )
        resp = requests.get(url, timeout=OSRM_TIMEOUT)
        resp.raise_for_status()
        data = resp.json()
        if data.get('code') != 'Ok' or not data.get('routes'):
            raise ValueError(f"OSRM alternatives: {data.get('code')}")
        return [_parse_osrm_route(r, 'osrm_alt') for r in data['routes']]
    except Exception as e:
        logger.debug(f"OSRM alternatives failed ({e})")
        return [get_route(origin_lat, origin_lng, dest_lat, dest_lng)]


def _parse_osrm_route(route: dict, source: str) -> dict:
    geometry = route['geometry']
    coords = [[pt[1], pt[0]] for pt in geometry['coordinates']]
    return {
        'coordinates': coords,
        'distance_km': route['distance'] / 1000.0,
        'duration_s': route['duration'],
        'source': source,
    }


def get_best_route(origin_lat: float, origin_lng: float,
                   dest_lat: float, dest_lng: float,
                   zones=None) -> dict:
    """
    Choisit le meilleur itinéraire en évitant les zones danger (+10%)
    ou autres catégories (+5%) si une alternative existe.
    """
    if zones is None:
        from .models import PricingZone
        zones = list(PricingZone.objects.filter(is_active=True).prefetch_related('tags'))

    candidates = get_route_alternatives(origin_lat, origin_lng, dest_lat, dest_lng)
    if not candidates:
        candidates = [get_route(origin_lat, origin_lng, dest_lat, dest_lng)]

    scored = []
    for route in candidates:
        metrics = _route_zone_metrics(route['coordinates'], zones)
        scored.append({**route, **metrics})

    baseline = min(scored, key=lambda r: r['distance_km'])
    best = baseline

    for candidate in scored:
        if candidate is baseline:
            continue
        if not _should_prefer_alternative(baseline, candidate):
            continue
        if _is_better_route(baseline, candidate):
            best = candidate

    return {
        'coordinates': best['coordinates'],
        'distance_km': best['distance_km'],
        'duration_s': best['duration_s'],
        'source': best.get('source', 'osrm'),
        'route_choice': 'alternative' if best is not baseline else 'shortest',
        'zones_metrics': {
            'danger_km': best.get('danger_km', 0.0),
            'tag_km': best.get('tag_km', {}),
        },
    }


def _route_zone_metrics(coords: list, zones) -> dict:
    if not coords or len(coords) < 2 or not zones:
        return {'danger_km': 0.0, 'tag_km': {}}

    from .pricing_engine import _segment_fraction_in_zone

    zone_distance = {z.pk: 0.0 for z in zones}
    for i in range(len(coords) - 1):
        pt_a, pt_b = coords[i], coords[i + 1]
        seg_len = segment_length_km(pt_a, pt_b)
        if seg_len == 0:
            continue
        for zone in zones:
            fraction = _segment_fraction_in_zone(pt_a, pt_b, zone)
            if fraction > 0:
                zone_distance[zone.pk] += seg_len * fraction

    danger_km = 0.0
    tag_km = {}
    for zone in zones:
        z_dist = zone_distance.get(zone.pk, 0.0)
        if z_dist <= 0:
            continue
        for tag in zone.tags.all():
            tag_km[tag.pk] = tag_km.get(tag.pk, 0.0) + z_dist
            if tag.is_danger:
                danger_km += z_dist

    return {'danger_km': round(danger_km, 4), 'tag_km': tag_km}


def _should_prefer_alternative(baseline: dict, candidate: dict) -> bool:
    if candidate.get('danger_km', 0) < baseline.get('danger_km', 0) - 0.01:
        return True
    base_tags = baseline.get('tag_km') or {}
    cand_tags = candidate.get('tag_km') or {}
    for tag_id, base_km in base_tags.items():
        if base_km > 0.01 and cand_tags.get(tag_id, 0) < base_km - 0.01:
            return True
    return False


def _is_better_route(baseline: dict, candidate: dict) -> bool:
    max_penalty = 5.0
    if baseline.get('danger_km', 0) > 0.01 and candidate.get('danger_km', 0) < baseline.get('danger_km', 0):
        max_penalty = max(max_penalty, 10.0)

    limit = 1.0 + (max_penalty / 100.0)
    dist_ratio = candidate['distance_km'] / max(baseline['distance_km'], 0.001)
    time_ratio = candidate['duration_s'] / max(baseline['duration_s'], 1.0)
    return dist_ratio <= limit and time_ratio <= limit


def _straight_line_route(origin_lat, origin_lng, dest_lat, dest_lng,
                          points_per_km: int = 4) -> dict:
    distance_km = _haversine(origin_lat, origin_lng, dest_lat, dest_lng)
    num_points = max(10, int(distance_km * points_per_km))
    coords = []
    for i in range(num_points + 1):
        t = i / num_points
        coords.append([
            origin_lat + t * (dest_lat - origin_lat),
            origin_lng + t * (dest_lng - origin_lng),
        ])
                                                                                             
    road_km = distance_km * 1.35
    duration_s = (road_km / 28.0) * 3600.0
    return {
        'coordinates': coords,
        'distance_km': road_km,
        'duration_s': duration_s,
        'source': 'straight_line',
    }


def _haversine(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6371.0
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    return R * 2 * math.asin(math.sqrt(a))


def segment_length_km(pt_a: list, pt_b: list) -> float:
    return _haversine(pt_a[0], pt_a[1], pt_b[0], pt_b[1])
