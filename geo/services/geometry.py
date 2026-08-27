"""Helpers géométrie — PostGIS (prod) ou Shapely (dev SQLite)."""
from __future__ import annotations

import math
from typing import Any

from django.conf import settings


def use_postgis() -> bool:
    return bool(getattr(settings, 'USE_POSTGIS', False))


def linestring_centroid(geojson: dict) -> tuple[float | None, float | None]:
    coords = (geojson or {}).get('coordinates') or []
    if not coords:
        return None, None
    if use_postgis():
        try:
            from django.contrib.gis.geos import GEOSGeometry
            geom = GEOSGeometry(str(geojson), srid=4326)
            c = geom.centroid
            return c.y, c.x
        except Exception:
            pass
    try:
        from shapely.geometry import shape
        geom = shape(geojson)
        c = geom.centroid
        return c.y, c.x
    except Exception:
        pass
    lats = [c[1] for c in coords if len(c) >= 2]
    lngs = [c[0] for c in coords if len(c) >= 2]
    if not lats:
        return None, None
    return sum(lats) / len(lats), sum(lngs) / len(lngs)


def linestring_length_m(geojson: dict) -> float | None:
    if use_postgis():
        try:
            from django.contrib.gis.db.models.functions import Length
            from django.contrib.gis.geos import GEOSGeometry
            geom = GEOSGeometry(str(geojson), srid=4326)
            return geom.length * 111320.0
        except Exception:
            pass
    try:
        from shapely.geometry import shape
        from shapely.ops import transform
        geom = shape(geojson)
        coords = list(geom.coords)
        total = 0.0
        for i in range(1, len(coords)):
            total += haversine_m(coords[i - 1][1], coords[i - 1][0], coords[i][1], coords[i][0])
        return total
    except Exception:
        return None


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def point_near_line_m(lat: float, lng: float, geojson: dict) -> float | None:
    """Distance minimale point → ligne (mètres)."""
    if use_postgis():
        try:
            from django.contrib.gis.db.models.functions import Distance
            from django.contrib.gis.geos import GEOSGeometry, Point
            pt = Point(lng, lat, srid=4326)
            line = GEOSGeometry(str(geojson), srid=4326)
            return pt.distance(line) * 111320.0
        except Exception:
            pass
    try:
        from shapely.geometry import Point, shape
        pt = Point(lng, lat)
        line = shape(geojson)
        return pt.distance(line) * 111320.0
    except Exception:
        return None


def make_linestring_geojson(coordinates: list[list[float]]) -> dict[str, Any]:
    return {'type': 'LineString', 'coordinates': coordinates}


def sync_postgis_geometry(model_instance, geom_field: str = 'geom') -> None:
    """Synchronise geom PostGIS depuis geometry_geojson (si USE_POSTGIS)."""
    if not use_postgis():
        return
    geojson = getattr(model_instance, 'geometry_geojson', None)
    if not geojson or not hasattr(model_instance, geom_field):
        return
    try:
        from django.contrib.gis.geos import GEOSGeometry
        setattr(model_instance, geom_field, GEOSGeometry(str(geojson), srid=4326))
    except Exception:
        pass
