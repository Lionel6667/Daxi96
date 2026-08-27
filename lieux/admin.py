from django.contrib import admin
from .models import LieuxCategory, LieuxPlace, LieuxPhoto


class LieuxPhotoInline(admin.TabularInline):
    model = LieuxPhoto
    extra = 1


@admin.register(LieuxCategory)
class LieuxCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'slug', 'order', 'is_active')


@admin.register(LieuxPlace)
class LieuxPlaceAdmin(admin.ModelAdmin):
    list_display = ('name', 'category', 'address', 'is_published', 'featured')
    list_filter = ('category', 'is_published', 'featured')
    search_fields = ('name', 'address', 'description')
    inlines = [LieuxPhotoInline]
