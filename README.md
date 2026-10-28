# Al-Rehman Clinic — Clinic Management System

Django + DRF (JWT) · React (Vite) · PostgreSQL · Celery + Redis · Urdu/English UI

Roles: **Receptionist** (patients, tokens, queue, dispensing, billing, receipts) · **Doctor** (queue, consultation, prescription) · **Admin** (dashboard, records, medicines, users, settings, audit log, Django admin panel).

---

## 1. Quick start (local)

### Option A — Docker (one command)
```bash
docker compose up --build
```
App → http://localhost:5173 · Django admin → http://localhost:8000/admin/

### Option B — manual

**Requirements:** Python 3.11+, Node 18+, PostgreSQL 14+, Redis.

```bash
# --- Database ---
sudo -u postgres psql -c "CREATE USER clinic_user WITH PASSWORD 'clinic_pass' CREATEDB;"
sudo -u postgres createdb -O clinic_user clinic_db

# --- Backend ---
cd backend
python -m venv venv && source venv/bin/activate     # Windows: venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env                                  # edit DB / Redis / WhatsApp values
python manage.py migrate
python manage.py seed_initial                         # admin + Dr. Jalal-ud-din, symptoms, universal list, store medicines (NO dummy data)
python manage.py runserver                            # http://localhost:8000

# --- Celery (second + third terminal, same venv) ---
celery -A config worker -l info
celery -A config beat -l info          # follow-up reminders (09:00) + nightly backup (02:00)

# --- Frontend ---
cd frontend
npm install
npm run dev                                           # http://localhost:5173  (proxies /api → :8000)
```

**No Postgres/Redis yet?** In `backend/.env` set `DB_ENGINE=sqlite` and `CELERY_EAGER=1` — everything works inline for a quick try-out.

### First logins
`seed_initial` creates `admin` and `dr.jalal`. Set `ADMIN_PASSWORD` / `DOCTOR_PASSWORD` in `.env` before running it, otherwise a random password is generated and **printed once** in the command output. Add the 2nd doctor and the receptionists from **Admin → Users**. Always run with `DEBUG=False` and a long `SECRET_KEY` in production.

---

## 2. Workflow

1. **Reception → New Patient**: new patient form (auto **Patient No.** `P-000123`) or search returning patient by Patient No./phone → details auto-fill. Enter vitals (BP, sugar fasting/random, weight, temp, pulse) → save → **token auto-generated**, doctor auto-assigned (least-loaded available doctor), token slip printable.
2. **Doctor → My Queue** updates live (polling every few seconds). Open patient: vitals top-left, name + history centre, **Medicine List (P/C)** right, **Patient Copy + Universal list** bottom. Tick symptoms (Sugar/BP ask for a value) → added to notes automatically. Add medicines from store (click) or type to autocomplete from the Universal list → *Write from outside*. Dose/frequency/duration/instructions are dropdowns with defaults. **Finish & Send to Pharmacy**.
3. **Reception → Queue** (Waiting / With doctor / Medicine pending / Completed): sees prescription, tells patient to collect medicine, **Dispense** (stock deducts, blocked if insufficient), takes payment (cash/card/online, partial allowed), prints receipt any time.
4. **Output**: PDF per prescription — A4, thermal (80 mm), Patient Copy, Outside-medicines sheet. Print from history at any time. **WhatsApp**: Cloud API if configured (Admin → Settings), otherwise a `wa.me` link opens with the message.
5. **Admin**: dashboard cards + charts, records tabs with date filters and Excel/PDF export, medicine upload, users, settings, audit log, daily closing, backups.

## 3. Medicine upload (Excel / CSV / **PDF**)
Admin → Medicines → drop a file. Headers are matched loosely (`name, strength, form, stock qty, price`, optional `expiry, batch, generic`). PDFs are read table-by-table with `pdfplumber` (text-based PDFs; scanned images need OCR first). Modes: *add to stock* or *replace stock*. Same for the **Universal list** (name, strength, form, generic). Shipped data: `backend/sample_data/store_medicines.csv` (clinic store: injections / tablets / syrups, stock and price 0 - fill from Reception → Stock) and `universal_medicines.csv` (~4,500 worldwide generic names + common brands; generics derived from the CC0 [Egyptian drug database](https://github.com/karem505/egyptian-drug-database)). Verify strength/form before prescribing.

## 4. Database schema

| Model | Key fields |
|---|---|
| **User** (role) | username, role (`admin`/`doctor`/`receptionist`), phone, specialization, qualification, consultation_fee, language, is_available |
| **Patient** | patient_no (unique, auto), name, age, gender, phone, address, cnic, blood_group, allergies, medical_history |
| **Visit** | patient → Patient, doctor → User, token_no (per-day counter), visit_date, status (`waiting` → `with_doctor` → `medicine_pending` → `completed` / `cancelled`), complaints, notes, diagnosis, follow_up_date, consultation_fee |
| **Vitals** (1:1 Visit) | bp_systolic, bp_diastolic, sugar, sugar_type, weight, temperature, pulse |
| **Symptom** / **VisitSymptom** | name, name_ur, value_type (none/sugar/bp) · ticked symptom + optional value per visit |
| **Medicine** (store) | name, generic_name, strength, form, stock_qty, price, batch_no, expiry_date, reorder_level |
| **StockMovement** | medicine, qty (+/−), balance_after, reason (import/dispense/adjust), user |
| **UniversalMedicine** | name, generic_name, strength, form |
| **Prescription** (1:1 Visit) | advice, finalized_at, dispensed_at/by, pdf_file |
| **PrescriptionItem** | source (`store`/`outside`), medicine FK (store only), name, strength, form, dose, frequency, duration, instructions, quantity, unit_price, dispensed_qty |
| **Payment** | visit, amount, method, received_by, created_at |
| **DailyClosing** | date, cash/card/online totals, total_revenue, counted_cash, patients_count |
| **Appointment** | patient, doctor, scheduled_at, reason, status |
| **AuditLog** | user, action, model, object_id, changes (JSON), ip, created_at |
| **ClinicSettings** | clinic name/tagline/address/phone, currency, default fee, low-stock & expiry thresholds, WhatsApp credentials |

## 5. REST API (all under `/api/`, JWT `Authorization: Bearer <access>`)

| Area | Endpoints |
|---|---|
| Auth | `POST auth/login/` · `POST auth/refresh/` · `GET auth/me/` |
| Patients | `GET/POST patients/` · `GET patients/search/?q=` · `GET patients/{id}/history/` |
| Visits | `GET/POST visits/` · `GET visits/queue/` · `GET visits/followups/` · `POST visits/{id}/start/` · `PUT visits/{id}/prescription/` · `POST visits/{id}/finish/` · `POST visits/{id}/dispense/` · `GET visits/{id}/billing/` · `POST visits/{id}/pay/` · `POST visits/{id}/cancel/` · `GET visits/{id}/token-slip/` |
| Prescriptions | `GET prescriptions/{id}/pdf/?layout=a4\|patient\|thermal\|outside` · `POST prescriptions/{id}/whatsapp/` |
| Medicines | `GET/POST medicines/` · `GET medicines/search/?q=` · `POST medicines/import/` · `GET universal-medicines/search/?q=` · `POST universal-medicines/import/` |
| Billing | `GET/POST billing/closing/` · `payments/` |
| Reports | `GET reports/dashboard/` · `GET reports/records/` · `GET reports/export/?type=&fmt=xlsx\|pdf` |
| Admin | `users/` · `settings/` · `audit-logs/` · `backups/` · `symptoms/` · `appointments/` |

Permissions are role-based per action (e.g. a receptionist cannot prescribe; a doctor sees only their own queue).

## 6. WhatsApp
Admin → Settings → enable WhatsApp, paste **Phone Number ID** + **Access token** from Meta WhatsApp Cloud API. The PDF is sent by a Celery job. Without credentials the button falls back to a `wa.me` link. Note: Cloud API may require an approved message template for first contact with a number.

## 7. Backups & production notes
* `python manage.py backup` (also nightly via Celery beat) → `backend/backups/*.json.gz`; for Postgres also schedule `pg_dump`.
* Production: `DEBUG=False`, strong `SECRET_KEY`, `ALLOWED_HOSTS`, `CORS_ALLOWED_ORIGINS`; `npm run build` and serve `frontend/dist` with nginx; run Django with `gunicorn config.wsgi`; set `VITE_API_URL` if API is on another origin.
* Tests: `cd backend && DB_ENGINE=sqlite python manage.py test`.

## 8. Project layout
```
backend/   config/ (settings, celery, urls) · apps/{accounts,core,clinic,pharmacy,billing,audit,reports} · sample_data/
frontend/  src/{pages/{reception,doctor,admin},components,i18n.jsx,api.js,styles.css}
docker-compose.yml
```


---

## Changelog — Al-Rehman Clinic update

- Clinic renamed to **Al-Rehman Clinic** everywhere (login, sidebar, prescription preview, all PDFs/receipts/WhatsApp texts, admin site). Existing databases are renamed automatically by migration `core.0002`.
- **Phone number is optional** when registering a patient (WhatsApp buttons are disabled for patients without a number).
- **Separate prints**: *Inside Rx* (A4) + *Inside receipt* (80mm, with bill) for clinic-store medicines/injections; *Outside Rx* (A4) + *Outside slip* (80mm) for medicines bought outside. Patient copy and Full A4 remain.
- Consultation screen: medicines are one list in the order added (newest at the bottom, auto-scrolls); **Save** and **Finish & Send to Pharmacy** are at the end of the medicine section; new medicines default to *Thrice daily (TDS)* (change `DEFAULT_FREQ` / `DEFAULT_DUR` at the top of `Consult.jsx`).
- **Universal list**: doctors/receptionists can add a missing medicine (and edit existing ones) from the consultation screen.
- **Injections tab**: separate injection orders; 2+ drugs in one order = a **MIX** given as a single dose; save frequently used mixes as templates; store drugs are deducted from stock at dispense and billed together with an optional injection charge.
- Run `python manage.py migrate` after updating (new migrations: `clinic.0003`, `core.0002`).
