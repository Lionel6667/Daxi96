from django.contrib import admin

from geo.models import DownloadJob, GeoPlace, GeoRoad, GeoZone, MapResource


@admin.register(GeoZone)
class GeoZoneAdmin(admin.ModelAdmin):
    list_display = ('name', 'department_slug', 'status', 'place_count', 'road_count', 'version', 'last_download_at')
    list_filter = ('status', 'department_slug')
    search_fields = ('name',)


@admin.register(GeoPlace)
class GeoPlaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'zone', 'category', 'publication_status', 'lat', 'lng')
    list_filter = ('publication_status', 'category', 'zone')
    search_fields = ('name', 'normalized_name')


@admin.register(GeoRoad)
class GeoRoadAdmin(admin.ModelAdmin):
    list_display = ('name', 'zone', 'road_type', 'publication_status', 'length_m', 'centroid_lat')
    list_filter = ('publication_status', 'road_type', 'zone')
    search_fields = ('name', 'normalized_name')


@admin.register(MapResource)
class MapResourceAdmin(admin.ModelAdmin):
    list_display = ('zone', 'resource_type', 'status', 'size_bytes', 'version')
    list_filter = ('resource_type', 'status')


@admin.register(DownloadJob)
class DownloadJobAdmin(admin.ModelAdmin):
    list_display = ('id', 'zone', 'status', 'stage', 'progress_pct', 'created_at')
    list_filter = ('status', 'stage')
    readonly_fields = ('logs',)
