from django.contrib import admin
from django.utils.html import format_html
from django.urls import reverse
from .models import RouteTag, PricingZone, PricingConfig, PriceCalculationLog


@admin.register(RouteTag)
class RouteTagAdmin(admin.ModelAdmin):
    list_display = ['name', 'color_badge', 'impact_percent', 'time_multiplier', 'zone_count']
    list_editable = ['impact_percent', 'time_multiplier']
    search_fields = ['name', 'description']
    ordering = ['name']

    def color_badge(self, obj):
        return format_html(
            '<span style="display:inline-block;width:20px;height:20px;'
            'background:{};border-radius:4px;border:1px solid #ccc;'
            'vertical-align:middle;margin-right:6px;"></span>'
            '<code>{}</code>',
            obj.color, obj.color
        )
    color_badge.short_description = 'Couleur'

    def zone_count(self, obj):
        count = obj.zones.filter(is_active=True).count()
        return f'{count} zone(s)'
    zone_count.short_description = 'Zones actives'


class RouteTagInline(admin.TabularInline):
    model = PricingZone.tags.through
    extra = 1
    verbose_name = 'Tag associé'
    verbose_name_plural = 'Tags associés'


@admin.register(PricingZone)
class PricingZoneAdmin(admin.ModelAdmin):
    list_display = ['name', 'color_badge', 'tags_display', 'total_impact_display', 'is_active']
    list_filter = ['is_active', 'tags']
    search_fields = ['name', 'notes']
    filter_horizontal = ['tags']
    readonly_fields = ['total_impact_percent', 'combined_time_multiplier', 'map_link']

    fieldsets = (
        ('Zone', {
            'fields': ('name', 'is_active', 'notes', 'map_link')
        }),
        ('Géographie', {
            'fields': ('polygon',),
            'classes': ('collapse',),
        }),
        ('Affichage carte', {
            'fields': ('display_color', 'display_opacity')
        }),
        ('Conditions associées', {
            'fields': ('tags', 'total_impact_percent', 'combined_time_multiplier')
        }),
    )

    def color_badge(self, obj):
        return format_html(
            '<span style="display:inline-block;width:20px;height:20px;'
            'background:{};border-radius:4px;border:1px solid #ccc;'
            'opacity:{};"></span>',
            obj.display_color, obj.display_opacity
        )
    color_badge.short_description = 'Couleur'

    def tags_display(self, obj):
        tags = obj.tags.all()
        badges = []
        for t in tags:
            badges.append(format_html(
                '<span style="display:inline-block;background:{};color:#fff;'
                'padding:2px 6px;border-radius:3px;font-size:11px;margin:1px;">{}</span>',
                t.color, t.name
            ))
        return format_html(''.join(str(b) for b in badges)) if badges else '—'
    tags_display.short_description = 'Tags'

    def total_impact_display(self, obj):
        val = obj.total_impact_percent
        color = '#28a745' if val == 0 else ('#dc3545' if val > 0 else '#17a2b8')
        sign = '+' if val > 0 else ''
        return format_html(
            '<span style="color:{};font-weight:bold;">{}{:.1f}%</span>',
            color, sign, val
        )
    total_impact_display.short_description = 'Impact total'

    def map_link(self, obj):
        url = reverse('pricing-admin')
        return format_html(
            '<a href="{}" target="_blank" style="color:#007bff;">🗺️ Ouvrir l\'éditeur de carte</a>',
            url
        )
    map_link.short_description = 'Carte interactive'


@admin.register(PricingConfig)
class PricingConfigAdmin(admin.ModelAdmin):
    list_display = [
        'name', 'base_price_per_km', 'minimum_price',
        'global_multiplier', 'max_zone_impact_percent',
        'currency', 'is_active'
    ]
    list_editable = ['base_price_per_km', 'minimum_price', 'global_multiplier', 'is_active']
    ordering = ['-is_active', '-created_at']

    fieldsets = (
        ('Identification', {'fields': ('name', 'is_active', 'notes')}),
        ('Tarification de base', {
            'fields': ('base_price_per_km', 'minimum_price', 'currency')
        }),
        ('Multiplicateurs', {
            'fields': ('global_multiplier', 'max_zone_impact_percent'),
            'description': (
                'global_multiplier : appliqué en dernier sur le prix total.<br>'
                'max_zone_impact_percent : plafonne l\'impact cumulé des tags dans une zone.'
            ),
        }),
    )

    def save_model(self, request, obj, form, change):
                                                          
        if obj.is_active:
            PricingConfig.objects.exclude(pk=obj.pk).update(is_active=False)
        super().save_model(request, obj, form, change)


@admin.register(PriceCalculationLog)
class PriceCalculationLogAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'created_at', 'total_distance_km',
        'base_price', 'final_price', 'currency',
        'order_id', 'zones_count'
    ]
    list_filter = ['currency', 'created_at']
    search_fields = ['order_id', 'origin_address', 'destination_address']
    readonly_fields = [f.name for f in PriceCalculationLog._meta.get_fields()]
    ordering = ['-created_at']

    def zones_count(self, obj):
        return len(obj.zones_breakdown)
    zones_count.short_description = 'Zones traversées'

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False
