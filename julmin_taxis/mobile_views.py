"""API mobile — synchronisation hors ligne (bootstrap)."""

import json
from decimal import Decimal
from datetime import date, datetime

from django.http import JsonResponse
from django.views.decorators.http import require_GET, require_http_methods
from django.views.decorators.csrf import csrf_exempt
from django.db.models import Count, Q

from orders.models import Order
from drivers.models import Driver
from julmin_taxis.htmx_views import _order_to_dict


def _json_safe(val):
    """Convert Django/Python types to JSON-serializable values."""
    if val is None or isinstance(val, (str, int, float, bool)):
        return val
    if isinstance(val, (Decimal,)):
        return float(val)
    if isinstance(val, (datetime, date)):
        return val.isoformat()
    if isinstance(val, dict):
        return {k: _json_safe(v) for k, v in val.items()}
    if isinstance(val, (list, tuple)):
        return [_json_safe(v) for v in val]
    return str(val)


def _offline_map_packs():
    """Paquets MBTiles disponibles pour téléchargement mobile (zones DAXI)."""
    from django.conf import settings
    from pathlib import Path
    import hashlib

    packs = []
    maps_dir = Path(settings.BASE_DIR) / 'static' / 'maps'
    if not maps_dir.exists():
        return packs
    for f in sorted(maps_dir.glob('*.mbtiles')):
        digest = hashlib.md5(f.read_bytes()).hexdigest()[:16]
        packs.append({
            'id': f.stem,
            'url': f'/static/maps/{f.name}',
            'version': digest,
            'size': f.stat().st_size,
            'name': f.stem.replace('_', ' ').title(),
        })
    return packs


@require_GET
def mobile_bootstrap(request):
    """
    GET /api/mobile/bootstrap/?guest_id=...
    Télécharge tout le nécessaire pour consultation hors ligne.
    """
    try:
        return _mobile_bootstrap_impl(request)
    except Exception as exc:
        import logging
        logging.getLogger(__name__).exception('mobile_bootstrap failed')
        return JsonResponse({'ok': False, 'error': str(exc)}, status=500)


def _mobile_bootstrap_impl(request):
    from django.contrib.auth.models import AnonymousUser
    from julmin_taxis.security_utils import normalize_guest_id

    user = getattr(request, 'user', None) or AnonymousUser()
    guest_id = normalize_guest_id(
        request.GET.get('guest_id', '').strip()
        or request.session.get('guest_id', '')
    )
    merge_ids = []
    for raw in request.GET.getlist('merge_guest_id'):
        mid = normalize_guest_id(raw)
        if mid and mid != guest_id and mid not in merge_ids:
            merge_ids.append(mid)
    session_gid = normalize_guest_id(request.session.get('guest_id', ''))
    if session_gid and session_gid != guest_id and session_gid not in merge_ids:
        merge_ids.append(session_gid)

    merged_from = []
    if guest_id:
        request.session['guest_id'] = guest_id
        if merge_ids:
            for alias in merge_ids:
                moved = Order.objects.filter(
                    guest_id=alias, user__isnull=True,
                ).update(guest_id=guest_id)
                if moved:
                    merged_from.append(alias)

    orders_qs = Order.objects.none()
    if user.is_authenticated:
        orders_qs = Order.objects.filter(user=user).select_related('driver').order_by('-created_at')[:80]
    elif guest_id:
        orders_qs = Order.objects.filter(guest_id=guest_id, user__isnull=True).select_related('driver').order_by('-created_at')[:80]

    orders = [_json_safe(_order_to_dict(o)) for o in orders_qs]

    from django.conf import settings
    from django.utils import timezone as tz
    active_statuses = {
        'pending', 'price_proposed', 'price_confirmed', 'driver_assigned',
        'on_way', 'arrived', 'in_progress',
    }
    now = tz.now()
    stats = {
        'total': len(orders),
        'this_month': sum(
            1 for o in orders_qs
            if o.created_at.month == now.month and o.created_at.year == now.year
        ),
        'pending': sum(1 for o in orders if o.get('status') in active_statuses),
        'completed': sum(1 for o in orders if o.get('status') == 'completed'),
    }

    drivers = []
    driver_qs = Driver.objects.filter(
        is_verified=True, status__in=['available', 'busy', 'offline']
    ).annotate(
        rides_done=Count('orders', filter=Q(orders__status='completed'))
    ).order_by('-rating', '-completed_trips', '-rides_done')[:60]
    for d in driver_qs:
        photo_url = ''
        try:
            from julmin_taxis.driver_display_utils import _driver_photo_url
            photo_url = _driver_photo_url(d, request=request) or ''
        except Exception:
            if d.photo:
                try:
                    photo_url = d.photo.url
                except Exception:
                    photo_url = ''
        if not photo_url:
            photo_url = (d.car_image_url or '').strip()
        drivers.append({
            'id': d.id,
            'firstname': d.firstname or '',
            'lastname': d.lastname or '',
            'rating': float(d.rating or 0),
            'completed_trips': max(int(d.completed_trips or 0), int(getattr(d, 'rides_done', 0) or 0)),
            'vehicle': d.vehicle or '',
            'car_brand': d.car_brand or '',
            'car_model': d.car_model or '',
            'plate': d.plate or '',
            'status': d.status,
            'lat': d.latitude,
            'lng': d.longitude,
            'photo': photo_url,
            'photo_url': photo_url,
            'photoURL': photo_url,
        })

                                    
    haiti_map = {
        'name': 'Haïti',
        'bounds': {
            'north': 20.15,
            'south': 18.0,
            'west': -74.8,
            'east': -71.6,
        },
        'center': {'lat': 19.5, 'lng': -72.3},
        'default_zoom': 9,
        'offline_packs': _offline_map_packs(),
    }

    from julmin_taxis.service_plans import service_plans_summary
    service_plans = service_plans_summary()

    try:
        from pricing.models import Department
        departments = list(
            Department.objects.filter(is_active=True).values(
                'slug', 'name', 'name_ht', 'bounds_json', 'is_covered'
            )
        )
    except Exception:
        departments = []

    from django.middleware.csrf import get_token

    payload = {
        'ok': True,
        'version': 1,
        'generated_at': tz.now().isoformat(),
        'csrf_token': get_token(request),
        'user': {
            'authenticated': user.is_authenticated,
            'email': user.email if user.is_authenticated else '',
            'name': user.get_full_name() if user.is_authenticated else '',
            'phone': getattr(user, 'phone', '') if user.is_authenticated else '',
            'user_id': getattr(user, 'firebase_user_id', None) if user.is_authenticated else None,
        },
        'guest_id': guest_id,
        'guest_id_merged': {'from': merged_from} if merged_from else None,
        'orders': orders,
        'stats': stats,
        'drivers': drivers,
        'service_plans': service_plans,
        'departments': departments,
        'map': haiti_map,
        'google_maps_key': getattr(settings, 'GOOGLE_MAPS_API_KEY', ''),
        'offline_rules': {
            'read_only_offline': False,
            'writes_queue_offline': True,
            'writes_require_online': ['register'],
        },
    }
    return JsonResponse(payload, json_dumps_params={'ensure_ascii': False})


@require_GET
def mobile_cache_manifest(request):
    """GET /api/mobile/cache-manifest/ — versions des assets pour cache delta."""
    from django.conf import settings
    import hashlib
    from pathlib import Path

    base = Path(settings.BASE_DIR)
    manifest = {}
    scan_roots = [
        base / 'static' / 'js',
        base / 'assets' / 'images',
        base / 'assets' / 'js',
    ]
    extra_files = [
        '/',
        '/manifest.json',
        '/gps-precision-engine.js',
        '/daxi-frequent-routes-data.js',
        '/daxi-frequent-routes-map.js',
    ]
    for root in scan_roots:
        if not root.exists():
            continue
        for local in root.rglob('*'):
            if not local.is_file():
                continue
            rel = '/' + local.relative_to(base).as_posix()
            digest = hashlib.md5(local.read_bytes()).hexdigest()[:16]
            manifest[rel] = {
                'version': digest,
                'etag': digest,
                'size': local.stat().st_size,
            }
    for rel in extra_files:
        local = base / rel.lstrip('/')
        if local.exists() and rel not in manifest:
            digest = hashlib.md5(local.read_bytes()).hexdigest()[:16]
            manifest[rel] = {'version': digest, 'etag': digest, 'size': local.stat().st_size}

    return JsonResponse({
        'ok': True,
        'cache_version': getattr(settings, 'DAXI_MOBILE_CACHE_VERSION', '2'),
        'files': manifest,
    })


def mobile_gps_batch(request):
    """POST /api/mobile/gps-batch/ — file d'attente GPS hors ligne."""
    if request.method != 'POST':
        return JsonResponse({'error': 'POST required'}, status=405)
    try:
        payload = json.loads(request.body.decode('utf-8') or '[]')
        if not isinstance(payload, list):
            return JsonResponse({'error': 'liste attendue'}, status=400)
    except json.JSONDecodeError:
        return JsonResponse({'error': 'invalid json'}, status=400)

    from julmin_taxis.htmx_views import _get_current_driver
    from django.utils import timezone

    driver = _get_current_driver(request)
    if not driver:
        return JsonResponse({'ok': False, 'error': 'Non authentifié'}, status=401)

    from julmin_taxis.gps_antispoof import validate_driver_gps

    applied = 0
    last_lat, last_lng = driver.latitude, driver.longitude
    for point in payload[:200]:
        try:
            lat = float(point.get('lat'))
            lng = float(point.get('lng'))
        except (TypeError, ValueError):
            continue
        speed = point.get('speed')
        try:
            speed_ms = float(speed) if speed is not None else None
        except (TypeError, ValueError):
            speed_ms = None
        ok, _, _ = validate_driver_gps(driver.pk, lat, lng, speed_ms)
        if not ok:
            continue
        driver.latitude = lat
        driver.longitude = lng
        from julmin_taxis.driver_presence import touch_driver_location_seen
        touch_driver_location_seen(driver, save=False)
        last_lat, last_lng = lat, lng
        applied += 1

    if applied:
        driver.save(update_fields=['latitude', 'longitude', 'location_updated_at', 'last_seen_at'])

    return JsonResponse({'ok': True, 'received': len(payload), 'applied': applied, 'lat': last_lat, 'lng': last_lng})


@require_GET
def client_recent_places(request):
    from django.contrib.auth.models import AnonymousUser
    from julmin_taxis.address_utils import clean_address_display
    from orders.models import KnownPlace
    from julmin_taxis.known_places_utils import round_coord

    user = getattr(request, 'user', None) or AnonymousUser()
    guest_id = request.GET.get('guest_id', '').strip() or request.session.get('guest_id', '')

    places = []
    seen = set()
    gps_re = __import__('re').compile(
        r'^(ma position actuelle|ma position|position actuelle|position gps|my current location)$',
        __import__('re').I,
    )

    def _add_place(label, lat, lng, kind, meta, source='recent'):
        try:
            lat_f, lng_f = float(lat), float(lng)
        except (TypeError, ValueError):
            return
        if not lat_f or not lng_f:
            return
        display = clean_address_display(label) if label else ''
        norm = (display or '').strip()
        if gps_re.match(norm) or 'position actuelle' in norm.lower():
            display = '📍 Position GPS'
        key = f'{round_coord(lat_f)}|{round_coord(lng_f)}'
        if key in seen:
            return
        seen.add(key)
        places.append({
            'label': (display or label or 'Lieu')[:200],
            'lat': lat_f,
            'lng': lng_f,
            'kind': kind,
            'meta': meta,
            'source': source,
        })

    for kp in KnownPlace.objects.order_by('-use_count', '-updated_at')[:20]:
        _add_place(kp.label, kp.lat, kp.lng, kp.kind if kp.kind != 'both' else 'pickup', '✓ Validé chauffeur', 'known')
        if len(places) >= 8:
            break

    qs = Order.objects.filter(status='completed')
    if user.is_authenticated:
        qs = qs.filter(user=user)
    elif guest_id:
        qs = qs.filter(guest_id=guest_id, user__isnull=True)
    else:
        return JsonResponse({'places': places[:8]})

    for o in qs.select_related().order_by('-created_at')[:40]:
        for kind, label, lat, lng in (
            ('pickup', o.pickup, o.pickup_lat, o.pickup_lng),
            ('dest', o.destination, o.destination_lat, o.destination_lng),
        ):
            if not label or lat is None or lng is None:
                continue
            date_s = o.created_at.strftime('%d/%m/%Y') if o.created_at else ''
            meta = date_s
            _add_place(label, lat, lng, kind, meta, 'order')
            if len(places) >= 8:
                break
        if len(places) >= 8:
            break

    return JsonResponse({'places': places[:8]})


@require_GET
def client_service_plans(request):
    """GET /api/client/service-plans/ — catalogue forfaits (hors HTML source)."""
    from julmin_taxis.service_plans import service_plans_api_payload
    lang = request.GET.get('lang') or request.COOKIES.get('daxi_lang') or 'fr'
    return JsonResponse(service_plans_api_payload(lang), json_dumps_params={'ensure_ascii': False})


@csrf_exempt
@require_http_methods(['POST'])
def mobile_driver_access(request):
    """
    POST /api/mobile/driver-access/
    Décision 100 % serveur : le client ne contient aucun secret.
    """
    from django.contrib.auth.models import AnonymousUser
    from drivers.models import Driver

    user = getattr(request, 'user', None) or AnonymousUser()
    if not user.is_authenticated:
        return JsonResponse({'ok': False, 'allowed': False, 'reason': 'auth_required'}, status=401)

    driver = Driver.objects.filter(user=user, is_verified=True).first()
    if not driver:
        driver = Driver.objects.filter(email__iexact=user.email, is_verified=True).first()
    if not driver:
        return JsonResponse({'ok': True, 'allowed': False, 'reason': 'not_a_driver'})

    return JsonResponse({
        'ok': True,
        'allowed': True,
        'redirect': '/driver/',
        'driver_id': driver.id,
    })
