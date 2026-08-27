"""Permissions API admin forum — alignées sur le reste du dashboard staff."""
from rest_framework.permissions import BasePermission

from julmin_taxis.staff_auth import user_is_staff


class IsStaffMember(BasePermission):
    """JWT ou session staff (comme admin-panel)."""

    def has_permission(self, request, view):
        return user_is_staff(request)
