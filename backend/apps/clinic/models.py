import re
from decimal import Decimal

from django.conf import settings
from django.core.exceptions import ObjectDoesNotExist
from django.db import models
from django.utils import timezone

from apps.core.models import Counter


class Patient(models.Model):
    class Gender(models.TextChoices):
        MALE = "male", "Male"
        FEMALE = "female", "Female"
        OTHER = "other", "Other"

    patient_no = models.CharField(max_length=20, unique=True, editable=False)
    name = models.CharField(max_length=150, db_index=True)
    age = models.PositiveSmallIntegerField()
    gender = models.CharField(max_length=10, choices=Gender.choices)
    phone = models.CharField(max_length=20, blank=True, default="", db_index=True)
    address = models.CharField(max_length=255, blank=True)
    cnic = models.CharField(max_length=20, blank=True)
    blood_group = models.CharField(max_length=5, blank=True)
    allergies = models.TextField(blank=True)
    medical_history = models.TextField(blank=True)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-id"]

    def save(self, *args, **kwargs):
        self.phone = re.sub(r"\D", "", self.phone or "")
        if not self.patient_no:
            self.patient_no = f"P-{Counter.next('patient'):06d}"
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.patient_no} · {self.name}"


class Visit(models.Model):
    class Status(models.TextChoices):
        WAITING = "waiting", "Waiting"
        WITH_DOCTOR = "with_doctor", "With doctor"
        MEDICINE_PENDING = "medicine_pending", "Medicine / billing pending"
        COMPLETED = "completed", "Completed"
        CANCELLED = "cancelled", "Cancelled"

    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name="visits")
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="visits", limit_choices_to={"role": "doctor"})
    token_no = models.PositiveIntegerField(editable=False)
    visit_date = models.DateField(default=timezone.localdate, db_index=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.WAITING, db_index=True)
    is_follow_up = models.BooleanField(default=False)

    class VisitType(models.TextChoices):
        CHECKUP = "checkup", "Check-up"
        COUNSELLING = "counselling", "Counselling"

    visit_type = models.CharField(max_length=20, choices=VisitType.choices, default=VisitType.CHECKUP, db_index=True)

    complaints = models.TextField(blank=True, help_text="Auto-built from ticked symptoms")
    notes = models.TextField(blank=True)
    diagnosis = models.TextField(blank=True)
    follow_up_date = models.DateField(null=True, blank=True, db_index=True)
    follow_up_reminded = models.BooleanField(default=False)

    consultation_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0)

    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    started_at = models.DateTimeField(null=True, blank=True)
    finished_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ["visit_date", "token_no"]
        unique_together = [("visit_date", "token_no")]

    def save(self, *args, **kwargs):
        if not self.token_no:
            self.token_no = Counter.next(f"token-{self.visit_date.isoformat()}")
        super().save(*args, **kwargs)

    # ---- helpers used by serializers (work with prefetched data, no extra queries) ----
    @property
    def rx(self):
        try:
            return self.prescription
        except ObjectDoesNotExist:
            return None

    @property
    def medicine_total(self):
        rx = self.rx
        if not rx:
            return Decimal("0")
        total = Decimal("0")
        for i in rx.items.all():
            if i.source == "store":
                qty = i.dispensed_qty if rx.dispensed_at else i.quantity
                total += i.unit_price * qty
        return total

    @property
    def injection_total(self):
        rx = self.rx
        if not rx:
            return Decimal("0")
        return sum((inj.charge for inj in rx.injections.all()), Decimal("0"))

    @property
    def total_due(self):
        return (self.consultation_fee or Decimal("0")) + self.medicine_total + self.injection_total

    @property
    def paid_amount(self):
        return sum((p.amount for p in self.payments.all()), Decimal("0"))

    @property
    def balance(self):
        return self.total_due - self.paid_amount

    @property
    def payment_status(self):
        total, paid = self.total_due, self.paid_amount
        if total <= 0 or paid >= total:
            return "paid"
        return "partial" if paid > 0 else "unpaid"

    def rebuild_complaints(self):
        parts = []
        for e in self.symptom_entries.select_related("symptom").order_by("symptom__order", "symptom_id"):
            s = e.symptom
            if e.value:
                unit = " mg/dL" if s.value_type == "sugar" and re.fullmatch(r"[\d.]+", e.value) else ""
                parts.append(f"{s.name}: {e.value}{unit}")
            else:
                parts.append(s.name)
        self.complaints = ", ".join(parts)

    def __str__(self):
        return f"{self.visit_date} T{self.token_no} {self.patient}"


class Vitals(models.Model):
    class SugarType(models.TextChoices):
        FASTING = "fasting", "Fasting"
        RANDOM = "random", "Random"

    visit = models.OneToOneField(Visit, on_delete=models.CASCADE, related_name="vitals")
    bp_systolic = models.PositiveSmallIntegerField(null=True, blank=True)
    bp_diastolic = models.PositiveSmallIntegerField(null=True, blank=True)
    sugar = models.DecimalField(max_digits=6, decimal_places=1, null=True, blank=True)
    sugar_type = models.CharField(max_length=10, choices=SugarType.choices, blank=True)
    weight = models.DecimalField(max_digits=5, decimal_places=1, null=True, blank=True)
    temperature = models.DecimalField(max_digits=4, decimal_places=1, null=True, blank=True)
    pulse = models.PositiveSmallIntegerField(null=True, blank=True)

    @property
    def bp(self):
        if self.bp_systolic and self.bp_diastolic:
            return f"{self.bp_systolic}/{self.bp_diastolic}"
        return ""

    class Meta:
        verbose_name_plural = "vitals"

    def __str__(self):
        return f"Vitals of {self.visit}"


class Symptom(models.Model):
    class ValueType(models.TextChoices):
        NONE = "", "Tick only"
        BP = "bp", "Blood pressure value"
        SUGAR = "sugar", "Sugar value"
        TEXT = "text", "Free text"

    name = models.CharField(max_length=80, unique=True)
    name_ur = models.CharField(max_length=80, blank=True)
    value_type = models.CharField(max_length=10, choices=ValueType.choices, blank=True, default="")
    order = models.PositiveSmallIntegerField(default=100)
    is_active = models.BooleanField(default=True)

    class Meta:
        ordering = ["order", "name"]

    def __str__(self):
        return self.name


class VisitSymptom(models.Model):
    visit = models.ForeignKey(Visit, on_delete=models.CASCADE, related_name="symptom_entries")
    symptom = models.ForeignKey(Symptom, on_delete=models.PROTECT)
    value = models.CharField(max_length=60, blank=True)

    class Meta:
        unique_together = [("visit", "symptom")]


class Prescription(models.Model):
    visit = models.OneToOneField(Visit, on_delete=models.CASCADE, related_name="prescription")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    advice = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    finalized_at = models.DateTimeField(null=True, blank=True)
    dispensed_at = models.DateTimeField(null=True, blank=True)
    dispensed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    pdf_file = models.FileField(upload_to="prescriptions/%Y/%m/", blank=True)

    def __str__(self):
        return f"Rx {self.visit}"


class PrescriptionItem(models.Model):
    class Source(models.TextChoices):
        STORE = "store", "Available in store"
        OUTSIDE = "outside", "Write from outside"

    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="items")
    medicine = models.ForeignKey("pharmacy.Medicine", null=True, blank=True, on_delete=models.SET_NULL, related_name="prescription_items")
    source = models.CharField(max_length=10, choices=Source.choices, default=Source.STORE)
    name = models.CharField(max_length=200)
    strength = models.CharField(max_length=60, blank=True)
    form = models.CharField(max_length=60, blank=True)
    dose = models.CharField(max_length=60, blank=True)
    frequency = models.CharField(max_length=60, blank=True)
    duration = models.CharField(max_length=60, blank=True)
    instructions = models.CharField(max_length=200, blank=True)
    quantity = models.PositiveIntegerField(default=1)
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    dispensed_qty = models.PositiveIntegerField(default=0)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    @property
    def label(self):
        return " ".join(x for x in [self.name, self.strength, self.form] if x)

    @property
    def charge(self):
        if self.source != "store":
            return Decimal("0")
        qty = self.dispensed_qty if self.prescription.dispensed_at else self.quantity
        return self.unit_price * qty

    def __str__(self):
        return self.label


class InjectionOrder(models.Model):
    """One injection 'dose' ordered by the doctor. It may be a single drug or a MIX of several drugs
    drawn into the same syringe / drip (see InjectionComponent)."""

    class Route(models.TextChoices):
        IM = "IM", "IM (muscle)"
        IV = "IV", "IV (vein)"
        SC = "SC", "SC (under skin)"
        DRIP = "IV drip", "IV drip"

    prescription = models.ForeignKey(Prescription, on_delete=models.CASCADE, related_name="injections")
    label = models.CharField(max_length=120, blank=True, help_text="Optional name, e.g. 'Pain mix'")
    route = models.CharField(max_length=10, choices=Route.choices, default=Route.IM)
    diluent = models.CharField(max_length=80, blank=True, help_text="e.g. Normal saline 5 ml")
    frequency = models.CharField(max_length=60, blank=True, default="Stat (once)")
    duration = models.CharField(max_length=60, blank=True)
    doses = models.PositiveSmallIntegerField(default=1, help_text="How many times this mix is given")
    notes = models.CharField(max_length=200, blank=True)
    admin_fee = models.DecimalField(max_digits=10, decimal_places=2, default=0, help_text="Injection / drip charge for this order")
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    @property
    def is_mix(self):
        return len(self.components.all()) > 1

    @property
    def title(self):
        comps = list(self.components.all())
        return self.label or " + ".join(c.name for c in comps) or "Injection"

    @property
    def charge(self):
        total = self.admin_fee or Decimal("0")
        for c in self.components.all():
            total += c.charge
        return total

    def __str__(self):
        return f"{self.title} ({self.route})"


class InjectionComponent(models.Model):
    """A single drug inside an InjectionOrder. Store components are deducted from stock at dispense."""

    injection = models.ForeignKey(InjectionOrder, on_delete=models.CASCADE, related_name="components")
    medicine = models.ForeignKey("pharmacy.Medicine", null=True, blank=True, on_delete=models.SET_NULL, related_name="injection_components")
    source = models.CharField(max_length=10, choices=PrescriptionItem.Source.choices, default="store")
    name = models.CharField(max_length=200)
    strength = models.CharField(max_length=60, blank=True)
    form = models.CharField(max_length=60, blank=True)
    amount = models.CharField(max_length=60, blank=True, help_text="Per dose, e.g. 1 amp / 2 ml")
    quantity = models.PositiveIntegerField(default=1, help_text="Total units used for the whole order (vials / amps)")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    dispensed_qty = models.PositiveIntegerField(default=0)
    order = models.PositiveSmallIntegerField(default=0)

    class Meta:
        ordering = ["order", "id"]

    @property
    def label(self):
        return " ".join(x for x in [self.name, self.strength] if x)

    @property
    def charge(self):
        if self.source != "store":
            return Decimal("0")
        rx = self.injection.prescription
        qty = self.dispensed_qty if rx.dispensed_at else self.quantity
        return self.unit_price * qty

    def __str__(self):
        return self.label


class InjectionTemplate(models.Model):
    """A doctor's saved mix (e.g. 'Pain mix') that can be re-applied with one click."""

    name = models.CharField(max_length=120)
    route = models.CharField(max_length=10, choices=InjectionOrder.Route.choices, default="IM")
    diluent = models.CharField(max_length=80, blank=True)
    components = models.JSONField(default=list)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.CASCADE, related_name="injection_templates")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["name"]

    def __str__(self):
        return self.name


class Appointment(models.Model):
    class Status(models.TextChoices):
        SCHEDULED = "scheduled", "Scheduled"
        ARRIVED = "arrived", "Arrived"
        CANCELLED = "cancelled", "Cancelled"
        DONE = "done", "Done"

    patient = models.ForeignKey(Patient, on_delete=models.CASCADE, related_name="appointments")
    doctor = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name="appointments", limit_choices_to={"role": "doctor"})
    scheduled_at = models.DateTimeField(db_index=True)
    reason = models.CharField(max_length=200, blank=True)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.SCHEDULED)
    visit = models.ForeignKey(Visit, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["scheduled_at"]

    def __str__(self):
        return f"{self.patient} @ {self.scheduled_at:%Y-%m-%d %H:%M}"
