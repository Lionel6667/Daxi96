"""
DAXI Uber-like Tracking & Real-Time Views
Real-time order tracking, coordinate capture, distance/ETA calculations.
"""
import json
import math
from datetime import datetime, timedelta
from django.http import JsonResponse, HttpResponse
from django.utils import timezone
from django.conf import settings

from orders.models import Order
from drivers.models import Driver
from julmin_taxis.round_trip_utils import (
    is_round_trip_order,
    round_trip_phase,
    round_trip_wait_remaining_seconds,
)
from julmin_taxis.driver_display_utils import driver_public_dict


def _notify_ws_tracking(group: str, event_type: str, data: dict):
    """Broadcast a WebSocket message via Django Channels (tracking events)."""
    try:
        from asgiref.sync import async_to_sync
        from channels.layers import get_channel_layer
        layer = get_channel_layer()
        if layer:
            async_to_sync(layer.group_send)(group, {
                'type': 'broadcast_message',
                'message': {'type': event_type, 'data': data}
            })
    except Exception:
        pass


def _get_driver(request):
    did = request.session.get('driver_id')
    if not did:
        return None
    try:
        return Driver.objects.get(pk=did, is_blocked=False)
    except Driver.DoesNotExist:
        return None


def _get_current_enterprise(request):
    from enterprises.models import Enterprise
    eid = request.session.get('current_enterprise_id') or request.session.get('enterprise_id')
    if not eid:
        return None
    try:
        return Enterprise.objects.get(pk=eid, status='approved')
    except Exception:
        return None


def _haversine(lat1, lng1, lat2, lng2):
    """Calculate distance in meters between two GPS coordinates."""
    R = 6371000                          
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lng2 - lng1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


def _estimate_duration_seconds(distance_meters, speed_kmh=25):
    """Estimate travel duration in seconds given distance and average speed."""
    if distance_meters <= 0:
        return 0
    speed_ms = (speed_kmh * 1000) / 3600
    return int(distance_meters / speed_ms)


def _format_duration(seconds):
    """Format seconds into human readable duration."""
    if seconds < 60:
        return f"{seconds}s"
    mins = seconds // 60
    if mins < 60:
        return f"{mins} min"
    hrs = mins // 60
    rem_mins = mins % 60
    return f"{hrs}h {rem_mins}min"


def _order_track_dict(order: Order):
    """Build tracking data dict for an order."""
    driver = order.driver
    now = timezone.now()
    
                                                                                   
    client_lat = order.client_gps_lat or order.pickup_lat
    client_lng = order.client_gps_lng or order.pickup_lng
    
                     
    drv_lat = driver.latitude if driver else None
    drv_lng = driver.longitude if driver else None
    
                 
    dest_lat = order.destination_lat
    dest_lng = order.destination_lng

    rt_phase = round_trip_phase(order)
    nav_target = None
    if is_round_trip_order(order):
        if order.status == 'in_progress' and rt_phase == 'return':
            nav_target = 'pickup'
        elif order.status == 'in_progress':
            nav_target = 'destination'
        elif order.status == 'waiting_return':
            nav_target = 'waiting'
    
    
    eta_dest_lat, eta_dest_lng = dest_lat, dest_lng
    if nav_target == 'pickup':
        eta_dest_lat, eta_dest_lng = order.pickup_lat, order.pickup_lng
    
                      
    dist_driver_client = None
    eta_driver_client = None
    dist_client_destination = None
    eta_total = None
    
    if drv_lat is not None and drv_lng is not None and client_lat is not None and client_lng is not None:
        dist_driver_client = round(_haversine(drv_lat, drv_lng, client_lat, client_lng), 1)
        eta_driver_client = _estimate_duration_seconds(dist_driver_client)
    
    if client_lat is not None and client_lng is not None and eta_dest_lat is not None and eta_dest_lng is not None:
        dist_client_destination = round(_haversine(client_lat, client_lng, eta_dest_lat, eta_dest_lng), 1)
    
    if dist_driver_client is not None and dist_client_destination is not None:
        eta_total = _estimate_duration_seconds(dist_driver_client + dist_client_destination)
    elif dist_driver_client is not None:
        eta_total = eta_driver_client
    
                        
    trigger_driver_arrived = dist_driver_client is not None and dist_driver_client <= 300
    trigger_with_client = dist_driver_client is not None and dist_driver_client <= 50
    trigger_destination_near = dist_client_destination is not None and dist_client_destination <= 500 if dist_client_destination else False
    trigger_client_with_driver = dist_driver_client is not None and dist_driver_client <= 50
    trigger_client_arrived = dist_client_destination is not None and dist_client_destination <= 500
    
                          
    is_later_active = False
    time_until_scheduled = None
    if order.is_later and order.scheduled_at:
        diff = (order.scheduled_at - now).total_seconds()
        time_until_scheduled = int(diff)
        is_later_active = diff <= 3600                        
    
    return {
        'order_id': order.pk,
        'status': order.status,
        'driver_lat': drv_lat,
        'driver_lng': drv_lng,
        'client_lat': client_lat,
        'client_lng': client_lng,
        'client_gps_accuracy': order.client_gps_accuracy,
        'destination_lat': dest_lat,
        'destination_lng': dest_lng,
        'is_round_trip': is_round_trip_order(order),
        'round_trip_phase': rt_phase,
        'round_trip_wait_minutes': int(order.round_trip_wait_minutes or 0),
        'round_trip_wait_remaining_seconds': round_trip_wait_remaining_seconds(order),
        'round_trip_nav_target': nav_target,
        'pickup': clean_address_display(order.pickup),
        'destination': clean_address_display(order.destination),
        'distance_driver_client': dist_driver_client,
        'distance_client_destination': dist_client_destination,
        'eta_driver_client': eta_driver_client,
        'eta_driver_client_display': _format_duration(eta_driver_client) if eta_driver_client else None,
        'eta_total': eta_total,
        'eta_total_display': _format_duration(eta_total) if eta_total else None,
        'trigger_driver_arrived': trigger_driver_arrived,
        'trigger_with_client': trigger_with_client,
        'trigger_destination_near': trigger_destination_near,
        'trigger_client_with_driver': trigger_client_with_driver,
        'trigger_client_arrived': trigger_client_arrived,
        'is_later': order.is_later,
        'scheduled_at': order.scheduled_at.isoformat() if order.scheduled_at else None,
        'time_until_scheduled': time_until_scheduled,
        'is_later_active': is_later_active,
        'pickup_coords_set_by_driver': order.pickup_coords_set_by_driver,
        'dest_coords_set_by_driver': order.dest_coords_set_by_driver,
        **driver_public_dict(driver, order),
    }


                                                                                
                                             
                                                                                

def order_track(request, order_id):
    """GET /htmx/order/<order_id>/track/ — returns JSON tracking data."""
    try:
        order = Order.objects.select_related('driver').get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        return JsonResponse({'error': 'Commande introuvable.'}, status=404)
    
                                                                   
    is_owner = (request.user.is_authenticated and order.user == request.user)
    is_guest = (request.session.get('guest_id') == order.guest_id and order.guest_id)
    is_driver = (_get_driver(request) == order.driver)
    is_admin = request.session.get('is_admin')
    
    if not (is_owner or is_guest or is_driver or is_admin):
        return JsonResponse({'error': 'Accès non autorisé.'}, status=403)
    
    return JsonResponse(_order_track_dict(order))


                                                                                
                                               
                                                                                

def driver_set_order_coords(request, order_id):
    """POST /htmx/driver/orders/<order_id>/set-coords/
    Driver sets pickup/destination coordinates when order was created without them.
    """
    driver = _get_driver(request)
    if not driver:
        return HttpResponse('<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">Non connecté.</div>', status=200)
    
    if request.method != 'POST':
        return HttpResponse('<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">Méthode non supportée.</div>', status=200)
    
    try:
        order = Order.objects.get(pk=int(order_id), driver=driver)
    except (Order.DoesNotExist, ValueError):
        return HttpResponse('<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">Commande introuvable.</div>', status=200)
    
    pickup_lat = request.POST.get('pickup_lat', '').strip()
    pickup_lng = request.POST.get('pickup_lng', '').strip()
    dest_lat = request.POST.get('destination_lat', '').strip()
    dest_lng = request.POST.get('destination_lng', '').strip()
    
    updated = False
    if pickup_lat and pickup_lng:
        try:
            order.pickup_lat = float(pickup_lat)
            order.pickup_lng = float(pickup_lng)
            order.pickup_coords_set_by_driver = True
            updated = True
        except ValueError:
            pass
    
    if dest_lat and dest_lng:
        try:
            order.destination_lat = float(dest_lat)
            order.destination_lng = float(dest_lng)
            order.dest_coords_set_by_driver = True
            updated = True
        except ValueError:
            pass
    
    if updated:
        order.save(update_fields=['pickup_lat', 'pickup_lng', 'destination_lat', 'destination_lng',
                                   'pickup_coords_set_by_driver', 'dest_coords_set_by_driver', 'updated_at'])
                                                    
        if order.pickup_lat and order.pickup_lng and order.destination_lat and order.destination_lng:
            try:
                from pricing.pricing_engine import calculate_price as _calc_price
                result = _calc_price(
                    origin_lat=order.pickup_lat, origin_lng=order.pickup_lng,
                    dest_lat=order.destination_lat, dest_lng=order.destination_lng,
                    order_id=str(order.pk), save_log=True,
                )
                base_price = float(result.get('final_price', 0))
                if base_price:
                    from decimal import Decimal
                    order.price = Decimal(str(round(base_price, 2)))
                    order.price_confirmed = True
                    order.status = 'price_confirmed'
                    order.save(update_fields=['price', 'price_confirmed', 'status', 'updated_at'])
            except Exception:
                pass
        
                                                                             
        _notify_ws_tracking(f'order_{order.pk}', 'coords_set', {
            'order_id': order.pk,
            'pickup_lat': order.pickup_lat,
            'pickup_lng': order.pickup_lng,
            'destination_lat': order.destination_lat,
            'destination_lng': order.destination_lng,
            'price': float(order.price) if order.price else None,
            'status': order.status,
        })
        _notify_ws_tracking('admin_orders', 'order_updated', {'order_id': order.pk})
        try:
            from julmin_taxis.notify import notify_coords_set_event
            notify_coords_set_event(order)
        except Exception:
            pass

        return HttpResponse(
            f'<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-3" id="co-{order.pk}-coords-msg">'
            f'✅ Coordonnées enregistrées. Prix recalculé automatiquement.</div>',
            status=200
        )
    
    return HttpResponse(
        f'<div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded mb-3" id="co-{order.pk}-coords-msg">'
        f'⚠️ Aucune coordonnée valide reçue.</div>',
        status=200
    )


                                                                                
                                    
                                                                                

def check_later_transitions():
    """
    Called periodically (e.g. from a management command or cron).
    Moves LATER orders to NOW when scheduled_at <= now.
    Returns the number of transitioned orders.
    """
    now = timezone.now()
    later_orders = Order.objects.filter(
        is_later=True,
        scheduled_at__lte=now,
        status__in=['pending', 'price_proposed', 'price_confirmed', 'driver_assigned']
    )
    count = 0
    for order in later_orders:
        order.is_later = False
        order.save(update_fields=['is_later'])
        _notify_ws_tracking(f'order_{order.pk}', 'now_transition', {
            'order_id': order.pk,
            'message': 'Votre course planifiée est maintenant active.'
        })
        try:
            from julmin_taxis.notify import push_order_event
            push_order_event(order, 'now_transition')
        except Exception:
            pass
        _notify_ws_tracking('admin_orders', 'order_updated', {'order_id': order.pk})
        count += 1
    return count


                                                                                
                                   
                                                                                

def check_gps_reminders():
    """
    Send reminder/flag for LATER orders within 1 hour where GPS not recently updated.
    Also sends "driver on the way" WS + email for assigned orders approaching in 1h.
    Returns the number of reminders sent.
    """
    now = timezone.now()
    upcoming = Order.objects.filter(
        is_later=True,
        scheduled_at__lte=now + timedelta(hours=1),
        scheduled_at__gt=now,
        status__in=['pending', 'price_proposed', 'price_confirmed', 'driver_assigned']
    )
    stale_threshold = now - timedelta(minutes=30)
    count = 0

    # Rappels multi-jours (push app + WhatsApp pour J-1 / jour J)
    try:
        from django.core.cache import cache as _rm_cache
        from julmin_taxis.notify import push_order_event, notify_trip_reminder
        windows = (
            ('trip_reminder_7d', timedelta(days=7), timedelta(days=6, hours=12)),
            ('trip_reminder_3d', timedelta(days=3), timedelta(days=2, hours=12)),
            ('trip_reminder_1d', timedelta(days=1), timedelta(hours=20)),
            ('trip_reminder_same_day', timedelta(hours=12), timedelta(hours=2)),
        )
        later_base = Order.objects.filter(
            is_later=True,
            scheduled_at__gt=now,
            status__in=['pending', 'price_proposed', 'price_confirmed', 'driver_assigned'],
        )
        for event, upper, lower in windows:
            for order in later_base.filter(
                scheduled_at__lte=now + upper,
                scheduled_at__gt=now + lower,
            ):
                key = f'daxi:{event}:{order.pk}'
                if not _rm_cache.add(key, 1, timeout=86400 * 8):
                    continue
                try:
                    push_order_event(order, event)
                    _notify_ws_tracking(f'order_{order.pk}', event, {
                        'order_id': order.pk,
                        'status': order.status,
                        'scheduled_at': order.scheduled_at.isoformat() if order.scheduled_at else None,
                    })
                    # WhatsApp rappel générique (texte adapté via template)
                    if event in ('trip_reminder_1d', 'trip_reminder_same_day'):
                        notify_trip_reminder(order)
                    else:
                        try:
                            from julmin_taxis.notify import _safe_whatsapp
                            _safe_whatsapp(order, 'notify_client_trip_reminder')
                        except Exception:
                            pass
                    count += 1
                except Exception:
                    _rm_cache.delete(key)
    except Exception:
        pass

    for order in upcoming:
        
        if not order.reminder_sent and (order.client_phone or '').strip():
            try:
                from orders.models import Order as OrderModel
                updated = OrderModel.objects.filter(
                    pk=order.pk, reminder_sent=False,
                ).update(reminder_sent=True)
                if updated:
                    from julmin_taxis.notify import notify_trip_reminder
                    notify_trip_reminder(order)
                    count += 1
            except Exception:
                pass

        if not order.pickup_confirm_sent and not order.meeting_prompt_acknowledged:
            order.pickup_confirm_sent = True
            order.save(update_fields=['pickup_confirm_sent'])
            from julmin_taxis.meeting_point_utils import order_meeting_coords
            mlat, mlng = order_meeting_coords(order)
            _notify_ws_tracking(f'order_{order.pk}', 'pickup_confirm_prompt', {
                'order_id': order.pk,
                'pickup': order.pickup,
                'destination': order.destination,
                'meeting_lat': mlat,
                'meeting_lng': mlng,
                'scheduled_at': order.scheduled_at.isoformat() if order.scheduled_at else None,
                'is_later': order.is_later,
                'status': order.status,
                'message': (
                    'Votre course commence dans moins d\'1 heure. '
                    'Souhaitez-vous conserver le lieu de rendez-vous ou le modifier ?'
                ),
            })
            try:
                from julmin_taxis.notify import push_order_event
                push_order_event(order, 'pickup_confirm_prompt')
            except Exception:
                pass
            count += 1

        gps_stale = (
            order.client_gps_lat is None or
            order.client_gps_updated_at is None or
            order.client_gps_updated_at < stale_threshold
        )
        if gps_stale:
            _notify_ws_tracking(f'order_{order.pk}', 'gps_reminder', {
                'order_id': order.pk,
                'message': 'Veuillez mettre à jour votre position GPS. Votre course commence dans moins d\'1 heure.',
                'scheduled_at': order.scheduled_at.isoformat(),
            })
            try:
                from django.core.cache import cache as _cache
                if _cache.add(f'daxi:gps_reminder_push:{order.pk}', 1, 45 * 60):
                    from julmin_taxis.notify import push_order_event
                    push_order_event(order, 'gps_reminder')
            except Exception:
                pass
            count += 1

                                                                                       
        if order.status == 'driver_assigned' and order.driver:
            driver = order.driver
                                                                                 
            if driver.status == 'available':
                driver.status = 'busy'
                driver.save(update_fields=['status'])

            already_notified_key = f'_1h_enroute_{order.pk}'
                                                                       
            from django.core.cache import cache
            if not cache.get(already_notified_key):
                cache.set(already_notified_key, True, timeout=3600)
                _notify_ws_tracking(f'order_{order.pk}', 'driver_on_the_way', {
                    'order_id': order.pk,
                    'driver_name': driver.get_full_name(),
                    'driver_phone': driver.phone,
                    'message': f'Votre chauffeur {driver.get_full_name()} sera en route dans moins d\'1 heure !',
                    'scheduled_at': order.scheduled_at.isoformat(),
                })
                try:
                    from notifications.email_service import EmailService
                    if order.client_email:
                        EmailService.send_driver_assigned(order)
                except Exception as _e:
                    import logging
                    logging.getLogger(__name__).warning('1h email failed order %s: %s', order.pk, _e)

    return count


                                                                                
                                             
                                                                                

def client_update_gps(request, order_id):
    """POST /htmx/client/orders/<order_id>/update-gps/
    Client updates their current GPS position (for future orders pickup location).
    Surveille l'écart > 200 m par rapport au lieu de RDV figé (avec marge précision GPS).
    """
    from julmin_taxis.gps_trace import gps_trace

    try:
        order = Order.objects.get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        gps_trace('BACKEND', 'BACKEND_CLIENT_UPDATE_GPS_REJECT', ok=False, order_id=order_id, reason='order_not_found')
        return JsonResponse({'error': 'Commande introuvable.'}, status=404)

    lat_raw = request.POST.get('lat', '').strip()
    lng_raw = request.POST.get('lng', '').strip()
    acc_raw = request.POST.get('accuracy', '').strip()
    gps_trace(
        'BACKEND',
        'BACKEND_CLIENT_UPDATE_GPS_RECEIVED',
        order_id=order.pk,
        lat=lat_raw,
        lng=lng_raw,
        accuracy=acc_raw or None,
    )

    from julmin_taxis.security_utils import guest_ids_match
    is_owner = request.user.is_authenticated and order.user_id and order.user_id == request.user.id
    guest_id = (
        request.POST.get('guest_id', '')
        or request.GET.get('guest_id', '')
        or request.session.get('guest_id', '')
    )
    is_guest = bool(order.guest_id) and guest_ids_match(order.guest_id, guest_id)
    if not (is_owner or is_guest):
        gps_trace('BACKEND', 'BACKEND_CLIENT_UPDATE_GPS_REJECT', ok=False, order_id=order.pk, reason='forbidden')
        return JsonResponse({'error': 'Accès non autorisé.'}, status=403)
    
    if request.method != 'POST':
        gps_trace('BACKEND', 'BACKEND_CLIENT_UPDATE_GPS_REJECT', ok=False, order_id=order.pk, reason='method_not_allowed')
        return JsonResponse({'error': 'Méthode non supportée.'}, status=405)
    
    lat = lat_raw
    lng = lng_raw
    
    if not lat or not lng:
        gps_trace('BACKEND', 'BACKEND_CLIENT_UPDATE_GPS_REJECT', ok=False, order_id=order.pk, reason='missing_lat_lng')
        return JsonResponse({'error': 'Latitude et longitude requises.'}, status=400)
    
    try:
        lat_f, lng_f = float(lat), float(lng)
        from julmin_taxis.gps_accuracy import parse_client_gps_accuracy, CLIENT_GPS_MAX_M
        accuracy_m = parse_client_gps_accuracy(acc_raw)
        if acc_raw and accuracy_m is None:
            try:
                too_coarse = float(acc_raw)
            except ValueError:
                too_coarse = None
            if too_coarse is not None and too_coarse > CLIENT_GPS_MAX_M:
                gps_trace(
                    'BACKEND',
                    'BACKEND_CLIENT_UPDATE_GPS_REJECT',
                    ok=False,
                    order_id=order.pk,
                    reason='accuracy_too_coarse',
                    accuracy=acc_raw,
                )
                return JsonResponse({'error': 'GPS trop imprécis.'}, status=400)

        order.client_gps_lat = lat_f
        order.client_gps_lng = lng_f
        order.client_gps_updated_at = timezone.now()
        update_fields = ['client_gps_lat', 'client_gps_lng', 'client_gps_updated_at']
        if accuracy_m is not None:
            order.client_gps_accuracy = accuracy_m
            update_fields.append('client_gps_accuracy')
        order.save(update_fields=update_fields)
        gps_trace(
            'BACKEND',
            'BACKEND_CLIENT_UPDATE_GPS_SAVED',
            order_id=order.pk,
            lat=lat_f,
            lng=lng_f,
            accuracy=accuracy_m,
            client_gps_updated_at=order.client_gps_updated_at.isoformat(),
        )
        if order.driver_id:
            gps_payload = {
                'order_id': order.pk,
                'lat': lat_f,
                'lng': lng_f,
                'accuracy': accuracy_m if accuracy_m is not None else order.client_gps_accuracy,
            }
            _notify_ws_tracking(f'order_{order.pk}', 'client_gps_updated', gps_payload)
            _notify_ws_tracking(f'driver_{order.driver_id}', 'client_gps_updated', gps_payload)

        from julmin_taxis.meeting_point_utils import should_prompt_relocate
        active = {'pending', 'price_proposed', 'price_confirmed', 'driver_assigned', 'on_way', 'arrived', 'in_progress'}
        payload = {'success': True, 'message': 'Position mise à jour.'}
        if order.status in active:
            prompt, drift_m = should_prompt_relocate(order, lat_f, lng_f, accuracy_m=accuracy_m)
            if prompt and not order.meeting_relocate_dismissed and not order.meeting_prompt_acknowledged:
                if order.meeting_relocate_prompted_at is None:
                    order.meeting_relocate_prompted_at = timezone.now()
                    order.save(update_fields=['meeting_relocate_prompted_at'])
                    payload['relocate_prompt'] = True
                    payload['drift_meters'] = round(drift_m, 0)
                    payload['order'] = {
                        'id': order.pk,
                        'pickup': order.pickup,
                        'destination': order.destination,
                        'scheduled_at': order.scheduled_at.isoformat() if order.scheduled_at else None,
                        'is_later': order.is_later,
                        'status': order.status,
                    }
                    _notify_ws_tracking(f'order_{order.pk}', 'relocate_prompt', {
                        'order_id': order.pk,
                        'drift_meters': payload['drift_meters'],
                        'pickup': order.pickup,
                        'destination': order.destination,
                        'scheduled_at': order.scheduled_at.isoformat() if order.scheduled_at else None,
                        'is_later': order.is_later,
                        'message': (
                            'Nous avons remarqué que vous avez quitté le lieu de rendez-vous. '
                            'Souhaitez-vous faire de votre position actuelle le nouveau lieu de rendez-vous ?'
                        ),
                    })
                    try:
                        from julmin_taxis.notify import push_order_event
                        push_order_event(order, 'relocate_prompt')
                    except Exception:
                        pass
        return JsonResponse(payload)
    except ValueError:
        gps_trace('BACKEND', 'BACKEND_CLIENT_UPDATE_GPS_REJECT', ok=False, order_id=order_id, reason='invalid_coordinates')
        return JsonResponse({'error': 'Coordonnées invalides.'}, status=400)


def client_update_pickup(request, order_id):
    """POST /htmx/client/orders/<order_id>/update-pickup/
    Client moves pickup rendezvous to their current GPS position during active ride.
    """
    try:
        order = Order.objects.select_related('driver').get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        return JsonResponse({'error': 'Commande introuvable.'}, status=404)

    is_owner = (request.user.is_authenticated and order.user == request.user)
    guest_id = request.GET.get('guest_id', '').strip() or request.POST.get('guest_id', '').strip() or request.session.get('guest_id', '')
    is_guest = (guest_id and order.guest_id == guest_id and not order.user_id)
    if not (is_owner or is_guest):
        return JsonResponse({'error': 'Accès non autorisé.'}, status=403)

    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non supportée.'}, status=405)

    active = {'pending', 'price_proposed', 'price_confirmed', 'driver_assigned', 'on_way', 'arrived', 'in_progress'}
    if order.status not in active:
        return JsonResponse({'error': 'Modification impossible pour cette course.'}, status=400)

    lat = request.POST.get('lat', '').strip()
    lng = request.POST.get('lng', '').strip()
    address = (request.POST.get('address') or 'Ma position actuelle').strip()

    if not lat or not lng:
        return JsonResponse({'error': 'Latitude et longitude requises.'}, status=400)

    try:
        lat_f, lng_f = float(lat), float(lng)
        order.pickup_lat = lat_f
        order.pickup_lng = lng_f
        order.meeting_lat = lat_f
        order.meeting_lng = lng_f
        order.client_gps_lat = lat_f
        order.client_gps_lng = lng_f
        order.client_gps_updated_at = timezone.now()
        order.meeting_relocate_prompted_at = None
        order.meeting_prompt_acknowledged = True
        if address:
            order.pickup = address[:500]
        order.save(update_fields=[
            'pickup_lat', 'pickup_lng', 'meeting_lat', 'meeting_lng', 'pickup',
            'client_gps_lat', 'client_gps_lng', 'client_gps_updated_at',
            'meeting_relocate_prompted_at', 'meeting_prompt_acknowledged',
        ])
        if order.driver_id:
            from julmin_taxis.htmx_views import _notify_ws
            _notify_ws(f'driver_{order.driver_id}', 'pickup_updated', {
                'order_id': order.pk,
                'pickup_lat': lat_f,
                'pickup_lng': lng_f,
                'pickup': order.pickup,
            })
            try:
                from julmin_taxis.notify import _safe_push_driver
                _safe_push_driver(order.driver, 'pickup_updated', order)
            except Exception:
                pass
        return JsonResponse({
            'success': True,
            'pickup_lat': lat_f,
            'pickup_lng': lng_f,
            'pickup': order.pickup,
        })
    except ValueError:
        return JsonResponse({'error': 'Coordonnées invalides.'}, status=400)


def client_confirm_pickup(request, order_id):
    """POST /htmx/client/orders/<order_id>/confirm-pickup/
    LATER ~1h avant : garder le RDV, utiliser GPS actuel, ou adresse manuelle.
    Body: choice=keep|gps|manual ; lat,lng,address pour manual/gps.
    """
    try:
        order = Order.objects.select_related('driver').get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        return JsonResponse({'error': 'Commande introuvable.'}, status=404)

    is_owner = (request.user.is_authenticated and order.user == request.user)
    guest_id = request.POST.get('guest_id', '').strip() or request.session.get('guest_id', '')
    is_guest = (guest_id and order.guest_id == guest_id and not order.user_id)
    if not (is_owner or is_guest):
        return JsonResponse({'error': 'Accès non autorisé.'}, status=403)

    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non supportée.'}, status=405)

    choice = (request.POST.get('choice') or '').strip().lower()
    if choice in ('keep', 'decline'):
        order.meeting_relocate_dismissed = True
        order.meeting_prompt_acknowledged = True
        order.save(update_fields=['meeting_relocate_dismissed', 'meeting_prompt_acknowledged'])
        return JsonResponse({'success': True, 'message': 'Lieu de rendez-vous conservé.'})

    lat = request.POST.get('lat', '').strip()
    lng = request.POST.get('lng', '').strip()
    address = (request.POST.get('address') or '').strip()

    if choice == 'gps':
        lat = lat or (str(order.client_gps_lat) if order.client_gps_lat else '')
        lng = lng or (str(order.client_gps_lng) if order.client_gps_lng else '')
        address = address or 'Ma position actuelle'

    if choice not in ('gps', 'manual') or not lat or not lng:
        return JsonResponse({'error': 'Choix ou coordonnées invalides.'}, status=400)

    try:
        lat_f, lng_f = float(lat), float(lng)
        order.pickup_lat = lat_f
        order.pickup_lng = lng_f
        order.meeting_lat = lat_f
        order.meeting_lng = lng_f
        order.client_gps_lat = lat_f
        order.client_gps_lng = lng_f
        order.client_gps_updated_at = timezone.now()
        order.meeting_relocate_prompted_at = None
        order.meeting_prompt_acknowledged = True
        if address:
            order.pickup = address[:500]
        order.save(update_fields=[
            'pickup_lat', 'pickup_lng', 'meeting_lat', 'meeting_lng', 'pickup',
            'client_gps_lat', 'client_gps_lng', 'client_gps_updated_at',
            'meeting_relocate_prompted_at', 'meeting_prompt_acknowledged',
        ])
        if order.driver_id:
            from julmin_taxis.htmx_views import _notify_ws
            _notify_ws(f'driver_{order.driver_id}', 'pickup_updated', {
                'order_id': order.pk,
                'pickup_lat': lat_f,
                'pickup_lng': lng_f,
                'pickup': order.pickup,
            })
            try:
                from julmin_taxis.notify import _safe_push_driver
                _safe_push_driver(order.driver, 'pickup_updated', order)
            except Exception:
                pass
        return JsonResponse({
            'success': True,
            'pickup_lat': lat_f,
            'pickup_lng': lng_f,
            'pickup': order.pickup,
            'message': 'Lieu de rendez-vous mis à jour.',
        })
    except ValueError:
        return JsonResponse({'error': 'Coordonnées invalides.'}, status=400)


                                                                                
                                               
                                                                                

def driver_update_order_status(request, order_id):
    """POST /htmx/driver/orders/<order_id>/status/
    Driver updates order status. Validates proximity constraints.
    """
    driver = _get_driver(request)
    if not driver:
        return HttpResponse(
            '<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" id="co-' + str(order_id) + '-status-msg">Non connecté.</div>',
            status=200
        )
    
    if request.method != 'POST':
        return HttpResponse(
            '<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" id="co-' + str(order_id) + '-status-msg">Méthode non supportée.</div>',
            status=200
        )
    
    try:
        order = Order.objects.select_related('driver').get(pk=int(order_id))
    except (Order.DoesNotExist, ValueError):
        return HttpResponse(
            '<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" id="co-' + str(order_id) + '-status-msg">Commande introuvable.</div>',
            status=200
        )
    
                                   
    if order.driver != driver:
        return HttpResponse(
            '<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" id="co-' + str(order_id) + '-status-msg">Cette course ne vous est pas assignée.</div>',
            status=200
        )
    
    new_status = request.POST.get('status', '').strip()
    valid_transitions = {
        'driver_assigned': ['on_way'],
        'on_way': ['arrived', 'in_progress'],
        'arrived': ['in_progress'],
        'in_progress': ['completed'],
        'price_confirmed': ['driver_assigned', 'on_way'],
    }
    
    allowed = valid_transitions.get(order.status, [])
    if new_status not in allowed:
        return HttpResponse(
            f'<div class="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded" id="co-{order.pk}-status-msg">'
            f'Transition invalide: {order.status} → {new_status}</div>',
            status=200
        )
    
                                                  
    if new_status == 'arrived':
                                       
        track = _order_track_dict(order)
        dist = track.get('distance_driver_client')
        if dist and dist > 300:
            return HttpResponse(
                f'<div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded" id="co-{order.pk}-status-msg">'
                f'⚠️ Trop loin du point de départ ({int(dist)}m). Approchez à moins de 300m.</div>',
                status=200
            )
    
    if new_status == 'in_progress' and order.status == 'arrived':
                                      
        track = _order_track_dict(order)
        dist = track.get('distance_driver_client')
        if dist and dist > 50:
            return HttpResponse(
                f'<div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded" id="co-{order.pk}-status-msg">'
                f'⚠️ Trop loin du client ({int(dist)}m). Approchez à moins de 50m.</div>',
                status=200
            )
    
    if new_status == 'completed':
                                            
        track = _order_track_dict(order)
        dist = track.get('distance_client_destination')
        if dist and dist > 500:
            return HttpResponse(
                f'<div class="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded" id="co-{order.pk}-status-msg">'
                f'⚠️ Trop loin de la destination ({int(dist)}m). Approchez à moins de 500m.</div>',
                status=200
            )
    
    order.update_status(new_status)
    
    try:
        from julmin_taxis.notify import notify_order_status
        notify_order_status(order, new_status)
    except Exception:
        pass
    
                          
    from .htmx_views import _notify_ws
    _notify_ws(f'order_{order.pk}', 'status_changed', {
        'order_id': order.pk,
        'status': new_status,
        'status_display': order.get_status_display(),
    })
    
    status_display = order.get_status_display()
    return HttpResponse(
        f'<div class="bg-green-100 border border-green-400 text-green-700 px-4 py-3 rounded mb-3" id="co-{order.pk}-status-msg">'
        f'✅ Statut mis à jour: {status_display}</div>',
        status=200
    )


def gps_diagnostic_report(request):
    """POST /htmx/gps-diagnostic/ — rapport diagnostic GPS Web (temporaire)."""
    import logging

    logger = logging.getLogger('daxi.web.gps.diagnostic')

    if request.method != 'POST':
        return JsonResponse({'error': 'Méthode non supportée.'}, status=405)

    try:
        if request.body:
            data = json.loads(request.body.decode('utf-8'))
        else:
            data = dict(request.POST)
    except (json.JSONDecodeError, UnicodeDecodeError, TypeError):
        return JsonResponse({'error': 'JSON invalide.'}, status=400)

    if not isinstance(data, dict):
        return JsonResponse({'error': 'Format invalide.'}, status=400)

    side = str(data.get('side') or 'UNKNOWN')
    report = {
        'side': side,
        'gps_supported': data.get('gps_supported'),
        'permission': data.get('permission'),
        'https': data.get('https'),
        'watch_started': data.get('watch_started'),
        'fixes_received': data.get('fixes_received'),
        'best_accuracy': data.get('best_accuracy'),
        'last_accuracy': data.get('last_accuracy'),
        'elapsed_ms': data.get('elapsed_ms'),
        'exploitable': data.get('exploitable'),
        'position_obtained': data.get('position_obtained'),
        'error': data.get('error'),
        'error_code': data.get('error_code'),
        'report_reason': data.get('report_reason'),
        'platform': data.get('platform'),
        'user_agent': (data.get('user_agent') or '')[:500],
        'on_line': data.get('on_line'),
    }
    logger.warning('DAXI_WEB_GPS_DIAGNOSTIC %s', report)

    return JsonResponse({'ok': True, 'received': True})
