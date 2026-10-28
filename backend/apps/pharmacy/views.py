import csv
from datetime import timedelta

from django.db.models import F, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from rest_framework.response import Response

from apps.audit.mixins import AuditedMixin
from apps.audit.utils import log
from apps.core.models import ClinicSettings

from . import importer
from .models import Medicine, StockMovement, UniversalMedicine
from .serializers import MedicineSerializer, StockMovementSerializer, UniversalMedicineSerializer
from .services import InsufficientStock, apply_stock

READ_ALL = ["receptionist", "doctor"]


INJ_Q = Q(form__icontains="inj") | Q(form__icontains="amp") | Q(form__icontains="vial") | Q(form__icontains="infus") | Q(name__istartswith="inj")


def _ranked(qs, q, limit):
    """Names that start with the query come first, then 'contains' matches."""
    starts = list(qs.filter(name__istartswith=q)[:limit])
    if len(starts) < limit:
        ids = [m.id for m in starts]
        more = qs.filter(Q(name__icontains=q) | Q(generic_name__icontains=q)).exclude(id__in=ids)[: limit - len(starts)]
        starts.extend(more)
    return starts


class MedicineViewSet(AuditedMixin, viewsets.ModelViewSet):
    queryset = Medicine.objects.all()
    serializer_class = MedicineSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    role_map = {
        "list": READ_ALL, "retrieve": READ_ALL, "search": READ_ALL, "low_stock": READ_ALL,
        "expiring": READ_ALL, "adjust": ["receptionist"], "movements": ["receptionist"], "*": [],
    }

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        q = p.get("q")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(generic_name__icontains=q) | Q(strength__icontains=q))
        today = timezone.localdate()
        flt = p.get("stock")
        if flt == "low":
            qs = qs.filter(stock_qty__lte=F("reorder_level"))
        elif flt == "out":
            qs = qs.filter(stock_qty__lte=0)
        elif flt == "expiring":
            days = ClinicSettings.load().expiry_alert_days
            qs = qs.filter(expiry_date__isnull=False, expiry_date__lte=today + timedelta(days=days))
        if p.get("active") in ("1", "true"):
            qs = qs.filter(is_active=True)
        if p.get("inj") == "1":
            qs = qs.filter(INJ_Q)
        return qs

    @action(detail=False, methods=["get"])
    def search(self, request):
        q = request.query_params.get("q", "").strip()
        if len(q) < 1:
            return Response([])
        base = Medicine.objects.filter(is_active=True)
        if request.query_params.get("inj") == "1":
            base = base.filter(INJ_Q)
        meds = _ranked(base, q, 15)
        return Response(MedicineSerializer(meds, many=True).data)

    @action(detail=False, methods=["get"])
    def low_stock(self, request):
        qs = Medicine.objects.filter(is_active=True, stock_qty__lte=F("reorder_level")).order_by("stock_qty")[:200]
        return Response(MedicineSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def expiring(self, request):
        days = ClinicSettings.load().expiry_alert_days
        qs = Medicine.objects.filter(is_active=True, expiry_date__isnull=False, expiry_date__lte=timezone.localdate() + timedelta(days=days)).order_by("expiry_date")[:200]
        return Response(MedicineSerializer(qs, many=True).data)

    @action(detail=True, methods=["post"])
    def adjust(self, request, pk=None):
        med = self.get_object()
        try:
            delta = int(request.data.get("delta"))
        except (TypeError, ValueError):
            return Response({"detail": "delta must be a whole number"}, status=400)
        reason = request.data.get("reason") or "adjust"
        if reason not in ("adjust", "import", "expired", "return"):
            reason = "adjust"
        try:
            med = apply_stock(med.pk, delta, reason, user=request.user, note=request.data.get("note", ""))
        except InsufficientStock as e:
            return Response({"detail": str(e)}, status=400)
        log(request, "stock", med, changes={"delta": delta, "reason": reason, "balance": med.stock_qty})
        return Response(MedicineSerializer(med).data)

    @action(detail=False, methods=["get"])
    def movements(self, request):
        qs = StockMovement.objects.select_related("medicine", "created_by")
        if request.query_params.get("reason"):
            qs = qs.filter(reason=request.query_params["reason"])
        page = self.paginate_queryset(qs)
        return self.get_paginated_response(StockMovementSerializer(page, many=True).data)

    @action(detail=False, methods=["post"], url_path="import")
    def import_file(self, request):
        f = request.FILES.get("file")
        if not f:
            return Response({"detail": "Attach a file (CSV, Excel .xlsx or PDF)."}, status=400)
        mode = request.data.get("mode", "add")
        try:
            rows = importer.parse_upload(f)
        except Exception as exc:
            return Response({"detail": f"Could not read file: {exc}"}, status=400)
        if not rows:
            return Response({"detail": "No medicine rows found. Make sure the file has a 'name' column (and strength, form, stock qty, price)."}, status=400)
        result = importer.import_store(rows, user=request.user, mode="replace" if mode == "replace" else "add")
        log(request, "import", model="Medicine", object_repr=f.name, changes={k: v for k, v in result.items() if k != "errors"})
        return Response(result)

    @action(detail=False, methods=["get"])
    def template(self, request):
        resp = HttpResponse(content_type="text/csv")
        resp["Content-Disposition"] = 'attachment; filename="store_medicines_template.csv"'
        w = csv.writer(resp)
        w.writerow(["name", "strength", "form", "stock qty", "price", "expiry date", "batch no", "generic name"])
        w.writerow(["Panadol", "500mg", "Tablet", 200, 2.5, "2027-12-31", "B-1021", "Paracetamol"])
        w.writerow(["Augmentin", "625mg", "Tablet", 60, 55, "2027-06-30", "B-2210", "Amoxicillin + Clavulanic acid"])
        return resp


class UniversalMedicineViewSet(AuditedMixin, viewsets.ModelViewSet):
    queryset = UniversalMedicine.objects.all()
    serializer_class = UniversalMedicineSerializer
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    # doctors / receptionists can add a missing medicine and fix typos; delete + bulk import stay admin-only
    role_map = {"list": READ_ALL, "retrieve": READ_ALL, "search": READ_ALL, "create": READ_ALL, "update": READ_ALL, "partial_update": READ_ALL, "*": []}

    def get_queryset(self):
        qs = super().get_queryset()
        q = self.request.query_params.get("q")
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(generic_name__icontains=q))
        if self.request.query_params.get("inj") == "1":
            qs = qs.filter(INJ_Q)
        return qs

    @action(detail=False, methods=["get"])
    def search(self, request):
        q = request.query_params.get("q", "").strip()
        if not q:
            return Response([])
        base = UniversalMedicine.objects.all()
        if request.query_params.get("inj") == "1":
            base = base.filter(INJ_Q)
        meds = _ranked(base, q, 15)
        return Response(UniversalMedicineSerializer(meds, many=True).data)

    @action(detail=False, methods=["post"], url_path="import")
    def import_file(self, request):
        f = request.FILES.get("file")
        if not f:
            return Response({"detail": "Attach a file (CSV, Excel .xlsx or PDF)."}, status=400)
        try:
            rows = importer.parse_upload(f)
        except Exception as exc:
            return Response({"detail": f"Could not read file: {exc}"}, status=400)
        if not rows:
            return Response({"detail": "No medicine rows found. Make sure the file has a 'name' column."}, status=400)
        result = importer.import_universal(rows)
        log(request, "import", model="UniversalMedicine", object_repr=f.name, changes=result)
        return Response(result, status=status.HTTP_200_OK)
