import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BookmarkPlus, Plus, Syringe, Trash2, X } from 'lucide-react'
import api, { errMsg, money } from '../api'
import { Badge, useToast } from './ui'
import MedSearch from './MedSearch'

/* ---------- constants & helpers (exported so Consult can build the save payload / preview) ---------- */
export const INJ_ROUTES = ['IM', 'IV', 'SC', 'IV drip']
export const INJ_FREQS = [['Stat (once)', 1], ['Once daily', 1], ['Twice daily', 2], ['Thrice daily', 3], ['Every 8 hours', 3]]
export const INJ_DURS = [['', 1], ['1 day', 1], ['2 days', 2], ['3 days', 3], ['5 days', 5], ['7 days', 7]]
const DILUENTS = ['Normal saline 5 ml', 'Normal saline 10 ml', 'Distilled water 5 ml', 'Distilled water 10 ml', 'Normal saline 100 ml (drip)', 'Dextrose 5% 500 ml (drip)', 'Ringer lactate 500 ml (drip)']

const uid = () => Math.random().toString(36).slice(2)
const calcDoses = (freq, dur) => Math.min(Math.max((INJ_FREQS.find((x) => x[0] === freq)?.[1] || 1) * (INJ_DURS.find((x) => x[0] === dur)?.[1] || 1), 1), 60)
export const newInjection = () => ({ key: uid(), label: '', route: 'IM', diluent: '', frequency: 'Stat (once)', duration: '', doses: 1, dosesManual: false, notes: '', admin_fee: '', components: [] })
export const injFromServer = (n) => ({
  key: uid(), label: n.label, route: n.route, diluent: n.diluent, frequency: n.frequency, duration: n.duration, doses: n.doses, dosesManual: true, notes: n.notes, admin_fee: Number(n.admin_fee) || '',
  components: n.components.map((c) => ({ key: uid(), source: c.source, medicine: c.medicine, name: c.name, strength: c.strength, form: c.form, amount: c.amount, quantity: c.quantity, stock_qty: c.stock_qty ?? null, price: c.unit_price ?? 0, qtyManual: true })),
})
export const injToServer = (n) => ({
  label: n.label || '', route: n.route, diluent: n.diluent || '', frequency: n.frequency || '', duration: n.duration || '', doses: n.doses || 1, notes: n.notes || '', admin_fee: n.admin_fee === '' ? 0 : n.admin_fee,
  components: n.components.map((c) => (c.source === 'store'
    ? { source: 'store', medicine: c.medicine, amount: c.amount, quantity: c.quantity }
    : { source: 'outside', name: c.name, strength: c.strength, form: c.form, amount: c.amount, quantity: c.quantity })),
})
export const injCharge = (n) => Number(n.admin_fee || 0) + n.components.filter((c) => c.source === 'store').reduce((s, c) => s + Number(c.price) * c.quantity, 0)
export const injTitle = (n) => n.label || n.components.map((c) => c.name).join(' + ') || 'Injection'

const cLabel = (c) => [c.name, c.strength].filter(Boolean).join(' ')

function Card({ n, idx, locked, onChange, onRemove, onSaveUniversal, onSaveTemplate, uniVersion, onAddComp }) {
  const mix = n.components.length > 1
  const patch = (p) => onChange(p)
  const setComp = (key, p) => onChange({ components: n.components.map((c) => (c.key === key ? { ...c, ...p } : c)) })
  const delComp = (key) => onChange({ components: n.components.filter((c) => c.key !== key) })
  return (
    <motion.div layout id={`inj-${n.key}`} className={`inj-card ${mix ? 'mix' : ''}`} initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, x: 40 }}>
      <div className="row between" style={{ flexWrap: 'nowrap' }}>
        <div className="row" style={{ gap: 8 }}>
          <b><Syringe size={15} /> Injection {idx + 1}</b>
          {mix && <Badge kind="inj">MIX · {n.components.length} drugs in one dose</Badge>}
        </div>
        {!locked && (
          <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
            {n.components.length > 0 && <button className="btn ghost sm" title="Save this mix to reuse later" onClick={onSaveTemplate}><BookmarkPlus size={14} /> Save mix</button>}
            <button className="btn ghost sm icon" onClick={onRemove}><Trash2 size={15} color="#f0455a" /></button>
          </div>
        )}
      </div>

      {n.components.length > 0 && (
        <div className="small inj-note">
          {mix ? 'Draw into ONE syringe / drip: ' : ''}<b>{n.components.map((c) => `${cLabel(c)}${c.amount ? ` (${c.amount})` : ''}`).join('  +  ')}</b>
          {n.diluent ? ` — in ${n.diluent}` : ''} — {n.route}
        </div>
      )}

      <div className="stack" style={{ gap: 6 }}>
        {n.components.map((c, k) => (
          <div key={c.key}>
            {k > 0 && <div className="inj-plus" style={{ textAlign: 'center', marginBottom: 2 }}>+ mixed with</div>}
            <div className="inj-comp">
              <div style={{ minWidth: 0 }}>
                <b>{cLabel(c)}</b> {c.form && <span className="muted small">{c.form}</span>}
                <div className="small muted">
                  {c.source === 'store' ? <>Stock {c.stock_qty} · Rs {Number(c.price)}/unit{c.stock_qty != null && c.stock_qty < c.quantity && <span style={{ color: 'var(--red)' }}> · low stock!</span>}</> : 'Patient brings from outside'}
                </div>
              </div>
              <input disabled={locked} title="Amount per dose (e.g. 1 amp, 2 ml)" placeholder="Amount" value={c.amount} onChange={(e) => setComp(c.key, { amount: e.target.value })} />
              <input disabled={locked} type="number" min="1" title="Total units used" value={c.quantity} onChange={(e) => setComp(c.key, { quantity: Math.max(1, Number(e.target.value) || 1), qtyManual: true })} />
              {!locked ? <button className="btn ghost sm icon" onClick={() => delComp(c.key)}><X size={14} /></button> : <span />}
            </div>
          </div>
        ))}
      </div>

      {!locked && (
        <MedSearch params={{ inj: 1 }} version={uniVersion} placeholder={n.components.length ? 'Add another drug to this mix…' : 'Search injection — type name, click to add…'} onAdd={onAddComp} onSaveUniversal={(name) => onSaveUniversal(name)} />
      )}

      <div className="sel" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 8 }}>
        <select disabled={locked} value={n.route} onChange={(e) => patch({ route: e.target.value })}>{INJ_ROUTES.map((r) => <option key={r}>{r}</option>)}</select>
        <div>
          <input disabled={locked} list={`dil-${n.key}`} placeholder="Diluent (optional)" value={n.diluent} onChange={(e) => patch({ diluent: e.target.value })} />
          <datalist id={`dil-${n.key}`}>{DILUENTS.map((d) => <option key={d} value={d} />)}</datalist>
        </div>
        <select disabled={locked} value={n.frequency} onChange={(e) => patch({ frequency: e.target.value })}>{INJ_FREQS.map(([f]) => <option key={f}>{f}</option>)}</select>
        <select disabled={locked} value={n.duration} onChange={(e) => patch({ duration: e.target.value })}>{INJ_DURS.map(([d]) => <option key={d} value={d}>{d || 'Duration (optional)'}</option>)}</select>
        <input disabled={locked} type="number" min="1" max="60" title="Number of doses" placeholder="Doses" value={n.doses} onChange={(e) => patch({ doses: Math.max(1, Number(e.target.value) || 1), dosesManual: true })} />
        <input disabled={locked} type="number" min="0" title="Injection / drip charge" placeholder="Injection charge (Rs)" value={n.admin_fee} onChange={(e) => patch({ admin_fee: e.target.value === '' ? '' : Math.max(0, Number(e.target.value)) })} />
      </div>
      <input disabled={locked} placeholder="Note (e.g. give slowly, after test dose)" value={n.notes} onChange={(e) => patch({ notes: e.target.value })} style={{ padding: '7px 9px', fontSize: 12.5, borderRadius: 9 }} />
      <div className="small muted">{n.doses} dose{n.doses > 1 ? 's' : ''} · charge ≈ {money(injCharge(n))}</div>
    </motion.div>
  )
}

/** Injection tab: any number of injection orders; an order with 2+ drugs is a MIX given as one dose. */
export default function InjectionPanel({ injections, setInjections, locked, onSaveUniversal, uniVersion }) {
  const toast = useToast()
  const [tpls, setTpls] = useState([])
  const endRef = useRef()

  const loadTpls = () => api.get('/injection-templates/').then((r) => setTpls(r.data)).catch(() => {})
  useEffect(() => { loadTpls() }, [])

  const change = (key) => (p) => setInjections((arr) => arr.map((o) => {
    if (o.key !== key) return o
    const n = { ...o, ...p }
    if (('frequency' in p || 'duration' in p) && !n.dosesManual) n.doses = calcDoses(n.frequency, n.duration)
    if (n.doses !== o.doses) n.components = n.components.map((c) => (c.qtyManual ? c : { ...c, quantity: n.doses }))
    return n
  }))
  const remove = (key) => () => setInjections((a) => a.filter((o) => o.key !== key))
  const addOrder = () => { setInjections((a) => [...a, newInjection()]); setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80) }

  const addComp = (key) => (m, source) => setInjections((arr) => arr.map((o) => {
    if (o.key !== key) return o
    const dup = (c) => c.source === source && (source === 'store' ? c.medicine === m.id : c.name.toLowerCase() === m.name.toLowerCase() && (c.strength || '') === (m.strength || ''))
    if (o.components.some(dup)) { toast(`${m.name} is already in this injection`, 'error'); return o }
    const comp = { key: uid(), source, medicine: source === 'store' ? m.id : null, name: m.name, strength: m.strength || '', form: m.form || '', amount: '1 amp', quantity: o.doses, stock_qty: m.stock_qty ?? null, price: m.price ?? 0, qtyManual: false }
    return { ...o, components: [...o.components, comp] }
  }))

  const saveTemplate = async (n) => {
    const name = window.prompt('Name for this mix (e.g. Pain mix):', n.label || '')
    if (!name?.trim()) return
    try {
      await api.post('/injection-templates/', {
        name: name.trim(), route: n.route, diluent: n.diluent,
        components: n.components.map((c) => ({ source: c.source, medicine: c.source === 'store' ? c.medicine : null, name: c.name, strength: c.strength, form: c.form, amount: c.amount, quantity: 1 })),
      })
      toast('Mix saved — use it from “Saved mixes”')
      loadTpls()
    } catch (e) { toast(errMsg(e), 'error') }
  }
  const applyTemplate = async (t) => {
    const comps = await Promise.all(t.components.map(async (c) => {
      let live = null
      if (c.source === 'store' && c.medicine) { try { live = (await api.get(`/medicines/${c.medicine}/`)).data } catch { live = null } }
      const store = !!live && live.is_active
      return { key: uid(), source: store ? 'store' : 'outside', medicine: store ? live.id : null, name: c.name, strength: c.strength || '', form: c.form || '', amount: c.amount || '', quantity: 1, stock_qty: store ? live.stock_qty : null, price: store ? live.price : 0, qtyManual: false }
    }))
    setInjections((a) => [...a, { ...newInjection(), label: t.name, route: t.route, diluent: t.diluent, components: comps }])
    setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80)
  }
  const delTemplate = async (t) => {
    if (!window.confirm(`Delete saved mix “${t.name}”?`)) return
    try { await api.delete(`/injection-templates/${t.id}/`); loadTpls() } catch (e) { toast(errMsg(e), 'error') }
  }

  return (
    <div className="stack">
      {!locked && (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn sm" onClick={addOrder}><Plus size={14} /> New injection / mix</button>
          {tpls.length > 0 && <span className="small muted">Saved mixes:</span>}
          {tpls.map((t) => (
            <span key={t.id} className="chip" style={{ padding: '4px 6px 4px 11px' }} onClick={() => applyTemplate(t)} title={t.components.map((c) => c.name).join(' + ')}>
              <Syringe size={13} /> {t.name}
              <button type="button" className="btn ghost sm icon" style={{ padding: 2, minHeight: 0 }} onClick={(e) => { e.stopPropagation(); delTemplate(t) }}><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      <div className="rx-items"><AnimatePresence initial={false}>
        {injections.map((n, i) => (
          <Card key={n.key} n={n} idx={i} locked={locked} onChange={change(n.key)} onRemove={remove(n.key)} onAddComp={addComp(n.key)} onSaveTemplate={() => saveTemplate(n)} onSaveUniversal={onSaveUniversal} uniVersion={uniVersion} />
        ))}
      </AnimatePresence></div>
      {injections.length === 0 && <div className="muted small" style={{ padding: 8 }}>No injection ordered. Tap “New injection / mix”, search the drug, and add more drugs to the same card to mix them in a single dose.</div>}
      <div ref={endRef} />
    </div>
  )
}
