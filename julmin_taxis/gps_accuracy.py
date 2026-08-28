"""Seuils de précision GPS client (mètres)."""

CLIENT_GPS_MAX_M = 300.0
CLIENT_GPS_TARGET_M = 100.0


def parse_client_gps_accuracy(raw):
    """Retourne la précision en mètres si elle est utilisable, sinon None.

    Tout ce qui dépasse 300 m est rejeté (y compris les fixes « rejet / approx »).
    """
    if raw is None:
        return None
    try:
        acc = float(raw)
    except (TypeError, ValueError):
        return None
    if acc <= 0 or acc > CLIENT_GPS_MAX_M:
        return None
    return acc


def should_warn_driver_gps(accuracy_m) -> bool:
    """Alerte chauffeur seulement si la localisation est plus large que 100 m."""
    try:
        acc = float(accuracy_m)
    except (TypeError, ValueError):
        return False
    return acc > CLIENT_GPS_TARGET_M
