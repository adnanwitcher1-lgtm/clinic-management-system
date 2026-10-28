import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Database, Download, FileUp, Loader2, Pencil, Plus, Search, Trash2, UploadCloud } from 'lucide-react'
import api, { download, errMsg, list } from '../../api'
import { Badge, Empty, Field, Modal, Page, PageHead, Skeleton, useDebounced, useToast } from '../../components/ui'
import { StockBadge } from '../reception/Stock'

function Uploader({ kind, onDone }) {
  const toast = useToast()
  const ref = useRef()
  const [drag, setDrag] = useState(false)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState('add')
  const [res, setRes] = useState(null)

  const send = async (file) => {
    if (!file) return
    const fd = new FormData()
    fd.append('file', file)
    if (kind === 'store') fd.append('mode', mode)
    if (kind === 'store' && mode === 'replace' && !window.confirm('Replace will deactivate every medicine that is NOT in this file. Continue?')) return
    setBusy(true); setRes(null)
    try {
      const { data } = await api.post(kind === 'store' ? '/medicines/import/' : '/universal-medicines/import/', fd)
      setRes(data); toast('Import finished'); onDone()
    } catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false); if (ref.current) ref.current.value = '' }
  }
  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="row between">
        <h3 style={{ margin: 0 }}><UploadCloud size={18} /> Upload {kind === 'store' ? 'store medicine list' : 'universal medicine list'}</h3>
        {kind === 'store' && <button className="btn ghost sm" onClick={() => download('/medicines/template/', {}, 'store_medicines_template.csv')}><Download size={14} /> Sample CSV</button>}
      </div>
      <motion.div
        className="row" animate={{ borderColor: drag ? 'var(--violet)' : 'var(--line)', background: drag ? 'var(--tint-violet)' : 'var(--surface-2)' }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }} onDragLeave={() => setDrag(false)} onDrop={(e) => { e.preventDefault(); setDrag(false); send(e.dataTransfer.files[0]) }}
        style={{ border: '2px dashed #e7e4f7', borderRadius: 16, padding: 20, margin: '12px 0 0', justifyContent: 'center', textAlign: 'center', gap: 16 }}
      >
        {busy ? <><Loader2 className="spin" /> Reading file…</> : (
          <>
            <FileUp size={30} color="#6a3cc6" />
            <div style={{ textAlign: 'start' }}>
              <b>Drop an Excel (.xlsx), CSV or PDF here</b>
              <div className="small muted">{kind === 'store' ? 'Columns: name, strength, form, stock qty, price (+ expiry, batch, generic)' : 'Columns: name, strength, form, generic name'} — headers are matched loosely. PDF tables are read automatically.</div>
            </div>
            {kind === 'store' && <select value={mode} onChange={(e) => setMode(e.target.value)} style={{ width: 'auto' }}><option value="add">Add / update (adds to stock)</option><option value="replace">Replace whole list</option></select>}
            <button className="btn" onClick={() => ref.current.click()}>Choose file</button>
            <input ref={ref} type="file" hidden accept=".csv,.xlsx,.xlsm,.pdf,.txt" onChange={(e) => send(e.target.files[0])} />
          </>
        )}
      </motion.div>
      {res && (
        <div className="small" style={{ marginTop: 10 }}>
          <b style={{ color: 'var(--green)' }}>✔ Done</b> — {Object.entries(res).filter(([k]) => k !== 'errors').map(([k, v]) => `${k.replace(/_/g, ' ')}: ${v}`).join(' · ')}
          {res.errors?.length > 0 && <details><summary style={{ color: 'var(--red)' }}>{res.errors.length} row(s) skipped</summary><ul>{res.errors.slice(0, 20).map((e, i) => <li key={i}>{String(e)}</li>)}</ul></details>}
        </div>
      )}
    </div>
  )
}

const BLANK = { name: '', generic_name: '', strength: '', form: 'Tablet', stock_qty: 0, price: 0, batch_no: '', expiry_date: '', reorder_level: 10, is_active: true }

export default function Medicines() {
  const toast = useToast()
  const [tab, setTab] = useState('store')
  const [q, setQ] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState(null)
  const [edit, setEdit] = useState(null)
  const dq = useDebounced(q)

  useEffect(() => setPage(1), [dq, tab])
  const load = useCallback(() => {
    const url = tab === 'store' ? '/medicines/' : tab === 'uni' ? '/universal-medicines/' : '/medicines/movements/'
    api.get(url, { params: { q: dq || undefined, page, page_size: 50 } }).then((r) => setData(r.data)).catch((e) => toast(errMsg(e), 'error'))
  }, [tab, dq, page]) // eslint-disable-line
  useEffect(() => { setData(null); load() }, [load])

  const save = async (e) => {
    e.preventDefault()
    const body = { ...edit, expiry_date: edit.expiry_date || null }
    try {
      edit.id ? await api.patch(`/medicines/${edit.id}/`, body) : await api.post('/medicines/', body)
      toast('Saved'); setEdit(null); load()
    } catch (er) { toast(errMsg(er), 'error') }
  }
  const remove = async (m) => {
    if (!window.confirm(`Delete ${m.label}?`)) return
    try { await api.delete(tab === 'store' ? `/medicines/${m.id}/` : `/universal-medicines/${m.id}/`); toast('Deleted'); load() } catch (e) { toast('Cannot delete (used in prescriptions) — mark inactive instead.', 'error') }
  }
  const rows = data?.results || []
  const pages = data ? Math.max(1, Math.ceil(data.count / 50)) : 1
  const f = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <Page>
      <PageHead title="Medicines" sub="Store list (with stock & price) and the universal autocomplete list">
        {tab === 'store' && <button className="btn" onClick={() => setEdit({ ...BLANK })}><Plus size={16} /> Add medicine</button>}
      </PageHead>
      <div className="tabs" style={{ marginBottom: 14 }}>
        <button className={tab === 'store' ? 'on' : ''} onClick={() => setTab('store')}>Store list</button>
        <button className={tab === 'uni' ? 'on' : ''} onClick={() => setTab('uni')}>Universal list</button>
        <button className={tab === 'mov' ? 'on' : ''} onClick={() => setTab('mov')}>Stock movements</button>
      </div>
      {tab !== 'mov' && <Uploader kind={tab === 'uni' ? 'uni' : 'store'} onDone={load} />}
      <div className="card">
        {tab !== 'mov' && <div style={{ position: 'relative', marginBottom: 12 }}><Search size={16} style={{ position: 'absolute', insetInlineStart: 12, top: 13, color: 'var(--muted)' }} /><input style={{ paddingInlineStart: 38 }} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} /></div>}
        {!data ? <Skeleton n={5} /> : rows.length === 0 ? <Empty text="Nothing here — upload a list above" icon={Database} /> : (
          <div className="table-wrap">
            {tab === 'store' && (
              <table>
                <thead><tr><th>Medicine</th><th>Form</th><th>Stock</th><th>Price</th><th>Expiry</th><th>Batch</th><th>Status</th><th /></tr></thead>
                <tbody>{rows.map((m) => (
                  <tr key={m.id} style={{ opacity: m.is_active ? 1 : 0.5 }}>
                    <td><b>{m.name}</b> <span className="muted">{m.strength}</span><div className="small muted">{m.generic_name}</div></td><td>{m.form}</td><td><b>{m.stock_qty}</b></td><td>Rs {Number(m.price)}</td>
                    <td className="small">{m.expiry_date || '—'}</td><td className="small">{m.batch_no || '—'}</td><td><StockBadge s={m.status} /> {!m.is_active && <Badge kind="expired">inactive</Badge>}</td>
                    <td className="right"><div className="row" style={{ gap: 6, justifyContent: 'flex-end' }}><button className="btn ghost sm icon" onClick={() => setEdit({ ...m, expiry_date: m.expiry_date || '' })}><Pencil size={14} /></button><button className="btn ghost sm icon" onClick={() => remove(m)}><Trash2 size={14} color="#f0455a" /></button></div></td>
                  </tr>))}</tbody>
              </table>
            )}
            {tab === 'uni' && (
              <table>
                <thead><tr><th>Name</th><th>Strength</th><th>Form</th><th>Generic</th><th /></tr></thead>
                <tbody>{rows.map((m) => <tr key={m.id}><td><b>{m.name}</b></td><td>{m.strength}</td><td>{m.form}</td><td className="muted">{m.generic_name}</td><td className="right"><button className="btn ghost sm icon" onClick={() => remove(m)}><Trash2 size={14} color="#f0455a" /></button></td></tr>)}</tbody>
              </table>
            )}
            {tab === 'mov' && (
              <table>
                <thead><tr><th>When</th><th>Medicine</th><th>Change</th><th>Balance</th><th>Reason</th><th>Note</th><th>By</th></tr></thead>
                <tbody>{rows.map((m) => <tr key={m.id}><td className="small">{new Date(m.created_at).toLocaleString()}</td><td>{m.medicine_label}</td><td><b style={{ color: m.qty < 0 ? 'var(--red)' : 'var(--green)' }}>{m.qty > 0 ? '+' : ''}{m.qty}</b></td><td>{m.balance_after}</td><td>{m.reason}</td><td className="small muted">{m.note}</td><td>{m.user}</td></tr>)}</tbody>
              </table>
            )}
          </div>
        )}
        {data && pages > 1 && (
          <div className="row between" style={{ marginTop: 12 }}>
            <span className="muted small">{data.count.toLocaleString()} records · page {page}/{pages}</span>
            <div className="row"><button className="btn ghost sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Prev</button><button className="btn ghost sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button></div>
          </div>
        )}
      </div>

      <AnimatePresence>
        {edit && (
          <Modal title={edit.id ? 'Edit medicine' : 'Add medicine'} onClose={() => setEdit(null)}>
            <form className="form-grid" onSubmit={save}>
              <Field label="Name *" className="span2"><input required value={edit.name} onChange={f('name')} /></Field>
              <Field label="Generic name" className="span2"><input value={edit.generic_name} onChange={f('generic_name')} /></Field>
              <Field label="Strength"><input value={edit.strength} onChange={f('strength')} placeholder="500mg" /></Field>
              <Field label="Form"><input value={edit.form} onChange={f('form')} placeholder="Tablet" /></Field>
              <Field label="Stock qty"><input type="number" value={edit.stock_qty} onChange={f('stock_qty')} /></Field>
              <Field label="Price (per unit)"><input type="number" step="0.01" value={edit.price} onChange={f('price')} /></Field>
              <Field label="Expiry date"><input type="date" value={edit.expiry_date} onChange={f('expiry_date')} /></Field>
              <Field label="Batch no."><input value={edit.batch_no} onChange={f('batch_no')} /></Field>
              <Field label="Reorder level"><input type="number" value={edit.reorder_level} onChange={f('reorder_level')} /></Field>
              <label className="row" style={{ alignSelf: 'end', gap: 8 }}><input type="checkbox" checked={edit.is_active} onChange={f('is_active')} /> Active</label>
              <button className="btn span-all">Save medicine</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </Page>
  )
}
