"""Réponses API client — sans facteurs tarifaires ni détail du moteur."""

from decimal import Decimal


def sanitize_admin_calculate_result(result: dict) -> dict:
    """Réponse complète pour admin / outils internes."""
    out = dict(result)
    if isinstance(out.get('final_price'), Decimal):
        out['final_price'] = float(out['final_price'])
    if isinstance(out.get('base_price'), Decimal):
        out['base_price'] = float(out['base_price'])
    return out


def client_route_payload(route: dict) -> dict:
    """
    Itinéraire uniquement — aucun prix, zone d'impact, ni config tarifaire.
    """
    duration_s = float(route.get('duration_s') or 0)
    return {
        'ok': True,
        'route_coordinates': route.get('coordinates') or [],
        'total_distance_km': round(float(route.get('distance_km') or 0), 3),
        'duration_s': round(duration_s, 0),
        'duration_min': round(duration_s / 60.0, 1) if duration_s else 0,
    }
