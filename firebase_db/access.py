from urllib.parse import parse_qs

from julmin_taxis.security_utils import guest_ids_match, normalize_guest_id


def _session_driver(request):
    did = request.session.get('driver_id')
    if not did:
        return None
    try:
        from drivers.models import Driver
        return Driver.objects.filter(pk=did, is_blocked=False).first()
    except Exception:
        return None


def _order_for_firebase_key(fb_key):
    if not fb_key or '/' in fb_key:
        return None
    from orders.models import Order
    return Order.objects.filter(firebase_uid=fb_key).first()


def _guest_from_request(request):
    return normalize_guest_id(
        request.session.get('guest_id') or request.GET.get('guest_id') or ''
    )


def _is_staff_user(user, session):
    if session and session.get('is_admin'):
        return True
    return bool(user and getattr(user, 'is_authenticated', False) and user.is_staff)


def _can_access_order(request, order):
    if not order:
        return False
    from julmin_taxis.staff_auth import user_is_staff
    if user_is_staff(request):
        return True
    user = getattr(request, 'user', None)
    if user and user.is_authenticated and order.user_id == user.id:
        return True
    guest = _guest_from_request(request)
    if guest and order.guest_id and guest_ids_match(guest, order.guest_id):
        return True
    driver = _session_driver(request)
    if driver and order.driver_id == driver.id:
        return True
    eid = request.session.get('current_enterprise_id') or request.session.get('enterprise_id')
    if eid and getattr(order, 'enterprise_id', None) and int(eid) == int(order.enterprise_id):
        return True
    return False


def _auth_context_from_scope(scope):
    qs = parse_qs(scope.get('query_string', b'').decode())
    session = scope.get('session') or {}
    user = scope.get('user')
    guest = normalize_guest_id(
        session.get('guest_id') or (qs.get('guest_id') or [''])[0]
    )
    return user, session, guest, qs


def _can_access_order_scope(user, session, guest, order):
    if not order:
        return False
    if _is_staff_user(user, session):
        return True
    if user and getattr(user, 'is_authenticated', False) and order.user_id == user.id:
        return True
    if guest and order.guest_id and guest_ids_match(guest, order.guest_id):
        return True
    driver_id = session.get('driver_id')
    if driver_id and order.driver_id and int(driver_id) == int(order.driver_id):
        from drivers.models import Driver
        try:
            d = Driver.objects.get(pk=int(driver_id), is_blocked=False)
            if order.driver_id == d.id:
                return True
        except (Driver.DoesNotExist, ValueError, TypeError):
            pass
    eid = session.get('current_enterprise_id') or session.get('enterprise_id')
    if eid and getattr(order, 'enterprise_id', None) and int(eid) == int(order.enterprise_id):
        return True
    return False


def authorize_firebase_read(request, path):
    path = (path or '').strip('/')
    from julmin_taxis.staff_auth import user_is_staff
    if user_is_staff(request):
        return True
    if not path:
        return False
    if path.startswith('drivers/'):
        fb_key = path.split('/', 1)[1].split('/')[0]
        driver = _session_driver(request)
        if driver and driver.firebase_uid == fb_key:
            return True
        return False
    if path.startswith('commande/') or path.startswith('commande_confirmed/'):
        fb_key = path.split('/', 1)[1].split('/')[0]
        return _can_access_order(request, _order_for_firebase_key(fb_key))
    if path in ('commande', 'commande_confirmed'):
        return False
    return False


def authorize_firebase_read_scope(scope, path):
    path = (path or '').strip('/')
    user, session, guest, _ = _auth_context_from_scope(scope)
    if _is_staff_user(user, session):
        return True
    if not path:
        return False
    if path.startswith('drivers/'):
        fb_key = path.split('/', 1)[1].split('/')[0]
        driver_id = session.get('driver_id')
        if not driver_id:
            return False
        from drivers.models import Driver
        try:
            driver = Driver.objects.get(pk=int(driver_id), is_blocked=False)
            return driver.firebase_uid == fb_key
        except (Driver.DoesNotExist, ValueError, TypeError):
            return False
    if path.startswith('commande/') or path.startswith('commande_confirmed/'):
        fb_key = path.split('/', 1)[1].split('/')[0]
        return _can_access_order_scope(user, session, guest, _order_for_firebase_key(fb_key))
    if path in ('commande', 'commande_confirmed'):
        return False
    return False


def authorize_firebase_write(request, path):
    path = (path or '').strip('/')
    from julmin_taxis.staff_auth import user_is_staff
    if user_is_staff(request):
        return True
    if path.startswith('drivers/'):
        fb_key = path.split('/', 1)[1].split('/')[0]
        driver = _session_driver(request)
        return driver and driver.firebase_uid == fb_key
    if path.startswith('commande/') or path.startswith('commande_confirmed/'):
        fb_key = path.split('/', 1)[1].split('/')[0]
        order = _order_for_firebase_key(fb_key)
        if order:
            return _can_access_order(request, order)
        guest = _guest_from_request(request)
        user = getattr(request, 'user', None)
        return bool(guest) or (user and user.is_authenticated)
    if path in ('commande', 'commande_confirmed'):
        guest = _guest_from_request(request)
        user = getattr(request, 'user', None)
        return bool(guest) or (user and user.is_authenticated)
    return False
