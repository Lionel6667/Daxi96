"""Champs chauffeur unifiés pour API client, WebSocket et page track."""
from django.conf import settings


def _abs_url(url: str, request=None) -> str:
    if not url:
        return ''
    url = str(url).strip()
    if url.startswith('data:'):
        return url
    if url.startswith('http://') or url.startswith('https://'):
        return url
    
    
    if url.startswith('/'):
        return url
    if request:
        try:
            return request.build_absolute_uri(url)
        except Exception:
            pass
    base = getattr(settings, 'SITE_URL', '').rstrip('/')
    if base:
        return f'{base}/{url.lstrip("/")}'
    return url


def _usable_data_uri(raw: str) -> str:
    """Ignore truncated/corrupt base64 leftovers that browsers reject as ERR_INVALID_URL."""
    b64 = (raw or '').strip()
    if not b64:
        return ''
    if b64.startswith('data:'):
        payload = b64.split(',', 1)[-1] if ',' in b64 else ''
        if len(payload) < 200 or not b64.lower().startswith('data:image/'):
            return ''
        return b64
    if len(b64) < 200:
        return ''
    return f'data:image/jpeg;base64,{b64}'


def _driver_photo_url(driver, order=None, request=None) -> str:
    if order and getattr(order, 'driver_photo_url', None):
        stored = _abs_url(order.driver_photo_url, request)
        if stored.startswith('data:'):
            stored = _usable_data_uri(stored)
        if stored and 'res.cloudinary.com' in stored and '/upload/drivers/' in stored:
            stored = ''
        if stored:
            return stored
    if driver and getattr(driver, 'photo', None) and driver.photo:
        name = str(getattr(driver.photo, 'name', '') or '').lstrip('/')
        usable = True
        if name and not name.startswith(('daxi/', 'http://', 'https://')):
            try:
                usable = bool(driver.photo.storage.exists(name))
            except Exception:
                usable = not name.startswith('drivers/')
        if usable:
            try:
                url = _abs_url(driver.photo.url, request)
                if url and 'res.cloudinary.com' in url and '/upload/drivers/' in url:
                    url = ''
                if url:
                    return url
            except Exception:
                pass
    if driver and getattr(driver, 'photo_base64', None):
        return _usable_data_uri(driver.photo_base64)
    return ''


def driver_public_dict(driver, order=None, request=None) -> dict:
    """Infos chauffeur + véhicule pour client / track / polling."""
    if not driver and not (order and order.driver_name):
        return {
            'driver_id': None,
            'driver_name': None,
            'driver_phone': None,
            'driver_photo': None,
            'driver_vehicle': None,
            'driver_car_brand': None,
            'driver_car_model': None,
            'driver_car_year': None,
            'driver_car_image': None,
            'driver_plate': None,
            'driver_rating': None,
            'driver_rating_count': None,
            'driver_is_verified': False,
        }

    name = (getattr(order, 'driver_name', None) or '').strip() if order else ''
    phone = (getattr(order, 'driver_phone', None) or '').strip() if order else ''
    if driver:
        name = name or driver.get_full_name()
        phone = phone or (driver.phone or '')
    vehicle = (driver.vehicle or '').strip() if driver else ''
    brand = (driver.car_brand or '').strip() if driver else ''
    model = (driver.car_model or '').strip() if driver else ''
    year = (driver.car_year or '').strip() if driver else ''
    car_image = (driver.get_public_vehicle_image_url() or '').strip() if driver else ''
    plate = (driver.plate or '').strip() if driver else ''
    label = ' '.join(p for p in [brand, model] if p).strip() or vehicle

    return {
        'driver_id': driver.pk if driver else None,
        'driver_name': name or None,
        'driver_phone': phone or None,
        'driver_photo': _driver_photo_url(driver, order, request) or None,
        'driver_vehicle': vehicle or None,
        'driver_car_brand': brand or None,
        'driver_car_model': model or None,
        'driver_car_year': year or None,
        'driver_car_image': _abs_url(car_image, request) if car_image else None,
        'driver_plate': plate or None,
        'driver_rating': float(driver.rating) if driver and driver.rating else None,
        'driver_rating_count': int(driver.rating_count) if driver and driver.rating_count else None,
        'driver_is_verified': bool(driver.is_verified) if driver else False,
        'driver_vehicle_label': label or None,
    }
