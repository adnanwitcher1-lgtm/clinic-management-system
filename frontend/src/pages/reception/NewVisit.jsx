import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, CheckCircle2, Droplet, Gauge, Loader2, Printer, Repeat, Search, Thermometer, UserPlus, Weight, X } from 'lucide-react'
import api, { errMsg, openPdf } from '../../api'
import { useLang } from '../../i18n'
import { Field, Page, PageHead, useDebounced, useToast } from '../../components/ui'

const BLANK = { name: '', age: '', gender: 'male', phone: '', address: '', cnic: '', blood_group: '', allergies: '', medical_history: '' }
const VBLANK = { bp_systolic: '', bp_diastolic: '', sugar: '', sugar_type: 'random', weight: '', temperature: '', pulse: '' }
const clean = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== '' && v !== null))

export default function NewVisit() {
  const { t } = useLang()
  const toast = useToast()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const [existing, setExisting] = useState(null) // returning patient (id)
  const [p, setP] = useState(BLANK)
  const [v, setV] = useState(VBLANK)
  const [doctors, setDoctors] = useState([])
  const [doctor, setDoctor] = useState('')
  const [fee, setFee] = useState('')
  const [visitType, setVisitType] = useState('checkup')
  const [followUp, setFollowUp] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [dup, setDup] = useState(null)
  const dq = useDebounced(q, 250)
  const phoneD = useDebounced(p.phone, 400)
  const topRef = useRef()

  useEffect(() => { api.get('/users/doctors/').then((r) => setDoctors(r.data)) }, [])
  useEffect(() => {
    const id = sp.get('patient')
    if (id) api.get(`/patients/${id}/`).then((r) => pick(r.data)).catch(() => {})
    // eslint-disable-next-line
  }, [])
  useEffect(() => {
    if (dq.trim().length < 2) return setHits([])
    api.get('/patients/search/', { params: { q: dq } }).then((r) => setHits(r.data))
  }, [dq])
  // warn when a "new" patient's phone already exists
  useEffect(() => {
    if (existing || phoneD.replace(/\D/g, '').length < 10) return setDup(null)
    api.get('/patients/search/', { params: { q: phoneD } }).then((r) => setDup(r.data[0] || null))
  }, [phoneD, existing])

  const pick = (pt) => {
    setExisting(pt.id)
    setP({ ...BLANK, ...Object.fromEntries(Object.keys(BLANK).map((k) => [k, pt[k] ?? ''])) })
    setQ(''); setHits([]); setDup(null)
    toast(`${pt.name} (${pt.patient_no}) loaded — details auto-filled`)
  }
  const reset = () => { setExisting(null); setP(BLANK); setV(VBLANK); setDoctor(''); setFee(''); setVisitType('checkup'); setFollowUp(false); setDone(null) }

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const body = { vitals: clean(v), is_follow_up: followUp, visit_type: visitType }
      if (!v.sugar) delete body.vitals.sugar_type
      if (doctor) body.doctor = Number(doctor)
      if (fee !== '') body.consultation_fee = fee
      if (existing) { body.patient_id = existing; body.patient = clean({ ...p, age: Number(p.age) }) } else body.patient = { ...clean(p), age: Number(p.age), cnic: p.cnic, address: p.address }
      const { data } = await api.post('/visits/', body)
      setDone(data)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      toast(errMsg(err), 'error')
    } finally {
      setBusy(false)
    }
  }
  const set = (k) => (e) => setP({ ...p, [k]: e.target.value })
  const doc = doctors.find((d) => String(d.id) === String(doctor))
  const defaultFee = doc ? (visitType === 'counselling' && doc.counselling_fee != null ? doc.counselling_fee : doc.consultation_fee) : null
  const setVit = (k) => (e) => setV({ ...v, [k]: e.target.value })

  if (done)
    return (
      <Page>
        <motion.div className="card" initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} style={{ maxWidth: 560, margin: '30px auto', textAlign: 'center' }}>
          <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', delay: 0.15 }}><CheckCircle2 size={64} color="#16c07a" /></motion.div>
          <h2 style={{ margin: '8px 0 2px' }}>Patient added to queue</h2>
          <div className="muted">{done.patient.name} · {done.patient.patient_no}</div>
          <motion.div initial={{ rotate: -8, scale: 0.5 }} animate={{ rotate: 0, scale: 1 }} transition={{ type: 'spring', delay: 0.25 }} className="token" style={{ width: 120, height: 120, fontSize: 56, borderRadius: 30, margin: '22px auto 8px' }}>{done.token_no}</motion.div>
          <div className="bold">Token number</div>
          <div className="muted" style={{ margin: '6px 0 20px' }}>{done.visit_type === 'counselling' && <><span className="badge b-store">Counselling</span> </>}Assigned to <b>Dr. {done.doctor_name}</b> — appears in the doctor's queue instantly.</div>
          <div className="row" style={{ justifyContent: 'center' }}>
            <button className="btn ghost" onClick={() => openPdf(`/visits/${done.id}/token-slip/`).catch((e) => toast(errMsg(e), 'error'))}><Printer size={16} /> Print token slip</button>
            <button className="btn" onClick={reset}><UserPlus size={16} /> Next patient</button>
            <button className="btn ghost" onClick={() => nav('/reception')}>Go to queue</button>
          </div>
        </motion.div>
      </Page>
    )

  return (
    <Page>
      <PageHead title="New Patient" sub="Register a new patient or pick a returning one — then record vitals and issue a token">
        {existing && <button className="btn ghost" onClick={reset}><X size={16} /> Clear / new patient</button>}
      </PageHead>

      <div className="card" style={{ marginBottom: 18 }} ref={topRef}>
        <h3><Repeat size={17} /> Returning patient? Search by Patient No. or phone</h3>
        <div className="suggest">
          <div style={{ position: 'relative' }}>
            <Search size={17} style={{ position: 'absolute', insetInlineStart: 13, top: 13, color: 'var(--muted)' }} />
            <input style={{ paddingInlineStart: 40 }} placeholder="e.g. P-000012 or 0300 1234567 or name" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <AnimatePresence>
            {hits.length > 0 && (
              <motion.div className="suggest-list" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {hits.map((h) => (
                  <button type="button" key={h.id} onClick={() => pick(h)}>
                    <span><b>{h.name}</b> <span className="muted small">{h.age}y · {h.gender}</span></span>
                    <span className="muted small">{h.patient_no}{h.phone ? ` · ${h.phone}` : ''}</span>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        {existing && <div className="small" style={{ color: 'var(--green)', marginTop: 8 }}><CheckCircle2 size={14} /> Returning patient — only a new visit will be added (no duplicate record).</div>}
      </div>

      <form onSubmit={submit} className="grid split-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <h3><UserPlus size={17} /> Patient details {existing && <span className="badge b-store">Auto-filled</span>}</h3>
          <div className="form-grid">
            <Field label={t('Name') + ' *'} className="span2"><input required value={p.name} onChange={set('name')} /></Field>
            <Field label={t('Age') + ' *'}><input required type="number" min="0" max="120" value={p.age} onChange={set('age')} /></Field>
            <Field label={t('Gender') + ' *'}>
              <select value={p.gender} onChange={set('gender')}><option value="male">{t('Male')}</option><option value="female">{t('Female')}</option><option value="other">{t('Other')}</option></select>
            </Field>
            <Field label={t('Phone') + ' (optional)'}><input inputMode="tel" placeholder="03XX XXXXXXX" value={p.phone} onChange={set('phone')} /></Field>
            <Field label="CNIC (optional)"><input placeholder="00000-0000000-0" value={p.cnic} onChange={set('cnic')} /></Field>
            <Field label={t('Blood Group')}>
              <select value={p.blood_group} onChange={set('blood_group')}><option value="">—</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}</select>
            </Field>
            <Field label={t('Address')} className="span2"><input value={p.address} onChange={set('address')} /></Field>
            <Field label={t('Allergies')} className="span2"><input placeholder="e.g. Penicillin, dust" value={p.allergies} onChange={set('allergies')} /></Field>
            <Field label={t('Medical History')} className="span-all"><textarea placeholder="Diabetes, hypertension, past surgeries…" value={p.medical_history} onChange={set('medical_history')} /></Field>
          </div>
          <AnimatePresence>
            {dup && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} className="row" style={{ background: 'var(--tint-orange)', borderRadius: 12, padding: 10, marginTop: 12 }}>
                <span className="small">⚠ This phone already belongs to <b>{dup.name}</b> ({dup.patient_no}).</span>
                <button type="button" className="btn sm" onClick={() => pick(dup)}>Use existing patient</button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="stack">
          <div className="card">
            <h3><Activity size={17} /> {t('Vitals')}</h3>
            <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
              <Field label="BP systolic"><input type="number" placeholder="120" value={v.bp_systolic} onChange={setVit('bp_systolic')} /></Field>
              <Field label="BP diastolic"><input type="number" placeholder="80" value={v.bp_diastolic} onChange={setVit('bp_diastolic')} /></Field>
              <Field label="Sugar (mg/dL)"><input type="number" step="0.1" value={v.sugar} onChange={setVit('sugar')} /></Field>
              <Field label="Sugar type"><select value={v.sugar_type} onChange={setVit('sugar_type')}><option value="fasting">Fasting</option><option value="random">Random</option></select></Field>
              <Field label="Weight (kg)"><input type="number" step="0.1" value={v.weight} onChange={setVit('weight')} /></Field>
              <Field label="Temp (°F)"><input type="number" step="0.1" placeholder="98.6" value={v.temperature} onChange={setVit('temperature')} /></Field>
              <Field label="Pulse (bpm)"><input type="number" value={v.pulse} onChange={setVit('pulse')} /></Field>
            </div>
          </div>

          <div className="card">
            <h3><Gauge size={17} /> Visit</h3>
            <div className="stack">
              <Field label="Doctor">
                <select value={doctor} onChange={(e) => setDoctor(e.target.value)}>
                  <option value="">Auto-assign (least busy)</option>
                  {doctors.map((d) => <option key={d.id} value={d.id} disabled={!d.is_available}>Dr. {d.full_name} — {d.waiting} waiting{d.is_available ? '' : ' (off duty)'}</option>)}
                </select>
              </Field>
              <Field label="Visit type">
                <div className="tabs" style={{ margin: 0 }}>
                  <button type="button" className={visitType === 'checkup' ? 'on' : ''} onClick={() => setVisitType('checkup')}>Check-up</button>
                  <button type="button" className={visitType === 'counselling' ? 'on' : ''} onClick={() => setVisitType('counselling')}>Counselling only</button>
                </div>
              </Field>
              <Field label={`${visitType === 'counselling' ? 'Counselling fee' : 'Consultation fee'} (leave blank for doctor's default)`}>
                <input type="number" min="0" placeholder={defaultFee != null ? `Default: Rs ${Number(defaultFee)}` : "Doctor's default"} value={fee} onChange={(e) => setFee(e.target.value)} />
              </Field>
              <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={followUp} onChange={(e) => setFollowUp(e.target.checked)} /> Follow-up visit</label>
              <button className="btn" style={{ height: 46 }} disabled={busy}>{busy ? <Loader2 className="spin" size={18} /> : <>{t('Save')} &amp; issue token</>}</button>
            </div>
          </div>
        </div>
      </form>
    </Page>
  )
}
