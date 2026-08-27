"""
Import OSM via Geofabrik Haiti PBF + osmium (pas Overpass).

Pipeline :
  Geofabrik haiti-and-domrep-latest.osm.pbf (~84 Mo)
    → osmium extract (bbox département)
    → osmium export geojsonseq / pyosmium
    → nettoyage → normalisation → validation → publication
"""
from __future__ import annotations

import json
import logging
import shutil
import subprocess
from pathlib import Path
from typing import Iterator

from django.conf import settings
from django.utils import timezone

from geo.models import GeoPlace, GeoRoad, GeoZone, MapResource, PublicationStatus
from geo.services.import_progress import (
    PIPELINE_FILES_TOTAL,
    estimate_pbf_objects,
    stage_progress,
)
from geo.services.geometry import linestring_centroid, linestring_length_m, make_linestring_geojson
from geo.services.osm_cleaner import (
    clean_osm_place,
    clean_osm_road,
    dedupe_key_osm,
    normalize_record_name,
)

logger = logging.getLogger(__name__)

GEOFABRIK_HAITI_URL = 'https://download.geofabrik.de/central-america/haiti-and-domrep-latest.osm.pbf'
MIN_PBF_BYTES = 40_000_000  

PLACE_AMENITY_MAP = {
    'school': 'school', 'university': 'school', 'college': 'school',
    'hospital': 'hospital', 'clinic': 'hospital', 'doctors': 'hospital',
    'hotel': 'hotel', 'motel': 'hotel', 'guest_house': 'hotel',
    'restaurant': 'restaurant', 'cafe': 'restaurant', 'fast_food': 'restaurant',
    'fuel': 'fuel', 'pharmacy': 'shop', 'supermarket': 'shop', 'marketplace': 'shop',
    'place_of_worship': 'landmark', 'bank': 'shop', 'atm': 'shop',
}

PLACE_PLACE_MAP = {
    'suburb': 'quarter', 'neighbourhood': 'quarter', 'quarter': 'quarter',
    'village': 'village', 'town': 'village', 'hamlet': 'village',
    'city': 'landmark',
}


def _geo_data_dir() -> Path:
    base = Path(getattr(settings, 'GEO_DATA_ROOT', settings.BASE_DIR / 'geo_data'))
    base.mkdir(parents=True, exist_ok=True)
    return base


def _dept_bbox(department_slug: str) -> tuple[float, float, float, float] | None:
    from admin_panel.models import DEPT_DEFAULT_BOUNDS
    bounds = DEPT_DEFAULT_BOUNDS.get(department_slug)
    if not bounds:
        return None
    return (
        bounds['lng_min'], bounds['lat_min'],
        bounds['lng_max'], bounds['lat_max'],
    )


def _run_cmd(cmd: list[str], writer: 'JobWriter | None' = None, timeout: int = 900) -> None:
    if writer:
        writer.log(' '.join(cmd[:6]) + ('...' if len(cmd) > 6 else ''))
    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired as exc:
        raise RuntimeError(f'Commande osmium expirée ({timeout}s)') from exc
    if result.returncode != 0:
        err = (result.stderr or result.stdout or 'command failed')[:2000]
        raise RuntimeError(err)


def _remove_invalid_pbf(path: Path) -> None:
    if path.exists() and path.stat().st_size < MIN_PBF_BYTES:
        try:
            path.unlink()
        except OSError:
            pass


def download_geofabrik_haiti(writer: 'JobWriter') -> Path:
    """Télécharge le PBF Haïti entier (une seule fois, réutilisable)."""
    from geo.job_utils import JobWriter

    dest = _geo_data_dir() / 'haiti-domrep-latest.osm.pbf'
    _remove_invalid_pbf(dest)

    if dest.exists() and dest.stat().st_size >= MIN_PBF_BYTES:
        size = dest.stat().st_size
        writer.log(f'PBF Haïti déjà présent ({size // 1_000_000} Mo)')
        writer.update(
            stage='download',
            bytes_done=size,
            bytes_total=size,
            progress_pct=stage_progress('download', 100),
            files_done=1,
            files_total=PIPELINE_FILES_TOTAL,
            force=True,
        )
        return dest

    writer.update(stage='download', status='running', files_total=PIPELINE_FILES_TOTAL, force=True)
    writer.log('Téléchargement Geofabrik Haïti + RD PBF (~84 Mo)…')

    import time
    import requests

    tmp = dest.with_suffix('.pbf.part')
    if tmp.exists():
        tmp.unlink(missing_ok=True)

    headers = {
        'User-Agent': 'DAXI-Geo/1.0 (+https://daxi.ht; contact@daxi.com)',
        'Accept': '*/*',
    }
    started = time.time()
    downloaded = 0

    with requests.get(GEOFABRIK_HAITI_URL, headers=headers, stream=True, timeout=120) as resp:
        resp.raise_for_status()
        final_url = str(resp.url or '')
        ctype = (resp.headers.get('Content-Type') or '').lower()
        if '.osm.pbf' not in final_url and 'octet-stream' not in ctype and 'pbf' not in ctype:
            raise RuntimeError(
                'Réponse Geofabrik invalide (page HTML au lieu du fichier PBF). '
                'Réessayez dans quelques minutes.'
            )
        total = int(resp.headers.get('Content-Length') or 0)
        writer.update(bytes_total=total or None, files_done=0, files_total=PIPELINE_FILES_TOTAL)
        with open(tmp, 'wb') as out:
            for chunk in resp.iter_content(chunk_size=1024 * 256):
                if not chunk:
                    continue
                out.write(chunk)
                downloaded += len(chunk)
                elapsed = max(time.time() - started, 0.1)
                fields = {
                    'bytes_done': downloaded,
                    'speed_bps': downloaded / elapsed,
                    'files_done': 1,
                }
                if total:
                    fields['progress_pct'] = stage_progress('download', min(99, (downloaded / total) * 100))
                    fields['eta_seconds'] = int((total - downloaded) / fields['speed_bps']) if fields['speed_bps'] else None
                writer.update(**fields)

    final_size = tmp.stat().st_size
    if final_size < MIN_PBF_BYTES:
        tmp.unlink(missing_ok=True)
        raise RuntimeError(
            f'Fichier PBF invalide ({final_size // 1024} Ko). '
            'Vérifiez la connexion internet ou réessayez plus tard.'
        )

    tmp.replace(dest)
    writer.update(
        bytes_done=final_size,
        bytes_total=final_size,
        progress_pct=stage_progress('download', 100),
        files_done=1,
        force=True,
    )
    writer.log(f'Téléchargement terminé — {final_size // 1_000_000} Mo', force_flush=True)

    save_with_retry = __import__('geo.job_utils', fromlist=['save_with_retry']).save_with_retry
    MapResource.objects.update_or_create(
        zone=writer.job.zone,
        resource_type='osm_pbf',
        defaults={
            'file_path': str(dest),
            'size_bytes': final_size,
            'status': 'ready',
            'version': timezone.now().strftime('%Y.%m'),
        },
    )
    return dest


def _osmium_cli() -> str | None:
    """Binaire osmium-tool — désactivé par défaut (pyosmium pip est plus fiable sur Windows)."""
    if not getattr(settings, 'OSMIUM_USE_CLI', False):
        return None
    configured = getattr(settings, 'OSMIUM_BINARY', '') or ''
    if configured and Path(configured).exists():
        return configured
    return shutil.which('osmium')


def _zone_bbox(zone: GeoZone) -> tuple[float, float, float, float] | None:
    from geo.dept_cities import city_bbox, department_bbox
    if zone.city_slug:
        bb = city_bbox(zone.department_slug, zone.city_slug)
        if bb:
            return bb
    return department_bbox(zone.department_slug)


def filter_pbf_by_bbox(source_pbf: Path, bbox: tuple[float, float, float, float], out_path: Path, writer: 'JobWriter | None' = None) -> Path:
    """Filtre le PBF avec osmium extract (CLI requis)."""
    cli = _osmium_cli()
    if not cli:
        raise RuntimeError('osmium CLI introuvable')
    _run_cmd([
        cli, 'extract',
        '--bbox', f'{bbox[0]},{bbox[1]},{bbox[2]},{bbox[3]}',
        str(source_pbf),
        '-o', str(out_path),
        '--overwrite',
    ], writer)
    return out_path


def export_geojson_from_pbf(pbf_path: Path, out_geojson: Path, writer: 'JobWriter | None' = None) -> Path:
    cli = _osmium_cli()
    if not cli:
        raise RuntimeError('osmium CLI introuvable')
    _run_cmd([cli, 'export', str(pbf_path), '-o', str(out_geojson), '--overwrite'], writer)
    return out_geojson


def prepare_zone_geojson(
    source_pbf: Path,
    bbox: tuple[float, float, float, float],
    geojson_out: Path,
    writer: 'JobWriter',
    zone: GeoZone,
) -> None:
    """Prépare GeoJSON zone — cache département (app mobile) + filtre ville."""
    from geo.services.dept_cache import prepare_zone_geojson_from_cache

    writer.log(f'Préparation données app — {zone.name}…', force_flush=True)
    feature_count = prepare_zone_geojson_from_cache(zone, source_pbf, bbox, geojson_out, writer)
    writer.extra['feature_count'] = feature_count
    writer.update(stage='import', files_done=2, force=True)
    writer.log(f'GeoJSON prêt — {feature_count} entités', force_flush=True)


def _iter_osm_features(geojson_path: Path) -> Iterator[dict]:
    """Lit un GeoJSON FeatureCollection ou geojsonseq."""
    text = geojson_path.read_text(encoding='utf-8', errors='replace').strip()
    if text.startswith('{'):
        data = json.loads(text)
        for feat in data.get('features', []):
            yield feat
        return
    for line in text.splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


def _feature_coords(feat: dict) -> tuple[float, float] | None:
    geom = feat.get('geometry') or {}
    gtype = geom.get('type')
    coords = geom.get('coordinates')
    if gtype == 'Point' and coords and len(coords) >= 2:
        return coords[1], coords[0]
    if gtype in ('Polygon', 'MultiPolygon'):
        try:
            rings = coords[0] if gtype == 'Polygon' else coords[0][0]
            lats = [c[1] for c in rings]
            lngs = [c[0] for c in rings]
            return sum(lats) / len(lats), sum(lngs) / len(lngs)
        except (IndexError, TypeError):
            return None
    if gtype == 'LineString' and coords:
        lats = [c[1] for c in coords if len(c) >= 2]
        lngs = [c[0] for c in coords if len(c) >= 2]
        if lats:
            return sum(lats) / len(lats), sum(lngs) / len(lngs)
    return None


BATCH_SIZE = 300


def _parse_osm_id(raw) -> int | None:
    """Convertit @id pyosmium (n123, w456) ou entier en int."""
    if raw is None:
        return None
    if isinstance(raw, int):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    if s[0] in 'nwrNWR' and len(s) > 1:
        s = s[1:]
    try:
        return int(s)
    except ValueError:
        return None


def _flush_road_batch(batch: list[GeoRoad]) -> int:
    if not batch:
        return 0
    GeoRoad.objects.bulk_create(batch, batch_size=BATCH_SIZE)
    return len(batch)


def _flush_place_batch(batch: list[GeoPlace]) -> int:
    if not batch:
        return 0
    GeoPlace.objects.bulk_create(batch, batch_size=BATCH_SIZE)
    return len(batch)


def import_features_to_zone(zone: GeoZone, geojson_path: Path, writer: 'JobWriter') -> dict:
    """Import + nettoyage + normalisation (statut CLEANED)."""
    writer.update(stage='import', files_done=2, force=True)
    writer.log('Import des entités OSM…', force_flush=True)

    GeoPlace.objects.filter(zone=zone, source='osm').delete()
    GeoRoad.objects.filter(zone=zone).delete()

    features = list(_iter_osm_features(geojson_path))
    total_features = len(features) or writer.extra.get('feature_count') or 1
    writer.extra['feature_count'] = total_features
    writer.update(bytes_done=0, bytes_total=total_features, items_done=0, items_total=total_features, progress_pct=stage_progress('import', 0), force=True)

    seen_places: set[str] = set()
    seen_roads: set[str] = set()
    stats = {'places': 0, 'roads': 0, 'rejected': 0}
    road_batch: list[GeoRoad] = []
    place_batch: list[GeoPlace] = []
    processed = 0

    def _tick_import_progress() -> None:
        if processed % 500 == 0 or processed == total_features:
            writer.update(
                items_done=processed,
                items_total=total_features,
                progress_pct=stage_progress('import', min(99, processed / total_features * 100)),
            )
        if processed % 2000 == 0:
            writer.log(f'… {processed}/{total_features} entités analysées')

    for feat in features:
        processed += 1
        props = feat.get('properties') or {}
        tags = {k: v for k, v in props.items() if not k.startswith('@')}
        geom = feat.get('geometry') or {}
        gtype = geom.get('type')

        if gtype == 'LineString' and tags.get('highway'):
            ok, name, road_type, reason = clean_osm_road(tags)
            if not ok:
                stats['rejected'] += 1
                continue
            norm = normalize_record_name(name)
            coords = geom.get('coordinates') or []
            if len(coords) < 2:
                continue
            clat, clng = linestring_centroid(geom)
            if clat is None:
                continue
            osm_id = _parse_osm_id(props.get('@id') or props.get('osm_id'))
            key = dedupe_key_osm(osm_id, norm, clat, clng)
            if key in seen_roads:
                continue
            seen_roads.add(key)
            length_m = linestring_length_m(geom)
            road_batch.append(GeoRoad(
                zone=zone,
                osm_id=osm_id or None,
                normalized_name=norm,
                name=name,
                road_type=road_type,
                geometry_geojson=make_linestring_geojson(coords),
                centroid_lat=clat,
                centroid_lng=clng,
                length_m=length_m,
                publication_status=PublicationStatus.CLEANED,
                raw_tags=tags,
            ))
            if len(road_batch) >= BATCH_SIZE:
                stats['roads'] += _flush_road_batch(road_batch)
                road_batch.clear()
            _tick_import_progress()
            continue

        if gtype != 'Point':
            coords = _feature_coords(feat)
            if not coords:
                continue
            lat, lng = coords
        else:
            coords = geom.get('coordinates') or []
            if len(coords) < 2:
                continue
            lng, lat = coords[0], coords[1]

        category = 'other'
        if tags.get('amenity'):
            category = PLACE_AMENITY_MAP.get(tags['amenity'], 'other')
        elif tags.get('place'):
            category = PLACE_PLACE_MAP.get(tags['place'], 'other')
        elif tags.get('shop'):
            category = 'shop'
        else:
            if not tags.get('name') and not tags.get('name:fr'):
                continue

        ok, name, reason = clean_osm_place(tags)
        if not ok:
            stats['rejected'] += 1
            continue
        norm = normalize_record_name(name)
        osm_id = _parse_osm_id(props.get('@id') or props.get('osm_id'))
        key = dedupe_key_osm(osm_id, norm, lat, lng)
        if key in seen_places:
            continue
        seen_places.add(key)
        place_batch.append(GeoPlace(
            zone=zone,
            osm_id=osm_id or None,
            normalized_name=norm,
            name=name,
            category=category,
            lat=lat,
            lng=lng,
            publication_status=PublicationStatus.CLEANED,
            raw_tags=tags,
        ))
        if len(place_batch) >= BATCH_SIZE:
            stats['places'] += _flush_place_batch(place_batch)
            place_batch.clear()

        _tick_import_progress()

    stats['roads'] += _flush_road_batch(road_batch)
    stats['places'] += _flush_place_batch(place_batch)

    writer.log(
        f'Import : {stats["places"]} lieux, {stats["roads"]} routes, {stats["rejected"]} rejetés',
        force_flush=True,
    )
    writer.update(stage='clean', files_done=3, progress_pct=stage_progress('import', 100), force=True)
    return stats


def validate_zone_records(zone: GeoZone, writer: 'JobWriter') -> None:
    """Validation DAXI : passe CLEANED → VALIDATED."""
    writer.update(stage='validate', files_done=4, progress_pct=stage_progress('validate', 0), force=True)
    writer.log('Validation DAXI…')
    GeoPlace.objects.filter(
        zone=zone, publication_status=PublicationStatus.CLEANED,
    ).update(publication_status=PublicationStatus.VALIDATED)
    GeoRoad.objects.filter(
        zone=zone, publication_status=PublicationStatus.CLEANED,
    ).update(publication_status=PublicationStatus.VALIDATED)
    writer.log('Validation terminée', force_flush=True)
    writer.update(progress_pct=stage_progress('validate', 100), files_done=5, force=True)


def publish_zone_records(zone: GeoZone, writer: 'JobWriter') -> None:
    """Publication : VALIDATED → PUBLISHED."""
    from geo.job_utils import save_with_retry

    writer.update(stage='publish', files_done=5, progress_pct=stage_progress('publish', 0), force=True)
    writer.log('Publication des données…')
    place_n = GeoPlace.objects.filter(
        zone=zone, publication_status=PublicationStatus.VALIDATED,
    ).update(publication_status=PublicationStatus.PUBLISHED)
    road_n = GeoRoad.objects.filter(
        zone=zone, publication_status=PublicationStatus.VALIDATED,
    ).update(publication_status=PublicationStatus.PUBLISHED)
    zone.place_count = GeoPlace.objects.filter(zone=zone, publication_status=PublicationStatus.PUBLISHED).count()
    zone.road_count = GeoRoad.objects.filter(zone=zone, publication_status=PublicationStatus.PUBLISHED).count()
    zone.status = 'available'
    zone.version = timezone.now().strftime('%Y.%m')
    zone.last_download_at = timezone.now()
    save_with_retry(zone)
    writer.log(f'Publié : {place_n} lieux, {road_n} routes', force_flush=True)
    writer.update(
        progress_pct=100,
        status='completed',
        files_done=PIPELINE_FILES_TOTAL,
        finished_at=timezone.now(),
        force=True,
    )
    writer.flush()


def run_zone_import_pipeline(zone_id: int, job_id: int) -> None:
    """Pipeline complet pour une zone (appelé par management command ou thread admin)."""
    from geo.job_utils import JobWriter, save_with_retry

    zone = GeoZone.objects.get(pk=zone_id)
    writer = JobWriter(job_id)
    writer.update(status='running', started_at=timezone.now(), force=True)

    try:
        bbox = _zone_bbox(zone)
        if not bbox:
            raise RuntimeError(f'BBox inconnue pour {zone.name}')

        haiti_pbf = download_geofabrik_haiti(writer)

        writer.update(stage='filter', files_done=1, files_total=PIPELINE_FILES_TOTAL, force=True)
        geojson_out = _geo_data_dir() / f'zone_{zone.pk}_{zone.city_slug or "dept"}.geojson'
        prepare_zone_geojson(haiti_pbf, bbox, geojson_out, writer, zone)

        writer.update(stage='clean', files_done=3, force=True)
        import_features_to_zone(zone, geojson_out, writer)
        validate_zone_records(zone, writer)
        publish_zone_records(zone, writer)

        zone.file_size_bytes = sum(
            r.size_bytes for r in zone.resources.filter(status='ready')
        )
        save_with_retry(zone, update_fields=['file_size_bytes'])

    except Exception as exc:
        logger.exception('OSM import failed zone=%s', zone_id)
        writer.reload()
        writer.log(str(exc), level='error', force_flush=True)
        writer.update(
            status='failed',
            error_message=str(exc)[:2000],
            finished_at=timezone.now(),
            force=True,
        )
        writer.flush()
        zone.status = 'error'
        save_with_retry(zone, update_fields=['status'])
        raise
