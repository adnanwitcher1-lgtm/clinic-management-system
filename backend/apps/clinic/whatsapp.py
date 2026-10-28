"""WhatsApp Cloud API helper with a wa.me link fallback."""
from urllib.parse import quote

import requests
from django.conf import settings

from apps.core.models import ClinicSettings
from apps.core.utils import digits


def normalize_msisdn(phone, country_code="92"):
    d = digits(phone)
    if not d:
        return ""
    if d.startswith("00"):
        d = d[2:]
    if d.startswith("0"):
        d = country_code + d[1:]
    elif not d.startswith(country_code) and len(d) <= 10:
        d = country_code + d
    return d


def wa_link(phone, text, cfg=None):
    cfg = cfg or ClinicSettings.load()
    return f"https://wa.me/{normalize_msisdn(phone, cfg.country_code)}?text={quote(text)}"


def credentials(cfg=None):
    cfg = cfg or ClinicSettings.load()
    pid = cfg.whatsapp_phone_number_id or settings.WHATSAPP_PHONE_NUMBER_ID
    token = cfg.whatsapp_token or settings.WHATSAPP_TOKEN
    enabled = cfg.whatsapp_enabled or bool(settings.WHATSAPP_TOKEN and settings.WHATSAPP_PHONE_NUMBER_ID)
    return (pid, token) if (enabled and pid and token) else (None, None)


def is_configured(cfg=None):
    return credentials(cfg)[0] is not None


def _base(pid):
    return f"https://graph.facebook.com/{settings.WHATSAPP_API_VERSION}/{pid}"


def send_text(phone, body, cfg=None):
    cfg = cfg or ClinicSettings.load()
    pid, token = credentials(cfg)
    if not pid:
        raise RuntimeError("WhatsApp Cloud API is not configured")
    r = requests.post(
        f"{_base(pid)}/messages",
        headers={"Authorization": f"Bearer {token}"},
        json={"messaging_product": "whatsapp", "to": normalize_msisdn(phone, cfg.country_code), "type": "text", "text": {"body": body}},
        timeout=20,
    )
    r.raise_for_status()
    return r.json()


def send_document(phone, pdf_bytes, filename, caption="", cfg=None):
    cfg = cfg or ClinicSettings.load()
    pid, token = credentials(cfg)
    if not pid:
        raise RuntimeError("WhatsApp Cloud API is not configured")
    headers = {"Authorization": f"Bearer {token}"}
    up = requests.post(
        f"{_base(pid)}/media",
        headers=headers,
        data={"messaging_product": "whatsapp", "type": "application/pdf"},
        files={"file": (filename, pdf_bytes, "application/pdf")},
        timeout=60,
    )
    up.raise_for_status()
    media_id = up.json()["id"]
    r = requests.post(
        f"{_base(pid)}/messages",
        headers=headers,
        json={
            "messaging_product": "whatsapp",
            "to": normalize_msisdn(phone, cfg.country_code),
            "type": "document",
            "document": {"id": media_id, "filename": filename, "caption": caption},
        },
        timeout=30,
    )
    r.raise_for_status()
    return r.json()


def prescription_text(rx, cfg=None):
    """Short text version of a prescription (used for wa.me fallback & captions)."""
    cfg = cfg or ClinicSettings.load()
    v = rx.visit
    lines = [f"*{cfg.clinic_name}*", f"Patient: {v.patient.name} ({v.patient.patient_no})", f"Date: {v.visit_date:%d %b %Y}  |  Token #{v.token_no}", f"Doctor: {v.doctor.display_name}"]
    if v.diagnosis:
        lines.append(f"Diagnosis: {v.diagnosis}")
    store = [i for i in rx.items.all() if i.source == "store"]
    outside = [i for i in rx.items.all() if i.source == "outside"]

    def fmt(i):
        extra = ", ".join(x for x in [i.dose, i.frequency, i.duration, i.instructions] if x)
        return f"• {i.label}" + (f" – {extra}" if extra else "")

    if store:
        lines += ["", "*Medicines (collect from clinic):*"] + [fmt(i) for i in store]
    if outside:
        lines += ["", "*Medicines (buy from outside pharmacy):*"] + [fmt(i) for i in outside]
    for n, inj in enumerate(rx.injections.all(), 1):
        if n == 1:
            lines += ["", "*Injections:*"]
        comps = " + ".join(c.label for c in inj.components.all())
        lines.append(f"• {comps} ({inj.route})" + (f" – {inj.frequency}" if inj.frequency else ""))
    if rx.advice:
        lines += ["", f"Advice: {rx.advice}"]
    if v.follow_up_date:
        lines += ["", f"Follow-up: {v.follow_up_date:%d %b %Y}"]
    lines += ["", "Get well soon 🌿"]
    return "\n".join(lines)
