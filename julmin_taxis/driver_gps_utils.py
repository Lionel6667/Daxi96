"""Payload WebSocket / API unifié pour position chauffeur."""


def driver_location_payload(lat, lng, driver_id, order_id=None):
    """Champs compatibles client (driver_lat) et legacy (lat/lng)."""
    return {
        'lat': lat,
        'lng': lng,
        'latitude': lat,
        'longitude': lng,
        'driver_lat': lat,
        'driver_lng': lng,
        'driver_id': driver_id,
        'order_id': order_id,
    }
