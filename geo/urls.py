from django.urls import path

from geo import htmx_views as hv
from geo import views as v

urlpatterns = [
    path('map-config/', v.geo_map_config, name='geo-map-config'),
    path('stats/', v.geo_stats, name='geo-stats'),
    path('tiles/<int:zone_id>/<int:z>/<int:x>/<int:y>.pbf', v.geo_mbtiles_tile, name='geo-mbtiles-tile'),
    path('tiles/<int:zone_id>/<int:z>/<int:x>/<int:y>.png', v.geo_mbtiles_tile, name='geo-mbtiles-tile-png'),
]

htmx_urlpatterns = [
    path('admin/geo/zones/', hv.admin_geo_zones, name='htmx-admin-geo-zones'),
    path('admin/geo/download-department/', hv.admin_geo_download_department, name='htmx-admin-geo-download'),
    path('admin/geo/activate-department/', hv.admin_geo_activate_department, name='htmx-admin-geo-activate'),
    path('admin/geo/deactivate-department/', hv.admin_geo_deactivate_department, name='htmx-admin-geo-deactivate'),
    path('admin/geo/sync-zones/', hv.admin_geo_sync_zones, name='htmx-admin-geo-sync'),
    path('admin/geo/zones/<int:zone_id>/import/', hv.admin_geo_start_import, name='htmx-admin-geo-import'),
    path('admin/geo/department-cities/<slug:dept_slug>/', hv.admin_geo_department_cities, name='htmx-admin-geo-cities'),
    path('admin/geo/jobs/<int:job_id>/cancel/', hv.admin_geo_cancel_job, name='htmx-admin-geo-cancel-job'),
    path('admin/geo/jobs/<int:job_id>/', hv.admin_geo_job_status, name='htmx-admin-geo-job'),
    path('admin/geo/zones/<int:zone_id>/map/', hv.admin_geo_zone_preview_map, name='htmx-admin-geo-zone-map'),
]
