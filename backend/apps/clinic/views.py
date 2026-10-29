import re
from datetime import timedelta
from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Max, Q
from django.http import HttpResponse
from django.utils import timezone
from rest_framework import serializers as drf_serializers
from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response

from apps.audit.mixins import AuditedMixin
from apps.audit.utils import log
from apps.billing.models import Payment
from apps.core.models import ClinicSettings
from apps.core.utils import dispatch, digits
from apps.pharmacy.services import InsufficientStock, apply_stock

from . import whatsapp
from .models import (
    Appointment, InjectionComponent, InjectionOrder, InjectionTemplate, Patient, Prescription, PrescriptionItem,
    Symptom, Visit, VisitSymptom, Vitals,
)
from .pdf import build_prescription_pdf, build_token_slip
from .serializers import (
    AppointmentSerializer, InjectionTemplateSerializer, PatientSerializer, PrescriptionSerializer, PrescriptionWriteSerializer,
    SymptomSerializer, VisitDetailSerializer, VisitListSerializer, VisitRegisterSerializer, VisitUpdateSerializer,
)
from .tasks import generate_prescription_pdf, send_prescription_whatsapp, send_single_reminder

ALL_STAFF = ["receptionist", "doctor"]


def patient_search(qs, q):
    """Match by patient no (P-000012 / 12), phone digits, or name."""
    q = (q or "").strip()
    if not q:
        return qs
    d = digits(q)
    cond = Q(name__icontains=q) | Q(patient_no__icontains=q)
    if d:
        cond |= Q(phone__icontains=d)
        if len(d) <= 6 and re.fullmatch(r"[pP]?-?\d+", q):
            cond |= Q(patient_no=f"P-{int(d):06d}")
    return qs.filter(cond)


# ------------------------------------------------------------------ patients
class PatientViewSet(AuditedMixin, viewsets.ModelViewSet):
    queryset = Patient.objects.all()
    serializer_class = PatientSerializer
    role_map = {"list": ALL_STAFF, "retrieve": ALL_STAFF, "search": ALL_STAFF, "history": ALL_STAFF,
                "create": ["receptionist"], "update": ["receptionist"], "partial_update": ["receptionist"], "*": []}

    def get_queryset(self):
        qs = Patient.objects.annotate(visits_count=Count("visits"), last_visit=Max("visits__visit_date"))
        qs = patient_search(qs, self.request.query_params.get("q"))
        if self.request.user.role == "doctor":
            qs = qs.filter(visits__doctor=self.request.user).distinct()
        return qs.order_by("-id")

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        log(self.request, "create", obj, changes={"patient_no": obj.patient_no, "name": obj.name})

    @action(detail=False, methods=["get"])
    def search(self, request):
        qs = patient_search(Patient.objects.annotate(visits_count=Count("visits"), last_visit=Max("visits__visit_date")), request.query_params.get("q"))
        return Response(PatientSerializer(qs.order_by("-id")[:10], many=True).data)

    @action(detail=True, methods=["get"])
    def history(self, request, pk=None):
        patient = Patient.objects.get(pk=pk)
        visits = (
            patient.visits.exclude(status="cancelled")
            .select_related("patient", "doctor", "vitals", "prescription")
            .prefetch_related("prescription__items", "prescription__injections__components", "payments", "symptom_entries__symptom")
            .order_by("-visit_date", "-token_no")
        )
        return Response(VisitDetailSerializer(visits, many=True).data)


# ------------------------------------------------------------------ symptoms
class SymptomViewSet(AuditedMixin, viewsets.ModelViewSet):
    queryset = Symptom.objects.all()
    serializer_class = SymptomSerializer
    pagination_class = None
    role_map = {"list": ALL_STAFF, "retrieve": ALL_STAFF, "*": []}

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role != "admin" or self.request.query_params.get("active") == "1":
            qs = qs.filter(is_active=True)
        return qs


# ------------------------------------------------------------------ visits
def _with_related(qs):
    return qs.select_related("patient", "doctor", "vitals", "prescription").prefetch_related(
        "prescription__items__medicine", "prescription__injections__components__medicine", "payments__received_by", "symptom_entries__symptom"
    )


def _has_store_stock(rx):
    """True when the prescription contains anything the clinic store must hand out (tablets or injection drugs)."""
    if any(i.source == "store" for i in rx.items.all()):
        return True
    return any(c.source == "store" for inj in rx.injections.all() for c in inj.components.all())


def maybe_complete(visit):
    """A visit is complete when medicine (if any) is dispensed and nothing is owed."""
    visit = _with_related(Visit.objects.filter(pk=visit.pk)).get()
    rx = visit.rx
    needs_dispense = bool(rx and not rx.dispensed_at and _has_store_stock(rx))
    if visit.status == Visit.Status.MEDICINE_PENDING and not needs_dispense and visit.balance <= 0:
        visit.status = Visit.Status.COMPLETED
        visit.save(update_fields=["status"])
    return visit


def billing_payload(visit):
    visit = _with_related(Visit.objects.filter(pk=visit.pk)).get()
    return {
        "consultation_fee": visit.consultation_fee, "medicine_total": visit.medicine_total, "injection_total": visit.injection_total,
        "total": visit.total_due, "paid": visit.paid_amount, "due": max(visit.balance, Decimal("0")),
        "payment_status": visit.payment_status, "status": visit.status,
        "dispensed": bool(visit.rx and visit.rx.dispensed_at),
        "payments": VisitDetailSerializer(visit).data["payments"],
    }


class VisitViewSet(viewsets.ModelViewSet):
    queryset = Visit.objects.all()
    http_method_names = ["get", "post", "patch", "put", "head", "options"]
    role_map = {
        "list": ALL_STAFF, "retrieve": ALL_STAFF, "queue": ALL_STAFF, "followups": ALL_STAFF,
        "create": ["receptionist"], "partial_update": ALL_STAFF, "update": [],
        "start": ["doctor"], "finish": ["doctor"], "prescription": ["doctor"],
        "dispense": ["receptionist"], "pay": ["receptionist"], "billing": ["receptionist", "doctor"],
        "cancel": ["receptionist"], "complete": ["receptionist"], "token_slip": ["receptionist"],
        "remind": ["receptionist"], "*": [],
    }

    def get_serializer_class(self):
        if self.action == "create":
            return VisitRegisterSerializer
        return VisitDetailSerializer if self.action == "retrieve" else VisitListSerializer

    def get_queryset(self):
        qs = _with_related(Visit.objects.all())
        u = self.request.user
        if u.role == "doctor":
            qs = qs.filter(doctor=u)
        p = self.request.query_params
        if p.get("date"):
            qs = qs.filter(visit_date=p["date"])
        if p.get("date_from"):
            qs = qs.filter(visit_date__gte=p["date_from"])
        if p.get("date_to"):
            qs = qs.filter(visit_date__lte=p["date_to"])
        if p.get("status"):
            qs = qs.filter(status__in=p["status"].split(","))
        if p.get("doctor"):
            qs = qs.filter(doctor_id=p["doctor"])
        if p.get("visit_type"):
            qs = qs.filter(visit_type=p["visit_type"])
        if p.get("patient"):
            qs = qs.filter(patient_id=p["patient"])
        if p.get("q"):
            qs = qs.filter(patient__in=patient_search(Patient.objects.all(), p["q"]))
        return qs.order_by("-visit_date", "-token_no") if self.action == "list" else qs

    def update(self, request, *args, **kwargs):
        return Response({"detail": "Use PATCH."}, status=405)

    # --- reception: register ------------------------------------------------
    def create(self, request, *args, **kwargs):
        ser = VisitRegisterSerializer(data=request.data, context={"request": request})
        ser.is_valid(raise_exception=True)
        visit = ser.save()
        log(request, "create", visit, changes={"token": visit.token_no, "patient": visit.patient.patient_no, "doctor": visit.doctor.username})
        visit = _with_related(Visit.objects.filter(pk=visit.pk)).get()
        return Response(VisitDetailSerializer(visit).data, status=201)

    @action(detail=False, methods=["get"])
    def queue(self, request):
        date = request.query_params.get("date") or timezone.localdate()
        qs = self.get_queryset().filter(visit_date=date).exclude(status="cancelled").order_by("token_no")
        return Response(VisitListSerializer(qs, many=True).data)

    @action(detail=False, methods=["get"])
    def followups(self, request):
        today = timezone.localdate()
        days = int(request.query_params.get("days", 14))
        qs = self.get_queryset().filter(follow_up_date__isnull=False, follow_up_date__gte=today - timedelta(days=7), follow_up_date__lte=today + timedelta(days=days)).order_by("follow_up_date")
        data = VisitListSerializer(qs, many=True).data
        cfg = ClinicSettings.load()
        for row, v in zip(data, qs):
            text = f"Hello {v.patient.name}, reminder from {cfg.clinic_name}: your follow-up with Dr. {v.doctor.display_name} is on {v.follow_up_date:%d %b %Y}."
            row["wa_link"] = whatsapp.wa_link(v.patient.phone, text, cfg) if digits(v.patient.phone) else ""
            row["follow_up_reminded"] = v.follow_up_reminded
        return Response(data)

    @action(detail=True, methods=["post"])
    def remind(self, request, pk=None):
        v = self.get_object()
        cfg = ClinicSettings.load()
        text = f"Hello {v.patient.name}, reminder from {cfg.clinic_name}: your follow-up with Dr. {v.doctor.display_name} is on {v.follow_up_date:%d %b %Y}." if v.follow_up_date else ""
        has_phone = bool(digits(v.patient.phone))
        queued = has_phone and bool(v.follow_up_date) and whatsapp.is_configured(cfg)
        if queued:
            dispatch(send_single_reminder, v.pk)
        return Response({"queued": queued, "wa_link": whatsapp.wa_link(v.patient.phone, text, cfg) if has_phone else ""})

    @action(detail=True, methods=["get"], url_path="token-slip")
    def token_slip(self, request, pk=None):
        v = self.get_object()
        resp = HttpResponse(build_token_slip(v, ClinicSettings.load()), content_type="application/pdf")
        resp["Content-Disposition"] = f'inline; filename="token-{v.token_no}.pdf"'
        return resp

    # --- doctor: examine -------------------------------------------------------
    def partial_update(self, request, *args, **kwargs):
        visit = self.get_object()
        ser = VisitUpdateSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        d = ser.validated_data
        if request.user.role == "receptionist" and set(d) - {"vitals"}:
            return Response({"detail": "Receptionists can only edit vitals."}, status=403)
        with transaction.atomic():
            for f in ("diagnosis", "notes", "follow_up_date"):
                if f in d:
                    setattr(visit, f, d[f])
                    if f == "follow_up_date":
                        visit.follow_up_reminded = False
            if "symptom_entries" in d:
                visit.symptom_entries.all().delete()
                seen = set()
                for e in d["symptom_entries"]:
                    if e["symptom"].pk in seen:
                        continue
                    seen.add(e["symptom"].pk)
                    VisitSymptom.objects.create(visit=visit, symptom=e["symptom"], value=e.get("value", ""))
                visit.rebuild_complaints()
            if "vitals" in d:
                vit, _ = Vitals.objects.get_or_create(visit=visit)
                for k, v in d["vitals"].items():
                    setattr(vit, k, v)
                vit.save()
            visit.save()
        log(request, "update", visit, changes={k: str(v)[:200] for k, v in request.data.items() if k in ("diagnosis", "notes", "follow_up_date", "vitals")})
        return Response(VisitDetailSerializer(_with_related(Visit.objects.filter(pk=visit.pk)).get()).data)

    @action(detail=True, methods=["post"])
    def start(self, request, pk=None):
        visit = self.get_object()
        if visit.status == Visit.Status.WAITING:
            visit.status = Visit.Status.WITH_DOCTOR
            visit.started_at = timezone.now()
            visit.save(update_fields=["status", "started_at"])
        return Response(VisitDetailSerializer(_with_related(Visit.objects.filter(pk=visit.pk)).get()).data)

    @action(detail=True, methods=["get", "put"])
    def prescription(self, request, pk=None):
        visit = self.get_object()
        if request.method == "GET":
            rx = visit.rx
            return Response(PrescriptionSerializer(rx).data if rx else None)
        if visit.status in (Visit.Status.COMPLETED, Visit.Status.CANCELLED):
            return Response({"detail": "This visit is closed."}, status=400)
        ser = PrescriptionWriteSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        with transaction.atomic():
            rx, _ = Prescription.objects.get_or_create(visit=visit, defaults={"created_by": request.user})
            if rx.dispensed_at:
                return Response({"detail": "Medicines are already dispensed – prescription is locked."}, status=400)
            rx.advice = ser.validated_data.get("advice", "")
            rx.save()
            rx.items.all().delete()
            for n, it in enumerate(ser.validated_data["items"]):
                med = it.get("medicine")
                if it["source"] == "store":
                    PrescriptionItem.objects.create(
                        prescription=rx, medicine=med, source="store", name=med.name, strength=med.strength, form=med.form,
                        dose=it.get("dose", ""), frequency=it.get("frequency", ""), duration=it.get("duration", ""),
                        instructions=it.get("instructions", ""), quantity=it.get("quantity", 1), unit_price=med.price, order=n,
                    )
                else:
                    PrescriptionItem.objects.create(
                        prescription=rx, source="outside", name=it["name"].strip(), strength=it.get("strength", ""), form=it.get("form", ""),
                        dose=it.get("dose", ""), frequency=it.get("frequency", ""), duration=it.get("duration", ""),
                        instructions=it.get("instructions", ""), quantity=it.get("quantity", 1), order=n,
                    )
            if "injections" in ser.validated_data:
                rx.injections.all().delete()
                for n, inj in enumerate(ser.validated_data["injections"]):
                    order = InjectionOrder.objects.create(
                        prescription=rx, label=inj.get("label", "").strip(), route=inj.get("route", "IM"), diluent=inj.get("diluent", ""),
                        frequency=inj.get("frequency", ""), duration=inj.get("duration", ""), doses=inj.get("doses", 1),
                        notes=inj.get("notes", ""), admin_fee=inj.get("admin_fee", 0), order=n,
                    )
                    for k, c in enumerate(inj["components"]):
                        med = c.get("medicine")
                        if c["source"] == "store":
                            InjectionComponent.objects.create(
                                injection=order, medicine=med, source="store", name=med.name, strength=med.strength, form=med.form,
                                amount=c.get("amount", ""), quantity=c.get("quantity", 1), unit_price=med.price, order=k,
                            )
                        else:
                            InjectionComponent.objects.create(
                                injection=order, source="outside", name=c["name"].strip(), strength=c.get("strength", ""), form=c.get("form", ""),
                                amount=c.get("amount", ""), quantity=c.get("quantity", 1), order=k,
                            )
        rx = Prescription.objects.prefetch_related("items__medicine", "injections__components__medicine").select_related("visit__doctor").get(pk=rx.pk)
        log(request, "update", rx, changes={"items": rx.items.count(), "injections": rx.injections.count()})
        return Response(PrescriptionSerializer(rx).data)

    @action(detail=True, methods=["post"])
    def finish(self, request, pk=None):
        visit = self.get_object()
        if visit.status not in (Visit.Status.WAITING, Visit.Status.WITH_DOCTOR):
            return Response({"detail": "Visit is not with the doctor."}, status=400)
        if "follow_up_date" in request.data:
            visit.follow_up_date = request.data.get("follow_up_date") or None
        visit.status = Visit.Status.MEDICINE_PENDING
        visit.finished_at = timezone.now()
        visit.started_at = visit.started_at or visit.finished_at
        visit.save()
        rx = visit.rx
        if rx:
            rx.finalized_at = timezone.now()
            rx.save(update_fields=["finalized_at"])
            dispatch(generate_prescription_pdf, rx.pk)
        log(request, "finish", visit, changes={"diagnosis": visit.diagnosis[:200]})
        return Response(VisitDetailSerializer(maybe_complete(visit)).data)

    # --- reception: dispense & bill ------------------------------------------
    @action(detail=True, methods=["post"])
    def dispense(self, request, pk=None):
        visit = self.get_object()
        rx = visit.rx
        if not rx:
            return Response({"detail": "No prescription for this visit."}, status=400)
        if rx.dispensed_at:
            return Response({"detail": "Already dispensed."}, status=400)
        if visit.status not in (Visit.Status.MEDICINE_PENDING, Visit.Status.WITH_DOCTOR):
            return Response({"detail": "Doctor has not finished this visit yet."}, status=400)
        overrides = {int(o["id"]): int(o["quantity"]) for o in request.data.get("items", []) if "id" in o and "quantity" in o}
        inj_overrides = {int(o["id"]): int(o["quantity"]) for o in request.data.get("injections", []) if "id" in o and "quantity" in o}
        store_items = [i for i in rx.items.select_related("medicine") if i.source == "store"]
        store_inj = [c for inj in rx.injections.all() for c in inj.components.select_related("medicine") if c.source == "store"]
        try:
            with transaction.atomic():
                for i in store_items:
                    qty = max(0, overrides.get(i.id, i.quantity))
                    if qty and i.medicine_id:
                        apply_stock(i.medicine_id, -qty, "dispense", user=request.user, note=f"Token #{visit.token_no}", visit=visit, item=i)
                    i.dispensed_qty = qty
                    i.save(update_fields=["dispensed_qty"])
                for c in store_inj:
                    qty = max(0, inj_overrides.get(c.id, c.quantity))
                    if qty and c.medicine_id:
                        apply_stock(c.medicine_id, -qty, "dispense", user=request.user, note=f"Token #{visit.token_no} · injection", visit=visit)
                    c.dispensed_qty = qty
                    c.save(update_fields=["dispensed_qty"])
                rx.dispensed_at = timezone.now()
                rx.dispensed_by = request.user
                rx.save(update_fields=["dispensed_at", "dispensed_by"])
        except InsufficientStock as e:
            return Response({"detail": str(e)}, status=400)
        log(request, "dispense", visit, changes={"token": visit.token_no, "items": len(store_items), "injection_drugs": len(store_inj)})
        visit = maybe_complete(visit)
        return Response(VisitDetailSerializer(visit).data)

    @action(detail=True, methods=["get"])
    def billing(self, request, pk=None):
        return Response(billing_payload(self.get_object()))

    @action(detail=True, methods=["post"])
    def pay(self, request, pk=None):
        visit = self.get_object()
        try:
            amount = Decimal(str(request.data.get("amount")))
        except Exception:
            return Response({"detail": "Enter a valid amount."}, status=400)
        if amount <= 0:
            return Response({"detail": "Amount must be greater than zero."}, status=400)
        method = request.data.get("method", "cash")
        if method not in ("cash", "card", "online"):
            method = "cash"
        pay = Payment.objects.create(visit=visit, amount=amount, method=method, note=request.data.get("note", ""), received_by=request.user)
        log(request, "payment", pay, changes={"amount": str(amount), "method": method, "token": visit.token_no})
        maybe_complete(visit)
        return Response(billing_payload(visit), status=201)

    @action(detail=True, methods=["post"])
    def complete(self, request, pk=None):
        visit = self.get_object()
        visit.status = Visit.Status.COMPLETED
        visit.save(update_fields=["status"])
        log(request, "complete", visit, changes={"balance_left": str(visit.balance)})
        return Response(VisitDetailSerializer(_with_related(Visit.objects.filter(pk=visit.pk)).get()).data)

    @action(detail=True, methods=["post"])
    def cancel(self, request, pk=None):
        visit = self.get_object()
        if visit.status != Visit.Status.WAITING:
            return Response({"detail": "Only waiting visits can be cancelled."}, status=400)
        visit.status = Visit.Status.CANCELLED
        visit.save(update_fields=["status"])
        log(request, "cancel", visit)
        return Response(VisitListSerializer(visit).data)


# ------------------------------------------------------------------ prescriptions: PDF / WhatsApp
class PrescriptionViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = Prescription.objects.select_related("visit__patient", "visit__doctor", "visit__vitals").prefetch_related("items__medicine", "injections__components__medicine", "visit__payments")
    serializer_class = PrescriptionSerializer
    role_map = {"*": ["receptionist", "doctor"]}

    def get_queryset(self):
        qs = super().get_queryset()
        if self.request.user.role == "doctor":
            qs = qs.filter(visit__doctor=self.request.user)
        return qs

    @action(detail=True, methods=["get"])
    def pdf(self, request, pk=None):
        rx = self.get_object()
        layout = request.query_params.get("layout", "a4")
        if layout not in ("a4", "patient", "thermal", "outside", "inside", "outside_thermal"):
            layout = "a4"
        data = build_prescription_pdf(rx, layout)
        log(request, "print", rx, changes={"layout": layout})
        name = f"prescription-{rx.visit.patient.patient_no}-{rx.visit.visit_date}-{layout}.pdf"
        resp = HttpResponse(data, content_type="application/pdf")
        resp["Content-Disposition"] = f'inline; filename="{name}"'
        return resp

    @action(detail=True, methods=["post"])
    def whatsapp(self, request, pk=None):
        rx = self.get_object()
        cfg = ClinicSettings.load()
        layout = request.data.get("layout", "patient")
        phone = (request.data.get("phone") or rx.visit.patient.phone)
        if not digits(phone):
            return Response({"detail": "This patient has no phone number on file."}, status=400)
        link = whatsapp.wa_link(phone, whatsapp.prescription_text(rx, cfg), cfg)
        queued = whatsapp.is_configured(cfg)
        if queued:
            dispatch(send_prescription_whatsapp, rx.pk, layout)
        log(request, "whatsapp", rx, changes={"phone": phone, "api": queued})
        return Response({"queued": queued, "wa_link": link, "phone": whatsapp.normalize_msisdn(phone, cfg.country_code)})


# ------------------------------------------------------------------ injection mix templates
class InjectionTemplateViewSet(viewsets.ModelViewSet):
    """Doctor's own saved injection mixes."""

    queryset = InjectionTemplate.objects.all()
    serializer_class = InjectionTemplateSerializer
    pagination_class = None
    http_method_names = ["get", "post", "delete", "head", "options"]
    role_map = {"*": ["doctor"]}

    def get_queryset(self):
        qs = super().get_queryset()
        return qs if self.request.user.role == "admin" else qs.filter(created_by=self.request.user)

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        log(self.request, "create", obj, changes={"name": obj.name})

    def perform_destroy(self, instance):
        log(self.request, "delete", instance, changes={"name": instance.name})
        instance.delete()


# ------------------------------------------------------------------ appointments
class AppointmentViewSet(AuditedMixin, viewsets.ModelViewSet):
    queryset = Appointment.objects.select_related("patient", "doctor")
    serializer_class = AppointmentSerializer
    role_map = {"list": ALL_STAFF, "retrieve": ALL_STAFF, "*": ["receptionist"]}

    def get_queryset(self):
        qs = super().get_queryset()
        p = self.request.query_params
        if self.request.user.role == "doctor":
            qs = qs.filter(doctor=self.request.user)
        if p.get("date"):
            qs = qs.filter(scheduled_at__date=p["date"])
        if p.get("upcoming") == "1":
            qs = qs.filter(scheduled_at__gte=timezone.now() - timedelta(hours=2), status="scheduled")
        if p.get("status"):
            qs = qs.filter(status=p["status"])
        return qs

    def perform_create(self, serializer):
        obj = serializer.save(created_by=self.request.user)
        log(self.request, "create", obj)

    @action(detail=True, methods=["post"])
    def check_in(self, request, pk=None):
        """Turn an appointment into a live visit (token + queue) when the patient arrives."""
        appt = self.get_object()
        ser = VisitRegisterSerializer(data={"patient_id": appt.patient_id, "doctor": appt.doctor_id, "notes": appt.reason}, context={"request": request})
        ser.is_valid(raise_exception=True)
        visit = ser.save()
        appt.visit, appt.status = visit, "arrived"
        appt.save(update_fields=["visit", "status"])
        log(request, "check_in", appt)
        return Response(VisitListSerializer(_with_related(Visit.objects.filter(pk=visit.pk)).get()).data, status=201)
