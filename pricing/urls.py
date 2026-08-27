from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'tags', views.RouteTagViewSet, basename='pricing-tags')
router.register(r'zones', views.PricingZoneViewSet, basename='pricing-zones')
router.register(r'config', views.PricingConfigViewSet, basename='pricing-config')
router.register(r'logs', views.PriceCalculationLogViewSet, basename='pricing-logs')

urlpatterns = [
                                                          
    path('route/', views.client_route_view, name='pricing-route'),
    path('estimate/', views.client_estimate_price_view, name='pricing-estimate'),
    path('calculate/', views.calculate_price_view, name='pricing-calculate'),
                          
    path('admin/', views.pricing_admin_view, name='pricing-admin'),
              
    path('', include(router.urls)),
]
