from .utils import diff, log, snapshot


class AuditedMixin:
    """Records create / update / delete of every object touched through a ModelViewSet."""

    def perform_create(self, serializer):
        obj = serializer.save()
        log(self.request, "create", obj, changes=snapshot(obj))

    def perform_update(self, serializer):
        before = snapshot(serializer.instance)
        obj = serializer.save()
        log(self.request, "update", obj, changes=diff(before, snapshot(obj)))

    def perform_destroy(self, instance):
        log(self.request, "delete", instance, changes=snapshot(instance))
        instance.delete()
