from django.urls import path
from . import views

urlpatterns = [
    path('', views.DriverListView.as_view(), name='driver-list'),
    path('create/', views.DriverCreateView.as_view(), name='driver-create'),
    path('me/', views.MyDriverProfileView.as_view(), name='driver-me'),
    path('<int:pk>/', views.DriverDetailView.as_view(), name='driver-detail'),
    path('<int:pk>/update/', views.DriverUpdateView.as_view(), name='driver-update'),
    path('<int:pk>/status/', views.DriverStatusUpdateView.as_view(), name='driver-status'),
    path('<int:pk>/location/', views.DriverLocationUpdateView.as_view(), name='driver-location'),
    path('<int:pk>/block/', views.DriverBlockView.as_view(), name='driver-block'),
    path('<int:pk>/delete/', views.DriverDeleteView.as_view(), name='driver-delete'),
    path('<int:pk>/reviews/', views.DriverReviewListView.as_view(), name='driver-reviews'),
    path('<int:pk>/reviews/create/', views.DriverReviewCreateView.as_view(), name='driver-review-create'),
]
