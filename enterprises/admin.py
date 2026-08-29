from django.contrib import admin

from .models import Enterprise, EnterpriseChatMessage, EnterpriseWithdrawal


@admin.register(Enterprise)
class EnterpriseAdmin(admin.ModelAdmin):
    list_display = ['name', 'email', 'phone', 'status', 'mode', 'commission_percent', 'created_at']
    list_filter = ['status', 'mode']
    search_fields = ['name', 'email', 'phone', 'affiliate_code']
    ordering = ['-created_at']
    exclude = ('password_hash',)
    readonly_fields = ('affiliate_code', 'created_at', 'approved_at')


@admin.register(EnterpriseChatMessage)
class EnterpriseChatMessageAdmin(admin.ModelAdmin):
    list_display = ['enterprise', 'is_from_admin', 'created_at']
    list_filter = ['is_from_admin']
    search_fields = ['enterprise__name', 'message']
    ordering = ['-created_at']


@admin.register(EnterpriseWithdrawal)
class EnterpriseWithdrawalAdmin(admin.ModelAdmin):
    list_display = ['enterprise', 'amount', 'status', 'created_at']
    list_filter = ['status']
    search_fields = ['enterprise__name']
    ordering = ['-created_at']
