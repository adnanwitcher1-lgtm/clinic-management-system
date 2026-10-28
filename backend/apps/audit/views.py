from django.db.models import Q
from rest_framework import serializers, viewsets

from .models import AuditLog


class AuditLogSerializer(serializers.ModelSerializer):
    class Meta:
        model = AuditLog
        fields = ["id", "username", "action", "model", "object_id", "object_repr", "changes", "ip", "created_at"]


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = AuditLog.objects.all()
    serializer_class = AuditLogSerializer
    role_map = {"*": []}  # admin only

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("q"):
            q = p["q"]
            qs = qs.filter(Q(username__icontains=q) | Q(object_repr__icontains=q) | Q(model__icontains=q))
        if p.get("action"):
            qs = qs.filter(action=p["action"])
        if p.get("model"):
            qs = qs.filter(model=p["model"])
        if p.get("date_from"):
            qs = qs.filter(created_at__date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(created_at__date__lte=p["date_to"])
        return qs
