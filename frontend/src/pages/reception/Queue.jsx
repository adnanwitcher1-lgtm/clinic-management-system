import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  BadgeCheck, Banknote, CheckCircle2, ClipboardCheck, Clock, Hourglass, Megaphone, PackageCheck, Pill, Plus, Printer,
  Stethoscope, Ticket, UserCheck, Users, XCircle,
} from 'lucide-react'
import api, { errMsg, list, money, openPdf } from '../../api'
import { useLang } from '../../i18n'
import { Badge, Empty, Field, Modal, Page, PageHead, Skeleton, Status, useToast, usePolling } from '../../components/ui'
import { RxItems, VitalsRow } from '../../components/PatientHistory'
import RxActions from '../../components/RxActions'

const TABS = [
  ['all', 'All', Users, null],
  ['waiting', 'Waiting', Hourglass, ['waiting']],
  ['with_doctor', 'With Doctor', Stethoscope, ['with_doctor']],
  ['medicine_pending', 'Medicine Pending', Pill, ['medicine_pending']],
  ['completed', 'Completed', CheckCircle2, ['completed']],
]

function Dispense({ visitId, onClose, onDone }) {
  const toast = useToast()
  const { t } = useLang()
  const [v, setV] = useState(null)
  const [qty, setQty] = useState({})
  const [pay, setPay] = useState({ amount: '', method: 'cash' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    const { data } = await api.get(`/visits/${visitId}/`)
    setV(data)
    setQty((q) => Object.keys(q).length ? q : Object.fromEntries([...(data.prescription?.items || []).map((i) => [i.id, i.quantity]), ...(data.prescription?.injections || []).flatMap((n) => n.components.filter((c) => c.source === 'store').map((c) => ['c' + c.id, c.quantity]))]))
    setPay((p) => ({ ...p, amount: Math.max(Number(data.balance), 0) || '' }))
    return data
  }, [visitId])
  useEffect(() => { load().catch((e) => toast(errMsg(e), 'error')) /* eslint-disable-next-line */ }, [])

  if (!v) return <Modal title="Dispense & bill" onClose={onClose}><Skeleton n={3} /></Modal>
  const rx = v.prescription
  const store = (rx?.items || []).filter((i) => i.source === 'store')
  const outside = (rx?.items || []).filter((i) => i.source === 'outside')
  const injs = rx?.injections || []
  const storeComps = injs.flatMap((n) => n.components.filter((c) => c.source === 'store'))
  const dispensed = !!rx?.dispensed_at
  const needDispense = (store.length > 0 || storeComps.length > 0) && !dispensed
  const lineTotal = (i) => Number(i.unit_price) * (dispensed ? i.dispensed_qty : Number(qty[i.id] ?? i.quantity))
  const compQty = (c) => (dispensed ? c.dispensed_qty : Number(qty['c' + c.id] ?? c.quantity))
  const medTotal = store.reduce((s, i) => s + lineTotal(i), 0)
  const injTotal = injs.reduce((s, n) => s + Number(n.admin_fee) + n.components.filter((c) => c.source === 'store').reduce((a, c) => a + Number(c.unit_price) * compQty(c), 0), 0)
  const total = Number(v.consultation_fee) + medTotal + injTotal
  const paid = Number(v.paid_amount)
  const due = Math.max(total - paid, 0)

  const run = async (fn, ok) => {
    setBusy(true)
    try {
      await fn()
      if (ok) toast(ok)
      const d = await load()
      onDone()
      return d
    } catch (e) {
      toast(errMsg(e), 'error')
    } finally {
      setBusy(false)
    }
  }
  const dispense = () =>
    run(() => api.post(`/visits/${v.id}/dispense/`, { items: store.map((i) => ({ id: i.id, quantity: Number(qty[i.id] ?? i.quantity) })), injections: storeComps.map((c) => ({ id: c.id, quantity: Number(qty['c' + c.id] ?? c.quantity) })) }), 'Medicines dispensed — stock updated')
  const takePayment = () => run(() => api.post(`/visits/${v.id}/pay/`, pay), 'Payment received')

  return (
    <Modal title={`Token #${v.token_no} · ${v.patient.name}`} onClose={onClose} wide>
      <div className="stack">
        <motion.div initial={{ scale: 0.97, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="card hero-card" style={{ boxShadow: 'none' }}>
          <Megaphone size={30} color="#6a3cc6" />
          <div style={{ position: 'relative', zIndex: 1 }}>
            <div className="small muted">Tell the patient</div>
            <b style={{ fontSize: 16 }}>“Please take your token no. <span style={{ fontSize: 24, color: 'var(--indigo)' }}>#{v.token_no}</span> and collect your medicine.”</b>
          </div>
        </motion.div>

        <div className="row small muted"><span>{v.patient.patient_no}</span>·<span>{v.patient.age}y {v.patient.gender}</span>·<span>Dr. {v.doctor_name}</span><VitalsRow v={v.vitals} /></div>
        {v.diagnosis && <div className="small"><b>Diagnosis:</b> {v.diagnosis}</div>}
        {v.patient.allergies && <div className="small" style={{ color: 'var(--red)' }}>⚠ Allergies: {v.patient.allergies}</div>}

        {!rx || (!rx.items.length && !injs.length) ? (
          <div className="muted small">No medicines were prescribed.</div>
        ) : (
          <>
            {store.length > 0 && (
              <div className="card" style={{ boxShadow: 'none', padding: 14 }}>
                <h3><Badge kind="store">Available in store</Badge> {dispensed && <Badge kind="paid">Dispensed</Badge>}</h3>
                <div className="table-wrap">
                  <table>
                    <thead><tr><th>Medicine</th><th>Directions</th><th>In stock</th><th>Qty</th><th className="right">Amount</th></tr></thead>
                    <tbody>
                      {store.map((i) => (
                        <tr key={i.id}>
                          <td><b>{i.label}</b></td>
                          <td className="small muted">{[i.dose, i.frequency, i.duration, i.instructions].filter(Boolean).join(' · ')}</td>
                          <td><Badge kind={i.stock_qty < Number(qty[i.id] ?? i.quantity) && !dispensed ? 'expired' : 'ok'}>{i.stock_qty ?? '—'}</Badge></td>
                          <td style={{ width: 90 }}>
                            {dispensed ? i.dispensed_qty : <input type="number" min="0" style={{ padding: '6px 8px' }} value={qty[i.id] ?? i.quantity} onChange={(e) => setQty({ ...qty, [i.id]: e.target.value })} />}
                          </td>
                          <td className="right">{money(lineTotal(i))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
            {outside.length > 0 && (
              <div className="card" style={{ boxShadow: 'none', padding: 14 }}>
                <h3><Badge kind="outside">Write from outside</Badge> <small className="muted">patient buys from outside pharmacy</small></h3>
                <ul style={{ margin: 0, paddingInlineStart: 18 }}>{outside.map((i) => <li key={i.id}><b>{i.label}</b> <span className="muted small">— {[i.dose, i.frequency, i.duration].filter(Boolean).join(' · ')}</span></li>)}</ul>
              </div>
            )}
            {injs.length > 0 && (
              <div className="card" style={{ boxShadow: 'none', padding: 14 }}>
                <h3><Badge kind="inj">Injections</Badge> <small className="muted">given at the clinic</small></h3>
                <div className="stack" style={{ gap: 10 }}>
                  {injs.map((n, k) => (
                    <div key={n.id} className={`inj-card ${n.is_mix ? 'mix' : ''}`}>
                      <div className="row between"><b>{n.is_mix ? `MIX of ${n.components.length}` : 'Injection'} · {n.route}{n.label ? ` · ${n.label}` : ''}</b><span className="small muted">{[n.diluent && `in ${n.diluent}`, n.frequency, n.duration].filter(Boolean).join(' · ')}</span></div>
                      <table><tbody>
                        {n.components.map((c) => (
                          <tr key={c.id}>
                            <td><b>{c.label}</b> <span className="muted small">{c.amount}</span></td>
                            <td>{c.source === 'store' ? <Badge kind={c.stock_qty < compQty(c) && !dispensed ? 'expired' : 'ok'}>{c.stock_qty ?? '—'}</Badge> : <Badge kind="outside">outside</Badge>}</td>
                            <td style={{ width: 90 }}>{c.source !== 'store' ? '—' : dispensed ? c.dispensed_qty : <input type="number" min="0" style={{ padding: '6px 8px' }} value={qty['c' + c.id] ?? c.quantity} onChange={(e) => setQty({ ...qty, ['c' + c.id]: e.target.value })} />}</td>
                            <td className="right">{c.source === 'store' ? money(Number(c.unit_price) * compQty(c)) : ''}</td>
                          </tr>
                        ))}
                        {Number(n.admin_fee) > 0 && <tr><td colSpan="3" className="small muted">Injection charge</td><td className="right">{money(n.admin_fee)}</td></tr>}
                      </tbody></table>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <div className="grid g2">
          <div className="card" style={{ boxShadow: 'none', padding: 14 }}>
            <h3><Banknote size={17} /> {t('Billing')}</h3>
            <table><tbody>
              <tr><td>Consultation fee</td><td className="right">{money(v.consultation_fee)}</td></tr>
              <tr><td>Medicines</td><td className="right">{money(medTotal)}</td></tr>
              {injs.length > 0 && <tr><td>Injections</td><td className="right">{money(injTotal)}</td></tr>}
              <tr><td><b>Total</b></td><td className="right"><b>{money(total)}</b></td></tr>
              <tr><td>Paid</td><td className="right">{money(paid)}</td></tr>
              <tr><td><b>Balance due</b></td><td className="right"><b style={{ color: due ? 'var(--red)' : 'var(--green)' }}>{money(due)}</b></td></tr>
            </tbody></table>
            {v.payments.length > 0 && <div className="small muted" style={{ marginTop: 8 }}>{v.payments.map((p) => <div key={p.id}>{money(p.amount)} · {p.method} · {new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>)}</div>}
          </div>

          <div className="card" style={{ boxShadow: 'none', padding: 14 }}>
            <h3><ClipboardCheck size={17} /> Actions</h3>
            <div className="stack">
              {needDispense && (
                <button className="btn green" disabled={busy} onClick={dispense}><PackageCheck size={17} /> Dispense medicine &amp; deduct stock</button>
              )}
              {due > 0 && (
                <div className="row" style={{ alignItems: 'flex-end' }}>
                  <Field label="Amount" className="grow"><input type="number" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} /></Field>
                  <Field label="Method">
                    <select style={{ minWidth: 100 }} value={pay.method} onChange={(e) => setPay({ ...pay, method: e.target.value })}>
                      <option value="cash">Cash</option><option value="card">Card</option><option value="online">Online</option>
                    </select>
                  </Field>
                  <button className="btn" disabled={busy || !pay.amount} onClick={takePayment}>Receive</button>
                </div>
              )}
              {!needDispense && due <= 0 && v.status === 'completed' && <div className="row" style={{ color: 'var(--green)' }}><BadgeCheck size={20} /> <b>All done — visit completed</b></div>}
              {v.status !== 'completed' && !needDispense && due > 0 && (
                <button className="btn ghost sm" onClick={() => run(() => api.post(`/visits/${v.id}/complete/`), 'Visit closed with balance')}>Close visit (leave balance)</button>
              )}
            </div>
          </div>
        </div>

        <div className="row between">
          <b className="muted small">Print anytime</b>
          <div className="row">
            <button className="btn ghost sm" onClick={() => openPdf(`/visits/${v.id}/token-slip/`).catch((e) => toast(errMsg(e), 'error'))}><Ticket size={15} /> Token slip</button>
            {rx && <RxActions rxId={rx.id} phone={v.patient.phone} hasInside={store.length + injs.length > 0} hasOutside={outside.length > 0 || injs.some((n) => n.components.some((c) => c.source === 'outside'))} />}
          </div>
        </div>
      </div>
    </Modal>
  )
}

export default function Queue() {
  const [rows, setRows] = useState(null)
  const [tab, setTab] = useState('all')
  const [open, setOpen] = useState(null)
  const nav = useNavigate()
  const toast = useToast()
  const { t } = useLang()
  const [prev, setPrev] = useState({})

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/visits/queue/')
      setRows(data)
      // notify when the doctor finishes a patient
      setPrev((old) => {
        data.forEach((v) => { if (old[v.id] && old[v.id] !== 'medicine_pending' && v.status === 'medicine_pending') toast(`Token #${v.token_no} (${v.patient.name}) is ready for medicine`) })
        return Object.fromEntries(data.map((v) => [v.id, v.status]))
      })
    } catch (e) { if (!rows) setRows([]) }
  }, []) // eslint-disable-line
  usePolling(load, 5000, [])

  const counts = useMemo(() => Object.fromEntries(TABS.map(([k, , , st]) => [k, (rows || []).filter((v) => !st || st.includes(v.status)).length])), [rows])
  const shown = (rows || []).filter((v) => tab === 'all' || v.status === tab)
  const cancel = async (v) => {
    if (!window.confirm(`Cancel token #${v.token_no}?`)) return
    try { await api.post(`/visits/${v.id}/cancel/`); toast('Visit cancelled'); load() } catch (e) { toast(errMsg(e), 'error') }
  }

  return (
    <Page>
      <PageHead title="Dashboard" sub={`${t("Today's queue")} · ${rows?.length ?? '…'} ${t('patients')}`}>
        <button className="btn" onClick={() => nav('/reception/new')}><Plus size={17} /> {t('New Patient')}</button>
      </PageHead>

      <div className="grid g4" style={{ marginBottom: 18 }}>
        {TABS.slice(1).map(([k, label, Icon], i) => (
          <motion.div key={k} className="card hover" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }} onClick={() => setTab(k)} style={{ cursor: 'pointer', outline: tab === k ? '2px solid var(--indigo)' : 'none' }}>
            <div className="stat">
              <div className="stat-icon" style={{ background: ['#ff9f43', '#2f6bff', '#8e3fc4', '#16c07a'][i], color: ['#ff9f43', '#2f6bff', '#8e3fc4', '#16c07a'][i] }}><Icon size={26} color="#fff" /></div>
              <div><span>{t(label)}</span><b>{counts[k]}</b></div>
            </div>
          </motion.div>
        ))}
      </div>

      <div className="tabs" style={{ marginBottom: 16 }}>
        {TABS.map(([k, label]) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{t(label)} <span className="n">{counts[k]}</span></button>
        ))}
      </div>

      {rows === null ? <Skeleton n={4} /> : shown.length === 0 ? (
        <div className="card"><Empty text="No patients in this list" icon={Clock} /></div>
      ) : (
        <div className="stack">
          <AnimatePresence initial={false}>
            {shown.map((v) => (
              <motion.div key={v.id} layout initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -30 }} className="q-card" onClick={() => ['medicine_pending', 'completed'].includes(v.status) && setOpen(v.id)} style={{ cursor: ['medicine_pending', 'completed'].includes(v.status) ? 'pointer' : 'default' }}>
                <div className="token">{v.token_no}</div>
                <div className="info">
                  <b>{v.patient.name} <small className="muted">· {v.patient.patient_no} · {v.patient.age}y</small></b>
                  <div className="small muted"><Stethoscope size={12} /> Dr. {v.doctor_name}{v.is_follow_up ? ' · follow-up' : ''}</div>
                  <div style={{ marginTop: 4 }}><VitalsRow v={v.vitals} /></div>
                </div>
                <div className="stack" style={{ alignItems: 'flex-end', gap: 6 }}>
                  <Status value={v.status} />
                  {v.has_prescription && <span className="small muted">{v.store_items} store · {v.outside_items} outside{v.injection_count ? ` · ${v.injection_count} inj` : ''}</span>}
                  {v.status === 'medicine_pending' && <Badge kind={v.payment_status}>Due {money(v.balance)}</Badge>}
                </div>
                <div className="row" style={{ gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  {v.status === 'waiting' && <>
                    <button className="btn ghost sm icon" title="Token slip" onClick={() => openPdf(`/visits/${v.id}/token-slip/`).catch((e) => toast(errMsg(e), 'error'))}><Printer size={15} /></button>
                    <button className="btn ghost sm icon" title="Cancel" onClick={() => cancel(v)}><XCircle size={15} color="#f0455a" /></button>
                  </>}
                  {v.status === 'medicine_pending' && <button className="btn green sm" onClick={() => setOpen(v.id)}><UserCheck size={15} /> Dispense</button>}
                  {v.status === 'completed' && <button className="btn ghost sm" onClick={() => setOpen(v.id)}><Printer size={15} /> Receipt</button>}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
      <AnimatePresence>{open && <Dispense key={open} visitId={open} onClose={() => setOpen(null)} onDone={load} />}</AnimatePresence>
    </Page>
  )
}
