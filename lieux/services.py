"""Activité et synchronisation GPS pour les lieux partenaires."""
from __future__ import annotations

from admin_panel.models import HAITI_DEPARTMENTS

DEPT_LABELS = dict(HAITI_DEPARTMENTS)


def department_label(slug: str) -> str:
    return DEPT_LABELS.get(slug or '', slug or '')


def sync_place_coords_from_enterprise(place) -> bool:
    """Copie le GPS entreprise sur le lieu s'il manque encore."""
    ent = place.enterprise
    if not ent or not ent.has_location():
        return False
    if place.latitude is not None and place.longitude is not None:
        return False
    place.latitude = ent.address_lat
    place.longitude = ent.address_lng
    place.save(update_fields=['latitude', 'longitude', 'updated_at'])
    return True


def refresh_enterprise_place_activity(enterprise) -> None:
    """Recalcule le score d'activité (commandes + clics lien affilié)."""
    if not enterprise:
        return
    from .models import LieuxPlace

    booking_count = enterprise.orders.count()
    clicks = enterprise.link_clicks or 0
    score = booking_count + clicks
    LieuxPlace.objects.filter(enterprise=enterprise).update(
        booking_count=booking_count,
        activity_score=score,
    )


def register_place_gps(place) -> None:
    """Enregistre le lieu dans les adresses connues si GPS disponible."""
    if place.latitude is None or place.longitude is None:
        return
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
