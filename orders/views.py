from django.utils import timezone
from rest_framework import status, generics, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.exceptions import PermissionDenied
from django_filters.rest_framework import DjangoFilterBackend
from channels.layers import get_channel_layer
from asgiref.sync import async_to_sync
import json

from julmin_taxis.order_security import (
    can_access_order,
    get_order_actor_role,
    assert_order_transition,
)
from julmin_taxis.staff_auth import user_is_staff

from .models import Order, OrderMessage, LostObject
from .serializers import OrderSerializer, OrderMessageSerializer, OrderCreateSerializer, LostObjectSerializer
from notifications.email_service import EmailService
from notifications.models import Notification


def notify_websocket(group_name, event_type, data):
    """Send WebSocket notification to a channel group."""
    channel_layer = get_channel_layer()
    try:
        async_to_sync(channel_layer.group_send)(
            group_name,
            {'type': 'order_update', 'event': event_type, 'data': data}
        )
    except Exception:
        pass


class OrderCreateView(APIView):
    """Create a new taxi order (authenticated or guest)."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = OrderCreateSerializer(data=request.data, context={'request': request})
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        order = serializer.save()
        if request.user.is_authenticated:
            order.user = request.user
            order.save(update_fields=['user'])

                                     
        notify_websocket('admin_orders', 'new_order', OrderSerializer(order).data)

                                       
        Notification.objects.create(
            notification_type='order_new',
            title='Nouvelle commande',
            message=f"Nouvelle commande de {order.client_name}: {order.pickup} → {order.destination}",
            order=order
        )

        return Response({
            'message': 'Commande créée avec succès.',
            'order': OrderSerializer(order).data
        }, status=status.HTTP_201_CREATED)


class OrderListView(generics.ListAPIView):
    """List orders for authenticated user."""
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    filter_backends = [DjangoFilterBackend, filters.OrderingFilter]
    filterset_fields = ['status']
    ordering_fields = ['created_at', 'date']
    ordering = ['-created_at']

    def get_queryset(self):
        user = self.request.user
        if hasattr(user, 'driver_profile'):
            return Order.objects.filter(driver=user.driver_profile)
        return Order.objects.filter(user=user)


class OrderDetailView(generics.RetrieveAPIView):
    """Get a specific order by ID."""
    serializer_class = OrderSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return Order.objects.all()

    def get_object(self):
        obj = super().get_object()
                                                                           
        request = self.request
        if request.user.is_authenticated:
            if (request.user.is_staff or
                    obj.user == request.user or
                    (hasattr(request.user, 'driver_profile') and obj.driver == request.user.driver_profile)):
                return obj
                                          
        guest_id = request.query_params.get('guest_id', '')
        if guest_id and obj.guest_id == guest_id:
            return obj
        from rest_framework.exceptions import PermissionDenied
        raise PermissionDenied()


class OrderStatusUpdateView(APIView):
    """Update order status (admin/driver only)."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        role = get_order_actor_role(request, order)
        if role not in ('staff', 'driver'):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get('status')
        if not new_status:
            return Response({'error': 'Statut requis.'}, status=status.HTTP_400_BAD_REQUEST)

        valid_statuses = [s[0] for s in Order.STATUS_CHOICES]
        if new_status not in valid_statuses:
            return Response({'error': 'Statut invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            assert_order_transition(order, new_status, role)
        except PermissionDenied as exc:
            return Response({'error': str(exc)}, status=status.HTTP_403_FORBIDDEN)

        order.update_status(new_status)

                                                        
        self._send_status_email(order, new_status)

                              
        order_data = OrderSerializer(order).data
        notify_websocket(f'order_{order.pk}', 'status_changed', order_data)
        if order.user:
            notify_websocket(f'user_{order.user_id}', 'order_status', order_data)

        return Response({'message': f'Statut mis à jour: {new_status}', 'order': order_data})

    def _send_status_email(self, order, new_status):
        try:
            if new_status == 'price_proposed':
                EmailService.send_price_proposed(order)
                order.price_email_sent = True
                order.save(update_fields=['price_email_sent'])
            elif new_status == 'driver_assigned':
                EmailService.send_driver_assigned(order)
            elif new_status == 'on_way':
                EmailService.send_driver_on_way(order)
            elif new_status == 'arrived':
                EmailService.send_driver_arrived(order)
            elif new_status == 'completed':
                EmailService.send_trip_completed(order)
                order.completion_email_sent = True
                order.save(update_fields=['completion_email_sent'])
        except Exception:
            pass


class ProposePrice(APIView):
    """Admin proposes a price for an order."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        price = request.data.get('price')
        if price is None:
            return Response({'error': 'Prix requis.'}, status=status.HTTP_400_BAD_REQUEST)

        order.price = price
        order.update_status('price_proposed')

                          
        try:
            EmailService.send_price_proposed(order)
            order.price_email_sent = True
            order.save(update_fields=['price_email_sent'])
        except Exception:
            pass

        order_data = OrderSerializer(order).data
        notify_websocket(f'order_{order.pk}', 'price_proposed', order_data)

        return Response({'message': 'Prix proposé avec succès.', 'order': order_data})


class ConfirmPrice(APIView):
    """Client confirms proposed price."""
    permission_classes = [AllowAny]

    def patch(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if not can_access_order(request, order):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        if order.status != 'price_proposed':
            return Response({'error': 'Aucun prix à confirmer.'}, status=status.HTTP_400_BAD_REQUEST)

        order.price_confirmed = True
        order.update_status('price_confirmed')

        order_data = OrderSerializer(order).data
        notify_websocket('admin_orders', 'price_confirmed', order_data)

        return Response({'message': 'Prix confirmé.', 'order': order_data})


class AssignDriverView(APIView):
    """Admin assigns a driver to an order."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        driver_id = request.data.get('driver_id')
        if not driver_id:
            return Response({'error': 'ID chauffeur requis.'}, status=status.HTTP_400_BAD_REQUEST)

        from drivers.models import Driver
        try:
            driver = Driver.objects.get(pk=driver_id)
        except Driver.DoesNotExist:
            return Response({'error': 'Chauffeur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        order.driver = driver
        driver.status = 'busy'
        driver.save(update_fields=['status'])
        order.update_status('driver_assigned')

                                     
        order_data = OrderSerializer(order).data
        notify_websocket(f'driver_{driver.pk}', 'new_order', order_data)
        notify_websocket(f'order_{order.pk}', 'driver_assigned', order_data)

                    
        try:
            EmailService.send_driver_assigned(order)
        except Exception:
            pass

        return Response({'message': f'Chauffeur {driver.full_name} assigné.', 'order': order_data})


class OrderMessagesView(APIView):
    """Get and send messages for an order."""
    permission_classes = [AllowAny]

    def get(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if not can_access_order(request, order):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        messages = order.messages.all()
        return Response(OrderMessageSerializer(messages, many=True).data)

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'error': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        if not can_access_order(request, order):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        content = request.data.get('content', '').strip()
        if not content:
            return Response({'error': 'Message requis.'}, status=status.HTTP_400_BAD_REQUEST)

        sender_type = 'user'
        sender_name = request.data.get('sender_name', '')

        if request.user.is_authenticated:
            if hasattr(request.user, 'driver_profile'):
                sender_type = 'driver'
                sender_name = request.user.driver_profile.full_name
            elif request.user.is_staff:
                sender_type = 'admin'
                sender_name = 'Admin DAXI'
            else:
                sender_type = 'user'
                sender_name = request.user.get_full_name() or request.user.username

        msg = OrderMessage.objects.create(
            order=order,
            sender=request.user if request.user.is_authenticated else None,
            sender_type=sender_type,
            sender_name=sender_name,
            content=content
        )

        msg_data = OrderMessageSerializer(msg).data
        notify_websocket(f'order_{order.pk}', 'new_message', msg_data)

        return Response(msg_data, status=status.HTTP_201_CREATED)


class AdminOrderListView(generics.ListAPIView):
    """Admin: list all orders with filters."""
    serializer_class = OrderSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['status', 'driver', 'date']
    search_fields = ['client_name', 'client_email', 'pickup', 'destination']
    ordering_fields = ['created_at', 'date']
    ordering = ['-created_at']

    def get_queryset(self):
        if not self.request.user.is_staff:
            return Order.objects.none()
        return Order.objects.select_related('driver', 'user').all()


class OrderDeleteView(APIView):
    """Admin: delete an order."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            order = Order.objects.get(pk=pk)
            order.delete()
            return Response({'message': 'Commande supprimée.'})
        except Order.DoesNotExist:
            return Response({'error': 'Commande introuvable.'}, status=status.HTTP_404_NOT_FOUND)


class OrderAcceptView(APIView):
    """
    Accept/confirm an order price by client. Replaces order_realtime_update.php?action=accept_order.
    Also called by adm.html via OrderRealtime.acceptOrder().
    """
    permission_classes = [AllowAny]

    def post(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            from firebase_db.models import FirebaseNode
            tables = ['commande_unconfirmed', 'commande', 'commande_confirmed', 'commande_transfered']
            for table in tables:
                nodes = FirebaseNode.objects.filter(path=f'{table}/{pk}')
                if nodes.exists():
                    return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
            return Response({'ok': False, 'error': 'Commande introuvable.'}, status=404)

        if not can_access_order(request, order):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        if order.status != 'price_proposed':
            return Response({'error': 'Aucun prix à confirmer.'}, status=status.HTTP_400_BAD_REQUEST)

        order.price_confirmed = True
        order.update_status('price_confirmed')
        order_data = OrderSerializer(order).data
        notify_websocket('admin_orders', 'price_confirmed', order_data)
        return Response({'ok': True, 'message': 'Prix confirmé.', 'order': order_data})


class OrderSyncAllView(APIView):
    """
    Sync all orders. Replaces order_realtime_update.php?action=sync_all.
    Returns basic counts.
    """
    permission_classes = [AllowAny]

    def post(self, request):
        if not user_is_staff(request):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        from firebase_db.models import FirebaseNode
        counts = {}
        for table in ['commande', 'commande_unconfirmed', 'commande_confirmed', 'commande_transfered']:
            counts[table] = FirebaseNode.objects.filter(path__startswith=table + '/').count()
        counts['django_orders'] = Order.objects.count()
        return Response({'ok': True, 'counts': counts})


class OrderTabView(APIView):
    """Fetch orders for a given tab. Replaces order_realtime_update.php?action=fetch_tab."""
    permission_classes = [AllowAny]

    def get(self, request, tab):
        if not user_is_staff(request):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        from firebase_db.models import FirebaseNode
        from firebase_db.views import _order_to_firebase
        tab_map = {
            'pending': 'commande',
            'unconfirmed': 'commande_unconfirmed',
            'confirmed': 'commande_confirmed',
            'transferred': 'commande_transfered',
            'refused': 'commande_refused',
            'completed': 'commande_completed',
        }
        table = tab_map.get(tab, tab)

                               
        nodes = FirebaseNode.objects.filter(path__startswith=table + '/')
        orders = {}
        for node in nodes:
            key = node.path.split('/')[-1]
            orders[key] = node.data

                                            
        if table == 'commande':
            statuses = ['pending', 'price_proposed', 'price_confirmed']
        elif table == 'commande_confirmed':
            statuses = ['driver_assigned', 'on_way', 'arrived', 'in_progress']
        elif table == 'commande_completed':
            statuses = ['completed']
        else:
            statuses = []

        if statuses:
            django_orders = Order.objects.filter(status__in=statuses).select_related('driver')
            for o in django_orders:
                key = o.firebase_uid if o.firebase_uid else f'django_{o.pk}'
                orders[key] = _order_to_firebase(o)

        return Response({'ok': True, 'tab': tab, 'orders': orders})


class OrderCreateCardView(APIView):
    """
    Create/register a Trello-like card for an order.
    Replaces OrderRealtime.createCard() in adm.html.
    """
    permission_classes = [AllowAny]

    def post(self, request, pk):
        if not user_is_staff(request):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            order = Order.objects.get(pk=pk)
            return Response({'ok': True, 'message': 'Carte créée.', 'order_id': order.pk})
        except Order.DoesNotExist:
            from firebase_db.models import FirebaseNode
            node = FirebaseNode.objects.filter(path__in=[f'commande/{pk}', f'commande_confirmed/{pk}']).first()
            if node:
                return Response({'ok': True, 'message': 'Carte Firebase enregistrée.', 'firebase_key': pk})
            return Response({'ok': False, 'error': 'Commande introuvable.'}, status=404)


class OrderDeleteCardView(APIView):
    """
    Delete an order card. Replaces OrderRealtime.deleteCard() in adm.html.
    """
    permission_classes = [AllowAny]

    def delete(self, request, pk):
        try:
            order = Order.objects.get(pk=pk)
        except Order.DoesNotExist:
            return Response({'ok': False, 'error': 'Commande introuvable.'}, status=404)

        role = get_order_actor_role(request, order)
        if role == 'staff':
            order.update_status('cancelled')
            return Response({'ok': True, 'message': 'Commande annulée.'})
        if role == 'client':
            try:
                assert_order_transition(order, 'cancelled', 'client')
            except PermissionDenied:
                return Response({'error': 'Annulation non autorisée.'}, status=status.HTTP_403_FORBIDDEN)
            order.update_status('cancelled')
            return Response({'ok': True, 'message': 'Commande annulée.'})
        return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)


class LostObjectListCreateView(APIView):
    """List or create lost-object reports for authenticated users."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = LostObject.objects.filter(user=request.user).select_related('order').order_by('-created_at')
        return Response(LostObjectSerializer(qs, many=True).data)

    def post(self, request):
        order_id = request.data.get('order')
        description = (request.data.get('description') or '').strip()
        if not order_id or len(description) < 5:
            return Response({'error': 'order et description requis.'}, status=400)
        try:
            order = Order.objects.get(pk=order_id, user=request.user, status='completed')
        except Order.DoesNotExist:
            return Response({'error': 'Commande terminée introuvable.'}, status=404)

        item, created = LostObject.objects.get_or_create(
            order=order,
            defaults={'user': request.user, 'description': description},
        )
        if not created:
            item.description = description
            item.status = 'reported'
            item.save(update_fields=['description', 'status', 'updated_at'])

        return Response(
            LostObjectSerializer(item).data,
            status=status.HTTP_201_CREATED if created else status.HTTP_200_OK,
        )


class AdminLostObjectListView(generics.ListAPIView):
    """Admin list of all lost-object reports."""
    serializer_class = LostObjectSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        if not self.request.user.is_staff:
            return LostObject.objects.none()
        return LostObject.objects.select_related('order', 'user').order_by('-created_at')


class LostObjectStatusUpdateView(APIView):
    """Admin updates lost-object status."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=403)
        new_status = request.data.get('status', '').strip()
        if new_status not in ('reported', 'found', 'returned'):
            return Response({'error': 'Statut invalide.'}, status=400)
        try:
            item = LostObject.objects.get(pk=pk)
        except LostObject.DoesNotExist:
            return Response({'error': 'Signalement introuvable.'}, status=404)
        item.status = new_status
        item.save(update_fields=['status', 'updated_at'])
        return Response(LostObjectSerializer(item).data)
