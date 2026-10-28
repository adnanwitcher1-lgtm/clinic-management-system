from django.db import models, transaction


class Counter(models.Model):
    """Gap-free, race-safe sequences (patient numbers, daily tokens)."""

    name = models.CharField(max_length=64, unique=True)
    value = models.PositiveIntegerField(default=0)

    @classmethod
    def next(cls, name):
        with transaction.atomic():
            obj, _ = cls.objects.select_for_update().get_or_create(name=name)
            obj.value += 1
            obj.save(update_fields=["value"])
            return obj.value

    def __str__(self):
        return f"{self.name}={self.value}"


class ClinicSettings(models.Model):
    """Singleton row holding clinic-wide configuration."""

    clinic_name = models.CharField(max_length=150, default="Al-Rehman Clinic")
    tagline = models.CharField(max_length=200, default="Health Today, Better Tomorrow", blank=True)
    address = models.CharField(max_length=255, blank=True, default="")
    phone = models.CharField(max_length=40, blank=True, default="")
    email = models.CharField(max_length=120, blank=True, default="")
    currency = models.CharField(max_length=10, default="Rs.")
    default_consultation_fee = models.DecimalField(max_digits=10, decimal_places=2, default=500)
    low_stock_threshold = models.PositiveIntegerField(default=10)
    expiry_alert_days = models.PositiveIntegerField(default=60)
    country_code = models.CharField(max_length=5, default="92", help_text="Used to build WhatsApp numbers, e.g. 92 for Pakistan")
    whatsapp_enabled = models.BooleanField(default=False)
    whatsapp_phone_number_id = models.CharField(max_length=60, blank=True, default="")
    whatsapp_token = models.TextField(blank=True, default="")

    class Meta:
        verbose_name = "Clinic settings"
        verbose_name_plural = "Clinic settings"

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    @classmethod
    def load(cls):
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        return self.clinic_name
