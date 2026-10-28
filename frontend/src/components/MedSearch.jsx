import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Plus, Search, ShoppingBag, Store } from 'lucide-react'
import api from '../api'
import { Badge, useDebounced } from './ui'

/**
 * Medicine search: clinic store first, then the Universal list, then "add as typed".
 *  params          extra query params for both searches (e.g. { inj: 1 } = injections only)
 *  onSaveUniversal optional (name) => open the "add to Universal list" form
 */
export default function MedSearch({ onAdd, locked, params = {}, placeholder = 'Search medicine — type name, click to add…', onSaveUniversal, version = 0 }) {
  const [q, setQ] = useState('')
  const [store, setStore] = useState([])
  const [uni, setUni] = useState([])
  const [open, setOpen] = useState(false)
  const dq = useDebounced(q, 200)
  const box = useRef()
  const pKey = JSON.stringify(params)
  useEffect(() => {
    if (!dq.trim()) { setStore([]); setUni([]); return }
    api.get('/medicines/search/', { params: { q: dq, ...params } }).then((r) => setStore(r.data))
    api.get('/universal-medicines/search/', { params: { q: dq, ...params } }).then((r) => setUni(r.data))
    // eslint-disable-next-line
  }, [dq, pKey, version])
  useEffect(() => {
    const h = (e) => box.current && !box.current.contains(e.target) && setOpen(false)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])
  const add = (m, src) => { onAdd(m, src); setQ(''); setOpen(false) }
  const typed = q.trim()
  const key = (e) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (store[0]) add(store[0], 'store')
    else if (uni[0]) add(uni[0], 'outside')
    else if (typed) add({ name: typed }, 'outside')
  }
  return (
    <div className="suggest" ref={box}>
      <div style={{ position: 'relative' }}>
        <Search size={16} style={{ position: 'absolute', insetInlineStart: 12, top: 13, color: 'var(--muted)' }} />
        <input disabled={locked} style={{ paddingInlineStart: 38 }} placeholder={placeholder} value={q} onChange={(e) => { setQ(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={key} />
      </div>
      <AnimatePresence>
        {open && typed && (
          <motion.div className="suggest-list" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {store.length > 0 && <div className="suggest-head g"><Store size={13} /> Available in store</div>}
            {store.map((m) => (
              <button type="button" key={'s' + m.id} onClick={() => add(m, 'store')}>
                <span><b>{m.name}</b> <span className="muted">{m.strength} {m.form}</span></span>
                <span className="small"><Badge kind={m.stock_qty <= 0 ? 'expired' : m.is_low ? 'low' : 'ok'}>{m.stock_qty} left</Badge> Rs {Number(m.price)}</span>
              </button>
            ))}
            {uni.length > 0 && <div className="suggest-head o"><ShoppingBag size={13} /> Not in store · Universal list (write from outside)</div>}
            {uni.map((m) => (
              <button type="button" key={'u' + m.id} onClick={() => add(m, 'outside')}>
                <span><b>{m.name}</b> <span className="muted">{m.strength} {m.form}</span></span>
                <span className="small muted">{m.generic_name}</span>
              </button>
            ))}
            <button type="button" onClick={() => add({ name: typed }, 'outside')}><span><Plus size={14} /> Add “<b>{typed}</b>” as outside medicine</span></button>
            {onSaveUniversal && <button type="button" onClick={() => { setOpen(false); onSaveUniversal(typed) }}><span><Plus size={14} /> Save “<b>{typed}</b>” to the Universal list…</span></button>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
