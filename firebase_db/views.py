"""
Firebase Realtime Database REST API emulator.
Provides GET/PUT/PATCH/DELETE/POST endpoints that map to FirebaseNode objects.
Also bridges Django Order and Driver models into Firebase-compatible paths so
all 3 HTML pages (vubez2, adm, driver) can see live data without any extra changes.
"""
import json
import uuid
import time
from django.http import JsonResponse
from django.views import View
from django.db import transaction as db_transaction
from .models import FirebaseNode
from .access import authorize_firebase_read, authorize_firebase_write
from julmin_taxis.staff_auth import user_is_staff
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync


def _broadcast_change(path, event_type, data):
    """Send a WebSocket notification to subscribers of this path."""
    try:
        channel_layer = get_channel_layer()
        if channel_layer:
            parts = path.strip('/').split('/')
            for i in range(len(parts) + 1):
                sub_path = '/'.join(parts[:i]) if i > 0 else ''
                group_name = 'fb_' + sub_path.replace('/', '__').replace('-', '_')[:90]
                async_to_sync(channel_layer.group_send)(group_name, {
                    'type': 'firebase.change',
                    'event': event_type,
                    'path': path,
                    'data': data,
                })
    except Exception:
        pass


def _order_driver_photo(driver, order):
    try:
        from julmin_taxis.driver_display_utils import _driver_photo_url
        return _driver_photo_url(driver, order) or ''
    except Exception:
        return ''


def _order_to_firebase(order):
    """Convert a Django Order to a Firebase-compatible dict."""
    driver = order.driver
    result = {
                     
        'clientName': order.client_name or 'Client',
        'clientEmail': order.client_email or '',
        'clientPhone': order.client_phone or '',
              
        'pickup': order.pickup or '',
        'destination': order.destination or '',
                                                                    
        'pickup_lat': order.pickup_lat,
        'pickup_lng': order.pickup_lng,
        'destination_lat': order.destination_lat,
        'destination_lng': order.destination_lng,
                                 
        'latitude': order.pickup_lat,
        'longitude': order.pickup_lng,
        'destinationLatitude': order.destination_lat,
        'destinationLongitude': order.destination_lng,
                        
        'status': order.status,
        'price': float(order.price) if order.price else 0,
        'priceConfirmed': order.price_confirmed,
                     
        'driverId': driver.firebase_uid if driver else (order.firebase_uid or ''),
        'driverName': (driver.get_full_name() if driver else None) or order.driver_name or '',
        'driverPhone': (driver.phone if driver else None) or order.driver_phone or '',
        'driverPhoto': _order_driver_photo(driver, order),
                                
        'userId': order.firebase_user_id or '',
        'guestId': order.guest_id or '',
        'servicePlan': order.service_plan or '',
        'tripType': order.trip_type or 'one_way',
        'description': order.description or '',
        'timestamp': int(order.created_at.timestamp() * 1000) if order.created_at else 0,
                                      
        'djangoId': order.pk,
        '_source': 'django',
    }
                                                             
    if order.pickup_lat is not None and order.pickup_lng is not None:
        result['pickupLocation'] = {'lat': order.pickup_lat, 'lng': order.pickup_lng}
                                 
    if order.destination_lat is not None and order.destination_lng is not None:
        result['destinationLocation'] = {'lat': order.destination_lat, 'lng': order.destination_lng}
    return result


def _driver_to_firebase(driver):
    """Convert a Django Driver to a Firebase-compatible dict."""
    photo_url = ''
    try:
        from julmin_taxis.driver_display_utils import _driver_photo_url
        photo_url = _driver_photo_url(driver) or ''
    except Exception:
        try:
            if driver.photo:
                photo_url = driver.photo.url or ''
        except Exception:
            photo_url = ''
    return {
        'firstname': driver.firstname or '',
        'lastname': driver.lastname or '',
        'fullName': driver.get_full_name(),
        'phone': driver.phone or '',
        'city': driver.city or '',
        'email': driver.email or '',
        'vehicle': driver.vehicle or '',
        'plate': driver.plate or '',
        'status': driver.status or 'offline',
        'latitude': driver.latitude,
        'longitude': driver.longitude,
        'rating': float(driver.rating) if driver.rating else 0.0,
        'ratingCount': driver.rating_count,
        'completedTrips': driver.completed_trips,
        'photoURL': photo_url,
        'photo_url': photo_url,
        'photo': photo_url,
        'isBlocked': driver.is_blocked,
        'isVerified': driver.is_verified,
        'fcmToken': driver.fcm_token or '',
        'djangoId': driver.pk,
        '_source': 'django',
    }


                                           
_COMMANDE_PENDING_STATUSES = ['pending', 'price_proposed', 'price_confirmed']
_COMMANDE_CONFIRMED_STATUSES = ['driver_assigned', 'on_way', 'arrived', 'in_progress', 'completed', 'cancelled']


def _get_django_data_for_path(path):
    """
    Return Django model data formatted as Firebase-compatible dict for known paths.
    Returns None if the path is not a known bridged path.
    """
    try:
        from orders.models import Order
        from drivers.models import Driver
    except ImportError:
        return None

    if path == 'commande' or path == '':
        orders = Order.objects.filter(status__in=_COMMANDE_PENDING_STATUSES).select_related('driver')
        result = {}
        for o in orders:
            key = o.firebase_uid if o.firebase_uid else f'django_{o.pk}'
            result[key] = _order_to_firebase(o)
        return result

    if path.startswith('commande/'):
        key = path[len('commande/'):]
                                                   
        try:
            o = Order.objects.select_related('driver').get(firebase_uid=key, status__in=_COMMANDE_PENDING_STATUSES)
            return _order_to_firebase(o)
        except Order.DoesNotExist:
            pass
        if key.startswith('django_'):
            try:
                o = Order.objects.select_related('driver').get(pk=int(key[7:]))
                return _order_to_firebase(o)
            except (Order.DoesNotExist, ValueError):
                pass
        return None

    if path == 'commande_confirmed':
        orders = Order.objects.filter(status__in=_COMMANDE_CONFIRMED_STATUSES).select_related('driver')
        result = {}
        for o in orders:
            key = o.firebase_uid if o.firebase_uid else f'django_{o.pk}'
            result[key] = _order_to_firebase(o)
        return result

    if path.startswith('commande_confirmed/'):
        key = path[len('commande_confirmed/'):]
        try:
            o = Order.objects.select_related('driver').get(firebase_uid=key, status__in=_COMMANDE_CONFIRMED_STATUSES)
            return _order_to_firebase(o)
        except Order.DoesNotExist:
            pass
        if key.startswith('django_'):
            try:
                o = Order.objects.select_related('driver').get(pk=int(key[7:]))
                return _order_to_firebase(o)
            except (Order.DoesNotExist, ValueError):
                pass
        return None

    if path == 'drivers':
        drivers = Driver.objects.filter(is_blocked=False)
        result = {}
        for d in drivers:
            key = d.firebase_uid if d.firebase_uid else f'django_{d.pk}'
            result[key] = _driver_to_firebase(d)
        return result

    if path.startswith('drivers/'):
        key = path[len('drivers/'):]
        try:
            d = Driver.objects.get(firebase_uid=key)
            return _driver_to_firebase(d)
        except Driver.DoesNotExist:
            pass
        if key.startswith('django_'):
            try:
                d = Driver.objects.get(pk=int(key[7:]))
                return _driver_to_firebase(d)
            except (Driver.DoesNotExist, ValueError):
                pass
        return None

    return None                      


def _merge_firebase_and_django(path, firebase_data, django_data):
    """Merge FirebaseNode data with Django model data, Django taking precedence."""
    if django_data is None:
        return firebase_data
    if firebase_data is None:
        return django_data
                                                                         
    if isinstance(firebase_data, dict) and isinstance(django_data, dict):
        merged = dict(firebase_data)
        merged.update(django_data)
        return merged
    return django_data


def _get_node_data(path):
    """Get all data under a path (including children)."""
    path = path.strip('/')
    if not path:
        nodes = FirebaseNode.objects.all()
        result = {}
        for node in nodes:
            _set_nested(result, node.path.strip('/').split('/'), node.data)
        return result

    try:
        node = FirebaseNode.objects.get(path=path)
        children = FirebaseNode.objects.filter(path__startswith=path + '/')
        if not children.exists():
            return node.data
        result = dict(node.data) if isinstance(node.data, dict) else {}
        for child in children:
            child_path = child.path[len(path) + 1:]
            parts = child_path.split('/')
            _set_nested(result, parts, child.data)
        return result
    except FirebaseNode.DoesNotExist:
        pass

    children = FirebaseNode.objects.filter(path__startswith=path + '/')
    if children.exists():
        result = {}
        for child in children:
            child_path = child.path[len(path) + 1:]
            parts = child_path.split('/')
            _set_nested(result, parts, child.data)
        return result

    return None


def _set_nested(d, parts, value):
    """Set a value in a nested dict using path parts."""
    for part in parts[:-1]:
        if part not in d or not isinstance(d[part], dict):
            d[part] = {}
        d = d[part]
    if parts:
        d[parts[-1]] = value


def _resolve_server_values(data):
    """Replace {'.sv': 'timestamp'} with current timestamp."""
    if isinstance(data, dict):
        if data.get('.sv') == 'timestamp':
            return int(time.time() * 1000)
        return {k: _resolve_server_values(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_resolve_server_values(v) for v in data]
    return data


def _query_nodes(path, order_by=None, equal_to=None, limit_to_first=None, limit_to_last=None):
    """Query children of a path with optional filtering."""
    path = path.strip('/')
    prefix = path + '/' if path else ''

    nodes = FirebaseNode.objects.filter(path__startswith=prefix) if prefix else FirebaseNode.objects.all()

    result = {}
    for node in nodes:
        rel_path = node.path[len(prefix):]
        if '/' in rel_path:
            continue
        key = rel_path
        data = node.data

        if order_by and equal_to is not None:
            if isinstance(data, dict):
                val = data.get(order_by)
                if str(val) != str(equal_to) and val != equal_to:
                    continue
            else:
                continue

        result[key] = data

    return result


class FirebaseNodeView(View):
    def get(self, request, path=''):
        path = path.strip('/')
        if not authorize_firebase_read(request, path):
            return JsonResponse({'error': 'Accès refusé'}, status=403)

        order_by = request.GET.get('orderBy')
        equal_to = request.GET.get('equalTo')

        if order_by:
            firebase_data = _query_nodes(path, order_by, equal_to)
        else:
            firebase_data = _get_node_data(path)

                                                                      
        django_data = _get_django_data_for_path(path)
        data = _merge_firebase_and_django(path, firebase_data, django_data)

        return JsonResponse({'data': data, 'exists': data is not None})

    def put(self, request, path=''):
        path = path.strip('/')
        if not authorize_firebase_write(request, path):
            return JsonResponse({'error': 'Accès refusé'}, status=403)
        try:
            body = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        body = _resolve_server_values(body)

        FirebaseNode.objects.filter(path__startswith=path + '/').delete()

        if body is None:
            FirebaseNode.objects.filter(path=path).delete()
            _broadcast_change(path, 'removed', None)
        else:
            node, created = FirebaseNode.objects.update_or_create(
                path=path,
                defaults={'data': body}
            )
            _broadcast_change(path, 'value', body)

                                                                      
        _sync_write_to_django(path, body, is_staff=user_is_staff(request))

        return JsonResponse({'success': True, 'path': path})

    def patch(self, request, path=''):
        path = path.strip('/')
        if not authorize_firebase_write(request, path):
            return JsonResponse({'error': 'Accès refusé'}, status=403)
        try:
            updates = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        updates = _resolve_server_values(updates)

        with db_transaction.atomic():
            try:
                node = FirebaseNode.objects.select_for_update().get(path=path)
                if isinstance(node.data, dict) and isinstance(updates, dict):
                    node.data.update(updates)
                else:
                    node.data = updates
                node.save()
            except FirebaseNode.DoesNotExist:
                FirebaseNode.objects.create(path=path, data=updates)

        _broadcast_change(path, 'value', _get_node_data(path))

                                                         
        _sync_update_to_django(path, updates, is_staff=user_is_staff(request))

        return JsonResponse({'success': True, 'path': path})

    def delete(self, request, path=''):
        path = path.strip('/')
        if not authorize_firebase_write(request, path):
            return JsonResponse({'error': 'Accès refusé'}, status=403)
        FirebaseNode.objects.filter(path=path).delete()
        FirebaseNode.objects.filter(path__startswith=path + '/').delete()
        _broadcast_change(path, 'removed', None)
        return JsonResponse({'success': True, 'path': path})

    def post(self, request, path=''):
        path = path.strip('/')
        if not authorize_firebase_write(request, path):
            return JsonResponse({'error': 'Accès refusé'}, status=403)
        try:
            body = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        body = _resolve_server_values(body)

        new_key = _generate_push_key()
        new_path = path + '/' + new_key if path else new_key

        FirebaseNode.objects.create(path=new_path, data=body)
        _broadcast_change(new_path, 'child_added', body)
        _broadcast_change(path, 'value', _get_node_data(path))

                                              
        if path in ('commande', 'commande_confirmed'):
            _sync_write_to_django(new_path, body, is_staff=user_is_staff(request))

        return JsonResponse({'success': True, 'key': new_key, 'path': new_path})


def _sync_write_to_django(path, data, is_staff=False):
    """Sync a Firebase write to the Django Order model when writing to commande paths."""
    if not isinstance(data, dict):
        return
    from julmin_taxis.order_security import filter_firebase_sync_data
    data = filter_firebase_sync_data(data, is_staff)
    if not data:
        return
    try:
        from orders.models import Order
        from drivers.models import Driver
        if path.startswith('commande/') or path.startswith('commande_confirmed/'):
            parts = path.split('/', 1)
            table = parts[0]
            firebase_key = parts[1] if len(parts) > 1 else ''
            if not firebase_key or '/' in firebase_key:
                return                  

                                                 
            order = Order.objects.filter(firebase_uid=firebase_key).first()
            if not order:
                order = Order(firebase_uid=firebase_key, firebase_table=table)

                                                  
            if 'clientName' in data:
                order.client_name = data['clientName']
            if 'clientEmail' in data:
                order.client_email = data['clientEmail']
            if 'clientPhone' in data:
                order.client_phone = data['clientPhone']
            if 'pickup' in data:
                order.pickup = data['pickup']
            if 'destination' in data:
                order.destination = data['destination']
            if 'latitude' in data and data['latitude'] is not None:
                try:
                    order.pickup_lat = float(data['latitude'])
                except (TypeError, ValueError):
                    pass
            if 'longitude' in data and data['longitude'] is not None:
                try:
                    order.pickup_lng = float(data['longitude'])
                except (TypeError, ValueError):
                    pass
            if 'pickupLocation' in data and isinstance(data['pickupLocation'], dict):
                try:
                    order.pickup_lat = float(data['pickupLocation'].get('lat', order.pickup_lat or 0))
                    order.pickup_lng = float(data['pickupLocation'].get('lng', order.pickup_lng or 0))
                except (TypeError, ValueError):
                    pass
            if 'destinationLatitude' in data and data['destinationLatitude'] is not None:
                try:
                    order.destination_lat = float(data['destinationLatitude'])
                except (TypeError, ValueError):
                    pass
            if 'destinationLongitude' in data and data['destinationLongitude'] is not None:
                try:
                    order.destination_lng = float(data['destinationLongitude'])
                except (TypeError, ValueError):
                    pass
            if 'destinationLocation' in data and isinstance(data['destinationLocation'], dict):
                try:
                    order.destination_lat = float(data['destinationLocation'].get('lat', order.destination_lat or 0))
                    order.destination_lng = float(data['destinationLocation'].get('lng', order.destination_lng or 0))
                except (TypeError, ValueError):
                    pass
            if 'status' in data:
                status_map = {
                    'pending': 'pending', 'price_proposed': 'price_proposed',
                    'price_confirmed': 'price_confirmed', 'accepted': 'driver_assigned',
                    'driver_assigned': 'driver_assigned', 'on_way': 'on_way',
                    'driver_on_way': 'on_way', 'arrived': 'arrived',
                    'driver_arrived': 'arrived', 'in_progress': 'in_progress',
                    'trip_started': 'in_progress', 'finished': 'completed',
                    'completed': 'completed', 'cancelled': 'cancelled',
                }
                order.status = status_map.get(data['status'], data['status'])
            if 'price' in data:
                try:
                    order.price = float(data['price'])
                except (TypeError, ValueError):
                    pass
            if 'priceConfirmed' in data:
                order.price_confirmed = bool(data['priceConfirmed'])
            if 'userId' in data:
                order.firebase_user_id = str(data['userId'])
            if 'guestId' in data:
                order.guest_id = str(data['guestId'])
            if 'driverName' in data:
                order.driver_name = data['driverName']
            if 'driverPhone' in data:
                order.driver_phone = data['driverPhone']
            if 'driverId' in data and data['driverId']:
                try:
                    drv = Driver.objects.filter(firebase_uid=data['driverId']).first()
                    if drv:
                        order.driver = drv
                except Exception:
                    pass
            if 'description' in data:
                order.description = data['description']
            if 'servicePlan' in data:
                order.service_plan = str(data['servicePlan'])
            if 'tripType' in data:
                order.trip_type = data['tripType']
            order.save()
    except Exception:
        pass                       


def _sync_update_to_django(path, updates, is_staff=False):
    """Sync partial updates (PATCH) to Django model."""
    if not isinstance(updates, dict):
        return
    try:
        from orders.models import Order
        if path.startswith('commande/') or path.startswith('commande_confirmed/'):
            parts = path.split('/', 1)
            firebase_key = parts[1] if len(parts) > 1 else ''
            if not firebase_key or '/' in firebase_key:
                return
            order = Order.objects.filter(firebase_uid=firebase_key).first()
            if order:
                _sync_write_to_django(
                    path,
                    {**({'status': order.status}), **updates},
                    is_staff=is_staff,
                )
    except Exception:
        pass

                                         
    try:
        from drivers.models import Driver
        if path.startswith('drivers/') and '/' in path[len('drivers/'):]:
            return                                           
        if path.startswith('drivers/'):
            firebase_key = path[len('drivers/'):]
            if not firebase_key or '/' in firebase_key:
                return
            driver = Driver.objects.filter(firebase_uid=firebase_key).first()
            if driver:
                changed = False
                if 'latitude' in updates and updates['latitude'] is not None:
                    try:
                        driver.latitude = float(updates['latitude'])
                        changed = True
                    except (TypeError, ValueError):
                        pass
                if 'longitude' in updates and updates['longitude'] is not None:
                    try:
                        driver.longitude = float(updates['longitude'])
                        changed = True
                    except (TypeError, ValueError):
                        pass
                if 'status' in updates:
                    status_map = {'available': 'available', 'busy': 'busy', 'offline': 'offline', 'finished': 'available'}
                    driver.status = status_map.get(updates['status'], 'available')
                    changed = True
                if 'fcmToken' in updates:
                    driver.fcm_token = updates['fcmToken'] or ''
                    changed = True
                if changed:
                    driver.save()
    except Exception:
        pass


class FirebaseTransactionView(View):
    def post(self, request, path=''):
        path = path.strip('/')
        if not authorize_firebase_write(request, path):
            return JsonResponse({'error': 'Accès refusé'}, status=403)
        try:
            body = json.loads(request.body)
        except Exception:
            return JsonResponse({'error': 'Invalid JSON'}, status=400)

        new_value = body.get('value')
        new_value = _resolve_server_values(new_value)

        with db_transaction.atomic():
            try:
                node = FirebaseNode.objects.select_for_update().get(path=path)
                node.data = new_value
                node.save()
            except FirebaseNode.DoesNotExist:
                FirebaseNode.objects.create(path=path, data=new_value)

        _broadcast_change(path, 'value', new_value)
        return JsonResponse({'success': True, 'value': new_value})


class FirebasePushKeyView(View):
    def post(self, request, path=''):
        path = path.strip('/')
        if not authorize_firebase_write(request, path):
            return JsonResponse({'error': 'Accès refusé'}, status=403)
        key = _generate_push_key()
        return JsonResponse({'key': key})


def _generate_push_key():
    """
    Generate a Firebase-like push ID.
    Format: timestamp-based + random, sortable chronologically.
    """
    now_ms = int(time.time() * 1000)
    chars = '-0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ_abcdefghijklmnopqrstuvwxyz'
    ts_chars = []
    for _ in range(8):
        ts_chars.append(chars[now_ms % 64])
        now_ms //= 64
    ts_part = ''.join(reversed(ts_chars))

    import random
    rand_part = ''.join(random.choice(chars) for _ in range(12))

    return ts_part + rand_part
