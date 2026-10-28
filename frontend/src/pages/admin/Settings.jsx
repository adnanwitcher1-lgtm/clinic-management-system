import { useCallback, useEffect, useState } from 'react'
import { Building2, DatabaseBackup, Download, Eye, EyeOff, ListChecks, Loader2, MessageCircle, Plus, Save, Trash2 } from 'lucide-react'
import api, { download, errMsg, list } from '../../api'
import { Badge, Field, Page, PageHead, Skeleton, useToast } from '../../components/ui'

function ClinicForm() {
  const toast = useToast()
  const [s, setS] = useState(null)
  const [token, setToken] = useState('')
  const [show, setShow] = useState(false)
  useEffect(() => { api.get('/settings/').then((r) => setS(r.data)) }, [])
  if (!s) return <Skeleton n={2} />
  const f = (k) => (e) => setS({ ...s, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  const save = async (e) => {
    e.preventDefault()
    try { const { data } = await api.put('/settings/', { ...s, whatsapp_token: token }); setS(data); setToken(''); toast('Settings saved') } catch (er) { toast(errMsg(er), 'error') }
  }
  return (
    <form className="grid g2" onSubmit={save} style={{ alignItems: 'start' }}>
      <div className="card">
        <h3><Building2 size={17} /> Clinic details <small className="muted">(shown on every PDF)</small></h3>
        <div className="form-grid">
          <Field label="Clinic name" className="span2"><input value={s.clinic_name} onChange={f('clinic_name')} /></Field>
          <Field label="Tagline" className="span2"><input value={s.tagline} onChange={f('tagline')} /></Field>
          <Field label="Address" className="span2"><input value={s.address} onChange={f('address')} /></Field>
          <Field label="Phone"><input value={s.phone} onChange={f('phone')} /></Field>
          <Field label="Email"><input value={s.email} onChange={f('email')} /></Field>
          <Field label="Currency label"><input value={s.currency} onChange={f('currency')} /></Field>
          <Field label="Default consultation fee"><input type="number" value={s.default_consultation_fee} onChange={f('default_consultation_fee')} /></Field>
          <Field label="Low-stock threshold"><input type="number" value={s.low_stock_threshold} onChange={f('low_stock_threshold')} /></Field>
          <Field label="Expiry alert (days before)"><input type="number" value={s.expiry_alert_days} onChange={f('expiry_alert_days')} /></Field>
        </div>
      </div>
      <div className="stack">
        <div className="card">
          <h3><MessageCircle size={17} color="#16c07a" /> WhatsApp Cloud API <Badge kind={s.whatsapp_configured ? 'paid' : 'partial'}>{s.whatsapp_configured ? 'Connected' : 'Using wa.me link fallback'}</Badge></h3>
          <div className="stack">
            <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={s.whatsapp_enabled} onChange={f('whatsapp_enabled')} /> Enable automatic sending (PDF as document)</label>
            <Field label="Country code (for 03XX numbers)"><input value={s.country_code} onChange={f('country_code')} /></Field>
            <Field label="Phone number ID"><input value={s.whatsapp_phone_number_id || ''} onChange={f('whatsapp_phone_number_id')} /></Field>
            <Field label="Permanent access token (leave blank to keep current)">
              <div style={{ position: 'relative' }}><input type={show ? 'text' : 'password'} value={token} onChange={(e) => setToken(e.target.value)} placeholder="••••••••" /><button type="button" onClick={() => setShow(!show)} style={{ position: 'absolute', insetInlineEnd: 8, top: 8, border: 0, background: 'none' }}>{show ? <EyeOff size={17} /> : <Eye size={17} />}</button></div>
            </Field>
            <div className="small muted">Without API credentials the “WhatsApp” button opens a ready-to-send wa.me chat with the patient.</div>
          </div>
        </div>
        <button className="btn" style={{ height: 46 }}><Save size={17} /> Save settings</button>
      </div>
    </form>
  )
}

function Symptoms() {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [n, setN] = useState({ name: '', name_ur: '', value_type: '' })
  const load = useCallback(() => api.get('/symptoms/').then((r) => setRows(list(r.data))), [])
  useEffect(() => { load() }, [load])
  const add = async (e) => {
    e.preventDefault()
    try { await api.post('/symptoms/', { ...n, order: (rows?.length || 0) * 10 + 100 }); setN({ name: '', name_ur: '', value_type: '' }); load() } catch (er) { toast(errMsg(er), 'error') }
  }
  const patch = async (s, d) => { try { await api.patch(`/symptoms/${s.id}/`, d); load() } catch (er) { toast(errMsg(er), 'error') } }
  const del = async (s) => { try { await api.delete(`/symptoms/${s.id}/`); load() } catch { toast('In use — deactivated instead'); patch(s, { is_active: false }) } }
  return (
    <div className="card">
      <h3><ListChecks size={17} /> Symptom checklist <small className="muted">shown to the doctor as tick marks</small></h3>
      <form className="row" onSubmit={add} style={{ marginBottom: 12, alignItems: 'flex-end' }}>
        <Field label="Name"><input required value={n.name} onChange={(e) => setN({ ...n, name: e.target.value })} /></Field>
        <Field label="Urdu name"><input value={n.name_ur} onChange={(e) => setN({ ...n, name_ur: e.target.value })} /></Field>
        <Field label="Asks for value"><select value={n.value_type} onChange={(e) => setN({ ...n, value_type: e.target.value })}><option value="">Tick only</option><option value="bp">BP value</option><option value="sugar">Sugar value</option><option value="text">Free text</option></select></Field>
        <button className="btn"><Plus size={16} /> Add</button>
      </form>
      {!rows ? <Skeleton /> : <div className="row" style={{ gap: 8 }}>
        {rows.map((s) => (
          <span key={s.id} className="chip" style={{ opacity: s.is_active ? 1 : 0.45 }}>
            <span onClick={() => patch(s, { is_active: !s.is_active })} title="Click to show/hide">{s.name}{s.name_ur ? ` · ${s.name_ur}` : ''}{s.value_type ? ` (${s.value_type})` : ''}</span>
            <Trash2 size={13} color="#f0455a" onClick={() => del(s)} />
          </span>
        ))}
      </div>}
    </div>
  )
}

function Backups() {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => api.get('/backups/').then((r) => setRows(r.data)), [])
  useEffect(() => { load() }, [load])
  const make = async () => { setBusy(true); try { const { data } = await api.post('/backups/'); setRows(data); toast('Backup created') } catch (e) { toast(errMsg(e), 'error') } finally { setBusy(false) } }
  return (
    <div className="card">
      <div className="row between"><h3 style={{ margin: 0 }}><DatabaseBackup size={17} /> Backups <small className="muted">automatic nightly at 2am via Celery beat</small></h3><button className="btn" disabled={busy} onClick={make}>{busy ? <Loader2 className="spin" size={16} /> : <DatabaseBackup size={16} />} Backup now</button></div>
      {!rows ? <Skeleton /> : rows.length === 0 ? <div className="muted" style={{ padding: 16 }}>No backups yet.</div> : (
        <table style={{ marginTop: 10 }}><tbody>{rows.map((b) => (
          <tr key={b.name}><td><b>{b.name}</b></td><td className="muted small">{(b.size / 1024).toFixed(0)} KB</td><td className="small">{new Date(b.modified * 1000).toLocaleString()}</td>
            <td className="right"><button className="btn ghost sm" onClick={() => download('/backups/', { download: b.name }, b.name)}><Download size={14} /> Download</button></td></tr>
        ))}</tbody></table>
      )}
    </div>
  )
}

export default function Settings() {
  return (
    <Page>
      <PageHead title="Settings" sub="Clinic profile, WhatsApp, symptoms and backups" />
      <div className="stack" style={{ gap: 18 }}><ClinicForm /><Symptoms /><Backups /></div>
    </Page>
  )
}
