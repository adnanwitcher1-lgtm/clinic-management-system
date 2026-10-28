import { useState } from 'react'
import { FileText, Loader2, MessageCircle, Printer, Receipt, UserSquare2, ShoppingBag, Pill } from 'lucide-react'
import api, { errMsg, openPdf } from '../api'
import { useLang } from '../i18n'
import { useToast } from './ui'

/**
 * Print / PDF / WhatsApp buttons for one prescription.
 *  inside  = clinic-store medicines + injections   (A4 "Inside Rx" and 80mm "Inside receipt" with the bill)
 *  outside = medicines the patient buys elsewhere  (A4 "Outside Rx" and 80mm "Outside slip")
 */
export default function RxActions({ rxId, hasInside = true, hasOutside = true, phone, size = 'sm', only }) {
  const toast = useToast()
  const { t } = useLang()
  const [busy, setBusy] = useState('')

  const pdf = async (layout) => {
    setBusy(layout)
    try {
      await openPdf(`/prescriptions/${rxId}/pdf/`, { layout })
    } catch (e) {
      toast(errMsg(e), 'error')
    } finally {
      setBusy('')
    }
  }
  const wa = async () => {
    setBusy('wa')
    const win = window.open('', '_blank')
    try {
      const { data } = await api.post(`/prescriptions/${rxId}/whatsapp/`, { layout: 'patient', phone })
      if (data.queued) {
        win?.close()
        toast(`WhatsApp message with PDF queued for +${data.phone}`)
      } else if (win) {
        win.location.href = data.wa_link
        toast('Opening WhatsApp… (API not configured, using wa.me link)')
      }
    } catch (e) {
      win?.close()
      toast(errMsg(e), 'error')
    } finally {
      setBusy('')
    }
  }

  const btn = (key, label, Icon, fn, cls = 'ghost') => (
    <button key={key} className={`btn ${cls} ${size}`} disabled={!!busy} onClick={fn}>
      {busy === key ? <Loader2 size={15} className="spin" /> : <Icon size={15} />} {label}
    </button>
  )
  const all = [
    ['inside', hasInside && btn('inside', 'Inside Rx', Pill, () => pdf('inside'))],
    ['thermal', hasInside && btn('thermal', 'Inside receipt', Receipt, () => pdf('thermal'))],
    ['outside', hasOutside && btn('outside', 'Outside Rx', ShoppingBag, () => pdf('outside'))],
    ['outside_thermal', hasOutside && btn('outside_thermal', 'Outside slip', ShoppingBag, () => pdf('outside_thermal'))],
    ['a4', btn('a4', 'Full A4', Printer, () => pdf('a4'))],
    ['patient', btn('patient', t('Patient Copy'), UserSquare2, () => pdf('patient'))],
    ['wa', !!String(phone || '').replace(/\D/g, '') && btn('wa', 'WhatsApp', MessageCircle, wa, 'green')],
  ]
  return <div className="row" style={{ gap: 8 }}>{all.filter(([k, b]) => b && (!only || only.includes(k))).map(([, b]) => b)}</div>
}

export { FileText }
