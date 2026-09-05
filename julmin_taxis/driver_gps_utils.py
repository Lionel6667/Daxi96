"""Payload WebSocket / API unifié pour position chauffeur."""


def parse_accuracy_m(raw):
    if raw is None or raw == '':
        return None
    try:
        acc = float(raw)
    except (TypeError, ValueError):
        return None
    if acc <= 0 or acc > 50000:
        return None
    return acc


def apply_driver_accuracy(driver, accuracy):
    if accuracy is None:
        return []
    driver.location_accuracy = accuracy
    return ['location_accuracy']


def driver_location_payload(lat, lng, driver_id, order_id=None, accuracy=None):
    """Champs compatibles client (driver_lat) et legacy (lat/lng)."""
    payload = {
        'lat': lat,
        'lng': lng,
        'latitude': lat,
        'longitude': lng,
        'driver_lat': lat,
        'driver_lng': lng,
        'driver_id': driver_id,
        'order_id': order_id,
    }
    if accuracy is not None:
        payload['accuracy'] = accuracy
        payload['driver_accuracy'] = accuracy
    return payload
