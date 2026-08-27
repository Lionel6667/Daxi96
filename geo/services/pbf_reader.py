"""Lecture PBF OSM via pyosmium (pip install osmium) — sans binaire osmium-tool."""
from __future__ import annotations

import json
import logging
import time
from pathlib import Path
from typing import TYPE_CHECKING

import osmium
from osmium.geom import GeoJSONFactory

if TYPE_CHECKING:
    from geo.job_utils import JobWriter

logger = logging.getLogger(__name__)


def _in_bbox(lon: float, lat: float, bbox: tuple[float, float, float, float]) -> bool:
    min_lon, min_lat, max_lon, max_lat = bbox
    return min_lon <= lon <= max_lon and min_lat <= lat <= max_lat


def _way_intersects_bbox(geom: dict, bbox: tuple[float, float, float, float]) -> bool:
    coords = geom.get('coordinates') or []
    for c in coords:
        if len(c) >= 2 and _in_bbox(c[0], c[1], bbox):
            return True
    return False


def _report_read_progress(
    writer: 'JobWriter | None',
    processed: int,
    estimate_state: list[int],
    *,
    started: float,
    last_report: list[float],
) -> None:
    if not writer:
        return
    now = time.time()
    if processed % 50000 != 0 and (now - last_report[0]) < 2.0:
        return
    last_report[0] = now

    estimated = estimate_state[0]
    if processed >= estimated * 0.95:
        estimate_state[0] = max(estimated, int(processed * 1.15) + 100_000)

    from geo.services.import_progress import stage_progress

    estimated = estimate_state[0]
    local_pct = min(98.0, (processed / max(estimated, 1)) * 100)
    elapsed = max(now - started, 0.1)
    speed = processed / elapsed
    remaining = int((estimated - processed) / speed) if speed > 0 and processed < estimated else None

    writer.log(f'… lecture PBF ({processed // 1000}k / ~{estimated // 1000}k entités)')
    writer.update(
        stage='filter',
        items_done=processed,
        items_total=estimated,
        progress_pct=stage_progress('filter', local_pct),
        speed_bps=speed,
        eta_seconds=remaining,
        force=True,
    )


def export_pbf_bbox_to_geojson(
    source_pbf: Path,
    bbox: tuple[float, float, float, float],
    out_geojson: Path,
    writer: 'JobWriter | None' = None,
    estimated_objects: int | None = None,
) -> int:
    """Exporte lieux + routes d'une bbox en GeoJSON FeatureCollection."""
    from geo.services.import_progress import estimate_pbf_objects, stage_progress

    factory = GeoJSONFactory()
    features: list[dict] = []
    processed = 0
    estimate_state = [estimated_objects or estimate_pbf_objects(source_pbf)]
    started = time.time()
    last_report = [0.0]

    class Exporter(osmium.SimpleHandler):
        def node(self, n):
            nonlocal processed
            processed += 1
            _report_read_progress(writer, processed, estimate_state, started=started, last_report=last_report)
            if not n.tags:
                return
            if not _in_bbox(n.location.lon, n.location.lat, bbox):
                return
            props = {tag.k: tag.v for tag in n.tags}
            props['@id'] = f'n{n.id}'
            features.append({
                'type': 'Feature',
                'geometry': {'type': 'Point', 'coordinates': [n.location.lon, n.location.lat]},
                'properties': props,
            })

        def way(self, w):
            nonlocal processed
            processed += 1
            _report_read_progress(writer, processed, estimate_state, started=started, last_report=last_report)
            tags = {tag.k: tag.v for tag in w.tags}
            if not tags.get('highway') and not tags.get('amenity') and not tags.get('place'):
                if not tags.get('name') and not tags.get('name:fr'):
                    return
            try:
                geom = json.loads(factory.create_linestring(w))
            except Exception:
                return
            if not _way_intersects_bbox(geom, bbox):
                return
            tags['@id'] = f'w{w.id}'
            features.append({
                'type': 'Feature',
                'geometry': geom,
                'properties': tags,
            })

    if writer:
        writer.log(
            f'Lecture PBF (~{estimate_state[0] // 1000}k entités estimées, 3-8 min)…',
            force_flush=True,
        )
    Exporter().apply_file(str(source_pbf), locations=True)

    final_total = max(processed, estimate_state[0])
    if writer:
        writer.update(
            items_done=processed,
            items_total=final_total,
            progress_pct=stage_progress('filter', 100),
            force=True,
        )
        writer.log(
            f'Lecture PBF terminée — {processed // 1000}k parcourues, {len(features)} extraites',
            force_flush=True,
        )

    out_geojson.parent.mkdir(parents=True, exist_ok=True)
    out_geojson.write_text(
        json.dumps({'type': 'FeatureCollection', 'features': features}, ensure_ascii=False),
        encoding='utf-8',
    )
    logger.info('pyosmium export: %s features → %s', len(features), out_geojson)
    return len(features)
