from django.db.models import Count, Sum, Avg, Q, Max
from django.http import JsonResponse
from django.shortcuts import render
from django.conf import settings
from django.utils import timezone
from django.utils.decorators import method_decorator
from datetime import timedelta
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework import status
from rest_framework.authentication import SessionAuthentication
from rest_framework_simplejwt.authentication import JWTAuthentication
from julmin_taxis.staff_auth import OptionalJWTAuthentication

from orders.models import Order, BlockedContact, client_is_blocked
from drivers.models import Driver
from accounts.models import CustomUser
from notifications.models import Notification
from chat.models import ChatSession


class DashboardStatsView(APIView):
    """Admin dashboard statistics."""
    permission_classes = [AllowAny]

    def get(self, request):
        from julmin_taxis.staff_auth import resolve_staff_user
        if not resolve_staff_user(request):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        now = timezone.now()
        today = now.date()
        week_ago = now - timedelta(days=7)
        month_ago = now - timedelta(days=30)

                     
        total_orders = Order.objects.count()
        order_filter_counts = {
            'all': Order.objects.exclude(status__in=['completed', 'cancelled']).count(),
            'pending': Order.objects.filter(status='pending').count(),
            'price_proposed': Order.objects.filter(
                Q(status='price_proposed') | Q(status='pending', price__gt=0)
            ).count(),
            'price_confirmed': Order.objects.filter(status='price_confirmed').count(),
            'driver_assigned': Order.objects.filter(status='driver_assigned').count(),
            'ongoing': Order.objects.filter(
                status__in=['on_way', 'arrived', 'in_progress', 'waiting_return']
            ).count(),
            'completed': Order.objects.filter(status='completed').count(),
            'cancelled': Order.objects.filter(status='cancelled').count(),
        }
        pending_orders = Order.objects.filter(
            status__in=['pending', 'price_proposed', 'price_confirmed']
        ).count()
        active_orders = Order.objects.filter(
            status__in=['price_proposed', 'price_confirmed', 'driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return']
        ).count()
        completed_orders = Order.objects.filter(status='completed').count()
        today_orders = Order.objects.filter(created_at__date=today).count()
        week_orders = Order.objects.filter(created_at__gte=week_ago).count()

                       
        total_revenue = Order.objects.filter(status='completed').aggregate(
            total=Sum('price')
        )['total'] or 0
        today_revenue = Order.objects.filter(
            status='completed', completed_at__date=today
        ).aggregate(total=Sum('price'))['total'] or 0
        week_revenue = Order.objects.filter(
            status='completed', completed_at__gte=week_ago
        ).aggregate(total=Sum('price'))['total'] or 0
        month_revenue = Order.objects.filter(
            status='completed', completed_at__gte=month_ago
        ).aggregate(total=Sum('price'))['total'] or 0

                      
        total_drivers = Driver.objects.count()
        available_drivers = Driver.objects.filter(status='available', is_blocked=False).count()
        busy_drivers = Driver.objects.filter(status='busy').count()
        offline_drivers = Driver.objects.filter(status='offline').count()
        verified_drivers = Driver.objects.filter(is_verified=True).count()

                    
        total_users = CustomUser.objects.filter(is_driver=False).count()
        new_users_week = CustomUser.objects.filter(date_inscription__gte=week_ago).count()
        new_users_month = CustomUser.objects.filter(date_inscription__gte=month_ago).count()

                    
        escalated_chats = ChatSession.objects.filter(is_escalated=True, is_resolved=False).count()

                              
        unread_notifications = Notification.objects.filter(is_read=False).count()

                                     
        recent_orders = []
        for order in Order.objects.select_related('driver').order_by('-created_at')[:10]:
            recent_orders.append({
                'id': order.pk,
                'client_name': order.client_name,
                'pickup': order.pickup,
                'destination': order.destination,
                'status': order.status,
                'status_display': order.get_status_display(),
                'price': str(order.price) if order.price else None,
                'driver_name': order.driver.full_name if order.driver else None,
                'created_at': order.created_at.isoformat() if order.created_at else None,
                'date': order.date,
                'time': str(order.time),
                'trip_type': order.trip_type,
                'is_later': order.is_later,
                'passengers': order.passengers,
                'is_paused': order.is_paused,
                'pause_price': str(order.pause_price) if order.pause_price else None,
            })

                                              
        daily_orders = []
        for i in range(6, -1, -1):
            day = today - timedelta(days=i)
            count = Order.objects.filter(created_at__date=day).count()
            revenue = Order.objects.filter(status='completed', completed_at__date=day).aggregate(
                total=Sum('price')
            )['total'] or 0
            daily_orders.append({
                'date': day.strftime('%d/%m'),
                'orders': count,
                'revenue': float(revenue)
            })

        return Response({
            'orders': {
                'total': total_orders,
                'pending': pending_orders,
                'active': active_orders,
                'completed': completed_orders,
                'today': today_orders,
                'week': week_orders,
                'filter_counts': order_filter_counts,
            },
            'revenue': {
                'total': float(total_revenue),
                'today': float(today_revenue),
                'week': float(week_revenue),
                'month': float(month_revenue),
            },
            'drivers': {
                'total': total_drivers,
                'available': available_drivers,
                'busy': busy_drivers,
                'offline': offline_drivers,
                'verified': verified_drivers,
            },
            'users': {
                'total': total_users,
                'new_week': new_users_week,
                'new_month': new_users_month,
            },
            'support': {
                'escalated_chats': escalated_chats,
                'unread_notifications': unread_notifications,
            },
            'recent_orders': recent_orders,
            'chart_data': daily_orders,
        })


ADMIN_BADGE_SECTIONS = frozenset({
    'orders', 'withdrawals', 'lost_objects', 'sos', 'chat', 'enterprises', 'enterprise_locations', 'drivers',
})


def _admin_badge_seen_at(request, section):
    session = getattr(request, 'session', None)
    if session is None:
        return None
    raw = (session.get('admin_badge_seen_at') or {}).get(section)
    if not raw:
        return None
    try:
        dt = timezone.datetime.fromisoformat(str(raw).replace('Z', '+00:00'))
        if timezone.is_naive(dt):
            return timezone.make_aware(dt)
        return dt
    except (ValueError, TypeError):
        return None


def _admin_withdrawals_pending_count(since=None):
    from drivers.models import DriverWalletTransaction
    from enterprises.models import EnterpriseWithdrawal
    from julmin_taxis.htmx_views import _driver_withdrawal_paid_ids, _driver_withdrawal_effective_status

    paid_ids = _driver_withdrawal_paid_ids()
    tx_qs = DriverWalletTransaction.objects.filter(transaction_type='withdrawal_request')
    if since:
        tx_qs = tx_qs.filter(created_at__gt=since)
    driver_pending = sum(
        1 for tx in tx_qs
        if _driver_withdrawal_effective_status(tx, paid_ids) == 'pending'
    )
    ent_qs = EnterpriseWithdrawal.objects.filter(status='pending')
    if since:
        ent_qs = ent_qs.filter(created_at__gt=since)
    return driver_pending + ent_qs.count()


def compute_admin_badge_counts(request):
    """Compteurs « nouveautés » — uniquement après la dernière visite admin de chaque section."""
    from enterprises.models import Enterprise
    from orders.models import LostObject, Order
    from chat.models import ChatSession
    from drivers.models import Driver
    from julmin_taxis.htmx_views import _SOS_ACTIVE_STATUSES

    order_statuses = ['pending', 'price_proposed', 'price_confirmed']

    orders_qs = Order.objects.filter(status__in=order_statuses)
    seen_orders = _admin_badge_seen_at(request, 'orders')
    if seen_orders:
        orders_qs = orders_qs.filter(created_at__gt=seen_orders)

    chat_qs = ChatSession.objects.filter(is_escalated=True, is_resolved=False)
    seen_chat = _admin_badge_seen_at(request, 'chat')
    if seen_chat:
        chat_qs = chat_qs.filter(updated_at__gt=seen_chat)

    lost_qs = LostObject.objects.filter(status='reported', driver_handled=False)
    seen_lost = _admin_badge_seen_at(request, 'lost_objects')
    if seen_lost:
        lost_qs = lost_qs.filter(created_at__gt=seen_lost)

    sos_qs = Order.objects.filter(
        sos_triggered_at__isnull=False,
        status__in=_SOS_ACTIVE_STATUSES,
    )
    seen_sos = _admin_badge_seen_at(request, 'sos')
    if seen_sos:
        sos_qs = sos_qs.filter(sos_triggered_at__gt=seen_sos)

    ent_qs = Enterprise.objects.filter(status='pending')
    seen_ent = _admin_badge_seen_at(request, 'enterprises')
    if seen_ent:
        ent_qs = ent_qs.filter(created_at__gt=seen_ent)

    loc_qs = Enterprise.objects.filter(status='approved', location_status='admin_help')
    seen_loc = _admin_badge_seen_at(request, 'enterprise_locations')
    if seen_loc:
        loc_qs = loc_qs.filter(location_help_requested_at__gt=seen_loc)

    # Chauffeurs: le badge reste tant que le dossier n'est pas traité (pas « vu = zéro »).
    drivers_qs = Driver.objects.filter(is_verified=False, is_blocked=False)

    return {
        'orders': orders_qs.count(),
        'withdrawals': _admin_withdrawals_pending_count(_admin_badge_seen_at(request, 'withdrawals')),
        'lost_objects': lost_qs.count(),
        'sos': sos_qs.count(),
        'chat': chat_qs.count(),
        'enterprises': ent_qs.count(),
        'enterprise_locations': loc_qs.count(),
        'drivers': drivers_qs.count(),
    }


class AdminBadgeCountsView(APIView):
    """Compteurs badges sidebar — chargés au démarrage admin."""
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTAuthentication, SessionAuthentication]

    def get(self, request):
        from julmin_taxis.staff_auth import resolve_staff_user
        if not resolve_staff_user(request):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        return Response(compute_admin_badge_counts(request))


class AdminMarkSectionSeenView(APIView):
    """POST — marque une section admin comme consultée (badge remis à zéro jusqu'à nouvelle activité)."""
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTAuthentication, SessionAuthentication]

    def post(self, request):
        from julmin_taxis.staff_auth import resolve_staff_user
        if not resolve_staff_user(request):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        section = (request.data.get('section') or '').strip()
        if section not in ADMIN_BADGE_SECTIONS:
            return Response({'error': 'Section invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        seen = dict(request.session.get('admin_badge_seen_at') or {})
        seen[section] = timezone.now().isoformat()
        django_request = getattr(request, '_request', request)
        django_request.session['admin_badge_seen_at'] = seen
        django_request.session.modified = True
        return Response({'ok': True, 'section': section, 'badges': compute_admin_badge_counts(request)})


class AdminUserListView(APIView):
    """Admin: list and manage users."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        users = CustomUser.objects.filter(is_superuser=False).order_by('-date_inscription')

                
        search = request.query_params.get('search', '')
        if search:
            users = users.filter(
                Q(first_name__icontains=search) |
                Q(last_name__icontains=search) |
                Q(email__icontains=search) |
                Q(phone__icontains=search)
            )

        data = []
        for user in users[:100]:
            data.append({
                'id': user.pk,
                'name': user.get_full_name() or user.username,
                'email': user.email,
                'phone': user.phone,
                'city': user.city,
                'is_driver': user.is_driver,
                'is_verified': user.is_verified,
                'is_blocked': user.is_blocked,
                'date_inscription': user.date_inscription,
                'completed_trips': user.completed_trips,
                'photo': user.photo.url if user.photo else None,
            })

        return Response(data)


class AdminUserBlockView(APIView):
    """Admin: block/unblock a user."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            user = CustomUser.objects.get(pk=pk)
        except CustomUser.DoesNotExist:
            return Response({'error': 'Utilisateur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        blocked = request.data.get('blocked', True)
        user.is_blocked = blocked
        user.save(update_fields=['is_blocked'])

        if blocked:
            BlockedContact.objects.update_or_create(
                email=user.email,
                defaults={
                    'user': user,
                    'phone': user.phone or '',
                    'client_name': user.get_full_name() or user.username,
                },
            )
        else:
            BlockedContact.objects.filter(
                Q(email__iexact=user.email) | Q(user=user)
            ).delete()

        action = 'bloqué' if blocked else 'débloqué'
        return Response({'message': f'Utilisateur {action}.'})


class AdminSessionSyncView(APIView):
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTAuthentication, SessionAuthentication]

    def post(self, request):
        from julmin_taxis.staff_auth import resolve_staff_user
        from django.contrib.auth import login

        user = None
        if request.user.is_authenticated and getattr(request.user, 'is_staff', False):
            user = request.user
        if not user:
            user = resolve_staff_user(request)
        if not user:
            inner = getattr(request, '_request', request)
            if getattr(inner, 'session', None) and inner.session.get('is_admin'):
                from django.contrib.auth import get_user_model
                user = get_user_model().objects.filter(is_staff=True).order_by('-is_superuser', 'id').first()
        if not user:
            return Response(
                {'error': 'Accès refusé. Compte administrateur requis.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        django_request = getattr(request, '_request', request)
        login(django_request, user, backend='django.contrib.auth.backends.ModelBackend')
        django_request.session['is_admin'] = True
        django_request.session.set_expiry(86400 * 7)
        django_request.session.modified = True
        return Response({'ok': True, 'user_id': user.pk})


class AdminLiveMapView(APIView):
    """GET — positions temps réel des courses actives + chauffeurs disponibles."""
    permission_classes = [IsAuthenticated]

    _PHASE_LABELS = {
        'pending': 'En attente de chauffeur',
        'price_proposed': 'Prix proposé — attente client',
        'price_confirmed': 'Prix confirmé — assigner chauffeur',
        'driver_assigned': 'Chauffeur assigné — départ imminent',
        'on_way': 'Chauffeur en route vers le client',
        'arrived': 'Chauffeur arrivé — attente client',
        'in_progress': 'Course en cours vers destination',
    }

    def get(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        from julmin_taxis.currency_utils import format_price
        from julmin_taxis.htmx_views import _parse_plan_stops
        from julmin_taxis.live_map_utils import (
            should_show_client_on_map,
            client_map_coords,
            order_scheduled_dt,
        )
        from drivers.serializers import ACTIVE_ORDER_STATUSES
        from julmin_taxis.driver_presence import get_driver_presence

        def _driver_photo_url(drv):
            from julmin_taxis.driver_display_utils import _driver_photo_url as shared_photo
            return shared_photo(drv, request=request) or ''

        now = timezone.now()
        live_map_horizon = now + timedelta(hours=1)

        active_statuses = ['price_confirmed', 'driver_assigned', 'on_way', 'arrived', 'in_progress', 'waiting_return']
        orders = Order.objects.filter(
            status__in=active_statuses,
        ).select_related('driver', 'driver__user').order_by('-updated_at')[:80]

        busy_driver_ids = set()
        payload = []
        for o in orders:
            sched = order_scheduled_dt(o)
            if o.is_later:
                if not sched or sched > live_map_horizon:
                    continue
            d = o.driver
            if d:
                busy_driver_ids.add(d.pk)

            show_client = should_show_client_on_map(o, now)
            clat, clng = client_map_coords(o) if show_client else (None, None)

            payload.append({
                'id': o.pk,
                'client_name': o.client_name or 'Client',
                'pickup': o.pickup,
                'destination': o.destination,
                'status': o.status,
                'status_display': o.get_status_display(),
                'phase_label': self._PHASE_LABELS.get(o.status, o.get_status_display()),
                'is_later': o.is_later,
                'scheduled_at': sched.isoformat() if sched else None,
                'show_client': show_client,
                'client_lat': clat,
                'client_lng': clng,
                'price': float(o.price) if o.price else None,
                'price_display': format_price(o.price) if o.price else None,
                'pickup_lat': o.pickup_lat,
                'pickup_lng': o.pickup_lng,
                'meeting_lat': o.meeting_lat,
                'meeting_lng': o.meeting_lng,
                'destination_lat': o.destination_lat,
                'destination_lng': o.destination_lng,
                'service_plan': o.service_plan or '',
                'is_plan_order': bool(o.service_plan),
                'trip_type': o.trip_type or '',
                'plan_stops': _parse_plan_stops(o),
                'driver': None if not d else {
                    'id': d.pk,
                    'name': d.full_name,
                    'phone': d.phone,
                    'vehicle': d.vehicle,
                    'plate': d.plate,
                    'status': d.status,
                    'lat': d.latitude,
                    'lng': d.longitude,
                    'photo_url': _driver_photo_url(d),
                },
            })

                                                                             
        driver_ids_with_coords = list(
            Driver.objects.filter(
                latitude__isnull=False,
                longitude__isnull=False,
            ).exclude(latitude=0, longitude=0).values_list('pk', flat=True)[:300]
        )
        drivers_qs = Driver.objects.filter(pk__in=driver_ids_with_coords)
        active_by_driver = {}
        for o in Order.objects.filter(
            driver_id__in=driver_ids_with_coords,
            status__in=ACTIVE_ORDER_STATUSES,
        ).order_by('-updated_at'):
            if o.driver_id not in active_by_driver:
                active_by_driver[o.driver_id] = o

        drivers_payload = []
        for d in drivers_qs:
            ao = active_by_driver.get(d.pk)
            on_trip = d.pk in busy_driver_ids or ao is not None
            presence = get_driver_presence(d, now)
            drivers_payload.append({
                'id': d.pk,
                'name': d.full_name,
                'vehicle': d.vehicle or '',
                'plate': d.plate or '',
                'photo_url': _driver_photo_url(d),
                'lat': d.latitude,
                'lng': d.longitude,
                'status': d.status,
                'is_online': presence['is_online'],
                'availability': presence['availability'],
                'status_label': presence['status_label'],
                'location_updated_at': (
                    d.location_updated_at.isoformat() if getattr(d, 'location_updated_at', None) else None
                ),
                'status_updated_at': d.status_updated_at.isoformat() if d.status_updated_at else None,
                'last_seen_at': presence['last_seen_at'].isoformat() if presence.get('last_seen_at') else None,
                'is_verified': d.is_verified,
                'on_trip': on_trip,
                'active_order': None if not ao else {
                    'id': ao.pk,
                    'status': ao.status,
                    'status_display': ao.get_status_display(),
                    'pickup': ao.pickup or '',
                },
            })

        idle_drivers = [d for d in drivers_payload if not d['on_trip']]

        return Response({
            'orders': payload,
            'drivers': drivers_payload,
            'idle_drivers': idle_drivers,
            'updated_at': now.isoformat(),
        })


class AdminClientsView(APIView):
    """GET — comptes + invités ayant commandé (pour blocage)."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        search = request.query_params.get('search', '').strip().lower()
        rows = []

        users = CustomUser.objects.filter(is_superuser=False).order_by('-date_inscription')[:200]
        blocked_emails = set(
            BlockedContact.objects.exclude(email='').values_list('email', flat=True)
        )
        for user in users:
            name = user.get_full_name() or user.username
            if search and search not in name.lower() and search not in (user.email or '').lower() and search not in (user.phone or ''):
                continue
            rows.append({
                'id': user.pk,
                'type': 'user',
                'name': name,
                'email': user.email or '',
                'phone': user.phone or '',
                'date_inscription': user.date_inscription,
                'completed_trips': user.completed_trips,
                'is_blocked': user.is_blocked or (user.email in blocked_emails),
                'photo': user.photo.url if user.photo else None,
            })

        guest_qs = (
            Order.objects.filter(user__isnull=True)
            .exclude(guest_id='')
            .values('guest_id', 'client_name', 'client_email', 'client_phone')
            .annotate(order_count=Count('id'), last_order=Max('created_at'))
            .order_by('-last_order')[:150]
        )
        for g in guest_qs:
            name = g['client_name'] or 'Client invité'
            email = g['client_email'] or ''
            phone = g['client_phone'] or ''
            gid = g['guest_id'] or ''
            if search and all(search not in (x or '').lower() for x in [name, email, phone, gid]):
                continue
            rows.append({
                'id': f"guest:{gid}",
                'type': 'guest',
                'guest_id': gid,
                'name': name,
                'email': email,
                'phone': phone,
                'date_inscription': g['last_order'],
                'completed_trips': g['order_count'],
                'is_blocked': client_is_blocked(email=email, phone=phone, guest_id=gid),
                'photo': None,
            })

        rows.sort(key=lambda r: r.get('date_inscription') or timezone.now(), reverse=True)
        return Response(rows[:150])


class AdminBlockContactView(APIView):
    """POST — bloquer/débloquer un invité (sans compte)."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        blocked = request.data.get('blocked', True)
        guest_id = (request.data.get('guest_id') or '').strip()
        email = (request.data.get('email') or '').strip()
        phone = (request.data.get('phone') or '').strip()
        client_name = (request.data.get('client_name') or '').strip()

        if not any([guest_id, email, phone]):
            return Response({'error': 'Identifiant invité requis.'}, status=status.HTTP_400_BAD_REQUEST)

        if blocked:
            lookup = Q()
            if guest_id:
                lookup |= Q(guest_id=guest_id)
            if email:
                lookup |= Q(email__iexact=email)
            if phone:
                lookup |= Q(phone=phone)
            existing = BlockedContact.objects.filter(lookup).first()
            if existing:
                existing.client_name = client_name or existing.client_name
                if guest_id and not existing.guest_id:
                    existing.guest_id = guest_id
                if email and not existing.email:
                    existing.email = email
                if phone and not existing.phone:
                    existing.phone = phone
                existing.save()
            else:
                BlockedContact.objects.create(
                    guest_id=guest_id,
                    email=email,
                    phone=phone,
                    client_name=client_name,
                )
            if email:
                CustomUser.objects.filter(email__iexact=email).update(is_blocked=True)
            msg = 'Client invité bloqué.'
        else:
            lookup = Q()
            if guest_id:
                lookup |= Q(guest_id=guest_id)
            if email:
                lookup |= Q(email__iexact=email)
            if phone:
                lookup |= Q(phone=phone)
            BlockedContact.objects.filter(lookup).delete()
            if email:
                CustomUser.objects.filter(email__iexact=email).update(is_blocked=False)
            msg = 'Client invité débloqué.'

        return Response({'message': msg})


class AdminClientDetailView(APIView):
    """GET ?user_id= ou ?guest_id= — détail client + historique courses."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        from julmin_taxis.currency_utils import format_price

        user_id = request.query_params.get('user_id')
        guest_id = (request.query_params.get('guest_id') or '').strip()

        if user_id:
            try:
                user = CustomUser.objects.get(pk=int(user_id))
            except (CustomUser.DoesNotExist, ValueError):
                return Response({'error': 'Utilisateur introuvable.'}, status=status.HTTP_404_NOT_FOUND)
            orders_qs = Order.objects.filter(user=user).select_related('driver').order_by('-created_at')[:40]
            blocked_emails = set(
                BlockedContact.objects.exclude(email='').values_list('email', flat=True)
            )
            client = {
                'type': 'user',
                'id': user.pk,
                'guest_id': '',
                'name': user.get_full_name() or user.username,
                'email': user.email or '',
                'phone': user.phone or '',
                'city': user.city or '',
                'date_inscription': user.date_inscription,
                'completed_trips': user.completed_trips,
                'is_blocked': user.is_blocked or (user.email in blocked_emails),
                'photo': user.photo.url if user.photo else None,
            }
        elif guest_id:
            orders_qs = Order.objects.filter(
                guest_id=guest_id, user__isnull=True,
            ).select_related('driver').order_by('-created_at')[:40]
            if not orders_qs.exists():
                return Response({'error': 'Invité introuvable.'}, status=status.HTTP_404_NOT_FOUND)
            first = orders_qs.first()
            client = {
                'type': 'guest',
                'id': f'guest:{guest_id}',
                'guest_id': guest_id,
                'name': first.client_name or 'Client invité',
                'email': first.client_email or '',
                'phone': first.client_phone or '',
                'city': '',
                'date_inscription': orders_qs.aggregate(last=Max('created_at'))['last'],
                'completed_trips': orders_qs.count(),
                'is_blocked': client_is_blocked(
                    email=first.client_email or '',
                    phone=first.client_phone or '',
                    guest_id=guest_id,
                ),
                'photo': None,
            }
        else:
            return Response({'error': 'user_id ou guest_id requis.'}, status=status.HTTP_400_BAD_REQUEST)

        orders = []
        for o in orders_qs:
            orders.append({
                'id': o.pk,
                'pickup': o.pickup,
                'destination': o.destination,
                'status': o.status,
                'status_display': o.get_status_display(),
                'price': float(o.price) if o.price else None,
                'price_display': format_price(o.price) if o.price else None,
                'created_at': o.created_at.isoformat() if o.created_at else None,
                'driver_name': o.driver.full_name if o.driver else None,
            })

        return Response({'client': client, 'orders': orders})


class AdminPendingOrdersView(APIView):
    """Admin: get all pending orders with details."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        status_filter = request.query_params.get('status', 'pending')
        orders = Order.objects.filter(status=status_filter).select_related('driver', 'user').order_by('created_at')

        from orders.serializers import OrderSerializer
        return Response(OrderSerializer(orders, many=True, context={'request': request}).data)


class AdminAvailableDriversView(APIView):
    """Admin: get available drivers for assignment."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        drivers = Driver.objects.filter(
            status='available', is_blocked=False, is_verified=True
        )
        from drivers.serializers import DriverSerializer
        return Response(DriverSerializer(drivers, many=True, context={'request': request}).data)


class AdminDriversListView(APIView):
    """GET — tous les chauffeurs (actifs, en attente, bloqués) pour le dashboard admin."""
    permission_classes = [AllowAny]
    authentication_classes = [OptionalJWTAuthentication, SessionAuthentication]

    def get(self, request):
        from julmin_taxis.staff_auth import resolve_staff_user
        if not resolve_staff_user(request):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        from drivers.serializers import DriverSerializer
        from drivers.views import _drivers_queryset
        qs = _drivers_queryset(for_staff=True)
        return Response(DriverSerializer(
            qs, many=True, context={'request': request, 'force_staff': True},
        ).data)


def covered_departments_api(request):
    """Public GET /admin-panel/covered-departments/ — returns active departments for autocomplete bias."""
    from .models import CoveredDepartment, DEPT_DEFAULT_BOUNDS
    rows = []
    for dept in CoveredDepartment.objects.all():
        row = {
            'slug': dept.slug,
            'name': dept.name,
            'is_active': dept.is_active,
            'lat_min': dept.lat_min,
            'lat_max': dept.lat_max,
            'lng_min': dept.lng_min,
            'lng_max': dept.lng_max,
        }
        if not row['lat_min'] and dept.slug in DEPT_DEFAULT_BOUNDS:
            row.update(DEPT_DEFAULT_BOUNDS[dept.slug])
        rows.append(row)
    return JsonResponse({'departments': rows})


import json as _json
import urllib.request as _urllib_req
import urllib.error as _urllib_err

def whatsapp_proxy(request):
    """
    POST /admin-panel/whatsapp-proxy/
    Body: { "token": "...", "phone_number_id": "...", "payload": {...} }
    Forwards the payload to the Meta Graph API and returns the response.
    """
    from julmin_taxis.staff_auth import user_is_staff
    if not user_is_staff(request):
        return JsonResponse({'error': 'Accès refusé'}, status=403)

    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)

    try:
        data = _json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON body'}, status=400)

    token = (data.get('token') or '').strip()
    phone_number_id = (data.get('phone_number_id') or '').strip()
    payload = data.get('payload')

    if not token or not phone_number_id or not payload:
        return JsonResponse({'error': 'token, phone_number_id and payload are required'}, status=400)

                                                    
    if not phone_number_id.isdigit():
        return JsonResponse({'error': 'Invalid phone_number_id'}, status=400)

    url = f'https://graph.facebook.com/v25.0/{phone_number_id}/messages'
    body_bytes = _json.dumps(payload).encode('utf-8')
    req = _urllib_req.Request(
        url,
        data=body_bytes,
        headers={
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json',
        },
        method='POST',
    )

    try:
        with _urllib_req.urlopen(req, timeout=15) as resp:
            result = _json.loads(resp.read().decode('utf-8'))
            return JsonResponse(result, status=resp.status)
    except _urllib_err.HTTPError as e:
        result = _json.loads(e.read().decode('utf-8'))
        return JsonResponse(result, status=e.code)
    except Exception as e:
        return JsonResponse({'error': str(e)}, status=502)


def whatsapp_discover(request):
    """
    POST /api/admin-panel/whatsapp-discover/
    Body: { "token": "..." }
    Discovers all WABAs and phone numbers accessible to this token.
    """
    from julmin_taxis.staff_auth import user_is_staff
    if not user_is_staff(request):
        return JsonResponse({'error': 'Accès refusé'}, status=403)

    if request.method != 'POST':
        return JsonResponse({'error': 'Method not allowed'}, status=405)
    try:
        data = _json.loads(request.body)
    except Exception:
        return JsonResponse({'error': 'Invalid JSON'}, status=400)

    token = (data.get('token') or '').strip()
    if not token:
        return JsonResponse({'error': 'token required'}, status=400)

    base = 'https://graph.facebook.com/v25.0'
    tok_param = f'access_token={_urllib_req.quote(token)}'

    def _get(url):
        req = _urllib_req.Request(url, headers={'Authorization': f'Bearer {token}'})
        try:
            with _urllib_req.urlopen(req, timeout=10) as r:
                return _json.loads(r.read().decode()), r.status
        except _urllib_err.HTTPError as e:
            return _json.loads(e.read().decode()), e.code

    results = {'steps': [], 'phones': []}

                       
    me, _ = _get(f'{base}/me?fields=id,name')
    results['me'] = me
    if 'error' in me:
        return JsonResponse(results)

    uid = me.get('id')
    results['steps'].append(f'System User ID: {uid} ({me.get("name", "")})')

                                                
    wabas_r, _ = _get(f'{base}/me/whatsapp_business_accounts?fields=id,name,currency,timezone_id')
    wabas = wabas_r.get('data', [])
    results['steps'].append(f'/me/whatsapp_business_accounts → {len(wabas)} WABA(s)')

                                                                               
    if not wabas:
        biz_r, _ = _get(f'{base}/me/businesses?fields=id,name')
        bizs = biz_r.get('data', [])
        results['steps'].append(f'/me/businesses → {len(bizs)} business(es)')
        for biz in bizs:
            w2, _ = _get(f'{base}/{biz["id"]}/owned_whatsapp_business_accounts?fields=id,name')
            wabas += w2.get('data', [])

    results['wabas'] = wabas

                                                                 
    for waba in wabas:
        phones_r, _ = _get(f'{base}/{waba["id"]}/phone_numbers?fields=id,display_phone_number,verified_name,status,quality_rating')
        phones = phones_r.get('data', [])
        results['steps'].append(f'WABA {waba.get("name","?")} ({waba["id"]}) → {len(phones)} numéro(s)')
        tpl_r, _ = _get(
            f'{base}/{waba["id"]}/message_templates'
            f'?limit=100&fields=name,status,category,language,components'
        )
        tpl_list = []
        for t in (tpl_r or {}).get('data', []):
            body = ''
            for comp in t.get('components', []):
                if comp.get('type') == 'BODY':
                    body = comp.get('text', '')
            tpl_list.append({
                'name': t.get('name'),
                'status': t.get('status'),
                'language': t.get('language'),
                'body': body,
            })
        results.setdefault('message_templates', []).extend(tpl_list)
        for p in phones:
            p['waba_id'] = waba['id']
            p['waba_name'] = waba.get('name', '')
            results['phones'].append(p)

                                                               
    if not results['phones']:
                                                                                      
                                                              
        results['hint'] = (
            'Le System User a les bonnes permissions mais n\'est lié à aucun WABA. '
            'Va sur business.facebook.com/wa/manage/phone-numbers/ pour trouver '
            'le WABA de ton numéro, puis ajoute le System User à ce WABA spécifique '
            '(pas "Test WhatsApp Business Account").'
        )

                                
    debug_r, _ = _get(f'{base}/debug_token?input_token={_urllib_req.quote(token)}&access_token={_urllib_req.quote(token)}')
    results['token_debug'] = debug_r.get('data', debug_r)

    return JsonResponse(results)


from django.views.decorators.csrf import ensure_csrf_cookie


@ensure_csrf_cookie
def admin_dashboard_page(request):
    import json
    fb_cfg = getattr(settings, 'FIREBASE_WEB_CONFIG', {}) or {}
    return render(request, 'admin_dashboard.html', {
        'google_maps_api_key': settings.GOOGLE_MAPS_API_KEY,
        'firebase_config_json': json.dumps(fb_cfg),
        'firebase_vapid_json': json.dumps(getattr(settings, 'FIREBASE_WEB_VAPID_KEY', '') or ''),
    })
