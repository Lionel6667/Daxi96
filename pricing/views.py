import logging
from rest_framework import viewsets, status
from rest_framework.decorators import api_view, permission_classes, action
from rest_framework.permissions import IsAuthenticated, IsAdminUser, AllowAny, BasePermission
from rest_framework.response import Response
from django.shortcuts import render, get_object_or_404
from django.contrib.admin.views.decorators import staff_member_required
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.clickjacking import xframe_options_sameorigin


class IsAdminSession(BasePermission):
    """Allow write access if request has admin session, staff user, or valid staff JWT."""
    def has_permission(self, request, view):
        from julmin_taxis.staff_auth import user_is_staff
        return user_is_staff(request)

from .models import RouteTag, PricingZone, PricingConfig, PriceCalculationLog
from .serializers import (
    RouteTagSerializer,
    PricingZoneSerializer,
    PricingZoneListSerializer,
    PricingConfigSerializer,
    PriceCalculationLogSerializer,
    CalculatePriceRequestSerializer,
)
from .pricing_engine import calculate_price, build_client_route
from .public_api import sanitize_admin_calculate_result, client_route_payload

logger = logging.getLogger(__name__)


                                                                             
                                           
                                                                             

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def client_route_view(request):
    """
    Itinéraire client (carte) — sans calcul ni exposition des facteurs tarifaires.
    """
    serializer = CalculatePriceRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {'error': 'Données invalides', 'details': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )
    data = serializer.validated_data
    try:
        route = build_client_route(
            data['origin_lat'], data['origin_lng'],
            data['dest_lat'], data['dest_lng'],
            google_duration_s=data.get('google_duration_s'),
            google_distance_km=data.get('google_distance_km'),
        )
        return Response(client_route_payload(route), status=status.HTTP_200_OK)
    except Exception as e:
        logger.exception('Erreur routage client: %s', e)
        return Response(
            {'error': 'Impossible de calculer l\'itinéraire.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR,
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def client_estimate_price_view(request):
    """Estimation tarif client — source unique pricing.services."""
    serializer = CalculatePriceRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response({'error': 'Données invalides', 'details': serializer.errors}, status=400)
    data = serializer.validated_data
    trip_type = request.data.get('trip_type', 'one_way')
    passengers = int(request.data.get('passengers', 1) or 1)
    wait_minutes = int(request.data.get('wait_minutes', 0) or 0)
    service_plan = (request.data.get('service_plan') or '').strip()
    from pricing.services import preview_order_price
    result = preview_order_price(
        data['origin_lat'], data['origin_lng'],
        data['dest_lat'], data['dest_lng'],
        trip_type=trip_type,
        passengers=passengers,
        wait_minutes=wait_minutes,
        service_plan=service_plan,
    )
    if result.price is None:
        return Response({'ok': False, 'error': 'Prix non calculable'}, status=400)
    return Response({
        'ok': True,
        'price': float(result.price),
        'distance_km': result.distance_km,
        'duration_min': result.duration_min,
        'is_fixed_plan': result.is_fixed_plan,
    })


@api_view(['POST'])
@permission_classes([IsAdminSession])
def calculate_price_view(request):
    """
    Calcule le prix d'une course en fonction du trajet et des zones.

    Body JSON:
        {
            "origin_lat": 19.7602,
            "origin_lng": -72.2040,
            "dest_lat": 19.7700,
            "dest_lng": -72.1900,
            "origin_address": "Cap-Haïtien centre",
            "destination_address": "Aéroport",
            "order_id": "CMD_001",
            "save_log": true
        }
    """
    serializer = CalculatePriceRequestSerializer(data=request.data)
    if not serializer.is_valid():
        return Response(
            {'error': 'Données invalides', 'details': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST
        )

    data = serializer.validated_data
    try:
        result = calculate_price(
            origin_lat=data['origin_lat'],
            origin_lng=data['origin_lng'],
            dest_lat=data['dest_lat'],
            dest_lng=data['dest_lng'],
            order_id=data.get('order_id', ''),
            save_log=data.get('save_log', True),
        )
        result = sanitize_admin_calculate_result(result)
        if not request.query_params.get('include_route'):
            result.pop('route_coordinates', None)

        return Response(result, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception(f"Erreur calcul de prix: {e}")
        return Response(
            {'error': 'Erreur interne lors du calcul de prix.'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


                                                                             
                   
                                                                             

class RouteTagViewSet(viewsets.ModelViewSet):
    queryset = RouteTag.objects.all().order_by('name')
    serializer_class = RouteTagSerializer
    permission_classes = [IsAdminSession]

    def get_permissions(self):
        return [IsAdminSession()]

    def perform_create(self, serializer):
        serializer.save()
        from django.core.cache import cache
        cache.delete('daxi_pricing_zone_alerts')

    def perform_update(self, serializer):
        serializer.save()
        from django.core.cache import cache
        cache.delete('daxi_pricing_zone_alerts')

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        from django.core.cache import cache
        cache.delete('daxi_pricing_zone_alerts')

    def destroy(self, request, *args, **kwargs):
        tag = self.get_object()
        if tag.is_system:
            return Response(
                {'error': 'Cette situation système ne peut pas être supprimée.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        return super().destroy(request, *args, **kwargs)


                                                                             
                    
                                                                             

class PricingZoneViewSet(viewsets.ModelViewSet):
    queryset = PricingZone.objects.filter(is_active=True).prefetch_related('tags')
    permission_classes = [IsAdminSession]

    def get_serializer_class(self):
        if self.action == 'list':
            return PricingZoneListSerializer
        return PricingZoneSerializer

    def get_queryset(self):
        qs = PricingZone.objects.prefetch_related('tags')
        if self.request.query_params.get('all'):
            return qs.order_by('name')
        return qs.filter(is_active=True).order_by('name')

    def get_permissions(self):
        return [IsAdminSession()]

    def perform_create(self, serializer):
        serializer.save()
        from django.core.cache import cache
        cache.delete('daxi_pricing_zone_alerts')

    def perform_update(self, serializer):
        serializer.save()
        from django.core.cache import cache
        cache.delete('daxi_pricing_zone_alerts')

    def perform_destroy(self, instance):
        super().perform_destroy(instance)
        from django.core.cache import cache
        cache.delete('daxi_pricing_zone_alerts')

    @action(detail=False, methods=['get'], permission_classes=[IsAdminSession])
    def map_data(self, request):
        """
        Retourne toutes les zones actives avec polygones — pour affichage carte client.
        Format léger, sans données sensibles.
        """
        zones = PricingZone.objects.filter(is_active=True).prefetch_related('tags')
        data = []
        for z in zones:
            data.append({
                'id': z.pk,
                'name': z.name,
                'polygon': z.polygon,
                'display_color': z.display_color,
                'display_opacity': z.display_opacity,
                'total_impact_percent': z.total_impact_percent,
                'tags': [
                    {
                        'id': t.pk,
                        'name': t.name,
                        'color': t.color,
                        'impact_percent': t.impact_percent,
                        'time_multiplier': t.time_multiplier,
                        'seconds_per_km': t.seconds_per_km,
                        'affects_time': t.affects_time,
                        'is_danger': t.is_danger,
                        'notify_on_approach': t.notify_on_approach,
                        'alert_message': t.alert_message,
                    }
                    for t in z.tags.all()
                ],
            })
        return Response(data)


                                                                             
                          
                                                                             

class PricingConfigViewSet(viewsets.ModelViewSet):
    queryset = PricingConfig.objects.all().order_by('-is_active', '-created_at')
    serializer_class = PricingConfigSerializer
    permission_classes = [IsAdminSession]

    def perform_create(self, serializer):
        instance = serializer.save()
        self._sync_pause_rate(instance)

    def perform_update(self, serializer):
        instance = serializer.save()
        self._sync_pause_rate(instance)

    @staticmethod
    def _sync_pause_rate(instance):
        from julmin_taxis.pricing_rates import sync_system_pause_rate
        if instance.pause_price_per_5min is not None:
            sync_system_pause_rate(instance.pause_price_per_5min)

    @action(detail=False, methods=['get'], permission_classes=[IsAdminSession])
    def active(self, request):
        """Retourne la configuration tarifaire active (admin uniquement)."""
        config = PricingConfig.get_active()
        return Response(PricingConfigSerializer(config).data)

    @action(detail=True, methods=['post'], permission_classes=[IsAdminSession])
    def set_active(self, request, pk=None):
        """Désactive toutes les configs et active celle-ci."""
        PricingConfig.objects.all().update(is_active=False)
        config = get_object_or_404(PricingConfig, pk=pk)
        config.is_active = True
        config.save()
        return Response(PricingConfigSerializer(config).data)


                                                                             
                        
                                                                             

class PriceCalculationLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = PriceCalculationLog.objects.all().order_by('-created_at')
    serializer_class = PriceCalculationLogSerializer
    permission_classes = [IsAdminUser]
    filterset_fields = ['order_id', 'currency']


                                                                             
                                    
                                                                             

@xframe_options_sameorigin
def pricing_admin_view(request):
    """Interface admin de gestion des zones et tags."""
    from django.http import HttpResponse
    from julmin_taxis.staff_auth import user_is_staff, staff_user_from_token

    token = request.GET.get('token', '').strip()
    if token:
        user = staff_user_from_token(token)
        if user.is_authenticated and user.is_staff:
            request.session['is_admin'] = True
            request.session.set_expiry(86400 * 7)

    if not user_is_staff(request):
        return HttpResponse(
            '<p style="font-family:system-ui;padding:24px;color:#64748b;">'
            'Accès refusé — reconnectez-vous au tableau de bord admin.</p>',
            status=403,
            content_type='text/html; charset=utf-8',
        )

    config = PricingConfig.get_active()
    tags = RouteTag.objects.all()
    zones = PricingZone.objects.prefetch_related('tags').filter(is_active=True)

    embed = request.GET.get('embed', '').lower() in ('1', 'true', 'yes')
    return render(request, 'pricing_admin.html', {
        'config': config,
        'tags': tags,
        'zones': zones,
        'api_token': token,
        'embed': embed,
    })
