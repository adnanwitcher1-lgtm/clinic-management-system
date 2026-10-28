import gzip
import os
from pathlib import Path

from django.conf import settings
from django.core.management import call_command
from django.db.models import Q
from django.http import FileResponse, Http404
from rest_framework import serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.utils import log
from apps.clinic.models import Patient
from apps.clinic.serializers import PatientBriefSerializer
from apps.clinic.views import patient_search
from apps.pharmacy.models import Medicine

from .models import ClinicSettings


class SettingsSerializer(serializers.ModelSerializer):
    whatsapp_token = serializers.CharField(write_only=True, required=False, allow_blank=True)
    whatsapp_configured = serializers.SerializerMethodField()

    class Meta:
        model = ClinicSettings
        exclude = ["id"]

    def get_whatsapp_configured(self, obj):
        from apps.clinic.whatsapp import is_configured

        return is_configured(obj)


class SettingsView(APIView):
    def get(self, request):
        data = SettingsSerializer(ClinicSettings.load()).data
        if request.user.role != "admin":
            for k in ("whatsapp_phone_number_id",):
                data.pop(k, None)
        return Response(data)

    def put(self, request):
        if request.user.role != "admin":
            return Response(status=403)
        cfg = ClinicSettings.load()
        data = request.data.copy() if hasattr(request.data, "copy") else dict(request.data)
        if data.get("whatsapp_token") in (None, ""):
            data.pop("whatsapp_token", None)  # keep existing secret when left blank
        ser = SettingsSerializer(cfg, data=data, partial=True)
        ser.is_valid(raise_exception=True)
        ser.save()
        log(request, "update", cfg, changes={k: ("***" if "token" in k else str(v)) for k, v in request.data.items()})
        return Response(SettingsSerializer(cfg).data)


class GlobalSearchView(APIView):
    """Search patients (no / name / phone) and store medicines in one go."""

    def get(self, request):
        q = request.query_params.get("q", "").strip()
        if len(q) < 2:
            return Response({"patients": [], "medicines": []})
        patients = patient_search(Patient.objects.all(), q)
        if request.user.role == "doctor":
            patients = patients.filter(visits__doctor=request.user).distinct()
        meds = Medicine.objects.filter(Q(name__icontains=q) | Q(generic_name__icontains=q), is_active=True)[:5]
        return Response({
            "patients": PatientBriefSerializer(patients.order_by("-id")[:6], many=True).data,
            "medicines": [{"id": m.id, "label": m.label, "stock_qty": m.stock_qty, "price": m.price} for m in meds],
        })


class BackupView(APIView):
    def _dir(self):
        d = Path(settings.BACKUP_DIR)
        d.mkdir(parents=True, exist_ok=True)
        return d

    def get(self, request):
        if request.user.role != "admin":
            return Response(status=403)
        name = request.query_params.get("download")
        if name:
            f = self._dir() / os.path.basename(name)
            if not f.exists():
                raise Http404
            return FileResponse(open(f, "rb"), as_attachment=True, filename=f.name)
        files = sorted(self._dir().glob("clinic-*.json.gz"), reverse=True)[:30]
        return Response([{"name": f.name, "size": f.stat().st_size, "modified": f.stat().st_mtime} for f in files])

    def post(self, request):
        if request.user.role != "admin":
            return Response(status=403)
        call_command("backup")
        log(request, "backup", model="Backup")
        return self.get(request)
