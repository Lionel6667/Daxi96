from django.contrib import admin
from .models import Driver, DriverReview


@admin.register(Driver)
class DriverAdmin(admin.ModelAdmin):
    list_display = ['full_name', 'email', 'phone', 'vehicle', 'plate', 'status', 'rating', 'completed_trips', 'is_verified', 'is_blocked']
    list_filter = ['status', 'is_verified', 'is_blocked']
    search_fields = ['firstname', 'lastname', 'email', 'phone', 'plate']
    ordering = ['-created_at']
    exclude = ('password_hash', 'photo_base64', 'fcm_token')
    actions = ['verify_drivers', 'block_drivers', 'unblock_drivers']

    def verify_drivers(self, request, queryset):
        queryset.update(is_verified=True)
        self.message_user(request, f"{queryset.count()} chauffeur(s) vérifié(s).")
    verify_drivers.short_description = "Vérifier les chauffeurs"

    def block_drivers(self, request, queryset):
        queryset.update(is_blocked=True)
        self.message_user(request, f"{queryset.count()} chauffeur(s) bloqué(s).")
    block_drivers.short_description = "Bloquer les chauffeurs"

    def unblock_drivers(self, request, queryset):
        queryset.update(is_blocked=False)
        self.message_user(request, f"{queryset.count()} chauffeur(s) débloqué(s).")
    unblock_drivers.short_description = "Débloquer les chauffeurs"


@admin.register(DriverReview)
class DriverReviewAdmin(admin.ModelAdmin):
    list_display = ['driver', 'user', 'rating', 'comment', 'created_at']
    list_filter = ['rating']
    search_fields = ['driver__firstname', 'driver__lastname', 'comment']
