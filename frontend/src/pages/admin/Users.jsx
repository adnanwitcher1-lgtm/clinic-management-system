import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Pencil, Plus, ShieldCheck, Stethoscope, UserCog, UserX } from 'lucide-react'
import api, { errMsg, list } from '../../api'
import { Badge, Field, Modal, Page, PageHead, Skeleton, useToast } from '../../components/ui'

const BLANK = { username: '', first_name: '', last_name: '', email: '', phone: '', role: 'receptionist', specialization: '', qualification: '', consultation_fee: '', counselling_fee: '', is_available: true, is_active: true, password: '' }
const ROLE = { admin: [ShieldCheck, '#f0455a'], doctor: [Stethoscope, '#2f6bff'], receptionist: [UserCog, '#8e3fc4'] }

export default function Users() {
  const toast = useToast()
  const [rows, setRows] = useState(null)
  const [edit, setEdit] = useState(null)
  const load = useCallback(() => api.get('/users/', { params: { page_size: 200 } }).then((r) => setRows(list(r.data))).catch((e) => toast(errMsg(e), 'error')), []) // eslint-disable-line
  useEffect(() => { load() }, [load])

  const save = async (e) => {
    e.preventDefault()
    const body = { ...edit, consultation_fee: edit.consultation_fee === '' || edit.role !== 'doctor' ? null : edit.consultation_fee, counselling_fee: edit.counselling_fee === '' || edit.role !== 'doctor' ? null : edit.counselling_fee }
    if (!body.password) delete body.password
    delete body.full_name
    try {
      edit.id ? await api.patch(`/users/${edit.id}/`, body) : await api.post('/users/', body)
      toast('User saved'); setEdit(null); load()
    } catch (er) { toast(errMsg(er), 'error') }
  }
  const deactivate = async (u) => {
    if (!window.confirm(`Deactivate ${u.username}? They will no longer be able to log in.`)) return
    try { await api.delete(`/users/${u.id}/`); toast('User deactivated'); load() } catch (e) { toast(errMsg(e), 'error') }
  }
  const f = (k) => (e) => setEdit({ ...edit, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  return (
    <Page>
      <PageHead title="Users" sub="Receptionists, doctors and admins — role-based permissions apply automatically">
        <button className="btn" onClick={() => setEdit({ ...BLANK })}><Plus size={16} /> Add user</button>
      </PageHead>
      {!rows ? <Skeleton n={4} /> : (
        <div className="grid g3">
          {rows.map((u, i) => {
            const [Icon, col] = ROLE[u.role]
            return (
              <motion.div key={u.id} className="card hover" initial={{ opacity: 0, y: 16 }} animate={{ opacity: u.is_active ? 1 : 0.5, y: 0 }} transition={{ delay: i * 0.04 }}>
                <div className="row" style={{ flexWrap: 'nowrap' }}>
                  <div className="avatar" style={{ width: 48, height: 48, background: col, color: '#fff' }}><Icon size={22} /></div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <b>{u.role === 'doctor' ? 'Dr. ' : ''}{u.full_name}</b>
                    <div className="small muted">@{u.username}</div>
                  </div>
                  <Badge kind={u.is_active ? 'ok' : 'expired'}>{u.is_active ? u.role : 'inactive'}</Badge>
                </div>
                {u.role === 'doctor' && <div className="small" style={{ marginTop: 10 }}>{u.specialization || 'General'} · fee Rs {Number(u.consultation_fee || 0)}{u.counselling_fee != null ? ` · counselling Rs ${Number(u.counselling_fee)}` : ''} · {u.is_available ? <span style={{ color: 'var(--green)' }}>on duty</span> : <span style={{ color: 'var(--red)' }}>off duty</span>}</div>}
                <div className="row" style={{ marginTop: 12, justifyContent: 'flex-end', gap: 6 }}>
                  <button className="btn ghost sm" onClick={() => setEdit({ ...BLANK, ...u, consultation_fee: u.consultation_fee ?? '', counselling_fee: u.counselling_fee ?? '', password: '' })}><Pencil size={14} /> Edit</button>
                  {u.is_active && <button className="btn ghost sm icon" onClick={() => deactivate(u)}><UserX size={14} color="#f0455a" /></button>}
                </div>
              </motion.div>
            )
          })}
        </div>
      )}
      <AnimatePresence>
        {edit && (
          <Modal title={edit.id ? 'Edit user' : 'Add user'} onClose={() => setEdit(null)}>
            <form className="form-grid" onSubmit={save}>
              <Field label="Username *"><input required disabled={!!edit.id} value={edit.username} onChange={f('username')} /></Field>
              <Field label={edit.id ? 'New password (optional)' : 'Password *'}><input type="password" required={!edit.id} minLength={6} value={edit.password} onChange={f('password')} /></Field>
              <Field label="First name"><input value={edit.first_name} onChange={f('first_name')} /></Field>
              <Field label="Last name"><input value={edit.last_name} onChange={f('last_name')} /></Field>
              <Field label="Role"><select value={edit.role} onChange={f('role')}><option value="receptionist">Receptionist</option><option value="doctor">Doctor</option><option value="admin">Admin</option></select></Field>
              <Field label="Phone"><input value={edit.phone} onChange={f('phone')} /></Field>
              {edit.role === 'doctor' && <>
                <Field label="Specialization"><input value={edit.specialization} onChange={f('specialization')} /></Field>
                <Field label="Qualification"><input value={edit.qualification} onChange={f('qualification')} /></Field>
                <Field label="Check-up fee (Rs)"><input type="number" value={edit.consultation_fee} onChange={f('consultation_fee')} /></Field>
                <Field label="Counselling fee (Rs)"><input type="number" placeholder="Same as check-up if empty" value={edit.counselling_fee} onChange={f('counselling_fee')} /></Field>
                <label className="row" style={{ alignSelf: 'end', gap: 8 }}><input type="checkbox" checked={edit.is_available} onChange={f('is_available')} /> On duty (gets new patients)</label>
              </>}
              {edit.id && <label className="row" style={{ gap: 8 }}><input type="checkbox" checked={edit.is_active} onChange={f('is_active')} /> Account active</label>}
              <button className="btn span-all">Save user</button>
            </form>
          </Modal>
        )}
      </AnimatePresence>
    </Page>
  )
}
