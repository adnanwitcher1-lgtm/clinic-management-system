import { useCallback, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { Activity, CheckCircle2, Clock, PlayCircle, Stethoscope, UserRound, Users } from 'lucide-react'
import api, { errMsg } from '../../api'
import { useAuth } from '../../auth'
import { useLang } from '../../i18n'
import { Empty, Page, Skeleton, StatCard, Status, useToast, usePolling } from '../../components/ui'
import { VitalsRow } from '../../components/PatientHistory'

export default function DoctorQueue() {
  const { user } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const seen = useRef(null)

  const load = useCallback(async () => {
    try {
      const { data } = await api.get('/visits/queue/')
      if (seen.current) data.filter((v) => !seen.current.has(v.id)).forEach((v) => toast(`New patient: token #${v.token_no} · ${v.patient.name}`))
      seen.current = new Set(data.map((v) => v.id))
      setRows(data)
    } catch (e) { if (!rows) setRows([]) }
  }, []) // eslint-disable-line
  usePolling(load, 4000, [])

  const open = async (v) => {
    try { if (v.status === 'waiting') await api.post(`/visits/${v.id}/start/`) } catch (e) { return toast(errMsg(e), 'error') }
    nav(`/doctor/visit/${v.id}`)
  }
  const c = useMemo(() => {
    const r = rows || []
    return { wait: r.filter((v) => v.status === 'waiting').length, now: r.filter((v) => v.status === 'with_doctor').length, done: r.filter((v) => ['medicine_pending', 'completed'].includes(v.status)).length, all: r.length }
  }, [rows])
  const active = (rows || []).filter((v) => ['waiting', 'with_doctor'].includes(v.status))
  const done = (rows || []).filter((v) => ['medicine_pending', 'completed'].includes(v.status))
  const next = active.find((v) => v.status === 'waiting')

  return (
    <Page>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('Welcome Back')}, Dr. {user.full_name}! 👋</h1>
          <div className="page-sub">Let's make today healthier!</div>
        </div>
        {next && <motion.button whileTap={{ scale: 0.96 }} className="btn" onClick={() => open(next)}><PlayCircle size={18} /> Call next · Token #{next.token_no}</motion.button>}
      </div>

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <StatCard icon={Users} color="#2f6bff" label="Today's patients" value={c.all} delay={0} />
        <StatCard icon={Clock} color="#ff9f43" label="Waiting" value={c.wait} delay={1} />
        <StatCard icon={Stethoscope} color="#8e3fc4" label="With me" value={c.now} delay={2} />
        <StatCard icon={CheckCircle2} color="#16c07a" label="Seen" value={c.done} delay={3} />
      </div>

      <div className="card" style={{ marginBottom: 18 }}>
        <h3><Activity size={17} /> Queue — by token <span className="live-dot" style={{ marginInlineStart: 4 }} /></h3>
        {rows === null ? <Skeleton n={3} /> : active.length === 0 ? <Empty text="No patients waiting. Enjoy the calm ☕" icon={UserRound} /> : (
          <div className="stack">
            <AnimatePresence initial={false}>
              {active.map((v) => (
                <motion.div layout key={v.id} initial={{ opacity: 0, y: 14, scale: 0.98 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, x: 40 }} className={`q-card ${v.status === 'with_doctor' ? 'active' : ''}`} onClick={() => open(v)} >
                  <div className="token">{v.token_no}</div>
                  <div className="info">
                    <b>{v.patient.name} <small className="muted">· {v.patient.patient_no} · {v.patient.age}y {v.patient.gender}</small></b>
                    {v.patient.allergies && <div className="small" style={{ color: 'var(--red)' }}>⚠ Allergies: {v.patient.allergies}</div>}
                    <div style={{ marginTop: 4 }}><VitalsRow v={v.vitals} /></div>
                  </div>
                  {v.is_follow_up && <span className="badge b-store">Follow-up</span>}
                  <Status value={v.status} />
                  <button className="btn sm"><PlayCircle size={15} /> {v.status === 'with_doctor' ? 'Continue' : 'Open'}</button>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      {done.length > 0 && (
        <div className="card">
          <h3><CheckCircle2 size={17} /> Seen today</h3>
          <div className="table-wrap"><table>
            <thead><tr><th>Token</th><th>Patient</th><th>Diagnosis</th><th>Status</th><th /></tr></thead>
            <tbody>{done.map((v) => (
              <tr key={v.id} className="clickable" onClick={() => nav(`/doctor/visit/${v.id}`)}>
                <td><b>#{v.token_no}</b></td><td>{v.patient.name}</td><td className="small">{v.diagnosis || '—'}</td><td><Status value={v.status} /></td><td className="right"><span className="btn ghost sm">View</span></td>
              </tr>
            ))}</tbody>
          </table></div>
        </div>
      )}
    </Page>
  )
}
