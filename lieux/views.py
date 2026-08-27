from django.db.models import Q
from django.http import JsonResponse
from django.shortcuts import get_object_or_404, render
from django.views.decorators.http import require_http_methods

from .models import LieuxCategory, LieuxPlace, LieuxPhoto

_DEFAULT_CATS = (
    ('restaurant', 'Restaurants', 'ri-restaurant-2-line', '#ea580c', 1),
    ('hotel', 'Hôtels', 'ri-hotel-line', '#2563eb', 2),
    ('market', 'Supermarchés', 'ri-shopping-basket-2-line', '#059669', 3),
    ('cafe', 'Cafés', 'ri-cup-line', '#92400e', 4),
    ('nightlife', 'Vie nocturne', 'ri-moon-clear-line', '#7c3aed', 5),
    ('beach', 'Plages', 'ri-sun-line', '#0891b2', 6),
    ('culture', 'Culture', 'ri-ancient-gate-line', '#b45309', 7),
)


def _ensure_default_categories():
    if LieuxCategory.objects.exists():
        return
    LieuxCategory.objects.bulk_create([
        LieuxCategory(slug=s, name=n, icon=i, color=c, order=o)
        for s, n, i, c, o in _DEFAULT_CATS
    ])


def _admin_ok(request):
    from julmin_taxis.htmx_views import _is_admin_authenticated
    return _is_admin_authenticated(request)


def _place_dict(place, detail=False):
    photos = []
    if detail:
        for p in place.photos.all():
            try:
                photos.append({'id': p.id, 'url': p.image.url, 'caption': p.caption or ''})
            except Exception:
                pass
    cover = place.cover_url
    cat = place.category
    ent = place.enterprise
    return {
        'id': place.id,
        'name': place.name,
        'address': place.address or '',
        'hours': place.hours or '',
        'description': place.description or '',
        'cover': cover,
        'latitude': place.latitude,
        'longitude': place.longitude,
        'is_published': place.is_published,
        'featured': place.featured,
        'order': place.order,
        'category_id': cat.id if cat else None,
        'category_name': cat.name if cat else '',
        'category_slug': cat.slug if cat else '',
        'category_icon': cat.icon if cat else 'ri-map-pin-line',
        'category_color': cat.color if cat else '#c27803',
        'enterprise_id': ent.id if ent else None,
        'enterprise_name': ent.name if ent else '',
        'photos': photos,
    }


def client_lieux_page(request):
    _ensure_default_categories()
    cat = (request.GET.get('cat') or '').strip()
    q = (request.GET.get('q') or '').strip()
    categories = LieuxCategory.objects.filter(is_active=True)
    places = LieuxPlace.objects.filter(is_published=True).select_related('category', 'enterprise').prefetch_related('photos')
    if cat:
        places = places.filter(category__slug=cat)
    if q:
        places = places.filter(Q(name__icontains=q) | Q(address__icontains=q) | Q(description__icontains=q))
    return render(request, 'htmx/client_lieux.html', {
        'places': places,
        'categories': categories,
        'active_cat': cat,
        'q': q,
    })


def client_lieux_detail(request, place_id):
    place = get_object_or_404(
        LieuxPlace.objects.select_related('category', 'enterprise').prefetch_related('photos'),
        pk=place_id, is_published=True,
    )
    return render(request, 'htmx/client_lieux_detail.html', {'place': place})


@require_http_methods(['GET'])
def admin_lieux_list(request):
    if not _admin_ok(request):
        return JsonResponse({'ok': False, 'error': 'non autorisé'}, status=403)
    _ensure_default_categories()
    places = LieuxPlace.objects.select_related('category', 'enterprise').prefetch_related('photos')
    cats = list(LieuxCategory.objects.all().values('id', 'slug', 'name', 'icon', 'color', 'order', 'is_active'))
    ents = []
    try:
        from enterprises.models import Enterprise
        ents = list(Enterprise.objects.filter(status='approved').order_by('name').values('id', 'name'))
    except Exception:
        pass
    return JsonResponse({
        'ok': True,
        'places': [_place_dict(p, detail=True) for p in places],
        'categories': cats,
        'enterprises': ents,
    })


@require_http_methods(['POST'])
def admin_lieux_save(request, place_id=None):
    if not _admin_ok(request):
        return JsonResponse({'ok': False, 'error': 'non autorisé'}, status=403)
    place = get_object_or_404(LieuxPlace, pk=place_id) if place_id else LieuxPlace()
    place.name = (request.POST.get('name') or '').strip()
    if not place.name:
        return JsonResponse({'ok': False, 'error': 'Le nom est obligatoire.'}, status=400)
    place.address = (request.POST.get('address') or '').strip()
    place.hours = (request.POST.get('hours') or '').strip()
    place.description = (request.POST.get('description') or '').strip()
    place.is_published = request.POST.get('is_published') in ('1', 'true', 'on', 'yes')
    place.featured = request.POST.get('featured') in ('1', 'true', 'on', 'yes')
    try:
        place.order = int(request.POST.get('order') or 0)
    except ValueError:
        place.order = 0
    cat_id = request.POST.get('category_id')
    place.category_id = int(cat_id) if cat_id else None
    ent_id = request.POST.get('enterprise_id')
    place.enterprise_id = int(ent_id) if ent_id else None
    lat = request.POST.get('latitude')
    lng = request.POST.get('longitude')
    try:
        place.latitude = float(lat) if lat not in (None, '') else None
        place.longitude = float(lng) if lng not in (None, '') else None
    except ValueError:
        return JsonResponse({'ok': False, 'error': 'Coordonnées GPS invalides.'}, status=400)
    if place.latitude is None or place.longitude is None:
        return JsonResponse({'ok': False, 'error': 'Place ce lieu sur la carte — le GPS est obligatoire.'}, status=400)
    cover = request.FILES.get('cover')
    if cover:
        place.cover = cover
    place.save()
    for img in request.FILES.getlist('photos'):
        LieuxPhoto.objects.create(place=place, image=img)
    try:
        from julmin_taxis.known_places_utils import register_known_place_strict
        label = place.name
        if place.address:
            label = f'{place.name} — {place.address}'
        register_known_place_strict(
            label, place.latitude, place.longitude,
            kind='dest', original_client_label=place.name,
        )
        if place.address and place.address.strip() != place.name.strip():
            register_known_place_strict(
                place.address, place.latitude, place.longitude,
                kind='dest', original_client_label=place.name,
            )
    except Exception:
        pass
    return JsonResponse({'ok': True, 'place': _place_dict(place, detail=True)})


@require_http_methods(['POST'])
def admin_lieux_delete(request, place_id):
    if not _admin_ok(request):
        return JsonResponse({'ok': False, 'error': 'non autorisé'}, status=403)
    place = get_object_or_404(LieuxPlace, pk=place_id)
    place.delete()
    return JsonResponse({'ok': True})


@require_http_methods(['POST'])
def admin_lieux_category_save(request, cat_id=None):
    if not _admin_ok(request):
        return JsonResponse({'ok': False, 'error': 'non autorisé'}, status=403)
    from django.utils.text import slugify
    cat = get_object_or_404(LieuxCategory, pk=cat_id) if cat_id else LieuxCategory()
    name = (request.POST.get('name') or '').strip()
    if not name:
        return JsonResponse({'ok': False, 'error': 'Le nom de la catégorie est obligatoire.'}, status=400)
    cat.name = name
    cat.icon = (request.POST.get('icon') or 'ri-map-pin-2-fill').strip() or 'ri-map-pin-2-fill'
    cat.color = (request.POST.get('color') or '#c27803').strip() or '#c27803'
    try:
        cat.order = int(request.POST.get('order') or cat.order or 0)
    except ValueError:
        cat.order = cat.order or 0
    cat.is_active = request.POST.get('is_active', '1') in ('1', 'true', 'on', 'yes')
    requested_slug = (request.POST.get('slug') or '').strip()
    if not cat.pk or requested_slug:
        base = slugify(requested_slug or name)[:36] or 'categorie'
        slug = base
        n = 2
        while LieuxCategory.objects.filter(slug=slug).exclude(pk=cat.pk or 0).exists():
            slug = f'{base}-{n}'
            n += 1
        cat.slug = slug
    cat.save()
    return JsonResponse({
        'ok': True,
        'category': {
            'id': cat.id, 'slug': cat.slug, 'name': cat.name,
            'icon': cat.icon, 'color': cat.color, 'order': cat.order,
            'is_active': cat.is_active,
        },
    })


@require_http_methods(['POST'])
def admin_lieux_category_delete(request, cat_id):
    if not _admin_ok(request):
        return JsonResponse({'ok': False, 'error': 'non autorisé'}, status=403)
    cat = get_object_or_404(LieuxCategory, pk=cat_id)
    cat.delete()
    return JsonResponse({'ok': True})


@require_http_methods(['POST'])
def admin_lieux_delete_photo(request, photo_id):
    if not _admin_ok(request):
        return JsonResponse({'ok': False, 'error': 'non autorisé'}, status=403)
    photo = get_object_or_404(LieuxPhoto, pk=photo_id)
    photo.delete()
    return JsonResponse({'ok': True})
