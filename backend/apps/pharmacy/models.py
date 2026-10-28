from django.conf import settings
from django.db import models


class Medicine(models.Model):
    """Medicine held in the clinic's own store (has stock + price)."""

    name = models.CharField(max_length=200, db_index=True)
    generic_name = models.CharField(max_length=200, blank=True)
    strength = models.CharField(max_length=60, blank=True)
    form = models.CharField(max_length=60, blank=True)
    stock_qty = models.IntegerField(default=0)
    price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    batch_no = models.CharField(max_length=60, blank=True)
    expiry_date = models.DateField(null=True, blank=True)
    reorder_level = models.PositiveIntegerField(default=10)
    is_active = models.BooleanField(default=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["name", "strength"]
        unique_together = [("name", "strength", "form")]

    @property
    def label(self):
        return " ".join(x for x in [self.name, self.strength, self.form] if x)

    @property
    def is_low(self):
        return self.stock_qty <= self.reorder_level

    def __str__(self):
        return self.label


class UniversalMedicine(models.Model):
    """Large global medicine dataset used for autocomplete when an item is not in the store."""

    name = models.CharField(max_length=200, db_index=True)
    generic_name = models.CharField(max_length=200, blank=True, db_index=True)
    strength = models.CharField(max_length=60, blank=True)
    form = models.CharField(max_length=60, blank=True)

    class Meta:
        ordering = ["name", "strength"]
        unique_together = [("name", "strength", "form")]

    @property
    def label(self):
        return " ".join(x for x in [self.name, self.strength, self.form] if x)

    def __str__(self):
        return self.label


class StockMovement(models.Model):
    class Reason(models.TextChoices):
        IMPORT = "import", "Import / purchase"
        ADJUST = "adjust", "Manual adjustment"
        DISPENSE = "dispense", "Dispensed to patient"
        RETURN = "return", "Returned"
        EXPIRED = "expired", "Expired / written off"

    medicine = models.ForeignKey(Medicine, on_delete=models.PROTECT, related_name="movements")
    qty = models.IntegerField(help_text="Positive adds stock, negative removes")
    balance_after = models.IntegerField(default=0)
    reason = models.CharField(max_length=20, choices=Reason.choices, db_index=True)
    note = models.CharField(max_length=255, blank=True)
    visit = models.ForeignKey("clinic.Visit", null=True, blank=True, on_delete=models.SET_NULL, related_name="stock_movements")
    prescription_item = models.ForeignKey("clinic.PrescriptionItem", null=True, blank=True, on_delete=models.SET_NULL, related_name="movements")
    unit_price = models.DecimalField(max_digits=10, decimal_places=2, default=0)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)

    class Meta:
        ordering = ["-created_at", "-id"]

    def __str__(self):
        return f"{self.medicine} {self.qty:+d} ({self.reason})"
