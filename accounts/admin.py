from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser


@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    list_display = ['username', 'email', 'first_name', 'last_name', 'phone', 'is_driver', 'is_verified', 'is_blocked', 'date_inscription']
    list_filter = ['is_driver', 'is_verified', 'is_blocked', 'language', 'is_active']
    search_fields = ['username', 'email', 'first_name', 'last_name', 'phone']
    ordering = ['-date_inscription']
    actions = ['block_users', 'unblock_users', 'verify_users']

    fieldsets = UserAdmin.fieldsets + (
        ('Profil DAXI', {
            'fields': ('phone', 'city', 'age', 'photo', 'language', 'is_driver', 'is_blocked', 'is_verified', 'fcm_token')
        }),
    )

    def block_users(self, request, queryset):
        queryset.update(is_blocked=True)
        self.message_user(request, f"{queryset.count()} utilisateur(s) bloqué(s).")
    block_users.short_description = "Bloquer les utilisateurs sélectionnés"

    def unblock_users(self, request, queryset):
        queryset.update(is_blocked=False)
        self.message_user(request, f"{queryset.count()} utilisateur(s) débloqué(s).")
    unblock_users.short_description = "Débloquer les utilisateurs sélectionnés"

    def verify_users(self, request, queryset):
        queryset.update(is_verified=True)
        self.message_user(request, f"{queryset.count()} utilisateur(s) vérifié(s).")
    verify_users.short_description = "Marquer comme vérifiés"
