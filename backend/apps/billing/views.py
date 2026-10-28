from datetime import date as date_cls
from decimal import Decimal

from django.db.models import Count, Sum
from django.utils import timezone
from rest_framework import serializers, viewsets
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log
from apps.clinic.models import Visit

from .models import DailyClosing, Payment


class PaymentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="visit.patient.name", read_only=True)
    patient_no = serializers.CharField(source="visit.patient.patient_no", read_only=True)
    token_no = serializers.IntegerField(source="visit.token_no", read_only=True)
    received_by_name = serializers.CharField(source="received_by.username", read_only=True, default="")

    class Meta:
        model = Payment
        fields = ["id", "visit", "patient_name", "patient_no", "token_no", "amount", "method", "note", "received_by_name", "created_at"]


class PaymentViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Payment.objects.select_related("visit__patient", "received_by")
    serializer_class = PaymentSerializer
    role_map = {"*": ["receptionist"]}

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if p.get("date_from"):
            qs = qs.filter(created_at__date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(created_at__date__lte=p["date_to"])
        if p.get("method"):
            qs = qs.filter(method=p["method"])
        return qs


def day_summary(day):
    pays = Payment.objects.filter(created_at__date=day)
    by = {r["method"]: r["t"] for r in pays.values("method").annotate(t=Sum("amount"))}
    total = sum(by.values(), Decimal("0"))
    visits = Visit.objects.filter(visit_date=day).exclude(status="cancelled")
    pending = visits.exclude(status="completed").count()
    return {
        "date": day, "cash_total": by.get("cash", Decimal("0")), "card_total": by.get("card", Decimal("0")),
        "online_total": by.get("online", Decimal("0")), "total_revenue": total,
        "payments_count": pays.count(), "patients_count": visits.count(), "pending_visits": pending,
    }


class ClosingView(APIView):
    """GET today's (or ?date=) totals; POST closes the day and stores the snapshot."""

    def _check(self, request):
        return request.user.role in ("admin", "receptionist")

    def get(self, request):
        if not self._check(request):
            return Response(status=403)
        day = request.query_params.get("date") or timezone.localdate()
        if isinstance(day, str):
            day = date_cls.fromisoformat(day)
        closing = DailyClosing.objects.filter(date=day).first()
        data = day_summary(day)
        data["closed"] = bool(closing)
        data["closing"] = None if not closing else {
            "counted_cash": closing.counted_cash, "note": closing.note, "closed_by": closing.closed_by.username if closing.closed_by else "", "closed_at": closing.closed_at,
        }
        data["history"] = list(DailyClosing.objects.values("date", "total_revenue", "cash_total", "card_total", "online_total", "counted_cash", "patients_count")[:14])
        return Response(data)

    def post(self, request):
        if not self._check(request):
            return Response(status=403)
        day = request.data.get("date") or timezone.localdate()
        if isinstance(day, str):
            day = date_cls.fromisoformat(day)
        s = day_summary(day)
        counted = request.data.get("counted_cash")
        obj, _ = DailyClosing.objects.update_or_create(
            date=day,
            defaults=dict(
                cash_total=s["cash_total"], card_total=s["card_total"], online_total=s["online_total"],
                total_revenue=s["total_revenue"], patients_count=s["patients_count"],
                counted_cash=Decimal(str(counted)) if counted not in (None, "") else None,
                note=request.data.get("note", ""), closed_by=request.user,
            ),
        )
        log(request, "closing", obj, changes={"revenue": str(s["total_revenue"]), "counted_cash": str(counted)})
        return self.get(request)
