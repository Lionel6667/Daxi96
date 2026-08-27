"""Apprentissage automatique des lieux DAXI validés par humains."""
from __future__ import annotations

import logging
from typing import TYPE_CHECKING

from julmin_taxis.known_places_utils import normalize_place_name

if TYPE_CHECKING:
    from orders.models import KnownPlace

logger = logging.getLogger(__name__)


def learn_from_manual_place(
    place: 'KnownPlace',
    *,
    original_client_label: str = '',
    corrected_label: str = '',
) -> None:
    """
    Après validation admin/chauffeur :
    - conserve le libellé client comme alias / terme de recherche
    - renforce le poids via use_count
    - améliore les recherches futures
    """
    update_fields: list[str] = []
    aliases = list(place.aliases or [])
    search_terms = list(getattr(place, 'search_terms', None) or [])

    client_label = (original_client_label or '').strip()
    if client_label and client_label != place.label:
        norm_client = normalize_place_name(client_label)
        norm_label = normalize_place_name(place.label)
        if norm_client and norm_client != norm_label:
            if client_label not in aliases and len(client_label) <= 500:
                aliases.append(client_label)
                update_fields.append('aliases')
            if client_label not in search_terms:
                search_terms.append(client_label)
                update_fields.append('search_terms')

    corrected = (corrected_label or '').strip()
    if corrected and corrected != place.label and corrected not in aliases:
        aliases.append(corrected)
        update_fields.append('aliases')

    if search_terms:
        place.search_terms = search_terms[-30:]
        if 'search_terms' not in update_fields:
            update_fields.append('search_terms')
    if aliases:
        place.aliases = aliases[-20:]
        if 'aliases' not in update_fields:
            update_fields.append('aliases')

    if update_fields:
        place.save(update_fields=list(set(update_fields)))


def record_search_hit(place_id: int) -> None:
    """Incrémente use_count quand un lieu DAXI est sélectionné dans l'autocomplete."""
    try:
        from django.db.models import F
        from orders.models import KnownPlace
        KnownPlace.objects.filter(pk=place_id).update(use_count=F('use_count') + 1)
    except Exception:
        try:
            from orders.models import KnownPlace
            kp = KnownPlace.objects.get(pk=place_id)
            kp.use_count = (kp.use_count or 0) + 1
            kp.save(update_fields=['use_count', 'updated_at'])
        except Exception as exc:
            logger.debug('[Learning] record_search_hit: %s', exc)
