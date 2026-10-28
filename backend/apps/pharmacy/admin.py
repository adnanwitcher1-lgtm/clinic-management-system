from django.contrib import admin, messages
from django.shortcuts import redirect, render
from django.urls import path
from django import forms

from . import importer
from .models import Medicine, StockMovement, UniversalMedicine


class UploadForm(forms.Form):
    file = forms.FileField(help_text="CSV, Excel (.xlsx) or PDF with columns: name, strength, form, stock qty, price")


@admin.register(Medicine)
class MedicineAdmin(admin.ModelAdmin):
    list_display = ("name", "strength", "form", "stock_qty", "price", "expiry_date", "reorder_level", "is_active")
    list_filter = ("form", "is_active")
    search_fields = ("name", "generic_name")
    change_list_template = "admin/pharmacy/import_changelist.html"

    def get_urls(self):
        return [path("import/", self.admin_site.admin_view(self.import_view), name="pharmacy_medicine_import")] + super().get_urls()

    def import_view(self, request):
        form = UploadForm(request.POST or None, request.FILES or None)
        if request.method == "POST" and form.is_valid():
            rows = importer.parse_upload(form.cleaned_data["file"])
            res = importer.import_store(rows, user=request.user, mode="add")
            messages.success(request, f"Imported: {res['created']} new, {res['updated']} updated, {res['skipped']} skipped.")
            return redirect("..")
        return render(request, "admin/pharmacy/import_form.html", {"form": form, "title": "Import store medicines", **self.admin_site.each_context(request)})


@admin.register(UniversalMedicine)
class UniversalMedicineAdmin(admin.ModelAdmin):
    list_display = ("name", "generic_name", "strength", "form")
    search_fields = ("name", "generic_name")
    list_filter = ("form",)
    change_list_template = "admin/pharmacy/import_changelist.html"

    def get_urls(self):
        return [path("import/", self.admin_site.admin_view(self.import_view), name="pharmacy_universalmedicine_import")] + super().get_urls()

    def import_view(self, request):
        form = UploadForm(request.POST or None, request.FILES or None)
        if request.method == "POST" and form.is_valid():
            rows = importer.parse_upload(form.cleaned_data["file"])
            res = importer.import_universal(rows)
            messages.success(request, f"Imported {res['created']} new medicines.")
            return redirect("..")
        return render(request, "admin/pharmacy/import_form.html", {"form": form, "title": "Import universal medicines", **self.admin_site.each_context(request)})


@admin.register(StockMovement)
class StockMovementAdmin(admin.ModelAdmin):
    list_display = ("created_at", "medicine", "qty", "balance_after", "reason", "created_by")
    list_filter = ("reason",)
    search_fields = ("medicine__name",)
    readonly_fields = [f.name for f in StockMovement._meta.fields]
