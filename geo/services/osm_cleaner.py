"""Nettoyage automatique des données OSM avant publication DAXI."""
from __future__ import annotations

import re
from typing import Any

from julmin_taxis.known_places_utils import normalize_place_name

CLOSED_TAGS = frozenset({
    'disused', 'abandoned', 'demolished', 'razed', 'removed', 'closed',
})
ENGLISH_ONLY_PATTERN = re.compile(r'^[a-z\s\d\-\.]+$', re.I)

ROAD_TYPES_MAP = {
    'motorway': 'motorway',
    'trunk': 'trunk',
    'primary': 'primary',
    'secondary': 'secondary',
    'tertiary': 'tertiary',
    'residential': 'residential',
    'unclassified': 'unclassified',
    'service': 'service',
    'track': 'track',
    'path': 'path',
}


def _pick_name(tags: dict) -> str:
    for key in ('name:fr', 'name:ht', 'name', 'addr:street', 'ref'):
        val = (tags.get(key) or '').strip()
        if val:
            return val
    return ''


def _is_closed(tags: dict) -> bool:
    if tags.get('disused') == 'yes' or tags.get('abandoned') == 'yes':
        return True
    for k in tags:
        if k in CLOSED_TAGS and tags.get(k) in ('yes', '1', True):
            return True
    return False


def _is_english_only(name: str) -> bool:
    if not name:
        return True
    if re.search(r'[àâäéèêëïîôùûüç]', name, re.I):
        return False
    if re.search(r'\b(rue|avenue|route|quartier|cap|haiti|haïti)\b', name, re.I):
        return False
    return bool(ENGLISH_ONLY_PATTERN.match(name)) and len(name) > 3


def clean_osm_place(tags: dict, name: str | None = None) -> tuple[bool, str, str]:
    """
    Retourne (ok, name, reject_reason).
    ok=False → rejeter ce lieu.
    """
    tags = tags or {}
    if _is_closed(tags):
        return False, '', 'lieu fermé / abandonné'

    name = (name or _pick_name(tags)).strip()
    if not name or len(name) < 2:
        return False, '', 'nom manquant'

    if _is_english_only(name) and not tags.get('name:fr') and not tags.get('name:ht'):
        return False, name, 'nom anglais seul sans variante locale'

    if tags.get('name:fr'):
        name = tags['name:fr'].strip() or name

    return True, name[:500], ''


def clean_osm_road(tags: dict, name: str | None = None) -> tuple[bool, str, str, str]:
    """Retourne (ok, name, road_type, reject_reason)."""
    tags = tags or {}
    if _is_closed(tags):
        return False, '', 'other', 'route fermée'

    highway = (tags.get('highway') or 'other').lower()
    if highway in ('footway', 'steps', 'corridor', 'elevator', 'bus_stop'):
        return False, '', highway, 'type non routier'

    name = (name or _pick_name(tags)).strip()
    if not name:
        ref = (tags.get('ref') or '').strip()
        if ref:
            name = f'Route {ref}'
        else:
            return False, '', highway, 'nom de rue manquant'

    if _is_english_only(name) and not tags.get('name:fr'):
        return False, name, highway, 'nom anglais sans variante locale'

    road_type = ROAD_TYPES_MAP.get(highway, 'other')
    return True, name[:500], road_type, ''


def normalize_record_name(name: str) -> str:
    return normalize_place_name(name)


def dedupe_key_osm(osm_id: int | None, normalized_name: str, lat: float, lng: float) -> str:
    if osm_id:
        return f'osm:{osm_id}'
    return f'n:{normalized_name}:{round(lat, 4)}:{round(lng, 4)}'
