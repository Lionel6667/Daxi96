from rest_framework import status, generics, filters
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from django_filters.rest_framework import DjangoFilterBackend
from django.db.models import Avg, Count, Prefetch
from django.utils import timezone

from orders.models import Order
from .models import Driver, DriverReview
from .serializers import DriverSerializer, DriverCreateSerializer, DriverReviewSerializer, ACTIVE_ORDER_STATUSES


def _drivers_queryset(for_staff=False):
    qs = Driver.objects.all() if for_staff else Driver.objects.filter(is_blocked=False, is_verified=True)
    qs = qs.annotate(
        reviews_avg=Avg('reviews__rating'),
        reviews_total=Count('reviews'),
    )
    if for_staff:
        qs = qs.prefetch_related(
            Prefetch(
                'orders',
                queryset=Order.objects.filter(status__in=ACTIVE_ORDER_STATUSES).order_by('-updated_at'),
                to_attr='_prefetched_active_orders',
            )
        )
    return qs.order_by('-created_at')


class DriverListView(generics.ListAPIView):
    """List all available/active drivers."""
    serializer_class = DriverSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['status', 'is_verified']
    search_fields = ['firstname', 'lastname', 'vehicle', 'plate']

    def get_queryset(self):
        from julmin_taxis.staff_auth import user_is_staff
        return _drivers_queryset(for_staff=user_is_staff(self.request))

    def list(self, request, *args, **kwargs):
        from julmin_taxis.staff_auth import user_is_staff
        if user_is_staff(request):
            qs = self.filter_queryset(self.get_queryset())
            return Response(
                DriverSerializer(
                    qs, many=True,
                    context={'request': request, 'force_staff': True},
                ).data,
            )
        return super().list(request, *args, **kwargs)


class DriverDetailView(generics.RetrieveAPIView):
    """Get driver profile."""
    serializer_class = DriverSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return _drivers_queryset(for_staff=True)


class DriverCreateView(APIView):
    """Admin creates a driver profile."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def post(self, request):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = DriverCreateSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        from julmin_taxis.commission_utils import get_default_driver_commission_rate
        driver = serializer.save(commission_rate=get_default_driver_commission_rate())
        return Response(
            DriverSerializer(driver, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class DriverUpdateView(APIView):
    """Update driver profile (admin or driver themselves)."""
    permission_classes = [IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, pk):
        try:
            driver = Driver.objects.get(pk=pk)
        except Driver.DoesNotExist:
            return Response({'error': 'Chauffeur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

                                                        
        is_own_profile = (hasattr(request.user, 'driver_profile') and
                         request.user.driver_profile.pk == pk)
        if not (request.user.is_staff or is_own_profile):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        serializer = DriverCreateSerializer(driver, data=request.data, partial=True)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        driver = serializer.save()
        return Response(DriverSerializer(driver, context={'request': request}).data)


class DriverStatusUpdateView(APIView):
    """Driver updates their availability status."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            driver = Driver.objects.get(pk=pk)
        except Driver.DoesNotExist:
            return Response({'error': 'Chauffeur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        is_own = (hasattr(request.user, 'driver_profile') and
                  request.user.driver_profile.pk == pk)
        if not (request.user.is_staff or is_own):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        new_status = request.data.get('status')
        if new_status not in ('available', 'busy', 'offline'):
            return Response({'error': 'Statut invalide.'}, status=status.HTTP_400_BAD_REQUEST)

        driver.status = new_status
        driver.status_updated_at = timezone.now()
        update_fields = ['status', 'status_updated_at']
        if new_status in ('available', 'busy'):
            from julmin_taxis.driver_presence import touch_driver_last_seen
            touch_driver_last_seen(driver, save=False)
            update_fields.append('last_seen_at')
        driver.save(update_fields=update_fields)
        return Response({'message': f'Statut mis à jour: {new_status}'})


class DriverLocationUpdateView(APIView):
    """Driver updates their GPS location."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        try:
            driver = Driver.objects.get(pk=pk)
        except Driver.DoesNotExist:
            return Response({'error': 'Chauffeur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        is_own = (hasattr(request.user, 'driver_profile') and
                  request.user.driver_profile.pk == pk)
        if not (request.user.is_staff or is_own):
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        lat = request.data.get('latitude')
        lng = request.data.get('longitude')
        if lat is None or lng is None:
            return Response({'error': 'Latitude et longitude requises.'}, status=status.HTTP_400_BAD_REQUEST)

        from julmin_taxis.gps_antispoof import is_mock_flag
        if is_mock_flag(request.data.get('mock')):
            return Response({'error': 'Position GPS rejetée (mock).'}, status=status.HTTP_400_BAD_REQUEST)

        driver.latitude = lat
        driver.longitude = lng
        from julmin_taxis.driver_gps_utils import parse_accuracy_m, apply_driver_accuracy
        acc = parse_accuracy_m(request.data.get('accuracy'))
        from julmin_taxis.driver_presence import touch_driver_location_seen
        touch_driver_location_seen(driver, save=False)
        fields = ['latitude', 'longitude', 'location_updated_at', 'last_seen_at']
        fields += apply_driver_accuracy(driver, acc)
        driver.save(update_fields=fields)

        from orders.views import notify_websocket
        from julmin_taxis.driver_gps_utils import driver_location_payload
        active_order = driver.orders.filter(
            status__in=['driver_assigned', 'on_way', 'arrived', 'in_progress']
        ).first()
        if active_order:
            payload = driver_location_payload(lat, lng, driver.pk, active_order.pk, accuracy=acc)
            notify_websocket(f'order_{active_order.pk}', 'driver_location', payload)
            notify_websocket('admin_orders', 'driver_location', payload)

        return Response({'message': 'Position mise à jour.'})


class DriverBlockView(APIView):
    """Admin blocks/unblocks a driver."""
    permission_classes = [IsAuthenticated]

    def patch(self, request, pk):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)

        try:
            driver = Driver.objects.get(pk=pk)
        except Driver.DoesNotExist:
            return Response({'error': 'Chauffeur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        blocked = request.data.get('blocked', True)
        driver.is_blocked = blocked
        driver.save(update_fields=['is_blocked'])
        action = 'bloqué' if blocked else 'débloqué'
        return Response({'message': f'Chauffeur {action}.'})


class DriverDeleteView(APIView):
    """Admin deletes a driver — conserve le nom sur les commandes existantes."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        if not request.user.is_staff:
            return Response({'error': 'Accès refusé.'}, status=status.HTTP_403_FORBIDDEN)
        try:
            driver = Driver.objects.get(pk=pk)
        except Driver.DoesNotExist:
            return Response({'error': 'Chauffeur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        from orders.models import Order
        snapshot_name = driver.get_full_name() or driver.full_name or ''
        snapshot_phone = driver.phone or ''
        if snapshot_name:
            Order.objects.filter(driver=driver).update(
                driver_name=snapshot_name,
                driver_phone=snapshot_phone,
            )

        if driver.user_id:
            driver.user.delete()
        else:
            driver.delete()
        return Response({'message': 'Chauffeur supprimé.'})


class DriverReviewCreateView(APIView):
    """Client rates a driver after a trip."""
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        try:
            driver = Driver.objects.get(pk=pk)
        except Driver.DoesNotExist:
            return Response({'error': 'Chauffeur introuvable.'}, status=status.HTTP_404_NOT_FOUND)

        serializer = DriverReviewSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

                                              
        order_id = request.data.get('order_id')
        from orders.models import Order
        order = None
        if order_id:
            try:
                order = Order.objects.get(pk=order_id, status='completed', user=request.user)
            except Order.DoesNotExist:
                return Response({'error': 'Commande introuvable ou non terminée.'}, status=status.HTTP_400_BAD_REQUEST)

                                       
            if DriverReview.objects.filter(driver=driver, user=request.user, order=order).exists():
                return Response({'error': 'Vous avez déjà noté ce chauffeur pour cette course.'}, status=status.HTTP_400_BAD_REQUEST)

        review = serializer.save(driver=driver, user=request.user, order=order)
        driver.recalculate_rating()

        return Response(DriverReviewSerializer(review).data, status=status.HTTP_201_CREATED)


class DriverReviewListView(generics.ListAPIView):
    """List reviews for a driver."""
    serializer_class = DriverReviewSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        driver_id = self.kwargs['pk']
        return DriverReview.objects.filter(driver_id=driver_id).select_related('user')


class MyDriverProfileView(APIView):
    """Driver gets their own profile."""
    permission_classes = [IsAuthenticated]

    def get(self, request):
        if not hasattr(request.user, 'driver_profile'):
            return Response({'error': 'Profil chauffeur introuvable.'}, status=status.HTTP_404_NOT_FOUND)
        return Response(DriverSerializer(request.user.driver_profile, context={'request': request}).data)
