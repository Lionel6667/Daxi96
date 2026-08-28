from django.urls import path
from . import views

urlpatterns = [
    path('stats/', views.DashboardStatsView.as_view(), name='admin-stats'),
    path('badge-counts/', views.AdminBadgeCountsView.as_view(), name='admin-badge-counts'),
    path('mark-section-seen/', views.AdminMarkSectionSeenView.as_view(), name='admin-mark-section-seen'),
    path('sync-session/', views.AdminSessionSyncView.as_view(), name='admin-sync-session'),
    path('live-map/', views.AdminLiveMapView.as_view(), name='admin-live-map'),
    path('clients/', views.AdminClientsView.as_view(), name='admin-clients'),
    path('clients/detail/', views.AdminClientDetailView.as_view(), name='admin-client-detail'),
    path('clients/block/', views.AdminBlockContactView.as_view(), name='admin-block-contact'),
    path('users/', views.AdminUserListView.as_view(), name='admin-users'),
    path('users/<int:pk>/block/', views.AdminUserBlockView.as_view(), name='admin-user-block'),
    path('pending-orders/', views.AdminPendingOrdersView.as_view(), name='admin-pending-orders'),
    path('available-drivers/', views.AdminAvailableDriversView.as_view(), name='admin-available-drivers'),
    path('drivers/', views.AdminDriversListView.as_view(), name='admin-drivers-list'),
    path('covered-departments/', views.covered_departments_api, name='covered-departments'),
    path('whatsapp-proxy/', views.whatsapp_proxy, name='whatsapp-proxy'),
    path('whatsapp-discover/', views.whatsapp_discover, name='whatsapp-discover'),
]
