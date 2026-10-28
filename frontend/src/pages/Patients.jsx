import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { ChevronLeft, ChevronRight, FilePlus2, Search, Users } from 'lucide-react'
import api, { errMsg } from '../api'
import { useAuth } from '../auth'
import { useLang } from '../i18n'
import { Empty, Page, PageHead, Skeleton, useDebounced, useToast } from '../components/ui'
import PatientHistory from '../components/PatientHistory'

export default function Patients() {
  const [sp, setSp] = useSearchParams()
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(sp.get('open') ? Number(sp.get('open')) : null)
  const dq = useDebounced(q)
  const { user } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const toast = useToast()

  useEffect(() => setPage(1), [dq])
  const load = useCallback(() => {
    api.get('/patients/', { params: { q: dq, page } }).then((r) => setData(r.data)).catch((e) => toast(errMsg(e), 'error'))
  }, [dq, page]) // eslint-disable-line
  useEffect(load, [load])

  const close = () => { setOpen(null); if (sp.get('open')) setSp({}, { replace: true }) }
  const pages = data ? Math.max(1, Math.ceil(data.count / 50)) : 1

  return (
    <Page>
      <PageHead title="Patients" sub={data ? `${data.count} records` : ''}>
        {user.role !== 'doctor' && <button className="btn" onClick={() => nav('/reception/new')}><FilePlus2 size={16} /> {t('New Patient')}</button>}
      </PageHead>
      <div className="card">
        <div style={{ position: 'relative', marginBottom: 14 }}>
          <Search size={17} style={{ position: 'absolute', insetInlineStart: 13, top: 13, color: 'var(--muted)' }} />
          <input style={{ paddingInlineStart: 40 }} placeholder="Search by Patient No., name or phone…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {!data ? <Skeleton n={5} /> : data.results.length === 0 ? <Empty text="No patients found" icon={Users} /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Patient No.</th><th>{t('Name')}</th><th>{t('Age')} / {t('Gender')}</th><th>{t('Phone')}</th><th>Blood</th><th>Visits</th><th>Last visit</th></tr></thead>
              <tbody>
                {data.results.map((p, i) => (
                  <motion.tr key={p.id} className="clickable" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 12) * 0.02 }} onClick={() => setOpen(p.id)}>
                    <td><b style={{ color: 'var(--indigo)' }}>{p.patient_no}</b></td>
                    <td><b>{p.name}</b>{p.allergies && <span title={`Allergies: ${p.allergies}`}> ⚠️</span>}</td>
                    <td>{p.age} · {p.gender}</td>
                    <td>{p.phone || '—'}</td>
                    <td>{p.blood_group || '—'}</td>
                    <td>{p.visits_count}</td>
                    <td className="small muted">{p.last_visit || '—'}</td>
                  </motion.tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {data && pages > 1 && (
          <div className="row between" style={{ marginTop: 12 }}>
            <span className="muted small">Page {page} of {pages}</span>
            <div className="row">
              <button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}><ChevronLeft size={15} /></button>
              <button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
      <AnimatePresence>{open && <PatientHistory key={open} patientId={open} onClose={close} />}</AnimatePresence>
    </Page>
  )
}
