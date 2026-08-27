"""
Permissions admin granulaires — remplace le binaire is_staff / is_admin.

Rôles :
  super_admin, finance, support, dispatch, driver_manager, enterprise_manager
"""
from __future__ import annotations

import re
from typing import Optional

from django.http import HttpResponse

ROLE_SUPER_ADMIN = 'super_admin'
ROLE_FINANCE = 'finance'
ROLE_SUPPORT = 'support'
ROLE_DISPATCH = 'dispatch'
ROLE_DRIVER_MANAGER = 'driver_manager'
ROLE_ENTERPRISE_MANAGER = 'enterprise_manager'

ADMIN_ROLE_CHOICES = [
    (ROLE_SUPER_ADMIN, 'Super Admin'),
    (ROLE_FINANCE, 'Finance'),
    (ROLE_SUPPORT, 'Support'),
    (ROLE_DISPATCH, 'Dispatch'),
    (ROLE_DRIVER_MANAGER, 'Driver Manager'),
    (ROLE_ENTERPRISE_MANAGER, 'Enterprise Manager'),
]


PERM_ALL = '*'
PERM_ORDERS_VIEW = 'orders_view'
PERM_ORDERS = 'orders'
PERM_PAYMENTS = 'payments'
PERM_WITHDRAWALS = 'withdrawals'
PERM_COMMISSIONS = 'commissions'
PERM_WALLETS = 'wallets'
PERM_CHAT = 'chat'
PERM_USERS = 'users'
PERM_TICKETS = 'tickets'
PERM_DRIVERS_MANAGE = 'drivers_manage'
PERM_ENTERPRISES = 'enterprises'
PERM_SYSTEM = 'system_config'

ROLE_PERMISSIONS: dict[str, set[str]] = {
    ROLE_SUPER_ADMIN: {PERM_ALL},
    ROLE_FINANCE: {
        PERM_ORDERS_VIEW, PERM_PAYMENTS, PERM_WITHDRAWALS, PERM_COMMISSIONS, PERM_WALLETS,
    },
    ROLE_SUPPORT: {PERM_ORDERS_VIEW, PERM_CHAT, PERM_USERS, PERM_TICKETS},
    ROLE_DISPATCH: {PERM_ORDERS_VIEW, PERM_ORDERS},
    ROLE_DRIVER_MANAGER: {PERM_ORDERS_VIEW, PERM_DRIVERS_MANAGE},
    ROLE_ENTERPRISE_MANAGER: {PERM_ORDERS_VIEW, PERM_ENTERPRISES},
}


_ADMIN_PATH_RULES: list[tuple[str, str]] = [
    (r'^/htmx/admin/system-config/?', PERM_SYSTEM),
    (r'^/htmx/admin/geo/', PERM_SYSTEM),
    (r'^/htmx/admin/change-password/?', PERM_SYSTEM),
    (r'^/htmx/admin/withdrawals/', PERM_WITHDRAWALS),
    (r'^/htmx/admin/pricing/?', PERM_COMMISSIONS),
    (r'^/htmx/admin/drivers/\d+/commission/?', PERM_COMMISSIONS),
    (r'^/htmx/admin/drivers/\d+/block/?', PERM_DRIVERS_MANAGE),
    (r'^/htmx/admin/drivers/\d+/verify/?', PERM_DRIVERS_MANAGE),
    (r'^/htmx/admin/drivers/\d+/delete/?', PERM_DRIVERS_MANAGE),
    (r'^/htmx/admin/drivers/\d+/car-image/?', PERM_DRIVERS_MANAGE),
    (r'^/htmx/admin/drivers/\d+/photo/?', PERM_DRIVERS_MANAGE),
    (r'^/htmx/admin/orders/\d+/delete/?', PERM_SYSTEM),
    (r'^/htmx/admin/orders/.+/assign-driver/?', PERM_ORDERS),
    (r'^/htmx/admin/orders/.+/status/?', PERM_ORDERS),
    (r'^/htmx/admin/orders/.+/refuse/?', PERM_ORDERS),
    (r'^/htmx/admin/orders/.+/propose-price/?', PERM_ORDERS),
    (r'^/htmx/admin/orders/.+/set-coords/?', PERM_ORDERS),
    (r'^/htmx/admin/chat/', PERM_CHAT),
    (r'^/htmx/admin/users/', PERM_USERS),
    (r'^/htmx/admin/assistance/', PERM_TICKETS),
    (r'^/htmx/admin/lost-objects/', PERM_TICKETS),
    (r'^/htmx/admin/sos-alerts/', PERM_TICKETS),
    (r'^/htmx/admin/enterprises/', PERM_ENTERPRISES),
    (r'^/htmx/admin/orders/?', PERM_ORDERS_VIEW),
    (r'^/htmx/admin/drivers/?', PERM_ORDERS_VIEW),
    (r'^/htmx/admin/stats/?', PERM_ORDERS_VIEW),
    (r'^/htmx/admin/calendar', PERM_ORDERS_VIEW),
    (r'^/htmx/admin/drivers/available/?', PERM_ORDERS),
]

_API_ADMIN_RULES: list[tuple[str, str]] = [
    (r'^/api/admin-panel/withdrawals', PERM_WITHDRAWALS),
    (r'^/api/admin-panel/finance', PERM_PAYMENTS),
    (r'^/api/admin-panel/drivers/.*/commission', PERM_COMMISSIONS),
    (r'^/api/admin-panel/drivers/.*/block', PERM_DRIVERS_MANAGE),
    (r'^/api/admin-panel/chat', PERM_CHAT),
    (r'^/api/admin-panel/users', PERM_USERS),
    (r'^/api/admin-panel/enterprises', PERM_ENTERPRISES),
    (r'^/api/admin-panel/orders/.*/delete', PERM_SYSTEM),
    (r'^/api/admin-panel/orders', PERM_ORDERS_VIEW),
    (r'^/api/admin-panel/stats', PERM_ORDERS_VIEW),
    (r'^/api/admin-panel/dashboard', PERM_ORDERS_VIEW),
]


def resolve_admin_role(request) -> Optional[str]:
    """Rôle admin effectif pour cette requête."""
    session = getattr(request, 'session', None)
    if session is not None:
        explicit = (session.get('admin_role') or '').strip()
        if explicit:
            return explicit
        if session.get('is_admin'):
            return ROLE_SUPER_ADMIN

    from julmin_taxis.staff_auth import resolve_staff_user
    user = resolve_staff_user(request)
    if not user:
        return None
    if getattr(user, 'is_superuser', False):
        return ROLE_SUPER_ADMIN
    role = (getattr(user, 'admin_role', None) or '').strip()
    if role:
        return role
    if getattr(user, 'is_staff', False):
        return ROLE_SUPER_ADMIN
    return None


def role_has_permission(role: Optional[str], permission: str) -> bool:
    if not role or not permission:
        return False
    perms = ROLE_PERMISSIONS.get(role, set())
    if PERM_ALL in perms:
        return True
    return permission in perms


def admin_has_permission(request, permission: str) -> bool:
    return role_has_permission(resolve_admin_role(request), permission)


def permission_for_path(path: str, rules: list[tuple[str, str]]) -> Optional[str]:
    for pattern, perm in rules:
        if re.search(pattern, path):
            return perm
    return None


def required_permission_for_request(request) -> Optional[str]:
    path = request.path or ''
    if path.startswith('/htmx/admin/'):
        return permission_for_path(path, _ADMIN_PATH_RULES)
    if path.startswith('/api/admin-panel/'):
        return permission_for_path(path, _API_ADMIN_RULES)
    return None


def admin_permission_denied_response(request) -> HttpResponse:
    """Réponse HTMX ou JSON selon le contexte."""
    from julmin_taxis.security_audit import log_access_denied
    perm = required_permission_for_request(request) or 'admin'
    log_access_denied(request, resource=request.path, permission=perm)
    if request.path.startswith('/api/'):
        from django.http import JsonResponse
        return JsonResponse({'error': 'Permission refusée pour cette action.'}, status=403)
    return HttpResponse(
        '<div class="bg-red-500/10 border border-red-500/20 text-red-500 px-4 py-3 rounded-2xl font-bold text-sm">'
        '<i class="ri-lock-line mr-2"></i> Permission refusée — votre rôle ne permet pas cette action.</div>',
        status=200,
        content_type='text/html',
    )
