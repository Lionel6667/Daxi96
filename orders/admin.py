from django.contrib import admin
from .models import Order, OrderMessage, SystemConfig, SecurityLog


class OrderMessageInline(admin.TabularInline):
    model = OrderMessage
    extra = 0
    readonly_fields = ['timestamp']


@admin.register(Order)
class OrderAdmin(admin.ModelAdmin):
    list_display = [
        'id', 'client_name', 'client_email', 'pickup', 'destination',
        'date', 'time', 'status', 'price', 'driver', 'created_at'
    ]
    list_filter = ['status', 'vehicle_type', 'date', 'created_at']
    search_fields = ['client_name', 'client_email', 'client_phone', 'pickup', 'destination']
    ordering = ['-created_at']
    readonly_fields = ['created_at', 'updated_at']
    inlines = [OrderMessageInline]
    actions = ['mark_completed', 'mark_cancelled']

    def mark_completed(self, request, queryset):
        for order in queryset:
            order.update_status('completed')
        self.message_user(request, f"{queryset.count()} commande(s) marquée(s) comme terminée(s).")
    mark_completed.short_description = "Marquer comme terminé"

    def mark_cancelled(self, request, queryset):
        for order in queryset:
            order.update_status('cancelled')
        self.message_user(request, f"{queryset.count()} commande(s) annulée(s).")
    mark_cancelled.short_description = "Annuler les commandes"


@admin.register(OrderMessage)
class OrderMessageAdmin(admin.ModelAdmin):
    list_display = ['order', 'sender_type', 'sender_name', 'content', 'timestamp']
    list_filter = ['sender_type']
    search_fields = ['content', 'sender_name']


@admin.register(SystemConfig)
class SystemConfigAdmin(admin.ModelAdmin):
    """Single-row admin for system-wide rate settings."""
    fieldsets = [
        ('Tarifs dynamiques', {
            'fields': ['wait_rate_per_5min', 'extra_km_rate'],
            'description': 'Ces tarifs s\'appliquent aux frais supplémentaires (pause client, dépassement destination).',
        }),
        ('Taux de change', {
            'fields': ['usd_htg_rate'],
            'description': 'Utilisé pour MonCash et HatexCard. Les prix affichés aux clients restent en USD ($).',
        }),
    ]

    def has_add_permission(self, request):
        return not SystemConfig.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(SecurityLog)
class SecurityLogAdmin(admin.ModelAdmin):
    list_display = ['created_at', 'action', 'actor_type', 'actor_id', 'order', 'ip_address']
    list_filter = ['action', 'actor_type', 'created_at']
    search_fields = ['actor_id', 'old_value', 'new_value']
    readonly_fields = ['created_at', 'action', 'actor_type', 'actor_id', 'user', 'order',
                       'old_value', 'new_value', 'ip_address', 'metadata']
    ordering = ['-created_at']

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

