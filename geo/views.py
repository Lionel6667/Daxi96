"""API publique / admin — cartes, tuiles, configuration MapLibre."""
from __future__ import annotations

import logging
import sqlite3
from pathlib import Path

from django.conf import settings
from django.http import FileResponse, HttpResponse, JsonResponse
from django.views.decorators.http import require_GET

from geo.models import GeoZone, MapResource, PublicationStatus

logger = logging.getLogger(__name__)

OPENFREEMAP_STYLE = 'https://tiles.openfreemap.org/styles/liberty'


def _human_bytes(n: int) -> str:
    if n < 1024:
        return f'{n} B'
    if n < 1024 ** 2:
        return f'{n / 1024:.1f} KB'
    if n < 1024 ** 3:
        return f'{n / (1024 ** 2):.1f} MB'
    return f'{n / (1024 ** 3):.2f} GB'


@require_GET
def geo_map_config(request):
    """
    GET /api/geo/map-config/
    Configuration cartes côté client : MapLibre + tuiles locales si disponibles.
    """
    zones = GeoZone.objects.filter(status='available').order_by('name')
    mbtiles_resources = MapResource.objects.filter(
        resource_type='mbtiles', status='ready',
    ).select_related('zone')

    tile_templates = []
    for res in mbtiles_resources:
        if res.file_path and Path(res.file_path).exists():
            tile_templates.append({
                'zone_id': res.zone_id,
                'zone_name': res.zone.name,
                'url': f'/api/geo/tiles/{res.zone_id}/{{z}}/{{x}}/{{y}}.pbf',
            })

    use_local = len(tile_templates) > 0
    return JsonResponse({
        'use_maplibre': True,
        'prefer_local_tiles': use_local,
        'style_url': OPENFREEMAP_STYLE,
        'local_tile_templates': tile_templates,
        'zones': [
            {
                'id': z.pk,
                'name': z.name,
                'department_slug': z.department_slug,
                'place_count': z.place_count,
                'road_count': z.road_count,
            }
            for z in zones
        ],
        'search_priority': ['daxi', 'osm', 'google'],
    })


@require_GET
def geo_mbtiles_tile(request, zone_id, z, x, y):
    """Serve une tuile vectorielle depuis un fichier MBTiles local."""
    ext = request.path.rsplit('.', 1)[-1].lower()
    fmt = 'pbf' if ext in ('pbf', 'mvt') else 'png'
    try:
        res = MapResource.objects.get(
            zone_id=int(zone_id),
            resource_type='mbtiles',
            status='ready',
        )
    except MapResource.DoesNotExist:
        return HttpResponse(status=404)

    path = Path(res.file_path)
    if not path.exists():
        return HttpResponse(status=404)

    zi, xi, yi = int(z), int(x), int(y)
    tms_y = (1 << zi) - 1 - yi

    try:
        conn = sqlite3.connect(f'file:{path}?mode=ro', uri=True)
        cur = conn.execute(
            'SELECT tile_data FROM tiles WHERE zoom_level=? AND tile_column=? AND tile_row=?',
            (zi, xi, tms_y),
        )
        row = cur.fetchone()
        conn.close()
    except sqlite3.Error as exc:
        logger.warning('[MBTiles] %s', exc)
        return HttpResponse(status=500)

    if not row:
        return HttpResponse(status=204)

    content_type = 'application/vnd.mapbox-vector-tile' if fmt == 'pbf' else 'image/png'
    resp = HttpResponse(row[0], content_type=content_type)
    resp['Cache-Control'] = 'public, max-age=86400'
    return resp


@require_GET
def geo_stats(request):
    """Statistiques globales base géographique."""
    from geo.models import GeoPlace, GeoRoad
    return JsonResponse({
        'zones': GeoZone.objects.count(),
        'zones_available': GeoZone.objects.filter(status='available').count(),
        'places_published': GeoPlace.objects.filter(publication_status=PublicationStatus.PUBLISHED).count(),
        'roads_published': GeoRoad.objects.filter(publication_status=PublicationStatus.PUBLISHED).count(),
        'use_postgis': bool(getattr(settings, 'USE_POSTGIS', False)),
    })
