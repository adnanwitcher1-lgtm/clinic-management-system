"""
First-run setup for a clean (production) database. No dummy patients, visits or fake stock.

    python manage.py seed_initial

Creates (only if missing):
  * clinic settings (name / default fee)
  * admin user and the doctor account(s)
  * symptom list
  * Universal medicine list  (backend/sample_data/universal_medicines.csv)
  * Clinic store medicines   (backend/sample_data/store_medicines.csv, stock 0 / price 0 - fill in later)

Passwords come from env vars ADMIN_PASSWORD / DOCTOR_PASSWORD. When not set a random one is
generated and printed ONCE - note it down. Existing users are never touched.
Safe to run again (it never duplicates anything).
"""
import csv
import os
import secrets
from decimal import Decimal
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand
from django.db import transaction

from apps.accounts.models import User
from apps.clinic.models import Symptom
from apps.core.models import ClinicSettings
from apps.pharmacy.models import Medicine, UniversalMedicine

from .medicine_data import SYMPTOMS

SAMPLE_DIR = Path(settings.BASE_DIR) / "sample_data"

# username, role, first, last, extra fields, password env var
USERS = [
    ("admin", "admin", "System", "Admin", {}, "ADMIN_PASSWORD"),
    ("dr.jalal", "doctor", "Jalal-ud-din", "", {"specialization": "General Physician", "qualification": "M.B.B.S., R.P.M.D.C.", "consultation_fee": 300}, "DOCTOR_PASSWORD"),
]


def _read(name):
    with open(SAMPLE_DIR / name, newline="", encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


class Command(BaseCommand):
    help = "Seed a clean database: settings, admin + doctor, symptoms, universal list, store medicines (no dummy data)."

    @transaction.atomic
    def handle(self, *args, **opts):
        cfg = ClinicSettings.load()
        if cfg.default_consultation_fee == Decimal("500"):
            cfg.default_consultation_fee = Decimal("300")
            cfg.save()

        for username, role, fn, ln, extra, env_key in USERS:
            if User.objects.filter(username=username).exists():
                continue
            pw = os.getenv(env_key) or secrets.token_urlsafe(9)
            u = User(username=username, role=role, first_name=fn, last_name=ln, **extra)
            u.set_password(pw)
            if role == "admin":
                u.is_staff = u.is_superuser = True
            u.save()
            shown = "(from env)" if os.getenv(env_key) else pw
            self.stdout.write(self.style.WARNING(f"Created {role} '{username}'  password: {shown}"))

        for name, ur, vt, order in SYMPTOMS:
            Symptom.objects.get_or_create(name=name, defaults={"name_ur": ur, "value_type": vt, "order": order})

        if not UniversalMedicine.objects.exists():
            rows = [
                UniversalMedicine(name=r["name"].strip(), generic_name=(r.get("generic_name") or "").strip(), strength=(r.get("strength") or "").strip(), form=(r.get("form") or "").strip())
                for r in _read("universal_medicines.csv") if (r.get("name") or "").strip()
            ]
            UniversalMedicine.objects.bulk_create(rows, ignore_conflicts=True, batch_size=1000)
        self.stdout.write(f"Universal medicines: {UniversalMedicine.objects.count()}")

        if not Medicine.objects.exists():
            for r in _read("store_medicines.csv"):
                Medicine.objects.get_or_create(
                    name=r["name"].strip(), strength=(r.get("strength") or "").strip(), form=(r.get("form") or "").strip(),
                    defaults={"stock_qty": int(r.get("stock_qty") or 0), "price": Decimal(r.get("price") or 0)},
                )
        self.stdout.write(f"Store medicines: {Medicine.objects.count()} (set stock + price from Reception > Stock)")
        self.stdout.write(self.style.SUCCESS("Done. Add receptionists / the 2nd doctor from Admin > Users."))
