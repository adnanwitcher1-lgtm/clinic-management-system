import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { BellRing, CalendarCheck, CalendarPlus, LogIn, MessageCircle, Search, X } from 'lucide-react'
import api, { errMsg, list } from '../api'
import { useAuth } from '../auth'
import { Badge, Empty, Field, Modal, Page, PageHead, Skeleton, useDebounced, useToast } from '../components/ui'

const nowLocal = () => { const d = new Date(Date.now() + 3600e3); d.setMinutes(0, 0, 0); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16) }

function NewAppt({ onClose, onSaved }) {
  const toast = useToast()
  const [doctors, setDoctors] = useState([])
  const [q, setQ] = useState('')
  const [hits, setHits] = useState([])
  const [pt, setPt] = useState(null)
  const [f, setF] = useState({ doctor: '', scheduled_at: nowLocal(), reason: '' })
  const dq = useDebounced(q)
  useEffect(() => { api.get('/users/doctors/').then((r) => { setDoctors(r.data); if (r.data[0]) setF((x) => ({ ...x, doctor: r.data[0].id })) }) }, [])
  useEffect(() => { dq.length > 1 ? api.get('/patients/search/', { params: { q: dq } }).then((r) => setHits(r.data)) : setHits([]) }, [dq])
  const save = async (e) => {
    e.preventDefault()
    if (!pt) return toast('Select a patient first', 'error')
    try { await api.post('/appointments/', { ...f, patient: pt.id, scheduled_at: new Date(f.scheduled_at).toISOString() }); toast('Appointment booked'); onSaved(); onClose() } catch (er) { toast(errMsg(er), 'error') }
  }
  return (
    <Modal title="Book appointment" onClose={onClose}>
      <form className="stack" onSubmit={save}>
        {pt ? (
          <div className="row between card" style={{ padding: 10, boxShadow: 'none' }}><span><b>{pt.name}</b> <span className="muted small">{pt.patient_no}{pt.phone ? ` · ${pt.phone}` : ''}</span></span><button type="button" className="btn ghost sm icon" onClick={() => setPt(null)}><X size={14} /></button></div>
        ) : (
          <div className="suggest">
            <div style={{ position: 'relative' }}><Search size={16} style={{ position: 'absolute', insetInlineStart: 12, top: 13, color: 'var(--muted)' }} /><input style={{ paddingInlineStart: 38 }} placeholder="Find patient by No., phone or name" value={q} onChange={(e) => setQ(e.target.value)} /></div>
            {hits.length > 0 && <div className="suggest-list">{hits.map((h) => <button type="button" key={h.id} onClick={() => { setPt(h); setHits([]) }}><span><b>{h.name}</b></span><span className="muted small">{h.patient_no}{h.phone ? ` · ${h.phone}` : ''}</span></button>)}</div>}
          </div>
        )}
        <Field label="Doctor"><select value={f.doctor} onChange={(e) => setF({ ...f, doctor: e.target.value })}>{doctors.map((d) => <option key={d.id} value={d.id}>Dr. {d.full_name}</option>)}</select></Field>
        <Field label="Date & time"><input type="datetime-local" required value={f.scheduled_at} onChange={(e) => setF({ ...f, scheduled_at: e.target.value })} /></Field>
        <Field label="Reason"><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
        <button className="btn">Book appointment</button>
      </form>
    </Modal>
  )
}

export default function Appointments() {
  const { user } = useAuth()
  const isDoc = user.role === 'doctor'
  const toast = useToast()
  const [tab, setTab] = useState('followups')
  const [appts, setAppts] = useState(null)
  const [fu, setFu] = useState(null)
  const [add, setAdd] = useState(false)

  const load = useCallback(async () => {
    const [a, f] = await Promise.all([api.get('/appointments/', { params: { upcoming: 1, page_size: 200 } }), api.get('/visits/followups/', { params: { days: 30 } })])
    setAppts(list(a.data)); setFu(f.data)
  }, [])
  useEffect(() => { load().catch((e) => toast(errMsg(e), 'error')) }, [load]) // eslint-disable-line

  const act = async (fn, ok) => { try { const r = await fn(); if (ok) toast(ok); load(); return r } catch (e) { toast(errMsg(e), 'error') } }
  const remind = async (v) => {
    const r = await act(() => api.post(`/visits/${v.id}/remind/`))
    if (!r) return
    if (r.data.queued) toast('Reminder sent via WhatsApp API')
    else window.open(r.data.wa_link, '_blank')
  }
  const todayStr = new Date().toLocaleDateString('en-CA')

  return (
    <Page>
      <PageHead title={isDoc ? 'Follow-ups' : 'Appointments'} sub="Upcoming appointments and follow-up reminders">
        {!isDoc && <button className="btn" onClick={() => setAdd(true)}><CalendarPlus size={16} /> Book appointment</button>}
      </PageHead>
      <div className="tabs" style={{ marginBottom: 16 }}>
        <button className={tab === 'followups' ? 'on' : ''} onClick={() => setTab('followups')}><BellRing size={15} /> Follow-ups <span className="n">{fu?.length ?? 0}</span></button>
        <button className={tab === 'appts' ? 'on' : ''} onClick={() => setTab('appts')}><CalendarCheck size={15} /> Appointments <span className="n">{appts?.length ?? 0}</span></button>
      </div>

      <div className="card">
        {tab === 'followups' ? (
          !fu ? <Skeleton /> : fu.length === 0 ? <Empty text="No follow-ups scheduled" icon={BellRing} /> : (
            <div className="table-wrap"><table>
              <thead><tr><th>Follow-up date</th><th>Patient</th><th>Phone</th><th>Doctor</th><th>Reminder</th>{!isDoc && <th />}</tr></thead>
              <tbody>{fu.map((v) => (
                <tr key={v.id}>
                  <td><b>{v.follow_up_date}</b> {v.follow_up_date === todayStr && <Badge kind="soon">Today</Badge>} {v.follow_up_date < todayStr && <Badge kind="expired">Overdue</Badge>}</td>
                  <td>{v.patient.name} <span className="muted small">{v.patient.patient_no}</span></td>
                  <td>{v.patient.phone || '—'}</td><td>Dr. {v.doctor_name}</td>
                  <td>{v.follow_up_reminded ? <Badge kind="paid">Sent</Badge> : <span className="muted small">Not sent (auto at 9am)</span>}</td>
                  {!isDoc && <td className="right"><button className="btn green sm" disabled={!v.patient.phone} title={v.patient.phone ? '' : 'No phone number'} onClick={() => remind(v)}><MessageCircle size={14} /> WhatsApp</button></td>}
                </tr>
              ))}</tbody>
            </table></div>
          )
        ) : !appts ? <Skeleton /> : appts.length === 0 ? <Empty text="No upcoming appointments" icon={CalendarCheck} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>When</th><th>Patient</th><th>Doctor</th><th>Reason</th>{!isDoc && <th />}</tr></thead>
            <tbody>{appts.map((a) => (
              <motion.tr key={a.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                <td><b>{new Date(a.scheduled_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</b></td>
                <td>{a.patient_name} <span className="muted small">{a.patient_no}</span></td>
                <td>Dr. {a.doctor_name}</td><td>{a.reason}</td>
                {!isDoc && <td className="right"><div className="row" style={{ justifyContent: 'flex-end', gap: 6 }}>
                  <button className="btn green sm" onClick={() => act(() => api.post(`/appointments/${a.id}/check_in/`), 'Checked in — token issued')}><LogIn size={14} /> Check-in</button>
                  <button className="btn ghost sm icon" onClick={() => act(() => api.patch(`/appointments/${a.id}/`, { status: 'cancelled' }), 'Appointment cancelled')}><X size={14} color="#f0455a" /></button>
                </div></td>}
              </motion.tr>
            ))}</tbody>
          </table></div>
        )}
      </div>
      <AnimatePresence>{add && <NewAppt onClose={() => setAdd(false)} onSaved={load} />}</AnimatePresence>
    </Page>
  )
}
