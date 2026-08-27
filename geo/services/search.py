"""Recherche unifiée : KnownPlace → GeoRoad → GeoPlace → statique → Google."""
from __future__ import annotations

import logging
from typing import Any

from django.conf import settings

from julmin_taxis.known_places_utils import normalize_place_name

logger = logging.getLogger(__name__)

MIN_LOCAL_BEFORE_GOOGLE = 5


def _text_matches(query_norm: str, label: str) -> bool:
    if not query_norm or len(query_norm) < 2:
        return False
    label_norm = normalize_place_name(label)
    if query_norm in label_norm:
        return True
    parts = [p for p in query_norm.split() if len(p) >= 2]
    if not parts:
        return query_norm in label_norm
    return all(p in label_norm for p in parts)


def _score_match(query_norm: str, label: str, use_count: int = 0, source_boost: int = 0) -> float:
    ln = normalize_place_name(label)
    if not ln:
        return 0
    if ln == query_norm:
        base = 1.0
    elif query_norm in ln:
        base = 0.85
    elif ln.startswith(query_norm):
        base = 0.75
    else:
        base = 0.55
    return base + min(use_count * 0.02, 0.2) + source_boost


def search_known_places(query: str, limit: int = 8) -> list[dict]:
    q = normalize_place_name(query)
    if len(q) < 2:
        return []
    out: list[dict] = []
    seen: set[str] = set()

    try:
        from orders.models import KnownPlace
        for kp in KnownPlace.objects.order_by('-use_count', '-updated_at')[:300]:
            labels = [kp.label] + list(kp.aliases or []) + list(getattr(kp, 'search_terms', None) or [])
            matched = any(_text_matches(q, lbl) for lbl in labels if lbl)
            if not matched:
                continue
            key = normalize_place_name(kp.label)
            if key in seen:
                continue
            seen.add(key)
            score = _score_match(q, kp.label, kp.use_count, source_boost=0.15)
            out.append({
                'place_id': f'daxi_known_{kp.pk}',
                'description': kp.label,
                'lat': kp.lat,
                'lng': kp.lng,
                'source': 'known',
                'source_label': 'DAXI',
                'geometry_type': 'point',
                '_score': score,
            })
    except Exception as exc:
        logger.debug('[GeoSearch] KnownPlace: %s', exc)

    out.sort(key=lambda x: -x['_score'])
    return [{k: v for k, v in p.items() if k != '_score'} for p in out[:limit]]


def search_geo_roads(query: str, limit: int = 6) -> list[dict]:
    q = normalize_place_name(query)
    if len(q) < 2:
        return []
    out: list[dict] = []
    seen: set[str] = set()

    try:
        from geo.models import GeoRoad, PublicationStatus
        qs = GeoRoad.objects.filter(publication_status=PublicationStatus.PUBLISHED)

        if getattr(settings, 'USE_POSTGIS', False):
            try:
                from django.contrib.gis.db.models.functions import Length
                from django.db.models import Q
                qs = qs.filter(
                    Q(normalized_name__icontains=q) | Q(name__icontains=query)
                ).order_by('-length_m')[:limit * 3]
            except Exception:
                qs = qs.filter(normalized_name__icontains=q)[:limit * 3]
        else:
            qs = qs.filter(normalized_name__icontains=q)[:limit * 3]

        for road in qs:
            key = road.normalized_name
            if key in seen:
                continue
            if not _text_matches(q, road.name):
                continue
            seen.add(key)
            lat, lng = road.centroid_lat, road.centroid_lng
            if lat is None or lng is None:
                continue
            zone_name = road.zone.name if road.zone_id else ''
            desc = road.name
            if zone_name and zone_name.lower() not in desc.lower():
                desc = f'{road.name}, {zone_name}'
            out.append({
                'place_id': f'daxi_road_{road.pk}',
                'description': desc,
                'lat': lat,
                'lng': lng,
                'source': 'osm',
                'source_label': 'OSM',
                'geometry_type': 'road',
                'road_type': road.road_type,
                '_score': _score_match(q, road.name, source_boost=0.05),
            })
    except Exception as exc:
        logger.debug('[GeoSearch] GeoRoad: %s', exc)

    out.sort(key=lambda x: -x['_score'])
    return [{k: v for k, v in p.items() if k != '_score'} for p in out[:limit]]


def search_geo_places(query: str, limit: int = 8) -> list[dict]:
    q = normalize_place_name(query)
    if len(q) < 2:
        return []
    out: list[dict] = []
    seen: set[str] = set()

    try:
        from geo.models import GeoPlace, PublicationStatus
        for gp in GeoPlace.objects.filter(
            publication_status=PublicationStatus.PUBLISHED,
        ).select_related('zone').order_by('name')[:400]:
            if not _text_matches(q, gp.name):
                continue
            key = gp.normalized_name
            if key in seen:
                continue
            seen.add(key)
            desc = gp.name
            if gp.zone_id and gp.zone.name.lower() not in desc.lower():
                desc = f'{gp.name}, {gp.zone.name}'
            out.append({
                'place_id': f'daxi_osm_{gp.pk}',
                'description': desc,
                'lat': gp.lat,
                'lng': gp.lng,
                'source': 'osm',
                'source_label': 'OSM',
                'geometry_type': 'point',
                'category': gp.category,
                '_score': _score_match(q, gp.name, source_boost=0.03),
            })
    except Exception as exc:
        logger.debug('[GeoSearch] GeoPlace: %s', exc)

    out.sort(key=lambda x: -x['_score'])
    return [{k: v for k, v in p.items() if k != '_score'} for p in out[:limit]]


def merge_predictions(*lists: list[dict], limit: int = 8) -> list[dict]:
    merged: list[dict] = []
    seen: set[str] = set()
    for lst in lists:
        for p in lst:
            pid = p.get('place_id') or ''
            desc = (p.get('description') or '').strip()
            if not desc:
                continue
            key = pid or normalize_place_name(desc)
            if key in seen:
                continue
            seen.add(key)
            merged.append(p)
            if len(merged) >= limit:
                return merged
    return merged


def unified_place_search(
    query: str,
    *,
    limit: int = 8,
    static_places: list[dict] | None = None,
    google_fetcher=None,
) -> list[dict]:
    """
    Priorité :
      1. KnownPlace (DAXI humain)
      2. GeoRoad (rues OSM)
      3. GeoPlace (lieux OSM)
      4. Catalogue statique
      5. Google (dernier recours)
    """
    known = search_known_places(query, limit=limit)
    roads = search_geo_roads(query, limit=limit)
    osm_places = search_geo_places(query, limit=limit)

    static_out: list[dict] = []
    if static_places:
        q = normalize_place_name(query)
        for i, sp in enumerate(static_places):
            if _text_matches(q, sp.get('label', '')):
                static_out.append({
                    'place_id': f'daxi_static_{i}',
                    'description': sp['label'],
                    'lat': sp['lat'],
                    'lng': sp['lng'],
                    'source': 'static',
                    'source_label': 'DAXI',
                    'geometry_type': 'point',
                })

    local = merge_predictions(known, roads, osm_places, static_out, limit=limit)

    if len(local) >= MIN_LOCAL_BEFORE_GOOGLE:
        return local[:limit]

    google: list[dict] = []
    if google_fetcher:
        try:
            google = google_fetcher(query) or []
        except Exception as exc:
            logger.warning('[GeoSearch] Google fallback failed: %s', exc)

    return merge_predictions(local, google, limit=limit)[:limit]


def nearest_published_place(lat: float, lng: float, radius_m: float = 200) -> dict | None:
    """Trouve le lieu publié le plus proche (PostGIS ST_DWithin si disponible)."""
    if getattr(settings, 'USE_POSTGIS', False):
        try:
            from django.contrib.gis.db.models.functions import Distance
            from django.contrib.gis.geos import Point
            from geo.models import GeoPlace, PublicationStatus

            pt = Point(lng, lat, srid=4326)
            qs = GeoPlace.objects.filter(
                publication_status=PublicationStatus.PUBLISHED,
            ).annotate(
                dist=Distance('geom', pt),
            ).order_by('dist')
            
            gp = qs.first()
            if gp:
                return {'id': gp.pk, 'name': gp.name, 'lat': gp.lat, 'lng': gp.lng}
        except Exception:
            pass

    from geo.services.geometry import haversine_m
    from geo.models import GeoPlace, PublicationStatus

    best = None
    best_d = radius_m
    for gp in GeoPlace.objects.filter(publication_status=PublicationStatus.PUBLISHED)[:500]:
        d = haversine_m(lat, lng, gp.lat, gp.lng)
        if d < best_d:
            best_d = d
            best = gp
    if best:
        return {'id': best.pk, 'name': best.name, 'lat': best.lat, 'lng': best.lng}
    return None


def _active_department_bounds() -> list[dict]:
    try:
        from admin_panel.models import CoveredDepartment
        return list(
            CoveredDepartment.objects.filter(is_active=True).values(
                'slug', 'lat_min', 'lat_max', 'lng_min', 'lng_max',
            )
        )
    except Exception:
        return []


def _in_any_dept_bounds(lat: float, lng: float, depts: list[dict]) -> bool:
    if not depts:
        return True
    for d in depts:
        if d.get('lat_min') is None:
            continue
        if (
            d['lat_min'] <= lat <= d['lat_max']
            and d['lng_min'] <= lng <= d['lng_max']
        ):
            return True
    return False


def _catalog_search_text(*parts: str) -> str:
    return normalize_place_name(' '.join(p for p in parts if p))


def build_saved_places_catalog(*, static_places: list[dict] | None = None) -> list[dict]:
    """
    Lieux sauvegardés (KnownPlace + statique) pour filtrage client instantané.
    N'inclut pas les données OSM importées — Google couvre la recherche générale.
    """
    depts = _active_department_bounds()
    out: list[dict] = []
    seen: set[str] = set()

    def _add(entry: dict) -> None:
        lat, lng = entry.get('lat'), entry.get('lng')
        if lat is None or lng is None:
            return
        if depts and not _in_any_dept_bounds(float(lat), float(lng), depts):
            return
        pid = entry.get('place_id') or ''
        key = pid or _catalog_search_text(entry.get('description', ''))
        if not key or key in seen:
            return
        seen.add(key)
        out.append(entry)

    try:
        from orders.models import KnownPlace
        for kp in KnownPlace.objects.order_by('-use_count', '-updated_at'):
            labels = [kp.label] + list(kp.aliases or []) + list(getattr(kp, 'search_terms', None) or [])
            _add({
                'place_id': f'daxi_known_{kp.pk}',
                'description': kp.label,
                'lat': kp.lat,
                'lng': kp.lng,
                'source': 'known',
                'source_label': 'DAXI',
                'geometry_type': 'point',
                'use_count': kp.use_count,
                'search_text': _catalog_search_text(*labels),
            })
    except Exception as exc:
        logger.debug('[GeoSearch] catalog KnownPlace: %s', exc)

    if static_places:
        for i, sp in enumerate(static_places):
            label = sp.get('label', '')
            _add({
                'place_id': f'daxi_static_{i}',
                'description': label,
                'lat': sp['lat'],
                'lng': sp['lng'],
                'source': 'static',
                'source_label': 'DAXI',
                'geometry_type': 'point',
                'search_text': _catalog_search_text(label),
            })

    out.sort(key=lambda x: (
        0 if x.get('source') == 'known' else 1,
        -(x.get('use_count') or 0),
        x.get('description', ''),
    ))
    return out


def build_places_catalog(*, static_places: list[dict] | None = None) -> list[dict]:
    """Alias — catalogue léger (lieux sauvegardés uniquement)."""
    return build_saved_places_catalog(static_places=static_places)


def filter_catalog(query: str, catalog: list[dict], *, limit: int = 8) -> list[dict]:
    """Filtre en mémoire (même logique que _text_matches)."""
    q = normalize_place_name(query)
    if len(q) < 2:
        return []
    scored: list[tuple[float, dict]] = []
    for entry in catalog:
        text = entry.get('search_text') or _catalog_search_text(entry.get('description', ''))
        if not _text_matches(q, text) and not _text_matches(q, entry.get('description', '')):
            continue
        score = _score_match(q, entry.get('description', ''), entry.get('use_count', 0))
        if entry.get('source') == 'known':
            score += 0.1
        scored.append((score, entry))
    scored.sort(key=lambda x: -x[0])
    return [e for _, e in scored[:limit]]


def _search_static_places(query: str, static_places: list[dict] | None, limit: int = 8) -> list[dict]:
    if not static_places:
        return []
    q = normalize_place_name(query)
    out: list[dict] = []
    for i, sp in enumerate(static_places):
        label = sp.get('label', '')
        if not _text_matches(q, label):
            continue
        out.append({
            'place_id': f'daxi_static_{i}',
            'description': label,
            'lat': sp['lat'],
            'lng': sp['lng'],
            'source': 'static',
            'source_label': 'DAXI',
            'geometry_type': 'point',
        })
        if len(out) >= limit:
            break
    return out


def suggestion_place_search(
    query: str,
    *,
    limit: int = 8,
    static_places: list[dict] | None = None,
    google_fetcher=None,
) -> list[dict]:
    """
    Autocomplete hybride : KnownPlace + statique + Google.
    Les données OSM importées ne sont pas utilisées pour les suggestions.
    """
    known = search_known_places(query, limit=limit)
    static_out = _search_static_places(query, static_places, limit=limit)
    depts = _active_department_bounds()
    if depts:
        known = [p for p in known if p.get('lat') is None or _in_any_dept_bounds(float(p['lat']), float(p['lng']), depts)]
        static_out = [p for p in static_out if p.get('lat') is None or _in_any_dept_bounds(float(p['lat']), float(p['lng']), depts)]
    local = merge_predictions(known, static_out, limit=limit)

    google: list[dict] = []
    if google_fetcher:
        try:
            google = google_fetcher(query) or []
        except Exception as exc:
            logger.warning('[GeoSearch] Google autocomplete failed: %s', exc)

    return merge_predictions(local, google, limit=limit)[:limit]
