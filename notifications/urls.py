from django.urls import path
from . import views

urlpatterns = [
    path('', views.NotificationListView.as_view(), name='notification-list'),
    path('unread-count/', views.UnreadCountView.as_view(), name='unread-count'),
    path('mark-all-read/', views.MarkAllReadView.as_view(), name='mark-all-read'),
    path('<int:pk>/read/', views.MarkNotificationReadView.as_view(), name='notification-read'),
                                                          
    path('register-device/', views.RegisterPushDeviceView.as_view(), name='register-push-device'),
    path('presence/', views.PresenceHeartbeatView.as_view(), name='presence-heartbeat'),
    path('send-push/', views.SendPushNotificationView.as_view(), name='send-push'),
    path('send-order-email/', views.SendOrderEmailView.as_view(), name='send-order-email'),
]
