"""Cache GeoJSON par département — évite de relire le PBF Haïti à chaque ville."""
from __future__ import annotations

import json
import logging
import shutil
from pathlib import Path
from typing import TYPE_CHECKING

from django.conf import settings

from geo.dept_cities import department_bbox

if TYPE_CHECKING:
    from geo.job_utils import JobWriter

logger = logging.getLogger(__name__)


def _geo_data_dir() -> Path:
    base = Path(getattr(settings, 'GEO_DATA_ROOT', settings.BASE_DIR / 'geo_data'))
    (base / 'cache').mkdir(parents=True, exist_ok=True)
    return base


def dept_geojson_path(dept_slug: str) -> Path:
    return _geo_data_dir() / 'cache' / f'dept_{dept_slug}.geojson'


def _feature_in_bbox(feat: dict, bbox: tuple[float, float, float, float]) -> bool:
    min_lon, min_lat, max_lon, max_lat = bbox
    geom = feat.get('geometry') or {}
    gtype = geom.get('type')
    coords = geom.get('coordinates') or []

    def _pt(lon: float, lat: float) -> bool:
        return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat

    if gtype == 'Point' and len(coords) >= 2:
        return _pt(coords[0], coords[1])
    if gtype == 'LineString':
        for c in coords:
            if len(c) >= 2 and _pt(c[0], c[1]):
                return True
    return False


def filter_geojson_by_bbox(
    source: Path,
    bbox: tuple[float, float, float, float],
    out_path: Path,
    writer: 'JobWriter | None' = None,
) -> int:
    from geo.services.import_progress import stage_progress

    data = json.loads(source.read_text(encoding='utf-8'))
    features = data.get('features') or []
    total = len(features) or 1
    kept: list[dict] = []

    if writer:
        writer.update(
            stage='filter',
            items_done=0,
            items_total=total,
            progress_pct=stage_progress('filter', 0),
            force=True,
        )
        writer.log(f'Filtrage ville depuis cache ({total} entités département)…', force_flush=True)

    for i, feat in enumerate(features, start=1):
        if _feature_in_bbox(feat, bbox):
            kept.append(feat)
        if writer and (i % 2000 == 0 or i == total):
            writer.update(
                items_done=i,
                items_total=total,
                progress_pct=stage_progress('filter', min(99, i / total * 100)),
            )

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(
        json.dumps({'type': 'FeatureCollection', 'features': kept}, ensure_ascii=False),
        encoding='utf-8',
    )
    if writer:
        writer.update(
            items_done=total,
            items_total=total,
            progress_pct=stage_progress('filter', 100),
            force=True,
        )
        writer.log(f'Zone extraite — {len(kept)} entités', force_flush=True)
    return len(kept)


def ensure_dept_geojson(
    dept_slug: str,
    source_pbf: Path,
    writer: 'JobWriter | None' = None,
) -> Path:
    """Construit ou réutilise le GeoJSON département (une lecture PBF par département)."""
    from geo.services.import_progress import estimate_pbf_objects, stage_progress
    from geo.services.pbf_reader import export_pbf_bbox_to_geojson

    cache = dept_geojson_path(dept_slug)
    if cache.exists() and cache.stat().st_size > 1024:
        if writer:
            writer.log(f'Cache département « {dept_slug} » réutilisé', force_flush=True)
            writer.update(
                stage='filter',
                items_done=0,
                items_total=0,
                progress_pct=stage_progress('filter', 100),
                force=True,
            )
        return cache

    bbox = department_bbox(dept_slug)
    if not bbox:
        raise RuntimeError(f'BBox département inconnue : {dept_slug}')

    if writer:
        estimated = estimate_pbf_objects(source_pbf)
        writer.update(
            stage='filter',
            bytes_done=0,
            bytes_total=0,
            items_done=0,
            items_total=estimated,
            progress_pct=stage_progress('filter', 0),
            speed_bps=0,
            force=True,
        )
        writer.log(
            f'Construction cache département « {dept_slug} » (lecture PBF unique, ~{estimated // 1000}k entités)…',
            force_flush=True,
        )

    export_pbf_bbox_to_geojson(source_pbf, bbox, cache, writer=writer, estimated_objects=None)
    return cache


def prepare_zone_geojson_from_cache(
    zone,
    source_pbf: Path,
    bbox: tuple[float, float, float, float],
    geojson_out: Path,
    writer: 'JobWriter',
) -> int:
    """Pipeline app : cache département + filtre ville si besoin."""
    dept_geojson = ensure_dept_geojson(zone.department_slug, source_pbf, writer)

    if zone.city_slug:
        return filter_geojson_by_bbox(dept_geojson, bbox, geojson_out, writer=writer)

    shutil.copyfile(dept_geojson, geojson_out)
    count = len(json.loads(dept_geojson.read_text(encoding='utf-8')).get('features') or [])
    if writer:
        from geo.services.import_progress import stage_progress
        writer.extra['feature_count'] = count
        writer.update(
            items_done=count,
            items_total=count,
            progress_pct=stage_progress('filter', 100),
            force=True,
        )
        writer.log(f'Département entier — {count} entités', force_flush=True)
    return count
