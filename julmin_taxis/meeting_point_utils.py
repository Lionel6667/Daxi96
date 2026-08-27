"""Point de rendez-vous figé et détection de déplacement client."""
from __future__ import annotations

import math
from typing import Optional, Tuple

RELOCATE_DRIFT_METERS = 200
                                                                               
RELOCATE_MAX_ACCURACY_M = 80


def haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Distance en mètres entre deux coordonnées WGS84."""
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def order_meeting_coords(order) -> Tuple[Optional[float], Optional[float]]:
    """Coordonnées du lieu de rendez-vous (figé à la commande)."""
    lat = order.meeting_lat
    lng = order.meeting_lng
    if lat is None or lng is None:
        lat = order.pickup_lat
        lng = order.pickup_lng
    if lat is None or lng is None:
        return None, None
    return float(lat), float(lng)


def drift_from_meeting_meters(order, client_lat: float, client_lng: float) -> Optional[float]:
    mlat, mlng = order_meeting_coords(order)
    if mlat is None or mlng is None:
        return None
    return haversine_meters(mlat, mlng, client_lat, client_lng)


def should_prompt_relocate(
    order,
    client_lat: float,
    client_lng: float,
    accuracy_m: Optional[float] = None,
) -> Tuple[bool, Optional[float]]:
    """True si le client s'est éloigné de plus de 200 m du lieu de RDV (avec marge précision GPS)."""
    drift = drift_from_meeting_meters(order, client_lat, client_lng)
    if drift is None:
        return False, None
    if getattr(order, 'is_later', False):
        return False, drift
    if accuracy_m is not None and accuracy_m > RELOCATE_MAX_ACCURACY_M:
        return False, drift
    threshold = RELOCATE_DRIFT_METERS
    if accuracy_m is not None and accuracy_m > 0:
        threshold = RELOCATE_DRIFT_METERS + min(float(accuracy_m), 120.0)
    return drift > threshold, drift
