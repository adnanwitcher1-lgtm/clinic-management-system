from django.contrib import admin

from .models import ClinicSettings


@admin.register(ClinicSettings)
class ClinicSettingsAdmin(admin.ModelAdmin):
    fieldsets = (
        ("Clinic", {"fields": ("clinic_name", "tagline", "address", "phone", "email", "currency", "default_consultation_fee")}),
        ("Inventory", {"fields": ("low_stock_threshold", "expiry_alert_days")}),
        ("WhatsApp Cloud API", {"fields": ("country_code", "whatsapp_enabled", "whatsapp_phone_number_id", "whatsapp_token")}),
    )

    def has_add_permission(self, request):
        return not ClinicSettings.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False
