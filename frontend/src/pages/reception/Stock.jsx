import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence } from 'framer-motion'
import { AlertTriangle, ArrowDownUp, History, PackageX, Pill, Search, Timer } from 'lucide-react'
import api, { errMsg, list } from '../../api'
import { Badge, Empty, Field, Modal, Page, PageHead, Skeleton, StatCard, useDebounced, useToast } from '../../components/ui'

export function StockBadge({ s }) {
  const map = { ok: ['ok', 'In stock'], low: ['low', 'Low stock'], out: ['expired', 'Out of stock'], expiring: ['soon', 'Expiring soon'], expired: ['expired', 'Expired'] }
  const [k, l] = map[s] || map.ok
  return <Badge kind={k}>{l}</Badge>
}

/** Medicine store stock view with adjust + movement history (receptionist). */
export default function Stock() {
  const [rows, setRows] = useState(null)
  const [q, setQ] = useState('')
  const [flt, setFlt] = useState('')
  const [adj, setAdj] = useState(null)
  const [mov, setMov] = useState(null)
  const [cards, setCards] = useState({ low: 0, out: 0, exp: 0, all: 0 })
  const dq = useDebounced(q)
  const toast = useToast()

  const load = useCallback(async () => {
    const p = { q: dq, page_size: 200 }
    if (flt) p.stock = flt
    const { data } = await api.get('/medicines/', { params: p })
    setRows(list(data))
  }, [dq, flt])
  useEffect(() => { load().catch((e) => toast(errMsg(e), 'error')) }, [load]) // eslint-disable-line
  useEffect(() => {
    Promise.all(['low', 'out', 'expiring', ''].map((s) => api.get('/medicines/', { params: { stock: s || undefined, page_size: 1 } }))).then(([a, b, c, d]) => setCards({ low: a.data.count, out: b.data.count, exp: c.data.count, all: d.data.count }))
  }, [rows])

  const save = async (e) => {
    e.preventDefault()
    try {
      await api.post(`/medicines/${adj.m.id}/adjust/`, { delta: adj.delta, reason: adj.reason, note: adj.note })
      toast('Stock updated'); setAdj(null); load()
    } catch (er) { toast(errMsg(er), 'error') }
  }

  return (
    <Page>
      <PageHead title="Medicine Stock" sub="Live store inventory — stock deducts automatically when you dispense">
        <button className="btn ghost" onClick={() => api.get('/medicines/movements/', { params: { page_size: 60 } }).then((r) => setMov(list(r.data)))}><History size={16} /> Stock movements</button>
      </PageHead>
      <div className="grid g4" style={{ marginBottom: 18 }}>
        <StatCard icon={Pill} color="#2f6bff" label="Medicines" value={cards.all} delay={0} />
        <StatCard icon={AlertTriangle} color="#ff9f43" label="Low stock" value={cards.low} delay={1} />
        <StatCard icon={PackageX} color="#f0455a" label="Out of stock" value={cards.out} delay={2} />
        <StatCard icon={Timer} color="#8e3fc4" label="Expiring soon" value={cards.exp} delay={3} />
      </div>
      <div className="card">
        <div className="row between" style={{ marginBottom: 12 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
            <Search size={16} style={{ position: 'absolute', insetInlineStart: 12, top: 13, color: 'var(--muted)' }} />
            <input style={{ paddingInlineStart: 38 }} placeholder="Search medicine…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="tabs">
            {[['', 'All'], ['low', 'Low'], ['out', 'Out'], ['expiring', 'Expiring']].map(([k, l]) => <button key={k} className={flt === k ? 'on' : ''} onClick={() => setFlt(k)}>{l}</button>)}
          </div>
        </div>
        {!rows ? <Skeleton /> : rows.length === 0 ? <Empty text="No medicines found" /> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Medicine</th><th>Form</th><th>Stock</th><th>Price</th><th>Expiry</th><th>Status</th><th /></tr></thead>
              <tbody>
                {rows.map((m) => (
                  <tr key={m.id}>
                    <td><b>{m.name}</b> <span className="muted">{m.strength}</span></td>
                    <td>{m.form}</td>
                    <td><b>{m.stock_qty}</b></td>
                    <td>Rs {Number(m.price)}</td>
                    <td className="small">{m.expiry_date || '—'}</td>
                    <td><StockBadge s={m.status} /></td>
                    <td className="right"><button className="btn ghost sm" onClick={() => setAdj({ m, delta: '', reason: 'adjust', note: '' })}><ArrowDownUp size={14} /> Adjust</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <AnimatePresence>
        {adj && (
          <Modal title={`Adjust stock — ${adj.m.label}`} onClose={() => setAdj(null)}>
            <form className="stack" onSubmit={save}>
              <div className="muted">Current stock: <b>{adj.m.stock_qty}</b>. Use a positive number to add, negative to remove.</div>
              <Field label="Change (+/-)"><input required type="number" autoFocus value={adj.delta} onChange={(e) => setAdj({ ...adj, delta: e.target.value })} /></Field>
              <Field label="Reason">
                <select value={adj.reason} onChange={(e) => setAdj({ ...adj, reason: e.target.value })}>
                  <option value="import">New purchase</option><option value="adjust">Manual correction</option><option value="return">Returned</option><option value="expired">Expired / written off</option>
                </select>
              </Field>
              <Field label="Note"><input value={adj.note} onChange={(e) => setAdj({ ...adj, note: e.target.value })} /></Field>
              <button className="btn">Update stock</button>
            </form>
          </Modal>
        )}
        {mov && (
          <Modal title="Recent stock movements" onClose={() => setMov(null)} wide>
            <div className="table-wrap"><table>
              <thead><tr><th>When</th><th>Medicine</th><th>Change</th><th>Balance</th><th>Reason</th><th>Note</th><th>By</th></tr></thead>
              <tbody>{mov.map((m) => (
                <tr key={m.id}><td className="small">{new Date(m.created_at).toLocaleString()}</td><td>{m.medicine_label}</td><td><b style={{ color: m.qty < 0 ? 'var(--red)' : 'var(--green)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</b></td><td>{m.balance_after}</td><td>{m.reason}</td><td className="small muted">{m.note}</td><td>{m.user}</td></tr>
              ))}</tbody>
            </table></div>
          </Modal>
        )}
      </AnimatePresence>
    </Page>
  )
}
