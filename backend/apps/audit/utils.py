from decimal import Decimal

SENSITIVE = {"password", "whatsapp_token"}


def _client_ip(request):
    if request is None:
        return None
    fwd = request.META.get("HTTP_X_FORWARDED_FOR")
    return (fwd.split(",")[0].strip() if fwd else request.META.get("REMOTE_ADDR")) or None


def snapshot(obj):
    """Flat, JSON-safe dict of an instance's concrete fields."""
    data = {}
    for f in obj._meta.concrete_fields:
        if f.name in SENSITIVE:
            continue
        v = getattr(obj, f.attname, None)
        if isinstance(v, Decimal):
            v = str(v)
        elif v is not None and not isinstance(v, (str, int, float, bool)):
            v = str(v)
        data[f.name] = v
    return data


def diff(before, after):
    return {k: [before.get(k), after.get(k)] for k in after if before.get(k) != after.get(k)}


def log(request, action, obj=None, changes=None, user=None, model=None, object_id=None, object_repr=None):
    from .models import AuditLog

    user = user or (getattr(request, "user", None) if request is not None else None)
    if user is not None and not getattr(user, "is_authenticated", False):
        user = None
    AuditLog.objects.create(
        user=user,
        username=getattr(user, "username", "") or "",
        action=action,
        model=model or (obj._meta.object_name if obj is not None else ""),
        object_id=str(object_id if object_id is not None else (obj.pk if obj is not None else "")),
        object_repr=(object_repr if object_repr is not None else (str(obj) if obj is not None else ""))[:255],
        changes=changes or {},
        ip=_client_ip(request),
    )
