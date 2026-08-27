from django.urls import path
from . import views

urlpatterns = [
    path('client/', views.client_lieux_page, name='lieux-client'),
    path('client/<int:place_id>/', views.client_lieux_detail, name='lieux-client-detail'),
    path('enterprise/meta/', views.enterprise_lieux_meta, name='lieux-enterprise-meta'),
    path('enterprise/', views.enterprise_lieux_get, name='lieux-enterprise-get'),
    path('enterprise/cities/', views.enterprise_lieux_cities, name='lieux-enterprise-cities'),
    path('enterprise/save/', views.enterprise_lieux_save, name='lieux-enterprise-save'),
    path('enterprise/photo/<int:photo_id>/delete/', views.enterprise_lieux_delete_photo, name='lieux-enterprise-photo-delete'),
    path('admin/', views.admin_lieux_list, name='lieux-admin-list'),
    path('admin/save/', views.admin_lieux_save, name='lieux-admin-create'),
    path('admin/<int:place_id>/save/', views.admin_lieux_save, name='lieux-admin-save'),
    path('admin/<int:place_id>/toggle-listed/', views.admin_lieux_toggle_listed, name='lieux-admin-toggle-listed'),
    path('admin/<int:place_id>/delete/', views.admin_lieux_delete, name='lieux-admin-delete'),
    path('admin/category/save/', views.admin_lieux_category_save, name='lieux-admin-cat-create'),
    path('admin/category/<int:cat_id>/save/', views.admin_lieux_category_save, name='lieux-admin-cat-save'),
    path('admin/category/<int:cat_id>/delete/', views.admin_lieux_category_delete, name='lieux-admin-cat-delete'),
    path('admin/photo/<int:photo_id>/delete/', views.admin_lieux_delete_photo, name='lieux-admin-photo-delete'),
]
