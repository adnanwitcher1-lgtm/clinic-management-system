import { Fragment, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Search, ShieldCheck } from 'lucide-react'
import api, { errMsg } from '../../api'
import { Badge, Empty, Page, PageHead, Skeleton, useDebounced, useToast } from '../../components/ui'

const kind = (a) => ({ create: 'paid', update: 'low', delete: 'expired', login: 'store', payment: 'paid', dispense: 'paid', print: 'store' }[a] || 'soon')

export default function Audit() {
  const toast = useToast()
  const [q, setQ] = useState('')
  const [action, setAction] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const dq = useDebounced(q)
  useEffect(() => setPage(1), [dq, action])
  useEffect(() => {
    api.get('/audit-logs/', { params: { q: dq || undefined, action: action || undefined, page } }).then((r) => setData(r.data)).catch((e) => toast(errMsg(e), 'error'))
    // eslint-disable-next-line
  }, [dq, action, page])
  const pages = data ? Math.max(1, Math.ceil(data.count / 50)) : 1

  return (
    <Page>
      <PageHead title="Audit Log" sub="Who changed what, and when" />
      <div className="card">
        <div className="row" style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}><Search size={16} style={{ position: 'absolute', insetInlineStart: 12, top: 13, color: 'var(--muted)' }} /><input style={{ paddingInlineStart: 38 }} placeholder="Search user, record…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <select style={{ width: 'auto' }} value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="">All actions</option>
            {['login', 'create', 'update', 'delete', 'finish', 'dispense', 'payment', 'print', 'whatsapp', 'import', 'backup', 'closing', 'stock'].map((a) => <option key={a}>{a}</option>)}
          </select>
        </div>
        {!data ? <Skeleton n={5} /> : data.results.length === 0 ? <Empty text="No log entries" icon={ShieldCheck} /> : (
          <div className="table-wrap"><table>
            <thead><tr><th>Time</th><th>User</th><th>Action</th><th>Record</th><th>IP</th></tr></thead>
            <tbody>{data.results.map((l, i) => (
              <Fragment key={l.id}>
                <motion.tr className="clickable" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: Math.min(i, 10) * 0.015 }} onClick={() => setOpen(open === l.id ? null : l.id)}>
                  <td className="small">{new Date(l.created_at).toLocaleString()}</td><td><b>{l.username || '—'}</b></td><td><Badge kind={kind(l.action)}>{l.action}</Badge></td><td>{l.model} <span className="muted small">{l.object_repr}</span></td><td className="small muted">{l.ip}</td>
                </motion.tr>
                {open === l.id && <tr><td colSpan={5} style={{ background: 'var(--surface-2)' }}><pre className="small" style={{ margin: 0, whiteSpace: 'pre-wrap' }}>{JSON.stringify(l.changes, null, 2)}</pre></td></tr>}
              </Fragment>
            ))}</tbody>
          </table></div>
        )}
        {data && pages > 1 && <div className="row between" style={{ marginTop: 12 }}><span className="muted small">{data.count} entries · page {page}/{pages}</span><div className="row"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div></div>}
      </div>
    </Page>
  )
}
