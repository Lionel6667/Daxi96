"""Activation des départements, villes et imports OSM."""
from __future__ import annotations

import threading

from django.utils import timezone

from admin_panel.models import DEPT_DEFAULT_BOUNDS, HAITI_DEPARTMENTS, CoveredDepartment
from geo.dept_cities import cities_for_department, city_bbox, department_bbox
from geo.job_utils import bg_db_setup, save_with_retry
from geo.models import DownloadJob, GeoZone
from geo.services.osm_importer import run_zone_import_pipeline


def ensure_all_departments_seeded() -> None:
    for slug, label in HAITI_DEPARTMENTS:
        bounds = DEPT_DEFAULT_BOUNDS.get(slug, {})
        defaults = {'name': label, 'is_active': slug == 'nord'}
        for key in ('lat_min', 'lat_max', 'lng_min', 'lng_max'):
            if key in bounds:
                defaults[key] = bounds[key]
        CoveredDepartment.objects.get_or_create(slug=slug, defaults=defaults)


def _zone_row(zone: GeoZone | None) -> dict:
    if not zone:
        return {
            'zone_id': None,
            'geo_status': 'none',
            'geo_status_display': 'Non téléchargé',
            'version': '—',
            'place_count': 0,
            'road_count': 0,
            'file_size_mb': 0,
            'last_download_display': '—',
            'active_job_id': None,
        }
    last_job = zone.download_jobs.order_by('-created_at').first()
    return {
        'zone_id': zone.pk,
        'geo_status': zone.status,
        'geo_status_display': zone.get_status_display(),
        'version': zone.version or '—',
        'place_count': zone.place_count,
        'road_count': zone.road_count,
        'file_size_mb': round((zone.file_size_bytes or 0) / (1024 * 1024), 1),
        'last_download_display': (
            timezone.localtime(zone.last_download_at).strftime('%d/%m/%Y %H:%M')
            if zone.last_download_at else '—'
        ),
        'active_job_id': (
            last_job.pk
            if last_job and last_job.status in ('queued', 'running')
            else None
        ),
    }


def department_coverage_rows() -> list[dict]:
    ensure_all_departments_seeded()
    all_zones = GeoZone.objects.select_related('department').all()
    zones_by_key: dict[tuple[str, str], GeoZone] = {}
    for z in all_zones:
        zones_by_key[(z.department_slug, z.city_slug or '')] = z

    rows = []
    for dept in CoveredDepartment.objects.order_by('name'):
        dept_zone = zones_by_key.get((dept.slug, ''))
        city_defs = cities_for_department(dept.slug)
        cities = []
        for cdef in city_defs:
            cz = zones_by_key.get((dept.slug, cdef['slug']))
            row = {
                'slug': cdef['slug'],
                'name': cdef['name'],
                **_zone_row(cz),
            }
            cities.append(row)

        active_job_id = None
        for c in cities:
            if c['active_job_id']:
                active_job_id = c['active_job_id']
        if dept_zone and dept_zone.download_jobs.filter(status__in=('queued', 'running')).exists():
            active_job_id = dept_zone.download_jobs.filter(
                status__in=('queued', 'running'),
            ).order_by('-created_at').first().pk

        dept_data = _zone_row(dept_zone)
        if cities:
            dept_data['place_count'] = sum(c['place_count'] for c in cities) or dept_data['place_count']
            dept_data['road_count'] = sum(c['road_count'] for c in cities) or dept_data['road_count']
            city_statuses = [c['geo_status'] for c in cities if c['geo_status'] != 'none']
            if dept_data['geo_status'] in ('none', 'not_downloaded') and city_statuses:
                if any(s in ('downloading', 'processing') for s in city_statuses):
                    dept_data['geo_status'] = 'downloading'
                    dept_data['geo_status_display'] = 'Téléchargement en cours'
                elif all(s == 'available' for s in city_statuses):
                    dept_data['geo_status'] = 'available'
                    dept_data['geo_status_display'] = 'Disponible'
                elif any(s == 'available' for s in city_statuses):
                    dept_data['geo_status'] = 'update_needed'
                    dept_data['geo_status_display'] = 'Partiellement disponible'

        city_names = [c['name'] for c in city_defs]
        cities_hint = f'{len(city_defs)} communes'

        rows.append({
            'slug': dept.slug,
            'name': dept.name,
            'is_active': dept.is_active,
            'cities': cities,
            'city_count': len(city_defs),
            'cities_hint': cities_hint,
            **dept_data,
            'active_job_id': active_job_id,
        })
    return rows


def cities_json(dept_slug: str) -> list[dict]:
    known = cities_for_department(dept_slug)
    zones = {
        z.city_slug: z
        for z in GeoZone.objects.filter(department_slug=dept_slug).exclude(city_slug='')
    }
    out = []
    for cdef in known:
        z = zones.get(cdef['slug'])
        out.append({
            'slug': cdef['slug'],
            'name': cdef['name'],
            **_zone_row(z),
        })
    return out


def _cancel_department_jobs(dept_slug: str) -> int:
    jobs = DownloadJob.objects.filter(
        zone__department_slug=dept_slug,
        status__in=('queued', 'running'),
    )
    n = jobs.count()
    now = timezone.now()
    for job in jobs:
        job.status = 'cancelled'
        job.finished_at = now
        job.error_message = 'Annulé par l\'administrateur'
        save_with_retry(job, update_fields=['status', 'finished_at', 'error_message', 'updated_at'])
    GeoZone.objects.filter(department_slug=dept_slug, status='downloading').update(status='error')
    return n


def cancel_job(job_id: int) -> dict:
    try:
        job = DownloadJob.objects.select_related('zone').get(pk=int(job_id))
    except (DownloadJob.DoesNotExist, ValueError):
        return {'error': 'Job introuvable'}
    if job.status not in ('queued', 'running'):
        return {'error': 'Ce job n\'est plus actif'}
    job.status = 'cancelled'
    job.finished_at = timezone.now()
    job.error_message = 'Annulé par l\'administrateur'
    save_with_retry(job)
    job.zone.status = 'error'
    save_with_retry(job.zone, update_fields=['status'])
    return {'ok': True, 'job_id': job.pk}


def _start_import_thread(zone: GeoZone) -> DownloadJob:
    if DownloadJob.objects.filter(zone=zone, status__in=('queued', 'running')).exists():
        return DownloadJob.objects.filter(
            zone=zone, status__in=('queued', 'running'),
        ).order_by('-created_at').first()

    zone.status = 'downloading'
    zone.save(update_fields=['status', 'updated_at'])
    job = DownloadJob.objects.create(
        zone=zone, status='queued', stage='download', files_total=6,
    )

    def _run():
        bg_db_setup()
        try:
            run_zone_import_pipeline(zone.pk, job.pk)
        except Exception:
            pass

    threading.Thread(target=_run, daemon=True).start()
    return job


def _ensure_zone(dept: CoveredDepartment, *, city_slug: str = '', city_name: str = '') -> GeoZone:
    if city_slug:
        zone, _ = GeoZone.objects.get_or_create(
            department_slug=dept.slug,
            city_slug=city_slug,
            defaults={
                'name': city_name or city_slug,
                'department': dept,
                'scope': 'city',
                'status': 'not_downloaded',
            },
        )
        if zone.name != city_name and city_name:
            zone.name = city_name
            zone.scope = 'city'
            zone.department = dept
            zone.save(update_fields=['name', 'scope', 'department', 'updated_at'])
        return zone

    zone, _ = GeoZone.objects.get_or_create(
        department_slug=dept.slug,
        city_slug='',
        defaults={
            'name': dept.name,
            'department': dept,
            'scope': 'department',
            'status': 'not_downloaded',
        },
    )
    updates = {}
    if zone.name != dept.name:
        updates['name'] = dept.name
    if zone.department_id != dept.pk:
        updates['department'] = dept
    if zone.scope != 'department':
        updates['scope'] = 'department'
    if updates:
        updates['updated_at'] = timezone.now()
        for k, v in updates.items():
            setattr(zone, k, v)
        zone.save(update_fields=list(updates.keys()))
    return zone


def start_downloads(
    dept_slug: str,
    *,
    all_department: bool = False,
    city_slugs: list[str] | None = None,
    activate: bool = True,
) -> dict:
    """Lance un ou plusieurs imports (département entier et/ou villes choisies)."""
    ensure_all_departments_seeded()
    try:
        dept = CoveredDepartment.objects.get(slug=dept_slug)
    except CoveredDepartment.DoesNotExist:
        return {'error': 'Département introuvable'}

    if activate:
        bounds = DEPT_DEFAULT_BOUNDS.get(dept_slug, {})
        dept.is_active = True
        for key in ('lat_min', 'lat_max', 'lng_min', 'lng_max'):
            if bounds.get(key) is not None and getattr(dept, key) in (None, 0):
                setattr(dept, key, bounds[key])
        dept.save()

    city_slugs = [s for s in (city_slugs or []) if s]
    if not all_department and not city_slugs:
        return {'error': 'Choisissez au moins une ville ou tout le département'}

    known = {c['slug']: c['name'] for c in cities_for_department(dept_slug)}
    jobs = []
    zones_started = []

    if all_department:
        zone = _ensure_zone(dept)
        job = _start_import_thread(zone)
        jobs.append({'zone_id': zone.pk, 'zone_name': zone.name, 'job_id': job.pk})
        zones_started.append(zone.name)

    for cslug in city_slugs:
        if cslug not in known:
            continue
        zone = _ensure_zone(dept, city_slug=cslug, city_name=known[cslug])
        job = _start_import_thread(zone)
        jobs.append({'zone_id': zone.pk, 'zone_name': zone.name, 'job_id': job.pk})
        zones_started.append(zone.name)

    if not jobs:
        return {'error': 'Aucune zone valide à télécharger'}

    return {
        'ok': True,
        'slug': dept_slug,
        'is_active': dept.is_active,
        'jobs': jobs,
        'job_id': jobs[0]['job_id'],
        'zone_id': jobs[0]['zone_id'],
        'zones_started': zones_started,
    }


def deactivate_department(slug: str) -> dict:
    try:
        dept = CoveredDepartment.objects.get(slug=slug)
    except CoveredDepartment.DoesNotExist:
        return {'error': 'Département introuvable'}
    cancelled = _cancel_department_jobs(slug)
    dept.is_active = False
    dept.save(update_fields=['is_active'])
    return {'ok': True, 'slug': slug, 'is_active': False, 'cancelled_jobs': cancelled}


def activate_department(slug: str, *, auto_download: bool = True) -> dict:
    if not auto_download:
        ensure_all_departments_seeded()
        dept = CoveredDepartment.objects.get(slug=slug)
        dept.is_active = True
        dept.save(update_fields=['is_active'])
        return {'ok': True, 'slug': slug, 'is_active': True}
    return start_downloads(slug, all_department=True, activate=True)


def download_department_osm(slug: str) -> dict:
    return start_downloads(slug, all_department=True, activate=True)
