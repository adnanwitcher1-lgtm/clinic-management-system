import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Droplets, FilePlus2, HeartPulse, Phone, ShieldAlert, Stethoscope, Thermometer, Weight } from 'lucide-react'
import api, { errMsg, list, money } from '../api'
import { useAuth } from '../auth'
import { Badge, Empty, Modal, Skeleton, Status, useToast } from './ui'
import RxActions from './RxActions'

export function VitalsRow({ v }) {
  if (!v) return null
  const items = [
    v.bp && ['BP', v.bp],
    v.sugar && ['Sugar', `${Number(v.sugar)} ${v.sugar_type ? `(${v.sugar_type})` : ''}`],
    v.weight && ['Wt', `${Number(v.weight)} kg`],
    v.temperature && ['Temp', `${Number(v.temperature)}°F`],
    v.pulse && ['Pulse', v.pulse],
  ].filter(Boolean)
  return <>{items.map(([k, val]) => <span className="vit-chip" key={k}><b style={{ marginInlineEnd: 4 }}>{k}</b>{val}</span>)}</>
}

export function RxItems({ rx }) {
  if (!rx?.items?.length && !rx?.injections?.length) return <div className="muted small">No medicines prescribed</div>
  const g = (s) => (rx.items || []).filter((i) => i.source === s)
  const Row = ({ i }) => (
    <li style={{ marginBottom: 3 }}>
      <b>{i.label}</b> <span className="muted">— {[i.dose, i.frequency, i.duration, i.instructions].filter(Boolean).join(' · ')}</span>
    </li>
  )
  return (
    <div className="stack" style={{ gap: 8 }}>
      {g('store').length > 0 && (
        <div><Badge kind="store">Available in store</Badge><ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{g('store').map((i) => <Row key={i.id} i={i} />)}</ul></div>
      )}
      {g('outside').length > 0 && (
        <div><Badge kind="outside">Write from outside</Badge><ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>{g('outside').map((i) => <Row key={i.id} i={i} />)}</ul></div>
      )}
      {rx.injections?.length > 0 && (
        <div>
          <Badge kind="inj">Injections</Badge>
          <ul style={{ margin: '6px 0 0', paddingInlineStart: 18 }}>
            {rx.injections.map((inj) => (
              <li key={inj.id} style={{ marginBottom: 3 }}>
                <b>{inj.is_mix ? 'MIX' : 'Inj'} ({inj.route})</b> {inj.components.map((c) => `${c.label}${c.amount ? ` ${c.amount}` : ''}${c.source === 'outside' ? ' [outside]' : ''}`).join(' + ')}
                <span className="muted"> — {[inj.diluent && `in ${inj.diluent}`, inj.frequency, inj.duration].filter(Boolean).join(' · ')}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {rx.advice && <div className="small"><b>Advice:</b> {rx.advice}</div>}
    </div>
  )
}

/** Full patient history with reprint of every old prescription. */
export default function PatientHistory({ patientId, onClose }) {
  const [patient, setPatient] = useState(null)
  const [visits, setVisits] = useState(null)
  const { user } = useAuth()
  const toast = useToast()
  const nav = useNavigate()

  useEffect(() => {
    Promise.all([api.get(`/patients/${patientId}/`), api.get(`/patients/${patientId}/history/`)])
      .then(([p, h]) => { setPatient(p.data); setVisits(list(h.data)) })
      .catch((e) => { toast(errMsg(e), 'error'); onClose() })
    // eslint-disable-next-line
  }, [patientId])

  return (
    <Modal title="Patient history" onClose={onClose} wide>
      {!patient || !visits ? (
        <Skeleton n={3} />
      ) : (
        <div className="stack">
          <div className="card hero-card" style={{ boxShadow: 'none' }}>
            <div className="avatar" style={{ width: 54, height: 54, fontSize: 22, background: 'var(--grad)', color: '#fff' }}>{patient.name[0]}</div>
            <div style={{ flex: 1, position: 'relative', zIndex: 1 }}>
              <h3 style={{ margin: 0, fontSize: 19 }}>{patient.name} <small className="muted">· {patient.patient_no}</small></h3>
              <div className="row small muted" style={{ gap: 14, marginTop: 4 }}>
                <span>{patient.age} yrs · {patient.gender}</span>
                {patient.phone && <span><Phone size={12} /> {patient.phone}</span>}
                {patient.blood_group && <span><Droplets size={12} /> {patient.blood_group}</span>}
                {patient.address && <span>{patient.address}</span>}
              </div>
              {patient.allergies && <div className="small" style={{ color: 'var(--red)', marginTop: 4 }}><ShieldAlert size={13} /> Allergies: {patient.allergies}</div>}
              {patient.medical_history && <div className="small" style={{ marginTop: 2 }}><HeartPulse size={13} /> History: {patient.medical_history}</div>}
            </div>
            {user.role !== 'doctor' && (
              <button className="btn" style={{ position: 'relative', zIndex: 1 }} onClick={() => nav(`/reception/new?patient=${patient.id}`)}>
                <FilePlus2 size={16} /> New visit
              </button>
            )}
          </div>

          {visits.length === 0 ? (
            <Empty text="No visits yet" />
          ) : (
            <div className="timeline">
              {visits.map((v) => (
                <div className="tl-item" key={v.id}>
                  <div className="row between">
                    <b>{v.visit_date} · Token #{v.token_no}</b>
                    <Status value={v.status} />
                  </div>
                  <div className="small muted" style={{ margin: '3px 0 6px' }}><Stethoscope size={12} /> Dr. {v.doctor_name}{v.is_follow_up ? ' · follow-up' : ''}</div>
                  <div className="row" style={{ gap: 4, marginBottom: 6 }}><VitalsRow v={v.vitals} /></div>
                  {v.complaints && <div className="small"><b>Complaints:</b> {v.complaints}</div>}
                  {v.diagnosis && <div className="small"><b>Diagnosis:</b> {v.diagnosis}</div>}
                  {v.notes && <div className="small muted">{v.notes}</div>}
                  {v.prescription && <div style={{ marginTop: 8 }}><RxItems rx={v.prescription} /></div>}
                  <div className="row between" style={{ marginTop: 10 }}>
                    <span className="small muted">Billed {money(v.total_due)} · Paid {money(v.paid_amount)} <Badge kind={v.payment_status}>{v.payment_status}</Badge></span>
                    {v.prescription_id && (
                      <RxActions rxId={v.prescription_id} phone={patient.phone} hasInside={v.store_items + v.injection_count > 0} hasOutside={v.outside_items > 0 || (v.prescription?.injections || []).some((i) => i.components.some((c) => c.source === 'outside'))} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </Modal>
  )
}
