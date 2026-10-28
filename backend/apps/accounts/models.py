from django.contrib.auth.models import AbstractUser
from django.db import models


class User(AbstractUser):
    class Role(models.TextChoices):
        ADMIN = "admin", "Admin"
        DOCTOR = "doctor", "Doctor"
        RECEPTIONIST = "receptionist", "Receptionist"

    role = models.CharField(max_length=20, choices=Role.choices, default=Role.RECEPTIONIST)
    phone = models.CharField(max_length=30, blank=True)
    specialization = models.CharField(max_length=120, blank=True)
    qualification = models.CharField(max_length=200, blank=True)
    consultation_fee = models.DecimalField(max_digits=10, decimal_places=2, null=True, blank=True)
    language = models.CharField(max_length=5, default="en", choices=[("en", "English"), ("ur", "Urdu")])
    is_available = models.BooleanField(default=True, help_text="Doctor is on duty (receives auto-assigned patients)")

    class Meta:
        ordering = ["first_name", "username"]

    def save(self, *args, **kwargs):
        if self.is_superuser:
            self.role = self.Role.ADMIN
        super().save(*args, **kwargs)

    @property
    def display_name(self):
        name = self.get_full_name().strip()
        return name or self.username

    def __str__(self):
        return f"{self.display_name} ({self.role})"
