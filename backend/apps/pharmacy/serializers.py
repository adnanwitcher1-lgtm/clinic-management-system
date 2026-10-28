from datetime import timedelta

from django.utils import timezone
from rest_framework import serializers

from .models import Medicine, StockMovement, UniversalMedicine


class MedicineSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)
    is_low = serializers.BooleanField(read_only=True)
    status = serializers.SerializerMethodField()

    class Meta:
        model = Medicine
        fields = [
            "id", "name", "generic_name", "strength", "form", "stock_qty", "price", "batch_no",
            "expiry_date", "reorder_level", "is_active", "label", "is_low", "status", "updated_at",
        ]

    def get_status(self, obj):
        today = timezone.localdate()
        if obj.expiry_date and obj.expiry_date < today:
            return "expired"
        if obj.stock_qty <= 0:
            return "out"
        if obj.is_low:
            return "low"
        if obj.expiry_date and obj.expiry_date <= today + timedelta(days=60):
            return "expiring"
        return "ok"


class UniversalMedicineSerializer(serializers.ModelSerializer):
    label = serializers.CharField(read_only=True)

    def validate(self, a):
        inst = self.instance
        name = (a.get("name", inst.name if inst else "") or "").strip()
        if not name:
            raise serializers.ValidationError({"name": "Medicine name is required."})
        strength = a.get("strength", inst.strength if inst else "")
        form = a.get("form", inst.form if inst else "")
        dup = UniversalMedicine.objects.filter(name__iexact=name, strength__iexact=strength, form__iexact=form)
        if inst:
            dup = dup.exclude(pk=inst.pk)
        if dup.exists():
            raise serializers.ValidationError("This medicine (same name, strength and form) is already in the universal list.")
        a["name"] = name
        return a

    class Meta:
        model = UniversalMedicine
        fields = ["id", "name", "generic_name", "strength", "form", "label"]
        validators = []  # duplicates are checked (case-insensitively) in validate()


class StockMovementSerializer(serializers.ModelSerializer):
    medicine_label = serializers.CharField(source="medicine.label", read_only=True)
    user = serializers.CharField(source="created_by.username", read_only=True, default="")

    class Meta:
        model = StockMovement
        fields = ["id", "medicine", "medicine_label", "qty", "balance_after", "reason", "note", "visit", "unit_price", "user", "created_at"]
