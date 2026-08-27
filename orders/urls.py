from django.urls import path
from . import views

urlpatterns = [
    path('', views.OrderCreateView.as_view(), name='order-create'),
    path('my/', views.OrderListView.as_view(), name='order-list'),
    path('all/', views.AdminOrderListView.as_view(), name='admin-order-list'),
    path('<int:pk>/', views.OrderDetailView.as_view(), name='order-detail'),
    path('<int:pk>/status/', views.OrderStatusUpdateView.as_view(), name='order-status'),
    path('<int:pk>/propose-price/', views.ProposePrice.as_view(), name='propose-price'),
    path('<int:pk>/confirm-price/', views.ConfirmPrice.as_view(), name='confirm-price'),
    path('<int:pk>/assign-driver/', views.AssignDriverView.as_view(), name='assign-driver'),
    path('<int:pk>/messages/', views.OrderMessagesView.as_view(), name='order-messages'),
    path('<int:pk>/delete/', views.OrderDeleteView.as_view(), name='order-delete'),
                                             
    path('<str:pk>/accept/', views.OrderAcceptView.as_view(), name='order-accept'),
    path('<str:pk>/create-card/', views.OrderCreateCardView.as_view(), name='order-create-card'),
    path('<str:pk>/delete-card/', views.OrderDeleteCardView.as_view(), name='order-delete-card'),
    path('sync-all/', views.OrderSyncAllView.as_view(), name='order-sync-all'),
    path('tab/<str:tab>/', views.OrderTabView.as_view(), name='order-tab'),
    path('lost-objects/', views.LostObjectListCreateView.as_view(), name='lost-object-list'),
    path('lost-objects/admin/', views.AdminLostObjectListView.as_view(), name='admin-lost-object-list'),
    path('lost-objects/<int:pk>/status/', views.LostObjectStatusUpdateView.as_view(), name='lost-object-status'),
]
