import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, AlertTriangle, ArrowLeft, Check, CheckCircle2, ClipboardList, Cloud, CloudOff, Copy, Droplet, FileText, HeartPulse, History,
  Loader2, Pencil, Pill, Plus, Printer, Save, Send, Syringe, Thermometer, Trash2, Weight, Zap,
} from 'lucide-react'
import api, { errMsg, list, money, openPdf } from '../../api'
import { useLang } from '../../i18n'
import { Badge, Empty, Field, Modal, Skeleton, useDebounced, useToast } from '../../components/ui'
import { RxItems, VitalsRow } from '../../components/PatientHistory'
import RxActions from '../../components/RxActions'
import MedSearch from '../../components/MedSearch'
import UniversalMedModal from '../../components/UniversalMedModal'
import InjectionPanel, { injCharge, injFromServer, injTitle, injToServer } from '../../components/InjectionPanel'

/* ---------------- prescription helpers ---------------- */
const DOSES = ['1 tablet', '2 tablets', '½ tablet', '1 capsule', '2 capsules', '5 ml', '10 ml', '2.5 ml', '1 injection', '2 drops', '1 sachet', '2 puffs', 'Apply thin layer', 'As directed']
const FREQS = [['Once daily (OD)', 1], ['Twice daily (BD)', 2], ['Thrice daily (TDS)', 3], ['Four times daily (QID)', 4], ['At night (HS)', 1], ['Every 8 hours', 3], ['Every 12 hours', 2], ['SOS (when needed)', 2]]
const DURS = [['1 day', 1], ['3 days', 3], ['5 days', 5], ['7 days', 7], ['10 days', 10], ['14 days', 14], ['1 month', 30], ['Ongoing', 30]]
const INSTR = ['After meal', 'Before meal', 'With water', 'Empty stomach', 'Before sleep', 'Apply locally', 'Dissolve in water', 'Shake well before use']

const defaultDose = (form = '') => {
  const f = form.toLowerCase()
  if (/cap/.test(f)) return '1 capsule'
  if (/syr|susp|solution/.test(f)) return '5 ml'
  if (/inj|infusion/.test(f)) return '1 injection'
  if (/drop/.test(f)) return '2 drops'
  if (/cream|oint|gel|lotion/.test(f)) return 'Apply thin layer'
  if (/inhal|spray/.test(f)) return '2 puffs'
  if (/sachet|powder/.test(f)) return '1 sachet'
  return '1 tablet'
}
const defaultInstr = (form = '') => (/cream|oint|gel|lotion/i.test(form) ? 'Apply locally' : /sachet|powder/i.test(form) ? 'Dissolve in water' : 'After meal')
const autoQty = (it) => {
  const f = `${it.form} ${it.dose}`.toLowerCase()
  if (!/tab|cap|inj/.test(f)) return 1
  const per = parseFloat(it.dose.replace('½', '0.5')) || 1
  const fr = FREQS.find((x) => x[0] === it.frequency)?.[1] || 1
  const d = DURS.find((x) => x[0] === it.duration)?.[1] || 1
  return Math.min(Math.max(Math.ceil(per * fr * d), 1), 999)
}
const DEFAULT_FREQ = 'Thrice daily (TDS)' // auto-selected when a medicine is added
const DEFAULT_DUR = '5 days'
const uid = () => Math.random().toString(36).slice(2)
const keyOf = (i) => `${i.source}|${i.medicine ?? i.name.toLowerCase()}|${(i.strength || '').toLowerCase()}`
const mkItem = (m, source) => {
  const it = {
    key: uid(), source, medicine: source === 'store' ? m.id : null, name: m.name, strength: m.strength || '', form: m.form || '',
    dose: defaultDose(m.form), frequency: DEFAULT_FREQ, duration: DEFAULT_DUR, instructions: defaultInstr(m.form),
    stock_qty: m.stock_qty ?? null, price: m.price ?? 0, qtyManual: false,
  }
  it.quantity = autoQty(it)
  return it
}
const fromServer = (i) => ({
  key: uid(), source: i.source, medicine: i.medicine, name: i.name, strength: i.strength, form: i.form, dose: i.dose, frequency: i.frequency,
  duration: i.duration, instructions: i.instructions, quantity: i.quantity, stock_qty: i.stock_qty, price: i.unit_price, qtyManual: true,
})
const label = (i) => [i.name, i.strength, i.form].filter(Boolean).join(' ')

function Sel({ value, onChange, options, placeholder }) {
  const opts = options.includes(value) || !value ? options : [value, ...options]
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">{placeholder}</option>
      {opts.map((o) => <option key={o}>{o}</option>)}
    </select>
  )
}

function MedRow({ it, onChange, onRemove, locked }) {
  const set = (k) => (v) => {
    const n = { ...it, [k]: v }
    if (['dose', 'frequency', 'duration'].includes(k) && !n.qtyManual) n.quantity = autoQty(n)
    onChange(n)
  }
  const low = it.source === 'store' && it.stock_qty != null && it.stock_qty < it.quantity
  return (
    <motion.div layout className={`med-row ${it.source}`} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: 40 }}>
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <div style={{ minWidth: 0 }}>
          <b>{label(it)}</b> <Badge kind={it.source === 'store' ? 'store' : 'outside'}>{it.source === 'store' ? 'store' : 'outside'}</Badge>
          <div className="small muted">
            {it.source === 'store' ? <>Stock {it.stock_qty} · Rs {Number(it.price)}/unit</> : 'Patient buys from outside'}
            {low && <span style={{ color: 'var(--red)' }}> · low stock!</span>}
          </div>
        </div>
        {!locked && <button className="btn ghost sm icon" onClick={onRemove}><Trash2 size={15} color="#f0455a" /></button>}
      </div>
      <div className="sel">
        <Sel value={it.dose} onChange={set('dose')} options={DOSES} placeholder="Dose" />
        <Sel value={it.frequency} onChange={set('frequency')} options={FREQS.map((f) => f[0])} placeholder="Frequency" />
        <Sel value={it.duration} onChange={set('duration')} options={DURS.map((f) => f[0])} placeholder="Duration" />
        <Sel value={it.instructions} onChange={set('instructions')} options={INSTR} placeholder="Instructions" />
        <input type="number" min="1" title="Quantity" value={it.quantity} onChange={(e) => onChange({ ...it, quantity: Math.max(1, Number(e.target.value) || 1), qtyManual: true })} />
      </div>
    </motion.div>
  )
}

/* ---------------- bottom-right: browse lists ---------------- */
function MedLists({ onAdd, locked, onAddNew, onEdit, version }) {
  const [tab, setTab] = useState('uni')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState([])
  const [count, setCount] = useState(0)
  const dq = useDebounced(q)
  useEffect(() => {
    api.get(tab === 'uni' ? '/universal-medicines/' : '/medicines/', { params: { q: dq, page_size: 40, active: 1 } }).then((r) => { setRows(list(r.data)); setCount(r.data.count ?? 0) })
  }, [tab, dq, version])
  return (
    <div className="card">
      <div className="row between" style={{ marginBottom: 10 }}>
        <h3 style={{ margin: 0 }}><Pill size={17} /> Medicine lists</h3>
        <div className="row" style={{ gap: 8 }}>
          {tab === 'uni' && <button className="btn sm" onClick={() => onAddNew(q.trim())}><Plus size={14} /> Add medicine</button>}
          <div className="tabs"><button className={tab === 'uni' ? 'on' : ''} onClick={() => setTab('uni')}>Universal</button><button className={tab === 'store' ? 'on' : ''} onClick={() => setTab('store')}>Store</button></div>
        </div>
      </div>
      <input placeholder={`Search ${tab === 'uni' ? 'universal' : 'store'} list (${count.toLocaleString()})…`} value={q} onChange={(e) => setQ(e.target.value)} style={{ marginBottom: 8 }} />
      <div style={{ maxHeight: 250, overflowY: 'auto' }}>
        {rows.length === 0 ? (
          <div>
            <Empty text="No medicines found" />
            {tab === 'uni' && <div style={{ textAlign: 'center' }}><button className="btn sm" onClick={() => onAddNew(q.trim())}><Plus size={14} /> Add “{q.trim() || 'new medicine'}” to Universal list</button></div>}
          </div>
        ) : rows.map((m) => (
          <div key={m.id} className="row" style={{ gap: 4, flexWrap: 'nowrap', borderBottom: '1px solid var(--line)' }}>
            <button disabled={locked} onClick={() => onAdd(m, tab === 'uni' ? 'outside' : 'store')} style={{ display: 'flex', flex: 1, minWidth: 0, justifyContent: 'space-between', gap: 8, padding: '8px 6px', border: 0, background: 'transparent', textAlign: 'start' }}>
              <span><b>{m.name}</b> <span className="muted small">{m.strength} {m.form}</span></span>
              <span className="small muted">{tab === 'store' ? `${m.stock_qty} · Rs ${Number(m.price)}` : m.generic_name}</span>
            </button>
            {tab === 'uni' && <button className="btn ghost sm icon" title="Edit this medicine" onClick={() => onEdit(m)}><Pencil size={14} /></button>}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ---------------- main page ---------------- */
export default function Consult() {
  const { id } = useParams()
  const nav = useNavigate()
  const toast = useToast()
  const { t } = useLang()

  const [visit, setVisit] = useState(null)
  const [symptoms, setSymptoms] = useState([])
  const [hist, setHist] = useState([])
  const [entries, setEntries] = useState({}) // symptomId -> value
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [followUp, setFollowUp] = useState('')
  const [vit, setVit] = useState({})
  const [editVit, setEditVit] = useState(false)
  const [items, setItems] = useState([])
  const [injections, setInjections] = useState([])
  const [rxTab, setRxTab] = useState('med')
  const [uniModal, setUniModal] = useState(null) // { med?, prefill?, forInj? }
  const [uniVersion, setUniVersion] = useState(0)
  const listEnd = useRef()
  const scrollNext = useRef(false)
  const prevLen = useRef(null)
  const [advice, setAdvice] = useState('')
  const [ready, setReady] = useState(false)
  const [saving, setSaving] = useState('saved')
  const [finish, setFinish] = useState(null)
  const [busy, setBusy] = useState(false)
  const rxId = useRef(null)
  const armed = useRef(false)
  const chain = useRef(Promise.resolve())
  const stateRef = useRef({})
  stateRef.current = { entries, diagnosis, notes, followUp, vit, items, injections, advice }

  const locked = !!visit && !['waiting', 'with_doctor'].includes(visit.status)

  useEffect(() => {
    (async () => {
      try {
        let { data: v } = await api.get(`/visits/${id}/`)
        if (v.status === 'waiting') v = (await api.post(`/visits/${id}/start/`)).data
        const [s, h] = await Promise.all([api.get('/symptoms/'), api.get(`/patients/${v.patient.id}/history/`)])
        setVisit(v); setSymptoms(list(s.data)); setHist(list(h.data).filter((x) => x.id !== v.id))
        setEntries(Object.fromEntries(v.symptom_entries.map((e) => [e.symptom, e.value || ''])))
        setDiagnosis(v.diagnosis || ''); setNotes(v.notes || ''); setFollowUp(v.follow_up_date || '')
        setVit(v.vitals || {})
        setItems((v.prescription?.items || []).map(fromServer)); setInjections((v.prescription?.injections || []).map(injFromServer)); setAdvice(v.prescription?.advice || '')
        rxId.current = v.prescription?.id || null
        setReady(true)
      } catch (e) { toast(errMsg(e), 'error'); nav('/doctor') }
    })()
    // eslint-disable-next-line
  }, [id])

  /* ---- save everything (serialised so saves never overlap) ---- */
  const doSave = async () => {
    const s = stateRef.current
    setSaving('saving')
    try {
      const num = (x) => (x === '' || x == null ? null : x)
      await api.patch(`/visits/${id}/`, {
        diagnosis: s.diagnosis, notes: s.notes, follow_up_date: s.followUp || null,
        symptom_entries: Object.entries(s.entries).map(([k, value]) => ({ symptom: Number(k), value: value || '' })),
        vitals: {
          bp_systolic: num(s.vit.bp_systolic), bp_diastolic: num(s.vit.bp_diastolic), sugar: num(s.vit.sugar), sugar_type: s.vit.sugar ? s.vit.sugar_type || 'random' : '',
          weight: num(s.vit.weight), temperature: num(s.vit.temperature), pulse: num(s.vit.pulse),
        },
      })
      if (s.items.length || s.injections.length || rxId.current) {
        const { data } = await api.put(`/visits/${id}/prescription/`, {
          advice: s.advice,
          items: s.items.map((i) => (i.source === 'store'
            ? { source: 'store', medicine: i.medicine, dose: i.dose, frequency: i.frequency, duration: i.duration, instructions: i.instructions, quantity: i.quantity }
            : { source: 'outside', name: i.name, strength: i.strength, form: i.form, dose: i.dose, frequency: i.frequency, duration: i.duration, instructions: i.instructions, quantity: i.quantity })),
          injections: s.injections.filter((n) => n.components.length).map(injToServer),
        })
        rxId.current = data.id
      }
      setSaving('saved')
    } catch (e) {
      setSaving('error')
      toast(errMsg(e), 'error')
      throw e
    }
  }
  const saveNow = () => { chain.current = chain.current.catch(() => {}).then(doSave); return chain.current }

  useEffect(() => {
    if (!ready || locked) return
    if (!armed.current) { armed.current = true; return }
    setSaving('dirty')
    const tm = setTimeout(() => saveNow().catch(() => {}), 1100)
    return () => clearTimeout(tm)
    // eslint-disable-next-line
  }, [entries, diagnosis, notes, followUp, vit, items, injections, advice])

  /* ---- medicine added from the list's own search box: scroll to the new (last) row ---- */
  useEffect(() => {
    if (!ready) return
    if (scrollNext.current && prevLen.current !== null && items.length > prevLen.current) listEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    scrollNext.current = false
    prevLen.current = items.length
  }, [items.length, ready])

  /* ---- symptoms ---- */
  const toggle = (s) => {
    if (locked) return
    setEntries((e) => {
      const n = { ...e }
      if (s.id in n) delete n[s.id]
      else n[s.id] = s.value_type === 'bp' ? (vit.bp_systolic && vit.bp_diastolic ? `${vit.bp_systolic}/${vit.bp_diastolic}` : '') : s.value_type === 'sugar' ? (vit.sugar ? String(Number(vit.sugar)) : '') : ''
      return n
    })
  }
  const complaints = useMemo(() => symptoms.filter((s) => s.id in entries).map((s) => (entries[s.id] ? `${s.name}: ${entries[s.id]}${s.value_type === 'sugar' && /^[\d.]+$/.test(entries[s.id]) ? ' mg/dL' : ''}` : s.name)), [symptoms, entries])

  /* ---- medicines ---- */
  const addMed = (m, source) => {
    if (locked) return
    const it = mkItem(m, source)
    setItems((arr) => {
      if (arr.some((x) => keyOf(x) === keyOf(it))) { toast(`${label(it)} is already in the prescription`, 'error'); return arr }
      return [...arr, it]
    })
  }
  const addFromPanel = (m, source) => { scrollNext.current = true; addMed(m, source) }
  const addFromList = (m, source) => {
    const exists = items.some((x) => keyOf(x) === keyOf(mkItem(m, source)))
    addMed(m, source)
    if (!exists) toast(`${m.name} added ↓ see “Medicine List” below`)
  }
  const editInj = (key) => {
    setRxTab('inj')
    setTimeout(() => {
      const el = document.getElementById(`inj-${key}`)
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el?.classList.add('flash')
      setTimeout(() => el?.classList.remove('flash'), 1500)
    }, 150)
  }
  const repeatRx = (rx) => {
    const add = rx.items.map(fromServer).filter((i) => !items.some((x) => x.source === i.source && x.name === i.name && x.strength === i.strength))
    setItems((a) => [...a, ...add])
    toast(`${add.length} medicine(s) copied from previous prescription`)
  }
  const upd = (key) => (n) => setItems((a) => a.map((x) => (x.key === key ? n : x)))
  const del = (key) => () => setItems((a) => a.filter((x) => x.key !== key))
  const store = items.filter((i) => i.source === 'store')
  const outside = items.filter((i) => i.source === 'outside')
  const injOutside = injections.some((n) => n.components.some((c) => c.source === 'outside'))
  const hasInside = store.length > 0 || injections.length > 0
  const hasOutside = outside.length > 0 || injOutside
  const onUniSaved = (m, addNow) => {
    setUniModal(null); setUniVersion((v) => v + 1)
    if (addNow) addMed(m, 'outside')
  }

  const doFinish = async () => {
    if (!diagnosis.trim() && !window.confirm('No diagnosis written. Finish anyway?')) return
    setBusy(true)
    try {
      await saveNow()
      const { data } = await api.post(`/visits/${id}/finish/`, { follow_up_date: followUp || null })
      setVisit(data); setFinish(data)
    } catch (e) { if (saving !== 'error') toast(errMsg(e), 'error') } finally { setBusy(false) }
  }
  const saveClick = async () => { try { await saveNow(); toast('Saved') } catch (e) { /* toast already shown */ } }
  const printCopy = async (layout) => {
    try { await saveNow(); if (!rxId.current) return toast('Add at least one medicine or injection first', 'error'); await openPdf(`/prescriptions/${rxId.current}/pdf/`, { layout }) } catch (e) { toast(errMsg(e), 'error') }
  }

  if (!visit) return <Skeleton n={4} />
  const p = visit.patient
  const vf = (k) => (e) => setVit((v) => ({ ...v, [k]: e.target.value }))
  const quick = (d) => { const x = new Date(); x.setDate(x.getDate() + d); setFollowUp(x.toLocaleDateString('en-CA')) }
  const SaveBadge = (
    <span className="pill" style={{ padding: '6px 12px' }}>
      {saving === 'saving' ? <><Loader2 size={14} className="spin" /> Saving…</> : saving === 'dirty' ? <><Cloud size={14} /> Unsaved…</> : saving === 'error' ? <><CloudOff size={14} color="#f0455a" /> Save failed</> : <><Check size={14} color="#16c07a" /> Saved</>}
    </span>
  )

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}>
      <div className="page-head">
        <div className="row">
          <button className="btn ghost icon" onClick={() => nav('/doctor')}><ArrowLeft size={18} /></button>
          <div className="token" style={{ width: 52, height: 52 }}>{visit.token_no}</div>
          <div><h1 className="page-title">{p.name}</h1><div className="page-sub">{p.patient_no} · {p.age}y · {p.gender}{p.phone ? ` · ${p.phone}` : ''}</div></div>
        </div>
        <div className="row">
          {SaveBadge}
          {locked && <Badge kind={visit.status}>{visit.status_label}</Badge>}
        </div>
      </div>

      <div className="consult-grid">
        {/* ========== LEFT: vitals + symptoms ========== */}
        <div className="stack">
          <div className="card">
            <div className="row between" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}><Activity size={17} /> B.P. &amp; {t('Vitals')}</h3>
              {!locked && <button className="btn ghost sm icon" onClick={() => setEditVit(!editVit)}><Pencil size={14} /></button>}
            </div>
            {editVit ? (
              <div className="form-grid" style={{ gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                <Field label="BP sys"><input type="number" value={vit.bp_systolic ?? ''} onChange={vf('bp_systolic')} /></Field>
                <Field label="BP dia"><input type="number" value={vit.bp_diastolic ?? ''} onChange={vf('bp_diastolic')} /></Field>
                <Field label="Sugar"><input type="number" value={vit.sugar ?? ''} onChange={vf('sugar')} /></Field>
                <Field label="Type"><select value={vit.sugar_type || 'random'} onChange={vf('sugar_type')}><option value="fasting">Fasting</option><option value="random">Random</option></select></Field>
                <Field label="Weight"><input type="number" value={vit.weight ?? ''} onChange={vf('weight')} /></Field>
                <Field label="Temp °F"><input type="number" value={vit.temperature ?? ''} onChange={vf('temperature')} /></Field>
                <Field label="Pulse"><input type="number" value={vit.pulse ?? ''} onChange={vf('pulse')} /></Field>
              </div>
            ) : (
              <div className="vitals-grid">
                <div className="vital bp"><small><HeartPulse size={11} /> Blood pressure</small><b style={{ fontSize: 26 }}>{vit.bp_systolic && vit.bp_diastolic ? `${vit.bp_systolic}/${vit.bp_diastolic}` : '—'}</b><small> mmHg</small></div>
                <div className="vital"><small><Droplet size={11} /> Sugar{vit.sugar_type ? ` (${vit.sugar_type})` : ''}</small><b>{vit.sugar ? Number(vit.sugar) : '—'}</b></div>
                <div className="vital"><small><Weight size={11} /> Weight</small><b>{vit.weight ? `${Number(vit.weight)} kg` : '—'}</b></div>
                <div className="vital"><small><Thermometer size={11} /> Temp</small><b>{vit.temperature ? `${Number(vit.temperature)}°F` : '—'}</b></div>
                <div className="vital"><small><Activity size={11} /> Pulse</small><b>{vit.pulse || '—'}</b></div>
              </div>
            )}
          </div>

          <div className="card">
            <h3><ClipboardList size={17} /> {t('Symptoms')} <small className="muted">tick to add</small></h3>
            <div className="row" style={{ gap: 7 }}>
              {symptoms.map((s) => {
                const on = s.id in entries
                return <motion.span whileTap={{ scale: 0.94 }} key={s.id} className={`chip ${on ? 'on' : ''}`} onClick={() => toggle(s)}>{on && <Check size={14} />}{s.name}</motion.span>
              })}
            </div>
            <AnimatePresence>
              {symptoms.filter((s) => s.id in entries && s.value_type).map((s) => (
                <motion.div key={s.id} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ marginTop: 10, overflow: 'hidden' }}>
                  <Field label={`${s.name} value`}>
                    <input autoFocus={!entries[s.id]} disabled={locked} placeholder={s.value_type === 'bp' ? 'e.g. 150/95' : s.value_type === 'sugar' ? 'mg/dL e.g. 240' : 'details…'} value={entries[s.id]} onChange={(e) => setEntries({ ...entries, [s.id]: e.target.value })} />
                  </Field>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>

        {/* ========== CENTER: patient + history ========== */}
        <div className="stack">
          <div className="card hero-card" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
            <div className="row" style={{ position: 'relative', zIndex: 1 }}>
              <div className="avatar" style={{ width: 54, height: 54, fontSize: 22, background: 'var(--grad)', color: '#fff' }}>{p.name[0]}</div>
              <div><h2 style={{ fontSize: 22 }}>{p.name}</h2><div className="muted small">{p.age} yrs · {p.gender}{p.blood_group ? ` · ${p.blood_group}` : ''}{p.address ? ` · ${p.address}` : ''}</div></div>
            </div>
            {p.allergies && <div className="alert"><AlertTriangle size={16} /><b>Allergies:</b> {p.allergies}</div>}
            {p.medical_history && <div className="small" style={{ position: 'relative', zIndex: 1 }}><b>Medical history:</b> {p.medical_history}</div>}
            {visit.notes && <div className="small muted" style={{ position: 'relative', zIndex: 1 }}>Reception note: {visit.notes}</div>}
          </div>

          <div className="card">
            <h3><FileText size={17} /> {t('Diagnosis')} &amp; {t('Notes')}</h3>
            {complaints.length > 0 && <div className="row" style={{ gap: 6, marginBottom: 10 }}><b className="small">C:</b>{complaints.map((c) => <span key={c} className="vit-chip" style={{ background: 'var(--tint-violet)', color: 'var(--on-violet)', borderColor: 'transparent' }}>{c}</span>)}</div>}
            <div className="stack">
              <Field label={t('Diagnosis')}><textarea disabled={locked} style={{ minHeight: 60 }} placeholder="Free-text diagnosis…" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} /></Field>
              <Field label={t('Notes')}><textarea disabled={locked} placeholder="Examination findings, notes…" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <Field label={`${t('Follow-up')} date`}><input disabled={locked} type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} /></Field>
                {!locked && [['3d', 3], ['1w', 7], ['2w', 14], ['1m', 30]].map(([l, d]) => <button key={l} type="button" className="chip" onClick={() => quick(d)}>{l}</button>)}
                {followUp && !locked && <button type="button" className="chip" onClick={() => setFollowUp('')}>clear</button>}
              </div>
            </div>
          </div>

          <div className="card">
            <h3><History size={17} /> Medical history <small className="muted">{hist.length} previous visit(s)</small></h3>
            {hist.length === 0 ? <Empty text="First visit — no history yet" icon={History} /> : (
              <div className="timeline">
                {hist.slice(0, 8).map((h) => (
                  <div className="tl-item" key={h.id}>
                    <div className="row between"><b>{h.visit_date} <span className="muted small">· Dr. {h.doctor_name}</span></b>{h.prescription && !locked && <button className="btn ghost sm" onClick={() => repeatRx(h.prescription)}><Copy size={13} /> Repeat Rx</button>}</div>
                    <div className="row" style={{ gap: 4, margin: '5px 0' }}><VitalsRow v={h.vitals} /></div>
                    {h.complaints && <div className="small"><b>C:</b> {h.complaints}</div>}
                    {h.diagnosis && <div className="small"><b>Dx:</b> {h.diagnosis}</div>}
                    {h.prescription && <div style={{ marginTop: 6 }}><RxItems rx={h.prescription} /></div>}
                    {h.prescription_id && <div style={{ marginTop: 8 }}><RxActions rxId={h.prescription_id} phone={p.phone} hasOutside={h.outside_items > 0} only={['a4', 'patient']} /></div>}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ========== BOTTOM: patient copy + universal list ========== */}
      <div className="consult-bottom">
        <div className="card">
          <div className="row between" style={{ marginBottom: 10 }}>
            <h3 style={{ margin: 0 }}><Zap size={17} /> {t('Patient Copy')} <small className="muted">live preview</small></h3>
            <div className="row" style={{ gap: 6 }}>
              <button className="btn ghost sm" onClick={() => printCopy('patient')}><Printer size={14} /> {t('Patient Copy')}</button>
              {hasInside && <button className="btn ghost sm" onClick={() => printCopy('inside')}><Printer size={14} /> Inside Rx</button>}
              {hasInside && <button className="btn ghost sm" onClick={() => printCopy('thermal')}><Printer size={14} /> Inside receipt</button>}
              {hasOutside && <button className="btn ghost sm" onClick={() => printCopy('outside')}><Printer size={14} /> Outside Rx</button>}
              {hasOutside && <button className="btn ghost sm" onClick={() => printCopy('outside_thermal')}><Printer size={14} /> Outside slip</button>}
              <button className="btn ghost sm" onClick={() => printCopy('a4')}><Printer size={14} /> Full A4</button>
            </div>
          </div>
          <div className="paper">
            <div className="row between"><h4>Al-Rehman Clinic</h4><span className="small muted">Token #{visit.token_no} · {visit.visit_date}</span></div>
            <hr style={{ border: 0, borderTop: '1px solid var(--line)' }} />
            <div><b>{p.name}</b> · {p.age}y · {p.gender} · {p.patient_no}</div>
            <div className="row" style={{ gap: 4, margin: '6px 0' }}><VitalsRow v={vit} /></div>
            {complaints.length > 0 && <div className="small"><b>C/O:</b> {complaints.join(', ')}</div>}
            {diagnosis && <div className="small"><b>Dx:</b> {diagnosis}</div>}
            <div style={{ marginTop: 8 }}><b style={{ color: 'var(--indigo)' }}>℞</b></div>
            {items.length === 0 && injections.length === 0 ? <div className="muted small">— no medicines yet —</div> : (
              <ol style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                {items.map((i) => <li key={i.key} style={{ marginBottom: 3 }}><b>{label(i)}</b> {i.source === 'outside' && <span className="badge b-outside" style={{ padding: '0 7px' }}>outside</span>}<div className="small muted">{[i.dose, i.frequency, i.duration, i.instructions].filter(Boolean).join(' · ')}</div></li>)}
              </ol>
            )}
            {injections.filter((n) => n.components.length).length > 0 && (
              <div style={{ marginTop: 8 }}>
                <b style={{ color: 'var(--accent-ink)' }}>Injections</b>
                <ol style={{ margin: '4px 0 0', paddingInlineStart: 18 }}>
                  {injections.filter((n) => n.components.length).map((n) => (
                    <li key={n.key} style={{ marginBottom: 3 }}>
                      <b>{n.components.length > 1 ? 'MIX: ' : ''}{injTitle(n)}</b> <span className="badge b-inj" style={{ padding: '0 7px' }}>{n.route}</span>
                      <div className="small muted">{[n.components.map((c) => c.amount).filter(Boolean).join(' + '), n.diluent && `in ${n.diluent}`, n.frequency, n.duration, n.doses > 1 && `${n.doses} doses`].filter(Boolean).join(' · ')}</div>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            {advice && <div className="small" style={{ marginTop: 8 }}><b>Advice:</b> {advice}</div>}
            {followUp && <div className="small" style={{ marginTop: 4 }}><b>Follow-up:</b> {followUp}</div>}
          </div>
        </div>
        <MedLists onAdd={addFromList} locked={locked} version={uniVersion} onAddNew={(name) => setUniModal({ prefill: name ? { name } : {} })} onEdit={(m) => setUniModal({ med: m })} />
      </div>

      {/* ========== LAST: editable medicine / injection list + Save & Finish at the very end ========== */}
      <div className="card rx-card" id="rx-section">
        <div className="row between" style={{ marginBottom: 6 }}>
          <h3 style={{ margin: 0 }}><Pill size={17} /> Medicine List <small className="muted">editable · in the order added</small></h3>
          <div className="tabs">
            <button className={rxTab === 'med' ? 'on' : ''} onClick={() => setRxTab('med')}><Pill size={14} /> Medicines <span className="n">{items.length}</span></button>
            <button className={rxTab === 'inj' ? 'on' : ''} onClick={() => setRxTab('inj')}><Syringe size={14} /> Injections <span className="n">{injections.length}</span></button>
          </div>
        </div>
        <div className="small muted" style={{ marginBottom: 12 }}><b>C</b> — {complaints.length ? complaints.join(', ') : 'no complaints ticked'}</div>

        {rxTab === 'med' ? (
          <div className="stack">
            <MedSearch onAdd={addFromPanel} locked={locked} onSaveUniversal={(name) => setUniModal({ prefill: { name } })} version={uniVersion} />
            <div className="row between">
              <div className="row" style={{ gap: 6 }}><Badge kind="store">Store ({store.length})</Badge><Badge kind="outside">Outside ({outside.length})</Badge><Badge kind="inj">Injections ({injections.length})</Badge></div>
              {(store.length > 0 || injections.length > 0) && <span className="small muted">≈ {money(store.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0) + injections.reduce((sum, n) => sum + injCharge(n), 0))}</span>}
            </div>
            {/* one list, in the order the doctor added them — the newest medicine is always the last row */}
            <div className="rx-items"><AnimatePresence initial={false}>{items.map((i) => <MedRow key={i.key} it={i} onChange={upd(i.key)} onRemove={del(i.key)} locked={locked} />)}</AnimatePresence></div>
            <div ref={listEnd} />
            {injections.length > 0 && (
              <>
                <div className="sec-label"><Syringe size={13} /> Injections</div>
                <div className="rx-items">
                  {injections.map((n) => (
                    <div key={n.key} className={`inj-sum ${n.components.length > 1 ? 'mix' : ''}`}>
                      <div style={{ minWidth: 0 }}>
                        <b>{n.components.length > 1 ? 'MIX · ' : ''}{injTitle(n)}</b> <Badge kind="inj">{n.route}</Badge>
                        <div className="small muted">{[n.components.map((c) => c.amount).filter(Boolean).join(' + '), n.diluent && `in ${n.diluent}`, n.frequency, n.duration, n.doses > 1 && `${n.doses} doses`].filter(Boolean).join(' · ') || '—'}</div>
                      </div>
                      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                        <button className="btn ghost sm" onClick={() => editInj(n.key)}><Pencil size={13} /> {locked ? 'View' : 'Edit'}</button>
                        {!locked && <button className="btn ghost sm icon" onClick={() => setInjections((a) => a.filter((x) => x.key !== n.key))}><Trash2 size={14} color="#f0455a" /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
            {items.length === 0 && injections.length === 0 && <div className="muted small" style={{ padding: 8 }}>Search above (or tap a medicine in “Medicine lists”) — store medicines are tagged “store”, others “outside”. Everything you add appears here at the bottom.</div>}
          </div>
        ) : (
          <InjectionPanel injections={injections} setInjections={setInjections} locked={locked} onSaveUniversal={(name) => setUniModal({ prefill: { name, form: 'Injection' }, forInj: true })} uniVersion={uniVersion} />
        )}

        <div style={{ marginTop: 16 }}>
          <Field label="Advice / instructions for patient"><textarea disabled={locked} style={{ minHeight: 60 }} placeholder="Drink plenty of fluids, rest…" value={advice} onChange={(e) => setAdvice(e.target.value)} /></Field>
        </div>

        {/* Save + Finish are the LAST thing on the page */}
        <div className="final-bar">
          <div className="row" style={{ gap: 10 }}>{SaveBadge}<span className="small muted">Review the patient copy above, then finish.</span></div>
          <div className="row" style={{ gap: 10 }}>
            {locked ? <Badge kind={visit.status}>{visit.status_label}</Badge> : (
              <>
                <button className="btn ghost lg" disabled={busy || saving === 'saving'} onClick={saveClick}>{saving === 'saving' ? <Loader2 size={17} className="spin" /> : <Save size={17} />} Save</button>
                <button className="btn green lg" disabled={busy} onClick={doFinish}>{busy ? <Loader2 size={17} className="spin" /> : <Send size={17} />} {t('Finish & Send to Pharmacy')}</button>
              </>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {uniModal && <UniversalMedModal key="uni" med={uniModal.med} prefill={uniModal.prefill} canAddToRx={!locked && !uniModal.forInj} onClose={() => setUniModal(null)} onSaved={onUniSaved} />}
        {finish && (
          <Modal title="Consultation finished" onClose={() => nav('/doctor')}>
            <div className="stack" style={{ textAlign: 'center' }}>
              <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring' }}><CheckCircle2 size={60} color="#16c07a" /></motion.div>
              <b>{p.name} has been sent to reception for medicine &amp; billing.</b>
              <div className="muted small">Token #{visit.token_no} now shows under “Medicine pending” on the receptionist screen.</div>
              {finish.prescription && <div style={{ display: 'flex', justifyContent: 'center' }}><RxActions rxId={finish.prescription.id} phone={p.phone} hasInside={hasInside} hasOutside={hasOutside} only={['inside', 'thermal', 'outside', 'outside_thermal', 'patient', 'wa']} /></div>}
              <button className="btn" onClick={() => nav('/doctor')}>Back to queue</button>
            </div>
          </Modal>
        )}
      </AnimatePresence>
    </motion.div>
  )
}
