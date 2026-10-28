from django.conf import settings
from django.db import models


class Payment(models.Model):
    class Method(models.TextChoices):
        CASH = "cash", "Cash"
        CARD = "card", "Card"
        ONLINE = "online", "Online / Bank transfer"

    visit = models.ForeignKey("clinic.Visit", on_delete=models.PROTECT, related_name="payments")
    amount = models.DecimalField(max_digits=10, decimal_places=2)
    method = models.CharField(max_length=10, choices=Method.choices, default=Method.CASH)
    note = models.CharField(max_length=200, blank=True)
    received_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.amount} ({self.method}) – {self.visit}"


class DailyClosing(models.Model):
    date = models.DateField(unique=True)
    cash_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    card_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    online_total = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    total_revenue = models.DecimalField(max_digits=12, decimal_places=2, default=0)
    counted_cash = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    patients_count = models.PositiveIntegerField(default=0)
    note = models.CharField(max_length=255, blank=True)
    closed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+")
    closed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-date"]

    def __str__(self):
        return f"Closing {self.date}"
