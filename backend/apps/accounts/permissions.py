from rest_framework.permissions import BasePermission


class ActionRolePermission(BasePermission):
    """
    Role-based access per view action.

    A view declares ``role_map = {"list": ["doctor"], "*": ["receptionist"]}``.
    * Admins always pass.
    * An action missing from the map falls back to "*".
    * If neither exists the action is admin-only.
    * A view without ``role_map`` only needs authentication.
    """

    def has_permission(self, request, view):
        user = request.user
        if not user or not user.is_authenticated or not user.is_active:
            return False
        role_map = getattr(view, "role_map", None)
        if role_map is None:
            return True
        if user.role == "admin":
            return True
        action = getattr(view, "action", None) or request.method.lower()
        roles = role_map.get(action, role_map.get("*"))
        return bool(roles) and user.role in roles
