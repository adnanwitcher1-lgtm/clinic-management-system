import { useCallback, useEffect, useState } from 'react'
import { Banknote, CheckCircle2, CreditCard, Landmark, Lock, Users, Wallet } from 'lucide-react'
import api, { errMsg, list, money, today } from '../../api'
import { useLang } from '../../i18n'
import { Badge, Empty, Field, Page, PageHead, Skeleton, StatCard, useToast } from '../../components/ui'

/** Daily closing + payments of the day. */
export default function Billing() {
  const { t } = useLang()
  const toast = useToast()
  const [date, setDate] = useState(today())
  const [d, setD] = useState(null)
  const [pays, setPays] = useState([])
  const [counted, setCounted] = useState('')
  const [note, setNote] = useState('')

  const load = useCallback(async () => {
    const [a, b] = await Promise.all([
      api.get('/billing/closing/', { params: { date } }),
      api.get('/payments/', { params: { date_from: date, date_to: date, page_size: 200 } }),
    ])
    setD(a.data); setPays(list(b.data))
    setCounted(a.data.closing?.counted_cash ?? ''); setNote(a.data.closing?.note ?? '')
  }, [date])
  useEffect(() => { load().catch((e) => toast(errMsg(e), 'error')) }, [load]) // eslint-disable-line

  const close = async () => {
    if (!window.confirm(`Close the day ${date}? Totals will be saved.`)) return
    try { await api.post('/billing/closing/', { date, counted_cash: counted, note }); toast('Day closed ✔'); load() } catch (e) { toast(errMsg(e), 'error') }
  }
  const diff = d && counted !== '' ? Number(counted) - Number(d.cash_total) : null

  return (
    <Page>
      <PageHead title="Daily Closing" sub="Reconcile cash, card and online payments">
        <input type="date" value={date} onChange={(e) => setDate(e.target.value)} style={{ width: 'auto' }} />
      </PageHead>
      {!d ? <Skeleton n={3} /> : (
        <>
          <div className="grid g4" style={{ marginBottom: 18 }}>
            <StatCard icon={Wallet} color="#2f6bff" label="Total revenue" value={d.total_revenue} prefix="Rs " delay={0} />
            <StatCard icon={Banknote} color="#16c07a" label="Cash" value={d.cash_total} prefix="Rs " delay={1} />
            <StatCard icon={CreditCard} color="#8e3fc4" label="Card" value={d.card_total} prefix="Rs " delay={2} />
            <StatCard icon={Landmark} color="#ff9f43" label="Online" value={d.online_total} prefix="Rs " delay={3} />
          </div>
          <div className="grid split-2b" style={{ alignItems: 'start' }}>
            <div className="card">
              <h3><Banknote size={17} /> Payments · {d.payments_count}</h3>
              {pays.length === 0 ? <Empty text="No payments on this day" /> : (
                <div className="table-wrap"><table>
                  <thead><tr><th>Time</th><th>Token</th><th>Patient</th><th>Method</th><th className="right">Amount</th></tr></thead>
                  <tbody>{pays.map((p) => (
                    <tr key={p.id}><td className="small">{new Date(p.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td><td>#{p.token_no}</td><td>{p.patient_name} <span className="muted small">{p.patient_no}</span></td><td><Badge kind="store">{p.method}</Badge></td><td className="right"><b>{money(p.amount)}</b></td></tr>
                  ))}</tbody>
                </table></div>
              )}
            </div>
            <div className="stack">
              <div className="card">
                <h3><Lock size={17} /> Close the day</h3>
                <div className="stack">
                  <div className="row between small"><span className="muted"><Users size={13} /> Patients seen</span><b>{d.patients_count}</b></div>
                  <div className="row between small"><span className="muted">Still pending</span><b style={{ color: d.pending_visits ? 'var(--red)' : 'inherit' }}>{d.pending_visits}</b></div>
                  <Field label="Cash counted in drawer"><input type="number" value={counted} onChange={(e) => setCounted(e.target.value)} /></Field>
                  {diff !== null && <div className="small" style={{ color: diff === 0 ? 'var(--green)' : 'var(--red)' }}>{diff === 0 ? 'Cash matches ✔' : `Difference: ${diff > 0 ? '+' : ''}${money(diff)}`}</div>}
                  <Field label="Note"><input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
                  <button className="btn" onClick={close}><CheckCircle2 size={17} /> {d.closed ? 'Update closing' : 'Close day'}</button>
                  {d.closed && <div className="small muted">Closed by {d.closing.closed_by} at {new Date(d.closing.closed_at).toLocaleString()}</div>}
                </div>
              </div>
              {d.history?.length > 0 && (
                <div className="card">
                  <h3>Recent closings</h3>
                  <table><tbody>{d.history.slice(0, 7).map((h) => <tr key={h.date}><td>{h.date}</td><td className="small muted">{h.patients_count} pts</td><td className="right"><b>{money(h.total_revenue)}</b></td></tr>)}</tbody></table>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </Page>
  )
}
