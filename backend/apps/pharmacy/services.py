from django.db import transaction

from .models import Medicine, StockMovement


class InsufficientStock(Exception):
    def __init__(self, medicine, wanted):
        self.medicine = medicine
        self.wanted = wanted
        super().__init__(f"Insufficient stock for {medicine.label}: need {wanted}, have {medicine.stock_qty}")


@transaction.atomic
def apply_stock(medicine_id, delta, reason, user=None, note="", visit=None, item=None, allow_negative=False):
    """Change stock atomically and write an audit-able movement row."""
    med = Medicine.objects.select_for_update().get(pk=medicine_id)
    if delta < 0 and med.stock_qty + delta < 0 and not allow_negative:
        raise InsufficientStock(med, -delta)
    med.stock_qty += delta
    med.save(update_fields=["stock_qty", "updated_at"])
    StockMovement.objects.create(
        medicine=med, qty=delta, balance_after=med.stock_qty, reason=reason, note=note,
        visit=visit, prescription_item=item, unit_price=med.price, created_by=user,
    )
    return med
