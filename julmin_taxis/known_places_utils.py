"""Enregistrement et déduplication des lieux DAXI validés manuellement."""
from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass, field
from difflib import SequenceMatcher
from typing import Optional

COORD_PRECISION = 5
DEFAULT_RADIUS_M = 45
AUTO_REUSE_CONFIDENCE = 0.88


def round_coord(value: float) -> float:
    return round(float(value), COORD_PRECISION)


def normalize_place_name(text: str) -> str:
    """Minuscules, sans accents, espaces et ponctuation normalisés."""
    t = unicodedata.normalize('NFD', (text or '').lower())
    t = ''.join(c for c in t if unicodedata.category(c) != 'Mn')
    t = re.sub(r"[''`]", ' ', t)
    t = re.sub(r'[^\w\s]', ' ', t, flags=re.UNICODE)
    t = re.sub(r'\s+', ' ', t).strip()
    replacements = (
        (r'\brue\b', 'ri'),
        (r'\best\b', 'e'),
        (r'\bouest\b', 'o'),
        (r'\bnord\b', 'n'),
        (r'\bsud\b', 's'),
        (r'\bavenue\b', 'av'),
        (r'\bblvd\b', 'bd'),
        (r'\bboulevard\b', 'bd'),
    )
    for pattern, repl in replacements:
        t = re.sub(pattern, repl, t)
    return re.sub(r'\s+', ' ', t).strip()


def name_similarity(a: str, b: str) -> float:
    na, nb = normalize_place_name(a), normalize_place_name(b)
    if not na or not nb:
        return 0.0
    if na == nb:
        return 1.0
    if na in nb or nb in na:
        shorter = min(len(na), len(nb))
        longer = max(len(na), len(nb))
        if shorter >= 3:
            return 0.82 + min(0.15, shorter / max(longer, 1) * 0.15)
    return SequenceMatcher(None, na, nb).ratio()


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dlat = math.radians(lat2 - lat1)
    dlng = math.radians(lng2 - lng1)
    a = math.sin(dlat / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dlng / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def _bbox_delta(radius_m: float) -> float:
    return max(radius_m / 111320.0, 0.0003)


def _confidence(distance_m: float, sim: float, radius_m: float) -> float:
    dist_score = max(0.0, 1.0 - (distance_m / max(radius_m, 1)))
    return min(1.0, sim * 0.72 + dist_score * 0.28)


@dataclass
class SimilarPlace:
    id: int
    label: str
    lat: float
    lng: float
    distance_m: float
    name_similarity: float
    confidence: float
    use_count: int = 0


@dataclass
class RegisterResult:
    place: Optional['KnownPlace'] = None
    created: bool = False
    reused: bool = False
    merged: bool = False
    candidates: list[SimilarPlace] = field(default_factory=list)


def find_similar_places(
    label: str,
    lat: float,
    lng: float,
    *,
    radius_m: float = DEFAULT_RADIUS_M,
    limit: int = 5,
    min_confidence: float = 0.5,
) -> list[SimilarPlace]:
    from orders.models import KnownPlace

    label = (label or '').strip()
    if not label:
        return []
    try:
        lat_f, lng_f = float(lat), float(lng)
    except (TypeError, ValueError):
        return []

    delta = _bbox_delta(radius_m)
    qs = KnownPlace.objects.filter(
        lat__gte=lat_f - delta,
        lat__lte=lat_f + delta,
        lng__gte=lng_f - delta,
        lng__lte=lng_f + delta,
    ).order_by('-use_count', '-updated_at')[:40]

    out: list[SimilarPlace] = []
    for kp in qs:
        dist = haversine_m(lat_f, lng_f, kp.lat, kp.lng)
        if dist > radius_m:
            continue
        sim = name_similarity(label, kp.label)
        for alias in (kp.aliases or []):
            sim = max(sim, name_similarity(label, alias))
        conf = _confidence(dist, sim, radius_m)
        if conf < min_confidence and not (dist <= 15 and sim >= 0.45):
            continue
        out.append(SimilarPlace(
            id=kp.pk,
            label=kp.label,
            lat=kp.lat,
            lng=kp.lng,
            distance_m=round(dist, 1),
            name_similarity=round(sim, 3),
            confidence=round(conf, 3),
            use_count=kp.use_count,
        ))
    out.sort(key=lambda x: (-x.confidence, -x.use_count, x.distance_m))
    return out[:limit]


def _merge_label(place, new_label: str) -> None:
    new_label = (new_label or '').strip()[:500]
    if not new_label:
        return
    old = (place.label or '').strip()
    if new_label == old:
        return
    aliases = list(place.aliases or [])
    if old and old not in aliases and old != new_label:
        aliases.append(old)
    norm_new = normalize_place_name(new_label)
    for alias in aliases[:]:
        if normalize_place_name(alias) == norm_new:
            aliases.remove(alias)
    if len(new_label) >= len(old):
        if old and old not in aliases:
            aliases.append(old)
        place.label = new_label
    else:
        if new_label not in aliases:
            aliases.append(new_label)
    place.aliases = aliases[:20]
    place.normalized_label = norm_new[:500]


def _reuse_place(place, label: str, *, kind: str, driver=None, order=None) -> 'KnownPlace':
    _merge_label(place, label)
    if kind in ('pickup', 'dest', 'both') and place.kind != 'both' and place.kind != kind:
        place.kind = 'both'
    if driver and not place.validated_by_id:
        place.validated_by = driver
    if order and not place.source_order_id:
        place.source_order = order
    place.use_count = (place.use_count or 0) + 1
    place.save()
    return place


def register_known_place(
    label: str,
    lat: float,
    lng: float,
    *,
    kind: str = 'both',
    driver=None,
    order=None,
    force_new: bool = False,
    reuse_place_id: int | None = None,
    require_confirmation: bool = False,
    original_client_label: str = '',
) -> RegisterResult:
    from orders.models import KnownPlace

    label = (label or '').strip()[:500]
    if not label:
        return RegisterResult()
    try:
        lat_r, lng_r = round_coord(lat), round_coord(lng)
    except (TypeError, ValueError):
        return RegisterResult()
    if not lat_r or not lng_r:
        return RegisterResult()

    if reuse_place_id:
        try:
            existing = KnownPlace.objects.get(pk=int(reuse_place_id))
            return _finalize_register_result(RegisterResult(
                place=_reuse_place(existing, label, kind=kind, driver=driver, order=order),
                created=False,
                reused=True,
            ), label, original_client_label)
        except (KnownPlace.DoesNotExist, ValueError, TypeError):
            pass

    if not force_new:
        candidates = find_similar_places(label, lat_r, lng_r)
        if candidates:
            best = candidates[0]
            if best.confidence >= AUTO_REUSE_CONFIDENCE or (
                not require_confirmation and best.confidence >= 0.72
            ):
                try:
                    existing = KnownPlace.objects.get(pk=best.id)
                    return _finalize_register_result(RegisterResult(
                        place=_reuse_place(existing, label, kind=kind, driver=driver, order=order),
                        created=False,
                        reused=True,
                        merged=True,
                    ), label, original_client_label)
                except KnownPlace.DoesNotExist:
                    pass
            if require_confirmation:
                return RegisterResult(candidates=candidates)

    obj, created = KnownPlace.objects.update_or_create(
        lat=lat_r,
        lng=lng_r,
        defaults={
            'label': label,
            'normalized_label': normalize_place_name(label)[:500],
            'kind': kind if kind in ('pickup', 'dest', 'both') else 'both',
            'source': 'manual',
            'validated_by': driver,
            'source_order': order,
        },
    )
    if not created:
        _merge_label(obj, label)
        if kind in ('pickup', 'dest', 'both') and obj.kind != 'both' and obj.kind != kind:
            obj.kind = 'both'
        obj.use_count = (obj.use_count or 0) + 1
        obj.save()
    result = RegisterResult(place=obj, created=created)
    return _finalize_register_result(result, label, original_client_label)


def _finalize_register_result(result: RegisterResult, label: str, original_client_label: str) -> RegisterResult:
    if result.place:
        try:
            from geo.services.learning import learn_from_manual_place
            learn_from_manual_place(
                result.place,
                original_client_label=original_client_label,
                corrected_label=label,
            )
        except Exception:
            pass
    return result


def _is_generic_pickup_label(label: str) -> bool:
    """Libellés GPS client — pas enregistrés comme lieu DAXI suggérable."""
    norm = normalize_place_name(label or '')
    if not norm:
        return True
    generic = (
        'ma position actuelle', 'ma position', 'position actuelle',
        'mon position', 'current location', 'my location',
    )
    return norm in generic or 'position actuelle' in norm


def register_known_place_strict(
    label: str,
    lat: float,
    lng: float,
    *,
    kind: str = 'both',
    driver=None,
    order=None,
    original_client_label: str = '',
) -> RegisterResult:
    """Enregistre CES coords pour CE libellé, sans fusion floue avec un voisin."""
    from django.db import IntegrityError, transaction
    from orders.models import KnownPlace

    label = (label or '').strip()[:500]
    if not label:
        return RegisterResult()
    try:
        lat_r, lng_r = round_coord(lat), round_coord(lng)
    except (TypeError, ValueError):
        return RegisterResult()
    if not lat_r or not lng_r:
        return RegisterResult()

    kind = kind if kind in ('pickup', 'dest', 'both') else 'both'
    norm = normalize_place_name(label)[:500]
    extra_label = (original_client_label or '').strip()[:500]

    try:
        with transaction.atomic():
            by_label = (
                KnownPlace.objects.filter(normalized_label=norm).order_by('-use_count', '-updated_at').first()
                if norm else None
            )
            by_coord = KnownPlace.objects.filter(lat=lat_r, lng=lng_r).first()

            if by_label and by_coord and by_label.pk != by_coord.pk:
                _merge_label(by_coord, label)
                if extra_label:
                    _merge_label(by_coord, extra_label)
                if kind != by_coord.kind:
                    by_coord.kind = 'both'
                by_coord.use_count = (by_coord.use_count or 0) + 1
                if driver:
                    by_coord.validated_by = driver
                if order:
                    by_coord.source_order = order
                by_coord.save()
                return _finalize_register_result(
                    RegisterResult(place=by_coord, created=False, reused=True, merged=True),
                    label, extra_label,
                )

            if by_label:
                clash = KnownPlace.objects.filter(lat=lat_r, lng=lng_r).exclude(pk=by_label.pk).first()
                if clash:
                    _merge_label(clash, label)
                    if extra_label:
                        _merge_label(clash, extra_label)
                    clash.use_count = (clash.use_count or 0) + 1
                    if driver:
                        clash.validated_by = driver
                    if order:
                        clash.source_order = order
                    clash.save()
                    return _finalize_register_result(
                        RegisterResult(place=clash, created=False, reused=True, merged=True),
                        label, extra_label,
                    )
                by_label.lat = lat_r
                by_label.lng = lng_r
                by_label.label = label
                by_label.normalized_label = norm
                if extra_label:
                    _merge_label(by_label, extra_label)
                if kind != by_label.kind:
                    by_label.kind = 'both'
                by_label.use_count = (by_label.use_count or 0) + 1
                if driver:
                    by_label.validated_by = driver
                if order:
                    by_label.source_order = order
                by_label.source = 'manual'
                by_label.save()
                return _finalize_register_result(
                    RegisterResult(place=by_label, created=False, reused=True),
                    label, extra_label,
                )

            if by_coord:
                _merge_label(by_coord, label)
                if extra_label:
                    _merge_label(by_coord, extra_label)
                by_coord.use_count = (by_coord.use_count or 0) + 1
                if driver:
                    by_coord.validated_by = driver
                if order:
                    by_coord.source_order = order
                by_coord.save()
                return _finalize_register_result(
                    RegisterResult(place=by_coord, created=False, reused=True),
                    label, extra_label,
                )

            obj = KnownPlace.objects.create(
                label=label,
                normalized_label=norm,
                lat=lat_r,
                lng=lng_r,
                kind=kind,
                source='manual',
                validated_by=driver,
                source_order=order,
                use_count=1,
            )
            if extra_label:
                _merge_label(obj, extra_label)
                obj.save()
            return _finalize_register_result(
                RegisterResult(place=obj, created=True),
                label, extra_label,
            )
    except IntegrityError:
        existing = KnownPlace.objects.filter(lat=lat_r, lng=lng_r).first()
        if existing:
            _merge_label(existing, label)
            existing.use_count = (existing.use_count or 0) + 1
            existing.save()
            return _finalize_register_result(
                RegisterResult(place=existing, created=False, reused=True),
                label, extra_label,
            )
        return RegisterResult()


def apply_place_decisions(
    decisions: list[dict],
    *,
    pickup: tuple | None = None,
    dest: tuple | None = None,
    stops: list | None = None,
    driver=None,
    order=None,
) -> None:
    """Applique les décisions de réutilisation / création pour chaque point.

    Chaque tuple : (label, lat, lng) ou (label, lat, lng, original_client_label).
    """
    slot_data = {}
    if pickup:
        slot_data['pickup'] = pickup
    if dest:
        slot_data['dest'] = dest
    for i, stop in enumerate(stops or []):
        slot_data[f'stop-{i}'] = stop

    decision_map = {d.get('slot'): d for d in decisions if d.get('slot')}

    for slot, data in slot_data.items():
        label = data[0]
        lat, lng = data[1], data[2]
        client_label = data[3] if len(data) > 3 else ''
        if not label:
            continue
        dec = decision_map.get(slot) or {}
        kind = 'pickup' if slot == 'pickup' else 'dest'
        if dec.get('action') in ('new', 'reuse') or dec.get('force_new') or dec.get('place_id'):
            register_known_place(
                label, lat, lng,
                kind=kind,
                driver=driver,
                order=order,
                force_new=dec.get('action') == 'new' or dec.get('force_new'),
                reuse_place_id=dec.get('place_id') if dec.get('action') == 'reuse' else None,
                original_client_label=client_label or label,
            )
        else:
            register_known_place_strict(
                label, lat, lng,
                kind=kind,
                driver=driver,
                order=order,
                original_client_label=client_label or label,
            )
