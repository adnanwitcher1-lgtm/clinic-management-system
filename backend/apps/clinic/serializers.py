from decimal import Decimal

from django.db import transaction
from django.db.models import Count, Q
from django.utils import timezone
from rest_framework import serializers

from apps.accounts.models import User
from apps.core.models import ClinicSettings
from apps.pharmacy.models import Medicine

from .models import (
    Appointment, InjectionComponent, InjectionOrder, InjectionTemplate, Patient, Prescription, PrescriptionItem,
    Symptom, Visit, VisitSymptom, Vitals,
)


class PatientSerializer(serializers.ModelSerializer):
    visits_count = serializers.IntegerField(read_only=True, default=0)
    last_visit = serializers.DateField(read_only=True, default=None)

    class Meta:
        model = Patient
        fields = "__all__"
        read_only_fields = ["patient_no", "created_by", "created_at"]


class PatientBriefSerializer(serializers.ModelSerializer):
    class Meta:
        model = Patient
        fields = ["id", "patient_no", "name", "age", "gender", "phone", "blood_group", "allergies", "medical_history"]


class VitalsSerializer(serializers.ModelSerializer):
    bp = serializers.CharField(read_only=True)

    class Meta:
        model = Vitals
        exclude = ["visit", "id"]


class SymptomSerializer(serializers.ModelSerializer):
    class Meta:
        model = Symptom
        fields = "__all__"


class VisitSymptomSerializer(serializers.ModelSerializer):
    symptom_name = serializers.CharField(source="symptom.name", read_only=True)

    class Meta:
        model = VisitSymptom
        fields = ["symptom", "symptom_name", "value"]


class PrescriptionItemSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)
    charge = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    stock_qty = serializers.SerializerMethodField()

    class Meta:
        model = PrescriptionItem
        exclude = ["prescription"]

    def get_stock_qty(self, obj):
        return obj.medicine.stock_qty if obj.medicine_id else None


class InjectionComponentSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)
    charge = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    stock_qty = serializers.SerializerMethodField()

    class Meta:
        model = InjectionComponent
        exclude = ["injection"]

    def get_stock_qty(self, obj):
        return obj.medicine.stock_qty if obj.medicine_id else None


class InjectionOrderSerializer(serializers.ModelSerializer):
    components = InjectionComponentSerializer(many=True, read_only=True)
    title = serializers.CharField(read_only=True)
    is_mix = serializers.BooleanField(read_only=True)
    charge = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)

    class Meta:
        model = InjectionOrder
        exclude = ["prescription"]


class InjectionTemplateSerializer(serializers.ModelSerializer):
    class Meta:
        model = InjectionTemplate
        fields = ["id", "name", "route", "diluent", "components", "created_at"]

    def validate_components(self, value):
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError("A mix needs at least one medicine.")
        clean = []
        for c in value:
            name = str(c.get("name", "")).strip()
            if not name:
                raise serializers.ValidationError("Every component needs a name.")
            clean.append({
                "source": "store" if c.get("source") == "store" and c.get("medicine") else "outside",
                "medicine": c.get("medicine") if c.get("source") == "store" else None,
                "name": name[:200], "strength": str(c.get("strength", ""))[:60], "form": str(c.get("form", ""))[:60],
                "amount": str(c.get("amount", ""))[:60], "quantity": max(1, int(c.get("quantity") or 1)),
            })
        return clean


class PrescriptionSerializer(serializers.ModelSerializer):
    items = PrescriptionItemSerializer(many=True, read_only=True)
    injections = InjectionOrderSerializer(many=True, read_only=True)
    doctor_name = serializers.SerializerMethodField()
    dispensed = serializers.SerializerMethodField()
    visit_id = serializers.IntegerField(source="visit.id", read_only=True)

    class Meta:
        model = Prescription
        fields = ["id", "visit_id", "advice", "items", "injections", "doctor_name", "created_at", "finalized_at", "dispensed_at", "dispensed"]

    def get_doctor_name(self, obj):
        return obj.visit.doctor.display_name

    def get_dispensed(self, obj):
        return bool(obj.dispensed_at)


# ----- writing prescriptions ------------------------------------------------
class ItemWriteSerializer(serializers.Serializer):
    medicine = serializers.PrimaryKeyRelatedField(queryset=Medicine.objects.all(), required=False, allow_null=True)
    source = serializers.ChoiceField(choices=["store", "outside"])
    name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    strength = serializers.CharField(max_length=60, required=False, allow_blank=True)
    form = serializers.CharField(max_length=60, required=False, allow_blank=True)
    dose = serializers.CharField(max_length=60, required=False, allow_blank=True)
    frequency = serializers.CharField(max_length=60, required=False, allow_blank=True)
    duration = serializers.CharField(max_length=60, required=False, allow_blank=True)
    instructions = serializers.CharField(max_length=200, required=False, allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, required=False, default=1)

    def validate(self, a):
        if a["source"] == "store" and not a.get("medicine"):
            raise serializers.ValidationError("A store medicine must be chosen from the store list.")
        if a["source"] == "outside" and not (a.get("name") or "").strip():
            raise serializers.ValidationError("Medicine name is required.")
        return a


class InjectionComponentWriteSerializer(serializers.Serializer):
    medicine = serializers.PrimaryKeyRelatedField(queryset=Medicine.objects.all(), required=False, allow_null=True)
    source = serializers.ChoiceField(choices=["store", "outside"])
    name = serializers.CharField(max_length=200, required=False, allow_blank=True)
    strength = serializers.CharField(max_length=60, required=False, allow_blank=True)
    form = serializers.CharField(max_length=60, required=False, allow_blank=True)
    amount = serializers.CharField(max_length=60, required=False, allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, required=False, default=1)

    def validate(self, a):
        if a["source"] == "store" and not a.get("medicine"):
            raise serializers.ValidationError("A store injection must be chosen from the store list.")
        if a["source"] == "outside" and not (a.get("name") or "").strip():
            raise serializers.ValidationError("Injection name is required.")
        return a


class InjectionWriteSerializer(serializers.Serializer):
    label = serializers.CharField(max_length=120, required=False, allow_blank=True)
    route = serializers.ChoiceField(choices=[c[0] for c in InjectionOrder.Route.choices], required=False, default="IM")
    diluent = serializers.CharField(max_length=80, required=False, allow_blank=True)
    frequency = serializers.CharField(max_length=60, required=False, allow_blank=True)
    duration = serializers.CharField(max_length=60, required=False, allow_blank=True)
    doses = serializers.IntegerField(min_value=1, max_value=60, required=False, default=1)
    notes = serializers.CharField(max_length=200, required=False, allow_blank=True)
    admin_fee = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, min_value=0, default=0)
    components = InjectionComponentWriteSerializer(many=True, allow_empty=False)


class PrescriptionWriteSerializer(serializers.Serializer):
    advice = serializers.CharField(required=False, allow_blank=True)
    items = ItemWriteSerializer(many=True)
    injections = InjectionWriteSerializer(many=True, required=False)


class VisitUpdateSerializer(serializers.Serializer):
    class SymptomEntry(serializers.Serializer):
        symptom = serializers.PrimaryKeyRelatedField(queryset=Symptom.objects.all())
        value = serializers.CharField(max_length=60, required=False, allow_blank=True)

    diagnosis = serializers.CharField(required=False, allow_blank=True)
    notes = serializers.CharField(required=False, allow_blank=True)
    follow_up_date = serializers.DateField(required=False, allow_null=True)
    symptom_entries = SymptomEntry(many=True, required=False)
    vitals = VitalsSerializer(required=False)


# ----- visits ---------------------------------------------------------------
class VisitListSerializer(serializers.ModelSerializer):
    patient = PatientBriefSerializer(read_only=True)
    doctor_name = serializers.SerializerMethodField()
    vitals = VitalsSerializer(read_only=True)
    status_label = serializers.CharField(source="get_status_display", read_only=True)
    visit_type_label = serializers.CharField(source="get_visit_type_display", read_only=True)
    medicine_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    total_due = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    paid_amount = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    balance = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    payment_status = serializers.CharField(read_only=True)
    store_items = serializers.SerializerMethodField()
    outside_items = serializers.SerializerMethodField()
    injection_count = serializers.SerializerMethodField()
    injection_total = serializers.DecimalField(max_digits=12, decimal_places=2, read_only=True)
    has_prescription = serializers.SerializerMethodField()
    prescription_id = serializers.SerializerMethodField()
    dispensed = serializers.SerializerMethodField()

    class Meta:
        model = Visit
        fields = [
            "id", "patient", "doctor", "doctor_name", "token_no", "visit_date", "status", "status_label",
            "is_follow_up", "visit_type", "visit_type_label", "complaints", "notes", "diagnosis", "follow_up_date", "consultation_fee",
            "medicine_total", "total_due", "paid_amount", "balance", "payment_status", "vitals",
            "store_items", "outside_items", "injection_count", "injection_total", "has_prescription", "prescription_id", "dispensed",
            "created_at", "started_at", "finished_at",
        ]

    def get_doctor_name(self, obj):
        return obj.doctor.display_name

    def _items(self, obj, source):
        rx = obj.rx
        return sum(1 for i in rx.items.all() if i.source == source) if rx else 0

    def get_store_items(self, obj):
        return self._items(obj, "store")

    def get_outside_items(self, obj):
        return self._items(obj, "outside")

    def get_injection_count(self, obj):
        rx = obj.rx
        return len(rx.injections.all()) if rx else 0

    def get_has_prescription(self, obj):
        return obj.rx is not None

    def get_prescription_id(self, obj):
        return obj.rx.id if obj.rx else None

    def get_dispensed(self, obj):
        return bool(obj.rx and obj.rx.dispensed_at)


class VisitDetailSerializer(VisitListSerializer):
    patient = PatientSerializer(read_only=True)
    symptom_entries = VisitSymptomSerializer(many=True, read_only=True)
    prescription = serializers.SerializerMethodField()
    payments = serializers.SerializerMethodField()

    class Meta(VisitListSerializer.Meta):
        fields = VisitListSerializer.Meta.fields + ["symptom_entries", "prescription", "payments"]

    def get_prescription(self, obj):
        rx = obj.rx
        return PrescriptionSerializer(rx).data if rx else None

    def get_payments(self, obj):
        return [
            {"id": p.id, "amount": p.amount, "method": p.method, "note": p.note, "created_at": p.created_at,
             "received_by": p.received_by.username if p.received_by else ""}
            for p in obj.payments.all()
        ]


def pick_doctor():
    today = timezone.localdate()
    return (
        User.objects.filter(role="doctor", is_active=True, is_available=True)
        .annotate(load=Count("visits", filter=Q(visits__visit_date=today, visits__status__in=["waiting", "with_doctor"])))
        .order_by("load", "id")
        .first()
    )


class VisitRegisterSerializer(serializers.Serializer):
    """Receptionist entry: new or returning patient + vitals -> Visit with auto token & doctor."""

    patient_id = serializers.IntegerField(required=False)
    patient = PatientSerializer(required=False)
    vitals = VitalsSerializer(required=False)
    doctor = serializers.PrimaryKeyRelatedField(queryset=User.objects.filter(role="doctor", is_active=True), required=False, allow_null=True)
    consultation_fee = serializers.DecimalField(max_digits=10, decimal_places=2, required=False, min_value=0)
    is_follow_up = serializers.BooleanField(required=False, default=False)
    visit_type = serializers.ChoiceField(choices=Visit.VisitType.choices, required=False, default=Visit.VisitType.CHECKUP)
    notes = serializers.CharField(required=False, allow_blank=True)

    def validate(self, a):
        if not a.get("patient_id") and not a.get("patient"):
            raise serializers.ValidationError("Provide patient_id (returning) or patient details (new).")
        if a.get("patient_id") and not Patient.objects.filter(pk=a["patient_id"]).exists():
            raise serializers.ValidationError({"patient_id": "Patient not found."})
        return a

    @transaction.atomic
    def create(self, vd):
        request = self.context["request"]
        pdata = vd.get("patient")
        if vd.get("patient_id"):
            patient = Patient.objects.get(pk=vd["patient_id"])
            if pdata:  # refresh details that may have changed (phone, allergies ...)
                for k, v in pdata.items():
                    setattr(patient, k, v)
                patient.save()
        else:
            patient = Patient.objects.create(created_by=request.user, **pdata)

        doctor = vd.get("doctor") or pick_doctor()
        if not doctor:
            raise serializers.ValidationError({"doctor": "No doctor is available. Add or enable a doctor first."})
        fee = vd.get("consultation_fee")
        visit_type = vd.get("visit_type", Visit.VisitType.CHECKUP)
        if fee is None:
            default_fee = doctor.consultation_fee if doctor.consultation_fee is not None else ClinicSettings.load().default_consultation_fee
            # counselling-only sessions use the doctor's counselling fee (falls back to the normal fee when not set)
            fee = doctor.counselling_fee if visit_type == Visit.VisitType.COUNSELLING and doctor.counselling_fee is not None else default_fee
        # a returning patient coming for a follow-up can be charged nothing by sending consultation_fee=0
        visit = Visit.objects.create(
            patient=patient, doctor=doctor, consultation_fee=fee, created_by=request.user,
            is_follow_up=vd.get("is_follow_up", False), visit_type=visit_type, notes=vd.get("notes", ""),
        )
        vitals = vd.get("vitals") or {}
        Vitals.objects.create(visit=visit, **vitals)
        return visit


class AppointmentSerializer(serializers.ModelSerializer):
    patient_name = serializers.CharField(source="patient.name", read_only=True)
    patient_no = serializers.CharField(source="patient.patient_no", read_only=True)
    patient_phone = serializers.CharField(source="patient.phone", read_only=True)
    doctor_name = serializers.SerializerMethodField()

    class Meta:
        model = Appointment
        fields = "__all__"
        read_only_fields = ["created_by", "created_at", "visit"]

    def get_doctor_name(self, obj):
        return obj.doctor.display_name
