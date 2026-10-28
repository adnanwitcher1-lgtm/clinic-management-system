import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import api, { errMsg } from '../api'
import { Field, Modal, useToast } from './ui'

const FORMS = ['Tablet', 'Capsule', 'Syrup', 'Suspension', 'Injection', 'Drops', 'Cream', 'Ointment', 'Gel', 'Lotion', 'Inhaler', 'Sachet', 'Powder']

/**
 * Add a medicine to (or edit one in) the Universal list.
 *  med      existing row to edit (omit to add)
 *  prefill  { name, form } start values when adding
 *  onSaved  (savedMedicine, addToPrescription) => void
 */
export default function UniversalMedModal({ med, prefill, onClose, onSaved, canAddToRx = true }) {
  const toast = useToast()
  const [f, setF] = useState({ name: '', strength: '', form: '', generic_name: '', ...(prefill || {}), ...(med || {}) })
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value })

  const save = async (addNow) => {
    if (!f.name.trim()) return toast('Medicine name is required', 'error')
    setBusy(true)
    try {
      const body = { name: f.name.trim(), strength: f.strength.trim(), form: f.form.trim(), generic_name: f.generic_name.trim() }
      const { data } = med ? await api.patch(`/universal-medicines/${med.id}/`, body) : await api.post('/universal-medicines/', body)
      toast(med ? 'Medicine updated' : 'Medicine added to Universal list')
      onSaved(data, addNow)
    } catch (e) {
      toast(errMsg(e), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal title={med ? 'Edit medicine (Universal list)' : 'Add medicine to Universal list'} onClose={onClose}>
      <div className="stack">
        <div className="form-grid">
          <Field label="Medicine name *" className="span2"><input autoFocus value={f.name} onChange={set('name')} placeholder="e.g. Augmentin" /></Field>
          <Field label="Strength"><input value={f.strength} onChange={set('strength')} placeholder="e.g. 625mg" /></Field>
          <Field label="Form">
            <input list="uni-forms" value={f.form} onChange={set('form')} placeholder="Tablet / Syrup / Injection…" />
            <datalist id="uni-forms">{FORMS.map((x) => <option key={x} value={x} />)}</datalist>
          </Field>
          <Field label="Generic name (optional)" className="span2"><input value={f.generic_name} onChange={set('generic_name')} placeholder="e.g. Amoxicillin + Clavulanic acid" /></Field>
        </div>
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn ghost" onClick={onClose}>Cancel</button>
          <button className="btn" disabled={busy} onClick={() => save(false)}>{busy ? <Loader2 size={16} className="spin" /> : null} Save</button>
          {!med && canAddToRx && <button className="btn green" disabled={busy} onClick={() => save(true)}>Save &amp; add to prescription</button>}
        </div>
      </div>
    </Modal>
  )
}
