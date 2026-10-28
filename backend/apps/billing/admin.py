from django.contrib import admin

from .models import DailyClosing, Payment


@admin.register(Payment)
class PaymentAdmin(admin.ModelAdmin):
    list_display = ("created_at", "visit", "amount", "method", "received_by")
    list_filter = ("method",)
    date_hierarchy = "created_at"


@admin.register(DailyClosing)
class DailyClosingAdmin(admin.ModelAdmin):
    list_display = ("date", "total_revenue", "cash_total", "card_total", "online_total", "patients_count", "closed_by")
