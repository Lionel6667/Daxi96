from django.contrib import admin
from .models import CoveredDepartment


@admin.register(CoveredDepartment)
class CoveredDepartmentAdmin(admin.ModelAdmin):
    list_display = ['name', 'slug', 'is_active', 'lat_min', 'lat_max', 'lng_min', 'lng_max']
    list_editable = ['is_active']
    list_filter = ['is_active']
    ordering = ['name']
