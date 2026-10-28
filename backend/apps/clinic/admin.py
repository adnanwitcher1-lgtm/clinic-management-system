from django.contrib import admin

from .models import Appointment, Patient, Prescription, PrescriptionItem, Symptom, Visit, VisitSymptom, Vitals


@admin.register(Patient)
class PatientAdmin(admin.ModelAdmin):
    list_display = ("patient_no", "name", "age", "gender", "phone", "blood_group", "created_at")
    search_fields = ("patient_no", "name", "phone", "cnic")
    list_filter = ("gender", "blood_group")
    readonly_fields = ("patient_no",)


class VitalsInline(admin.StackedInline):
    model = Vitals
    extra = 0


class SymptomInline(admin.TabularInline):
    model = VisitSymptom
    extra = 0


@admin.register(Visit)
class VisitAdmin(admin.ModelAdmin):
    list_display = ("visit_date", "token_no", "patient", "doctor", "status", "consultation_fee")
    list_filter = ("status", "visit_date", "doctor")
    search_fields = ("patient__name", "patient__patient_no", "patient__phone")
    inlines = [VitalsInline, SymptomInline]
    readonly_fields = ("token_no",)
    date_hierarchy = "visit_date"


class ItemInline(admin.TabularInline):
    model = PrescriptionItem
    extra = 0


@admin.register(Prescription)
class PrescriptionAdmin(admin.ModelAdmin):
    list_display = ("visit", "finalized_at", "dispensed_at")
    inlines = [ItemInline]


@admin.register(Symptom)
class SymptomAdmin(admin.ModelAdmin):
    list_display = ("name", "name_ur", "value_type", "order", "is_active")
    list_editable = ("order", "is_active")


@admin.register(Appointment)
class AppointmentAdmin(admin.ModelAdmin):
    list_display = ("scheduled_at", "patient", "doctor", "status")
    list_filter = ("status", "doctor")
