"""Vues HTMX admin — gestion des zones et imports cartographiques."""
from __future__ import annotations

import json

from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.shortcuts import render
from django.utils import timezone
from django.views.decorators.http import require_GET, require_POST

from admin_panel.models import CoveredDepartment
from geo.models import DownloadJob, GeoZone
from geo.services.import_progress import display_progress_pct, progress_display
from geo.services.zone_admin import (
    cancel_job,
    cities_json,
    deactivate_department,
    department_coverage_rows,
    ensure_all_departments_seeded,
    start_downloads,
)


def _admin_gate(request):
    from julmin_taxis.htmx_views import _admin_gate as gate
    from julmin_taxis.admin_permissions import PERM_SYSTEM
    return gate(request, PERM_SYSTEM)


def _zone_to_dict(zone: GeoZone) -> dict:
    last_job = zone.download_jobs.order_by('-created_at').first()
    mbtiles = zone.resources.filter(resource_type='mbtiles', status='ready').first()
    return {
        'id': zone.pk,
        'name': zone.name,
        'department_slug': zone.department_slug,
        'status': zone.status,
        'status_display': zone.get_status_display(),
        'version': zone.version or '—',
        'file_size_mb': round((zone.file_size_bytes or 0) / (1024 * 1024), 1),
        'place_count': zone.place_count,
        'road_count': zone.road_count,
        'tile_count': zone.tile_count,
        'last_download_at': zone.last_download_at,
        'last_download_display': (
            timezone.localtime(zone.last_download_at).strftime('%d/%m/%Y %H:%M')
            if zone.last_download_at else '—'
        ),
        'has_mbtiles': bool(mbtiles),
        'active_job_id': last_job.pk if last_job and last_job.status in ('queued', 'running') else None,
        'active_job_status': last_job.status if last_job else None,
    }


@require_GET
def admin_geo_zones(request):
    gate = _admin_gate(request)
    if gate:
        return gate
    from django.db import OperationalError
    from django.http import HttpResponse
    import logging
    logger = logging.getLogger(__name__)
    try:
        ensure_all_departments_seeded()
        active_jobs = DownloadJob.objects.filter(
            status__in=('queued', 'running'),
        ).select_related('zone').order_by('-created_at')[:10]
        departments = department_coverage_rows()
        return render(request, 'htmx/admin_geo_zones.html', {
            'departments': departments,
            'departments_active': sum(1 for d in departments if d['is_active']),
            'departments_available': sum(1 for d in departments if d['geo_status'] == 'available'),
            'active_jobs': active_jobs,
            'csrf_token': get_token(request),
        })
    except OperationalError as exc:
        logger.warning('admin_geo_zones DB busy: %s', exc)
        msg = str(exc).lower()
        if 'no such column' in msg or 'no column named' in msg:
            hint = 'Migration base requise : python manage.py migrate geo'
            title = 'Schéma base de données incomplet'
        else:
            hint = 'Un import est peut-être en cours. Attendez ou annulez-le puis réessayez.'
            title = 'Base occupée par un import en cours'
        return HttpResponse(
            '<div class="text-center py-12 text-amber-300">'
            '<i class="ri-database-2-line text-3xl mb-3 block"></i>'
            f'<p class="font-bold">{title}</p>'
            f'<p class="text-sm text-gray-400 mt-2">{hint}</p>'
            '<button type="button" onclick="loadAdminGeoZones(true)" class="mt-4 px-4 py-2 rounded-xl bg-gray-700 text-white text-sm">Réessayer</button>'
            '</div>',
            status=200,
            content_type='text/html; charset=utf-8',
        )
    except Exception:
        logger.exception('admin_geo_zones failed')
        return HttpResponse(
            '<div class="text-center py-12 text-red-400">'
            '<p class="font-bold">Erreur de chargement des zones</p>'
            '<p class="text-sm text-gray-400 mt-2">Redémarrez le serveur Django si le problème persiste.</p>'
            '<button type="button" onclick="loadAdminGeoZones(true)" class="mt-4 px-4 py-2 rounded-xl bg-gray-700 text-white text-sm">Réessayer</button>'
            '</div>',
            status=200,
            content_type='text/html; charset=utf-8',
        )


@require_POST
def admin_geo_sync_zones(request):
    gate = _admin_gate(request)
    if gate:
        return gate
    ensure_all_departments_seeded()
    created = 0
    for dept in CoveredDepartment.objects.filter(is_active=True):
        _, was_created = GeoZone.objects.get_or_create(
            department_slug=dept.slug,
            city_slug='',
            defaults={
                'name': dept.name,
                'department': dept,
                'scope': 'department',
                'status': 'not_downloaded',
            },
        )
        if was_created:
            created += 1
    return JsonResponse({'ok': True, 'created': created})


@require_GET
def admin_geo_department_cities(request, dept_slug):
    gate = _admin_gate(request)
    if gate:
        return gate
    return JsonResponse({'cities': cities_json(dept_slug)})


@require_POST
def admin_geo_activate_department(request):
    """Active un département DAXI, crée la GeoZone et lance l'import OSM."""
    gate = _admin_gate(request)
    if gate:
        return gate
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        payload = request.POST

    slug = (payload.get('slug') or '').strip()
    if not slug:
        return JsonResponse({'error': 'Département requis'}, status=400)

    auto_download = payload.get('auto_download', True)
    if isinstance(auto_download, str):
        auto_download = auto_download.lower() not in ('0', 'false', 'no')

    if auto_download:
        result = start_downloads(slug, all_department=True, activate=True)
    else:
        from geo.services.zone_admin import activate_department
        result = activate_department(slug, auto_download=False)
    if result.get('error'):
        return JsonResponse(result, status=404)
    return JsonResponse(result)


@require_POST
def admin_geo_deactivate_department(request):
    gate = _admin_gate(request)
    if gate:
        return gate
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        payload = request.POST
    slug = (payload.get('slug') or '').strip()
    if not slug:
        return JsonResponse({'error': 'Département requis'}, status=400)
    result = deactivate_department(slug)
    if result.get('error'):
        return JsonResponse(result, status=404)
    return JsonResponse(result)


@require_POST
def admin_geo_download_department(request):
    """Import OSM pour un département entier (toutes les villes)."""
    gate = _admin_gate(request)
    if gate:
        return gate
    try:
        payload = json.loads(request.body.decode('utf-8') or '{}')
    except json.JSONDecodeError:
        payload = request.POST
    slug = (payload.get('slug') or '').strip()
    if not slug:
        return JsonResponse({'error': 'Département requis'}, status=400)
    all_department = bool(payload.get('all_department', False))
    city_slugs = payload.get('cities') or []
    if isinstance(city_slugs, str):
        city_slugs = [city_slugs]
    result = start_downloads(
        slug,
        all_department=all_department,
        city_slugs=city_slugs,
        activate=True,
    )
    if result.get('error'):
        return JsonResponse(result, status=404)
    return JsonResponse(result)


@require_POST
def admin_geo_cancel_job(request, job_id):
    gate = _admin_gate(request)
    if gate:
        return gate
    result = cancel_job(int(job_id))
    if result.get('error'):
        return JsonResponse(result, status=404)
    return JsonResponse(result)


def _start_import_job(zone: GeoZone) -> DownloadJob:
    from geo.services.zone_admin import _start_import_thread
    return _start_import_thread(zone)


@require_POST
def admin_geo_start_import(request, zone_id):
    gate = _admin_gate(request)
    if gate:
        return gate
    try:
        zone = GeoZone.objects.get(pk=int(zone_id))
    except (GeoZone.DoesNotExist, ValueError):
        return JsonResponse({'error': 'Zone introuvable'}, status=404)

    if DownloadJob.objects.filter(zone=zone, status__in=('queued', 'running')).exists():
        return JsonResponse({'error': 'Un import est déjà en cours pour cette zone'}, status=409)

    job = _start_import_job(zone)
    return JsonResponse({'ok': True, 'job_id': job.pk, 'zone_id': zone.pk})


@require_GET
def admin_geo_job_status(request, job_id):
    gate = _admin_gate(request)
    if gate:
        return gate
    try:
        job = DownloadJob.objects.select_related('zone').get(pk=int(job_id))
    except (DownloadJob.DoesNotExist, ValueError):
        return JsonResponse({'error': 'Job introuvable'}, status=404)

    bytes_total = job.bytes_total or 0
    bytes_done = job.bytes_done or 0
    items_done = getattr(job, 'items_done', 0) or 0
    items_total = getattr(job, 'items_total', 0) or 0
    qty = progress_display(
        job.stage,
        bytes_done=bytes_done,
        bytes_total=bytes_total,
        items_done=items_done,
        items_total=items_total,
    )
    pct = display_progress_pct(job.progress_pct or 0, job.status)
    return JsonResponse({
        'id': job.pk,
        'zone_id': job.zone_id,
        'zone_name': job.zone.name,
        'status': job.status,
        'stage': job.stage,
        'stage_display': job.get_stage_display(),
        'progress_pct': pct,
        'bytes_done': bytes_done,
        'bytes_total': bytes_total,
        'items_done': items_done,
        'items_total': items_total,
        'bytes_done_mb': round(bytes_done / (1024 * 1024), 2),
        'bytes_total_mb': round(bytes_total / (1024 * 1024), 2) if bytes_total else 0,
        'quantity_label': qty['quantity_label'],
        'progress_done_label': qty['done_label'],
        'progress_total_label': qty['total_label'],
        'progress_unit': qty['unit'],
        'speed_mbps': round((job.speed_bps or 0) / (1024 * 1024), 2),
        'speed_eps': round(job.speed_bps or 0) if qty['unit'] == 'entities' else None,
        'eta_seconds': job.eta_seconds,
        'files_done': job.files_done,
        'files_total': job.files_total,
        'error_message': job.error_message,
        'logs': (job.logs or [])[-40:],
    })


@require_GET
def admin_geo_zone_preview_map(request, zone_id):
    """Fragment carte MapLibre pour prévisualiser une zone."""
    gate = _admin_gate(request)
    if gate:
        return gate
    try:
        zone = GeoZone.objects.get(pk=int(zone_id))
    except (GeoZone.DoesNotExist, ValueError):
        return JsonResponse({'error': 'Zone introuvable'}, status=404)
    return render(request, 'htmx/admin_geo_zone_map.html', {
        'zone': zone,
        'csrf_token': get_token(request),
    })
