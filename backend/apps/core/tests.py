"""End-to-end flow: receptionist registers -> doctor prescribes -> receptionist dispenses & bills -> admin reports."""
import io

from django.core.files.uploadedfile import SimpleUploadedFile
from rest_framework.test import APITestCase

from apps.accounts.models import User
from apps.clinic.models import Symptom
from apps.pharmacy.models import Medicine, UniversalMedicine


class ClinicFlowTests(APITestCase):
    @classmethod
    def setUpTestData(cls):
        cls.admin = User.objects.create_superuser("admin", password="pw123456")
        cls.rec = User.objects.create_user("rec", password="pw123456", role="receptionist")
        cls.doc = User.objects.create_user("doc", password="pw123456", role="doctor", first_name="Ahmed", consultation_fee=500)
        cls.doc2 = User.objects.create_user("doc2", password="pw123456", role="doctor", first_name="Sara", consultation_fee=400)
        cls.med = Medicine.objects.create(name="Panadol", strength="500mg", form="Tablet", stock_qty=50, price=3)
        cls.sugar = Symptom.objects.create(name="Sugar", value_type="sugar")
        cls.fever = Symptom.objects.create(name="Fever")
        UniversalMedicine.objects.create(name="Brufen", strength="400mg", form="Tablet")

    def login(self, username):
        r = self.client.post("/api/auth/login/", {"username": username, "password": "pw123456"})
        self.assertEqual(r.status_code, 200, r.content)
        self.client.credentials(HTTP_AUTHORIZATION=f"Bearer {r.data['access']}")
        return r.data

    def test_full_flow(self):
        self.login("rec")
        new = {
            "patient": {"name": "Ali Raza", "age": 35, "gender": "male", "phone": "0300-1234567", "allergies": "Penicillin"},
            "vitals": {"bp_systolic": 140, "bp_diastolic": 90, "sugar": "180", "sugar_type": "random", "weight": "72", "temperature": "99.1", "pulse": 80},
        }
        r = self.client.post("/api/visits/", new, format="json")
        self.assertEqual(r.status_code, 201, r.content)
        v1 = r.data
        self.assertEqual(v1["token_no"], 1)
        self.assertTrue(v1["patient"]["patient_no"].startswith("P-"))
        self.assertEqual(v1["patient"]["phone"], "03001234567")

        # second patient goes to the other (less loaded) doctor, token increments
        r = self.client.post("/api/visits/", {"patient": {"name": "Sana", "age": 20, "gender": "female", "phone": "03111111111"}}, format="json")
        self.assertEqual(r.data["token_no"], 2)
        self.assertNotEqual(r.data["doctor"], v1["doctor"])

        # returning patient lookup by phone and by patient no
        r = self.client.get("/api/patients/search/?q=03001234567")
        self.assertEqual(len(r.data), 1)
        r = self.client.get(f"/api/patients/search/?q={v1['patient']['patient_no']}")
        self.assertEqual(r.data[0]["name"], "Ali Raza")
        r = self.client.post("/api/visits/", {"patient_id": v1["patient"]["id"], "doctor": self.doc.id}, format="json")
        self.assertEqual(r.status_code, 201)
        self.assertEqual(r.data["patient"]["patient_no"], v1["patient"]["patient_no"])
        visit_id = v1["id"]

        # receptionist can't prescribe
        self.assertEqual(self.client.put(f"/api/visits/{visit_id}/prescription/", {"items": []}, format="json").status_code, 403)

        # doctor flow
        self.login("doc")
        q = self.client.get("/api/visits/queue/").data
        self.assertTrue(all(x["doctor"] == self.doc.id for x in q))
        self.assertEqual(self.client.post(f"/api/visits/{visit_id}/start/").data["status"], "with_doctor")
        r = self.client.patch(f"/api/visits/{visit_id}/", {
            "symptom_entries": [{"symptom": self.fever.id}, {"symptom": self.sugar.id, "value": "240"}],
            "diagnosis": "Viral fever", "notes": "Rest", "follow_up_date": "2030-01-01"}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertIn("Sugar: 240 mg/dL", r.data["complaints"])
        r = self.client.get("/api/medicines/search/?q=pana")
        self.assertEqual(r.data[0]["name"], "Panadol")
        self.assertEqual(self.client.get("/api/universal-medicines/search/?q=bru").data[0]["name"], "Brufen")
        rx = {"advice": "Fluids", "items": [
            {"source": "store", "medicine": self.med.id, "dose": "1 tablet", "frequency": "Thrice daily (TDS)", "duration": "5 days", "instructions": "After meal", "quantity": 15},
            {"source": "outside", "name": "Brufen", "strength": "400mg", "form": "Tablet", "dose": "1 tablet", "frequency": "BD", "duration": "3 days", "quantity": 6}]}
        r = self.client.put(f"/api/visits/{visit_id}/prescription/", rx, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        rx_id = r.data["id"]
        self.assertEqual(len(r.data["items"]), 2)
        r = self.client.post(f"/api/visits/{visit_id}/finish/", {}, format="json")
        self.assertEqual(r.data["status"], "medicine_pending")
        for layout in ("a4", "patient", "thermal", "outside"):
            pdf = self.client.get(f"/api/prescriptions/{rx_id}/pdf/?layout={layout}")
            self.assertEqual(pdf.status_code, 200)
            self.assertTrue(pdf.content.startswith(b"%PDF"), layout)
        r = self.client.post(f"/api/prescriptions/{rx_id}/whatsapp/", {}, format="json")
        self.assertIn("wa.me/923001234567", r.data["wa_link"])
        # doctor sees only own history
        self.assertEqual(self.client.get(f"/api/patients/{v1['patient']['id']}/history/").status_code, 200)

        # receptionist dispenses + bills
        self.login("rec")
        b = self.client.get(f"/api/visits/{visit_id}/billing/").data
        self.assertEqual(float(b["consultation_fee"]), 500.0)
        self.assertEqual(float(b["medicine_total"]), 45.0)
        r = self.client.post(f"/api/visits/{visit_id}/dispense/", {}, format="json")
        self.assertEqual(r.status_code, 200, r.content)
        self.med.refresh_from_db()
        self.assertEqual(self.med.stock_qty, 35)
        self.assertEqual(self.client.post(f"/api/visits/{visit_id}/dispense/", {}, format="json").status_code, 400)
        r = self.client.post(f"/api/visits/{visit_id}/pay/", {"amount": 300, "method": "cash"}, format="json")
        self.assertEqual(r.data["payment_status"], "partial")
        r = self.client.post(f"/api/visits/{visit_id}/pay/", {"amount": 245, "method": "card"}, format="json")
        self.assertEqual(r.data["payment_status"], "paid")
        self.assertEqual(r.data["status"], "completed")
        self.assertEqual(self.client.get(f"/api/prescriptions/{rx_id}/pdf/?layout=thermal").status_code, 200)
        self.assertEqual(self.client.get(f"/api/visits/{visit_id}/token-slip/").status_code, 200)
        self.assertEqual(self.client.get("/api/billing/closing/").data["total_revenue"] and 1, 1)
        self.assertEqual(self.client.post("/api/billing/closing/", {"counted_cash": 300}, format="json").status_code, 200)

        # insufficient stock is refused
        r = self.client.post("/api/visits/", {"patient_id": v1["patient"]["id"], "doctor": self.doc.id}, format="json")
        vid = r.data["id"]
        self.login("doc")
        self.client.put(f"/api/visits/{vid}/prescription/", {"items": [{"source": "store", "medicine": self.med.id, "quantity": 999}]}, format="json")
        self.client.post(f"/api/visits/{vid}/finish/", {}, format="json")
        self.login("rec")
        r = self.client.post(f"/api/visits/{vid}/dispense/", {}, format="json")
        self.assertEqual(r.status_code, 400)
        self.assertIn("Insufficient", r.data["detail"])

        # admin: dashboard, records, exports, audit, users
        self.login("admin")
        d = self.client.get("/api/reports/dashboard/").data
        self.assertEqual(d["cards"]["today_patients"], 4)
        self.assertEqual(len(d["daily_patients"]), 30)
        for kind in ("patients", "visits", "inventory", "dispensing", "payments"):
            r = self.client.get(f"/api/reports/records/?type={kind}")
            self.assertEqual(r.status_code, 200, kind)
            for fmt in ("xlsx", "pdf"):
                e = self.client.get(f"/api/reports/export/?type={kind}&fmt={fmt}")
                self.assertEqual(e.status_code, 200, (kind, fmt))
        self.assertGreater(self.client.get("/api/audit-logs/").data["count"], 5)
        self.assertEqual(self.client.get("/api/users/").status_code, 200)
        self.assertEqual(self.client.get("/api/search/?q=ali").status_code, 200)
        self.assertEqual(self.client.post("/api/backups/").status_code, 200)
        # role guards
        self.login("rec")
        self.assertEqual(self.client.get("/api/reports/dashboard/").status_code, 403)
        self.assertEqual(self.client.get("/api/audit-logs/").status_code, 403)
        self.assertEqual(self.client.get("/api/users/").status_code, 403)
        self.assertEqual(self.client.get("/api/users/doctors/").status_code, 200)

    def test_imports(self):
        self.login("admin")
        csv = b"Medicine Name,Strength,Dosage Form,Qty,Rate,Expiry Date\nCalpol,120mg/5ml,syp,10,120,2027-01-31\nPanadol,500mg,tab,25,3.5,\n"
        r = self.client.post("/api/medicines/import/", {"file": SimpleUploadedFile("m.csv", csv)}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual((r.data["created"], r.data["updated"]), (1, 1))
        self.med.refresh_from_db()
        self.assertEqual(self.med.stock_qty, 75)
        self.assertEqual(float(self.med.price), 3.5)
        # xlsx
        from openpyxl import Workbook

        wb = Workbook()
        ws = wb.active
        ws.append(["Name", "Strength", "Form", "Stock", "Price"])
        ws.append(["Zyrtec", "10mg", "Tablet", 40, 8])
        buf = io.BytesIO()
        wb.save(buf)
        r = self.client.post("/api/medicines/import/", {"file": SimpleUploadedFile("m.xlsx", buf.getvalue())}, format="multipart")
        self.assertEqual(r.data["created"], 1, r.content)
        # pdf with a table
        from reportlab.lib.pagesizes import A4
        from reportlab.platypus import SimpleDocTemplate, Table

        pb = io.BytesIO()
        SimpleDocTemplate(pb, pagesize=A4).build([Table([["Medicine", "Strength", "Form", "Stock", "Price"], ["Avil", "25mg", "Tablet", "30", "3"], ["Risek", "20mg", "Capsule", "12", "12"]], style=[("GRID", (0, 0), (-1, -1), 0.5, (0, 0, 0))])])
        r = self.client.post("/api/medicines/import/", {"file": SimpleUploadedFile("m.pdf", pb.getvalue())}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertEqual(r.data["created"], 2)
        self.assertTrue(Medicine.objects.filter(name="Risek", stock_qty=12).exists())
        # pdf with plain text lines (no table)
        from reportlab.pdfgen import canvas

        pb = io.BytesIO()
        c = canvas.Canvas(pb)
        for i, line in enumerate(["Medicine list", "Cefspan 400mg Capsule 60 85", "Voltral 50mg Tablet 100 8.5"]):
            c.drawString(60, 780 - i * 20, line)
        c.save()
        r = self.client.post("/api/universal-medicines/import/", {"file": SimpleUploadedFile("u.pdf", pb.getvalue())}, format="multipart")
        self.assertEqual(r.status_code, 200, r.content)
        self.assertTrue(UniversalMedicine.objects.filter(name="Cefspan", strength="400mg").exists(), UniversalMedicine.objects.values_list("name", flat=True))
        r = self.client.post("/api/medicines/import/", {"file": SimpleUploadedFile("bad.csv", b"foo,bar\n1,2\n")}, format="multipart")
        self.assertEqual(r.status_code, 400)
