import { AnimatePresence, motion } from 'framer-motion'
import { CheckCircle2, Inbox, X, XCircle } from 'lucide-react'
import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'
import { useLang } from '../i18n'

/* ---------- toast ---------- */
const ToastCtx = createContext(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }) {
  const [items, setItems] = useState([])
  const push = useCallback((msg, type = 'ok') => {
    const id = Math.random()
    setItems((s) => [...s, { id, msg, type }])
    setTimeout(() => setItems((s) => s.filter((x) => x.id !== id)), 4200)
  }, [])
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toasts">
        <AnimatePresence>
          {items.map((t) => (
            <motion.div key={t.id} className={`toast ${t.type === 'error' ? 'error' : ''}`} initial={{ opacity: 0, x: 60 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 60 }}>
              {t.type === 'error' ? <XCircle color="#f0455a" size={20} /> : <CheckCircle2 color="#16c07a" size={20} />}
              <span>{t.msg}</span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  )
}

/* ---------- modal ---------- */
export function Modal({ title, onClose, children, wide }) {
  const { t } = useLang()
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [onClose])
  return (
    <motion.div className="overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <motion.div className={`modal ${wide ? 'wide' : ''}`} initial={{ y: 30, scale: 0.96, opacity: 0 }} animate={{ y: 0, scale: 1, opacity: 1 }}>
        <div className="row between" style={{ marginBottom: 14, flexWrap: 'nowrap', gap: 10 }}>
          <h3 style={{ fontSize: 18, minWidth: 0 }}>{t(title)}</h3>
          <button className="btn ghost icon" style={{ flexShrink: 0 }} onClick={onClose}><X size={18} /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  )
}

/* ---------- small pieces ---------- */
export function Field({ label, children, className = '' }) {
  const { t } = useLang()
  return (
    <label className={`field ${className}`}>
      <span>{t(label)}</span>
      {children}
    </label>
  )
}

export function Status({ value }) {
  const { t } = useLang()
  const names = { waiting: 'Waiting', with_doctor: 'With Doctor', medicine_pending: 'Medicine Pending', completed: 'Completed', cancelled: 'Cancelled' }
  return <span className={`badge b-${value}`}>{t(names[value] || value)}</span>
}

export function Badge({ kind, children }) {
  const { t } = useLang()
  return <span className={`badge b-${kind}`}>{typeof children === 'string' ? t(children) : children}</span>
}

export function Empty({ text = 'Nothing here yet', icon: Icon = Inbox }) {
  const { t } = useLang()
  return (
    <div className="empty">
      <Icon size={42} />
      <div>{t(text)}</div>
    </div>
  )
}

export const Skeleton = ({ n = 3 }) => (
  <div className="stack">{Array.from({ length: n }).map((_, i) => <div key={i} className="skeleton" />)}</div>
)

export function PageHead({ title, sub, children }) {
  const { t } = useLang()
  return (
    <div className="page-head">
      <div>
        <h1 className="page-title">{t(title)}</h1>
        {sub && <div className="page-sub">{sub}</div>}
      </div>
      <div className="row">{children}</div>
    </div>
  )
}

export function Page({ children }) {
  return <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }}>{children}</motion.div>
}

export function CountUp({ value, prefix = '' }) {
  const [n, setN] = useState(0)
  const target = Number(value) || 0
  useEffect(() => {
    let raf
    const start = performance.now()
    const tick = (now) => {
      const p = Math.min((now - start) / 700, 1)
      setN(Math.round(target * (1 - Math.pow(1 - p, 3))))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])
  return <>{prefix}{n.toLocaleString()}</>
}

export function StatCard({ icon: Icon, color, label, value, prefix, hint, delay = 0 }) {
  const { t } = useLang()
  return (
    <motion.div className="card hover" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: delay * 0.07 }}>
      <div className="stat">
        <div className="stat-icon" style={{ background: color, color }}>
          <Icon size={26} color="#fff" />
        </div>
        <div>
          <span>{t(label)}</span>
          <b><CountUp value={value} prefix={prefix} /></b>
          {hint && <small className="muted">{hint}</small>}
        </div>
      </div>
    </motion.div>
  )
}

/* debounce hook */
export function useDebounced(value, ms = 250) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms)
    return () => clearTimeout(id)
  }, [value, ms])
  return v
}

/* poll a loader every N seconds (real-time queue) */
export function usePolling(fn, ms = 5000, deps = []) {
  const saved = useRef(fn)
  saved.current = fn
  useEffect(() => {
    let alive = true
    const run = () => alive && document.visibilityState !== 'hidden' && saved.current()
    saved.current()
    const id = setInterval(run, ms)
    return () => {
      alive = false
      clearInterval(id)
    }
    // eslint-disable-next-line
  }, deps)
}
