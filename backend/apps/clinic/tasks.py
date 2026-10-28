import logging
from datetime import timedelta

from celery import shared_task
from django.core.files.base import ContentFile
from django.core.management import call_command
from django.utils import timezone

from apps.core.models import ClinicSettings

from . import whatsapp
from .models import Prescription, Visit
from .pdf import build_prescription_pdf

log = logging.getLogger(__name__)


@shared_task
def generate_prescription_pdf(prescription_id):
    rx = Prescription.objects.select_related("visit__patient", "visit__doctor").prefetch_related("items", "visit__payments").get(pk=prescription_id)
    data = build_prescription_pdf(rx, "a4")
    rx.pdf_file.save(f"rx-{rx.visit.patient.patient_no}-{rx.visit.visit_date}-T{rx.visit.token_no}.pdf", ContentFile(data), save=True)
    return rx.pdf_file.name


@shared_task
def send_prescription_whatsapp(prescription_id, layout="patient"):
    rx = Prescription.objects.select_related("visit__patient", "visit__doctor").prefetch_related("items", "visit__payments").get(pk=prescription_id)
    cfg = ClinicSettings.load()
    if not whatsapp.is_configured(cfg):
        return "not-configured"
    v = rx.visit
    pdf = build_prescription_pdf(rx, layout)
    try:
        whatsapp.send_document(v.patient.phone, pdf, f"Prescription-{v.patient.patient_no}-{v.visit_date}.pdf", caption=f"{cfg.clinic_name} – prescription for {v.patient.name}", cfg=cfg)
        return "sent"
    except Exception as exc:  # network / API error – the UI keeps the wa.me fallback
        log.exception("WhatsApp send failed: %s", exc)
        return f"failed: {exc}"


@shared_task
def send_followup_reminders():
    """Daily: remind patients whose follow-up is tomorrow."""
    cfg = ClinicSettings.load()
    tomorrow = timezone.localdate() + timedelta(days=1)
    sent = 0
    for v in Visit.objects.filter(follow_up_date=tomorrow, follow_up_reminded=False).select_related("patient", "doctor"):
        text = f"Hello {v.patient.name}, this is a reminder from {cfg.clinic_name}: your follow-up visit with Dr. {v.doctor.display_name} is due tomorrow ({tomorrow:%d %b %Y}). Please bring your previous prescription."
        if whatsapp.is_configured(cfg):
            try:
                whatsapp.send_text(v.patient.phone, text, cfg)
                v.follow_up_reminded = True
                v.save(update_fields=["follow_up_reminded"])
                sent += 1
            except Exception as exc:
                log.warning("Reminder failed for visit %s: %s", v.pk, exc)
    return sent


@shared_task
def send_single_reminder(visit_id):
    cfg = ClinicSettings.load()
    v = Visit.objects.select_related("patient", "doctor").get(pk=visit_id)
    if not (v.follow_up_date and whatsapp.is_configured(cfg)):
        return "skipped"
    text = f"Hello {v.patient.name}, reminder from {cfg.clinic_name}: your follow-up with Dr. {v.doctor.display_name} is on {v.follow_up_date:%d %b %Y}."
    whatsapp.send_text(v.patient.phone, text, cfg)
    v.follow_up_reminded = True
    v.save(update_fields=["follow_up_reminded"])
    return "sent"


@shared_task
def nightly_backup():
    call_command("backup")
    return "ok"
