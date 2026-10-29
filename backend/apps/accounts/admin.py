from django.contrib import admin
from django.contrib.auth.admin import UserAdmin

from .models import User


@admin.register(User)
class ClinicUserAdmin(UserAdmin):
    list_display = ("username", "first_name", "last_name", "role", "is_available", "is_active")
    list_filter = ("role", "is_active", "is_available")
    fieldsets = UserAdmin.fieldsets + (
        ("Clinic", {"fields": ("role", "phone", "specialization", "qualification", "consultation_fee", "counselling_fee", "language", "is_available")}),
    )
    add_fieldsets = UserAdmin.add_fieldsets + (
        ("Clinic", {"fields": ("role", "first_name", "last_name", "phone", "specialization", "qualification", "consultation_fee", "counselling_fee")}),
    )
