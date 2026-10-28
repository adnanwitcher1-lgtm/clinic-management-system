import { createContext, useContext, useEffect, useState } from 'react'

const ur = {
  // navigation / pages
  Dashboard: 'ڈیش بورڈ', Patients: 'مریض', 'New Patient': 'نیا مریض', Queue: 'قطار', 'My Queue': 'میری قطار', 'Follow-ups': 'فالو اپ',
  Appointments: 'اپائنٹمنٹس', 'Medicine Stock': 'ادویات کا اسٹاک', Billing: 'بلنگ', Records: 'ریکارڈ', Medicines: 'ادویات', Users: 'صارفین',
  Settings: 'سیٹنگز', 'Audit Log': 'آڈٹ لاگ', 'Reception View': 'ریسپشن ویو', Reports: 'رپورٹس', Logout: 'لاگ آؤٹ', 'Daily Closing': 'روزانہ حساب',
  Live: 'لائیو', 'Search patients (No., name, phone) or medicines…': 'مریض (نمبر، نام، فون) یا دوا تلاش کریں…',
  // auth
  'Sign in': 'لاگ ان', Username: 'یوزر نیم', Password: 'پاسورڈ', 'Welcome Back': 'خوش آمدید',
  // patient
  Name: 'نام', Age: 'عمر', Gender: 'جنس', Phone: 'فون', Address: 'پتہ', 'Blood Group': 'بلڈ گروپ', Allergies: 'الرجی',
  'Medical History': 'طبی تاریخ', Male: 'مرد', Female: 'عورت', Other: 'دیگر', 'CNIC (optional)': 'شناختی کارڈ (اختیاری)',
  'Patient details': 'مریض کی تفصیل', 'Patient history': 'مریض کی ہسٹری', 'Patient Copy': 'مریض کی کاپی', 'Patient No.': 'مریض نمبر',
  'Returning patient? Search by Patient No. or phone': 'پرانا مریض؟ مریض نمبر یا فون سے تلاش کریں',
  'Save & issue token': 'محفوظ کریں اور ٹوکن جاری کریں', 'Patient added to queue': 'مریض قطار میں شامل ہو گیا', 'Next patient': 'اگلا مریض',
  'Token number': 'ٹوکن نمبر', 'Print token slip': 'ٹوکن پرچی پرنٹ کریں', 'Go to queue': 'قطار پر جائیں',
  // vitals
  Vitals: 'وائٹلز', 'B.P. & Vitals': 'بلڈ پریشر اور وائٹلز', 'Blood pressure': 'بلڈ پریشر', Sugar: 'شوگر', Weight: 'وزن', Pulse: 'نبض', Temp: 'بخار',
  'BP systolic': 'بی پی اوپر', 'BP diastolic': 'بی پی نیچے', 'Sugar (mg/dL)': 'شوگر (mg/dL)', 'Sugar type': 'شوگر کی قسم', 'Weight (kg)': 'وزن (کلو)',
  'Temp (°F)': 'درجہ حرارت (°F)', 'Pulse (bpm)': 'نبض (bpm)', Fasting: 'نہار منہ', Random: 'رینڈم',
  // queue
  Token: 'ٹوکن', All: 'تمام', Waiting: 'انتظار میں', 'With Doctor': 'ڈاکٹر کے پاس', 'Medicine Pending': 'دوا باقی', Completed: 'مکمل',
  Cancelled: 'منسوخ', patients: 'مریض', "Today's queue": 'آج کی قطار', "Today's Patients": 'آج کے مریض', 'Today Revenue': 'آج کی آمدنی',
  'Pending Patients': 'زیر انتظار مریض', 'Low Stock': 'کم اسٹاک', 'Low stock': 'کم اسٹاک', 'Out of stock': 'اسٹاک ختم', 'Expiring soon': 'جلد ایکسپائر',
  'No patients in this list': 'اس فہرست میں کوئی مریض نہیں', 'No patients found': 'کوئی مریض نہیں ملا', Dispense: 'دوا دیں', Receipt: 'رسید',
  'Dispense & bill': 'دوا اور بل', 'Tell the patient': 'مریض کو بتائیں', 'Available in store': 'اسٹور میں موجود', 'Write from outside': 'باہر سے خریدیں',
  'Consultation fee': 'کنسلٹیشن فیس', Total: 'کل', Paid: 'ادا شدہ', 'Balance due': 'باقی رقم', Amount: 'رقم', Method: 'طریقہ', Receive: 'وصول کریں',
  Cash: 'نقد', Card: 'کارڈ', Online: 'آن لائن', Actions: 'کارروائیاں', 'Print anytime': 'کسی بھی وقت پرنٹ',
  // doctor
  Symptoms: 'علامات', 'tick to add': 'ٹک کریں', Diagnosis: 'تشخیص', Notes: 'نوٹس', 'Follow-up': 'فالو اپ', 'Medical history': 'طبی تاریخ',
  'Medicine List': 'دواؤں کی فہرست', 'Medicine lists': 'دواؤں کی فہرستیں', Universal: 'عالمی', Store: 'اسٹور', 'Universal List': 'عالمی فہرست',
  'Finish & Send to Pharmacy': 'مکمل کریں اور فارمیسی بھیجیں', 'Consultation finished': 'معائنہ مکمل', 'Back to queue': 'قطار پر واپس',
  'Advice / instructions for patient': 'مریض کے لیے ہدایات', 'Welcome Back, ': 'خوش آمدید، ', Prescription: 'نسخہ', Print: 'پرنٹ',
  'Queue — by token': 'قطار — ٹوکن کے مطابق', 'Seen today': 'آج دیکھے گئے', Seen: 'دیکھے گئے', 'With me': 'میرے پاس', 'Call next': 'اگلا بلائیں',
  // admin
  'Daily patients · last 30 days': 'روزانہ مریض · پچھلے 30 دن', 'Monthly revenue': 'ماہانہ آمدنی', 'Top prescribed medicines': 'سب سے زیادہ لکھی گئی ادویات',
  'Common diagnoses': 'عام تشخیصیں', 'Medicine inventory': 'ادویات کا اسٹاک', 'Dispensing history': 'ادویات کی فراہمی', 'Revenue / Payments': 'آمدنی / ادائیگیاں',
  Visits: 'وزٹس', 'Add user': 'صارف شامل کریں', Role: 'کردار', Receptionist: 'ریسپشنسٹ', Doctor: 'ڈاکٹر', Admin: 'ایڈمن',
  'Clinic details': 'کلینک کی تفصیل', 'Save settings': 'سیٹنگز محفوظ کریں', Backups: 'بیک اپ', 'Backup now': 'ابھی بیک اپ لیں',
  'Symptom checklist': 'علامات کی فہرست', 'Store list': 'اسٹور لسٹ', 'Universal list': 'یونیورسل لسٹ', 'Stock movements': 'اسٹاک کی نقل و حرکت',
  'Add medicine': 'دوا شامل کریں', Save: 'محفوظ کریں', Cancel: 'منسوخ', Search: 'تلاش کریں', Edit: 'ترمیم', Delete: 'حذف', 'Book appointment': 'اپائنٹمنٹ بک کریں',
  Doctors: 'ڈاکٹرز', 'Quick Actions': 'فوری کارروائیاں', 'Total Patients': 'کل مریض', 'Medicines ': 'ادویات', 'No data yet': 'ابھی کوئی ڈیٹا نہیں',
  'Nothing here yet': 'ابھی کچھ نہیں', 'Total revenue': 'کل آمدنی', 'Close day': 'دن بند کریں', 'Patients seen': 'دیکھے گئے مریض',
}

const Ctx = createContext(null)

export function LangProvider({ children }) {
  const [lang, setLang] = useState(localStorage.getItem('lang') || 'en')
  useEffect(() => {
    document.documentElement.lang = lang
    document.documentElement.dir = lang === 'ur' ? 'rtl' : 'ltr'
    localStorage.setItem('lang', lang)
  }, [lang])
  const t = (s) => {
    if (lang !== 'ur' || typeof s !== 'string') return s
    if (ur[s]) return ur[s]
    const star = s.endsWith(' *')
    return star && ur[s.slice(0, -2)] ? `${ur[s.slice(0, -2)]} *` : s
  }
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>
}

export const useLang = () => useContext(Ctx)
