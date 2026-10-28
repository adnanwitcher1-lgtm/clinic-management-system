import { useCallback, useEffect, useState } from 'react'
import { FileSpreadsheet, FileText, Search } from 'lucide-react'
import api, { download, errMsg } from '../../api'
import { Empty, Page, PageHead, Skeleton, useDebounced, useToast } from '../../components/ui'

const TABS = [['patients', 'Patients'], ['visits', 'Visits'], ['inventory', 'Medicine inventory'], ['dispensing', 'Dispensing history'], ['payments', 'Revenue / Payments']]
const monthAgo = () => { const d = new Date(); d.setDate(d.getDate() - 30); return d.toLocaleDateString('en-CA') }

export default function Records() {
  const toast = useToast()
  const [tab, setTab] = useState('patients')
  const [from, setFrom] = useState(monthAgo())
  const [to, setTo] = useState(new Date().toLocaleDateString('en-CA'))
  const [q, setQ] = useState('')
  const [data, setData] = useState(null)
  const dq = useDebounced(q)

  const params = useCallback(() => ({ type: tab, date_from: tab === 'inventory' ? undefined : from, date_to: tab === 'inventory' ? undefined : to, q: dq || undefined }), [tab, from, to, dq])
  useEffect(() => {
    setData(null)
    api.get('/reports/records/', { params: params() }).then((r) => setData(r.data)).catch((e) => toast(errMsg(e), 'error'))
    // eslint-disable-next-line
  }, [params])

  const exp = (fmt) => download('/reports/export/', { ...params(), fmt }, `${tab}.${fmt}`).catch((e) => toast(errMsg(e), 'error'))

  return (
    <Page>
      <PageHead title="Records" sub="Filter by date range and export to Excel or PDF">
        <button className="btn green" onClick={() => exp('xlsx')}><FileSpreadsheet size={16} /> Excel</button>
        <button className="btn red" onClick={() => exp('pdf')}><FileText size={16} /> PDF</button>
      </PageHead>
      <div className="tabs" style={{ marginBottom: 14 }}>{TABS.map(([k, l]) => <button key={k} className={tab === k ? 'on' : ''} onClick={() => setTab(k)}>{l}</button>)}</div>
      <div className="card">
        <div className="row" style={{ marginBottom: 14 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 200 }}><Search size={16} style={{ position: 'absolute', insetInlineStart: 12, top: 13, color: 'var(--muted)' }} /><input style={{ paddingInlineStart: 38 }} placeholder="Search in results…" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {tab !== 'inventory' && <>
            <label className="row small muted">From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ width: 'auto' }} /></label>
            <label className="row small muted">To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ width: 'auto' }} /></label>
          </>}
        </div>
        {!data ? <Skeleton n={5} /> : data.rows.length === 0 ? <Empty text="No records for this filter" /> : (
          <>
            <div className="small muted" style={{ marginBottom: 8 }}>{data.count} record(s){data.count > data.rows.length ? ` — showing first ${data.rows.length}, export for all` : ''}</div>
            <div className="table-wrap" style={{ maxHeight: 560, overflowY: 'auto' }}>
              <table>
                <thead><tr>{data.columns.map((c) => <th key={c}>{c}</th>)}</tr></thead>
                <tbody>{data.rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c === '' || c == null ? '—' : String(c)}</td>)}</tr>)}</tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </Page>
  )
}
