"""Recherche unifiée — délègue à geo.services.search."""
from __future__ import annotations

import logging
import re

import requests
from django.conf import settings
from django.http import JsonResponse
from django.views.decorators.http import require_GET

from geo.services.learning import record_search_hit
from geo.services.search import build_saved_places_catalog, suggestion_place_search
from julmin_taxis.known_places_utils import find_similar_places

logger = logging.getLogger(__name__)

_STATIC_HAITI_PLACES = [
    {'label': 'Cap-Haïtien, Nord, Haïti', 'lat': 19.7596, 'lng': -72.2042},
    {'label': 'Aéroport Hugo Chávez, Cap-Haïtien', 'lat': 19.7330, 'lng': -72.1947},
    {'label': 'Labadee, Cap-Haïtien', 'lat': 19.7870, 'lng': -72.2450},
    {'label': 'Milot, Nord, Haïti', 'lat': 19.6083, 'lng': -72.2172},
    {'label': 'Limonade, Nord, Haïti', 'lat': 19.6700, 'lng': -72.1230},
    {'label': 'Quartier-Morin, Nord, Haïti', 'lat': 19.6970, 'lng': -72.1560},
    {'label': 'Port-au-Prince, Ouest, Haïti', 'lat': 18.5944, 'lng': -72.3074},
    {'label': 'Aéroport Toussaint Louverture, Port-au-Prince', 'lat': 18.5800, 'lng': -72.2925},
    {'label': 'Pétion-Ville, Port-au-Prince', 'lat': 18.5125, 'lng': -72.2850},
    {'label': 'Delmas, Port-au-Prince', 'lat': 18.5447, 'lng': -72.3028},
    {'label': 'Carrefour, Port-au-Prince', 'lat': 18.5342, 'lng': -72.4103},
    {'label': 'Tabarre, Port-au-Prince', 'lat': 18.5833, 'lng': -72.2667},
    {'label': 'Gonaïves, Artibonite, Haïti', 'lat': 19.4456, 'lng': -72.6882},
    {'label': 'Les Cayes, Sud, Haïti', 'lat': 18.2000, 'lng': -73.7500},
    {'label': 'Jacmel, Sud-Est, Haïti', 'lat': 18.2340, 'lng': -72.5350},
    {'label': 'Hinche, Centre, Haïti', 'lat': 19.1500, 'lng': -72.0167},
    {'label': 'Jérémie, Grand\'Anse, Haïti', 'lat': 18.6500, 'lng': -74.1167},
    {'label': 'Fort-Liberté, Nord-Est, Haïti', 'lat': 19.6620, 'lng': -71.8400},
    {'label': 'Ouanaminthe, Nord-Est, Haïti', 'lat': 19.5500, 'lng': -71.7333},
    {'label': 'Saint-Marc, Artibonite, Haïti', 'lat': 19.1080, 'lng': -72.6930},
]


def _api_key() -> str:
    return getattr(settings, 'GOOGLE_MAPS_API_KEY', '') or ''


def _google_autocomplete(query: str) -> list[dict]:
    key = _api_key()
    if not key:
        return []
    try:
        resp = requests.get(
            'https://maps.googleapis.com/maps/api/place/autocomplete/json',
            params={
                'input': query,
                'components': 'country:ht',
                'language': 'fr',
                'location': '19.7580,-72.2018',
                'radius': '45000',
                'strictbounds': 'true',
                'key': key,
            },
            timeout=4,
        )
        data = resp.json()
        if data.get('status') in ('OK', 'ZERO_RESULTS'):
            return [
                {
                    'place_id': p.get('place_id', ''),
                    'description': p.get('description', ''),
                    'source': 'google',
                    'source_label': 'Google',
                }
                for p in data.get('predictions', [])
                if p.get('place_id') and p.get('description')
            ]
    except requests.RequestException as exc:
        logger.warning('[Places] Google autocomplete: %s', exc)
    return []


def _is_google_place_id(place_id: str) -> bool:
    """Vrai place_id Google — jamais un identifiant interne DAXI."""
    if not place_id or place_id.startswith('daxi_'):
        return False
    return bool(re.match(r'^[A-Za-z0-9_-]{10,}$', place_id))


@require_GET
def places_catalog(request):
    """GET /api/places/catalog/ — lieux sauvegardés DAXI (KnownPlace + statique) pour filtrage client."""
    catalog = build_saved_places_catalog(static_places=_STATIC_HAITI_PLACES)
    return JsonResponse({
        'places': catalog,
        'count': len(catalog),
        'version': getattr(settings, 'PLACES_CATALOG_VERSION', '2'),
    })


@require_GET
def places_autocomplete(request):
    """GET /api/places/autocomplete/?q= — lieux sauvegardés + Google (sans OSM)."""
    query = (request.GET.get('q') or request.GET.get('input') or '').strip()
    if len(query) < 2:
        return JsonResponse({'predictions': []})

    predictions = suggestion_place_search(
        query,
        limit=12,
        static_places=_STATIC_HAITI_PLACES,
        google_fetcher=_google_autocomplete,
    )
    return JsonResponse({'predictions': predictions})


@require_GET
def places_similar(request):
    """GET /api/places/similar/?label=ri+9&lat=19.76&lng=-72.20"""
    label = (request.GET.get('label') or '').strip()
    try:
        lat = float(request.GET.get('lat', ''))
        lng = float(request.GET.get('lng', ''))
    except (TypeError, ValueError):
        return JsonResponse({'error': 'lat/lng required'}, status=400)
    if not label:
        return JsonResponse({'candidates': []})
    candidates = find_similar_places(label, lat, lng, min_confidence=0.52)
    return JsonResponse({
        'candidates': [
            {
                'id': c.id,
                'label': c.label,
                'lat': c.lat,
                'lng': c.lng,
                'distance_m': c.distance_m,
                'name_similarity': c.name_similarity,
                'confidence': c.confidence,
                'use_count': c.use_count,
            }
            for c in candidates
        ],
    })


@require_GET
def places_details(request):
    """GET /api/places/details/?place_id=…"""
    place_id = (request.GET.get('place_id') or '').strip()
    if not place_id:
        return JsonResponse({'error': 'place_id required'}, status=400)

    if place_id.startswith('daxi_known_'):
        try:
            from orders.models import KnownPlace
            pk = int(place_id.replace('daxi_known_', ''))
            kp = KnownPlace.objects.get(pk=pk)
            record_search_hit(pk)
            return JsonResponse({
                'place_id': place_id,
                'name': kp.label,
                'formatted_address': kp.label,
                'lat': kp.lat,
                'lng': kp.lng,
                'source': 'known',
                'geometry_type': 'point',
            })
        except (ValueError, KnownPlace.DoesNotExist):
            return JsonResponse({'error': 'NOT_FOUND'}, status=404)

    if place_id.startswith('daxi_road_'):
        try:
            from geo.models import GeoRoad
            pk = int(place_id.replace('daxi_road_', ''))
            road = GeoRoad.objects.select_related('zone').get(pk=pk)
            return JsonResponse({
                'place_id': place_id,
                'name': road.name,
                'formatted_address': f'{road.name}, {road.zone.name}' if road.zone_id else road.name,
                'lat': road.centroid_lat,
                'lng': road.centroid_lng,
                'source': 'osm',
                'geometry_type': 'road',
                'road_type': road.road_type,
                'geometry': road.geometry_geojson,
            })
        except (ValueError, GeoRoad.DoesNotExist):
            return JsonResponse({'error': 'NOT_FOUND'}, status=404)

    if place_id.startswith('daxi_osm_'):
        try:
            from geo.models import GeoPlace
            pk = int(place_id.replace('daxi_osm_', ''))
            gp = GeoPlace.objects.select_related('zone').get(pk=pk)
            return JsonResponse({
                'place_id': place_id,
                'name': gp.name,
                'formatted_address': f'{gp.name}, {gp.zone.name}' if gp.zone_id else gp.name,
                'lat': gp.lat,
                'lng': gp.lng,
                'source': 'osm',
                'geometry_type': 'point',
                'category': gp.category,
            })
        except (ValueError, GeoPlace.DoesNotExist):
            return JsonResponse({'error': 'NOT_FOUND'}, status=404)

    if place_id.startswith('daxi_static_'):
        try:
            idx = int(place_id.replace('daxi_static_', ''))
            sp = _STATIC_HAITI_PLACES[idx]
            return JsonResponse({
                'place_id': place_id,
                'name': sp['label'],
                'formatted_address': sp['label'],
                'lat': sp['lat'],
                'lng': sp['lng'],
                'source': 'static',
                'geometry_type': 'point',
            })
        except (ValueError, IndexError):
            return JsonResponse({'error': 'NOT_FOUND'}, status=404)

    key = _api_key()
    if not key:
        return JsonResponse({'error': 'missing_api_key'}, status=503)

    if not _is_google_place_id(place_id):
        return JsonResponse({'error': 'INVALID_PLACE_ID'}, status=400)

    try:
        resp = requests.get(
            'https://maps.googleapis.com/maps/api/place/details/json',
            params={
                'place_id': place_id,
                'fields': 'geometry,formatted_address,name,place_id',
                'language': 'fr',
                'key': key,
            },
            timeout=8,
        )
        data = resp.json()
    except requests.RequestException as exc:
        logger.warning('[Places] Google details: %s', exc)
        return JsonResponse({'error': 'upstream_failed'}, status=502)

    if data.get('status') != 'OK' or not data.get('result'):
        return JsonResponse({'error': data.get('status', 'NOT_FOUND')}, status=404)

    result = data['result']
    loc = (result.get('geometry') or {}).get('location') or {}
    return JsonResponse({
        'place_id': result.get('place_id', place_id),
        'name': result.get('name', ''),
        'formatted_address': result.get('formatted_address', ''),
        'lat': loc.get('lat'),
        'lng': loc.get('lng'),
        'source': 'google',
        'geometry_type': 'point',
    })
