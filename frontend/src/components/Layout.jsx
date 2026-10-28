import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import {
  Activity, CalendarCheck, ChevronDown, ClipboardList, FileBarChart, HeartPulse, Languages, LayoutDashboard, LogOut, Menu,
  Pill, Receipt, Search, Settings as Cog, ShieldCheck, Stethoscope, UserPlus, Users, UsersRound, Package,
} from 'lucide-react'
import { useAuth } from '../auth'
import { useLang } from '../i18n'
import api from '../api'
import { useDebounced, usePolling } from './ui'
import ThemeToggle from './ThemeToggle'

const NAV = {
  receptionist: [
    ['/reception', 'Dashboard', LayoutDashboard, true],
    ['/reception/new', 'New Patient', UserPlus],
    ['/reception/patients', 'Patients', Users],
    ['/reception/appointments', 'Appointments', CalendarCheck],
    ['/reception/stock', 'Medicine Stock', Package],
    ['/reception/billing', 'Billing', Receipt],
  ],
  doctor: [
    ['/doctor', 'My Queue', Stethoscope, true],
    ['/doctor/patients', 'Patients', Users],
    ['/doctor/appointments', 'Follow-ups', CalendarCheck],
  ],
  admin: [
    ['/admin', 'Dashboard', LayoutDashboard, true],
    ['/admin/records', 'Records', ClipboardList],
    ['/admin/medicines', 'Medicines', Pill],
    ['/admin/users', 'Users', UsersRound],
    ['/admin/settings', 'Settings', Cog],
    ['/admin/audit', 'Audit Log', ShieldCheck],
    ['/reception', 'Reception View', Activity],
    ['/reception/billing', 'Billing', Receipt],
    ['/reception/patients', 'Patients', Users],
  ],
}

function GlobalSearch() {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const dq = useDebounced(q, 250)
  const nav = useNavigate()
  const { user } = useAuth()
  const { t } = useLang()
  const box = useRef()
  const base = user.role === 'doctor' ? '/doctor' : '/reception'

  useEffect(() => {
    if (dq.trim().length < 2) return setRes(null)
    api.get('/search/', { params: { q: dq } }).then((r) => setRes(r.data)).catch(() => {})
  }, [dq])
  useEffect(() => {
    const h = (e) => box.current && !box.current.contains(e.target) && setRes(null)
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const go = (p) => {
    setRes(null)
    setQ('')
    nav(`${base}/patients?open=${p.id}`)
  }
  const empty = res && !res.patients.length && !res.medicines.length
  return (
    <div className="search" ref={box}>
      <Search size={18} />
      <input placeholder={t('Search patients (No., name, phone) or medicines…')} value={q} onChange={(e) => setQ(e.target.value)} />
      <AnimatePresence>
        {res && (
          <motion.div className="search-results" initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {res.patients.map((p) => (
              <button key={p.id} onClick={() => go(p)}>
                <span className="avatar" style={{ width: 32, height: 32 }}>{p.name[0]}</span>
                <span>
                  <b>{p.name}</b>
                  <br />
                  <small className="muted">{p.patient_no}{p.phone ? ` · ${p.phone}` : ''} · {p.age}y</small>
                </span>
              </button>
            ))}
            {res.medicines.map((m) => (
              <button key={'m' + m.id} onClick={() => setRes(null)}>
                <Pill size={18} color="#8e3fc4" />
                <span>
                  <b>{m.label}</b>
                  <br />
                  <small className="muted">Stock {m.stock_qty} · Rs {m.price}</small>
                </span>
              </button>
            ))}
            {empty && <div className="empty small">No matches</div>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function Layout({ children }) {
  const { user, logout } = useAuth()
  const { lang, setLang, t } = useLang()
  const [open, setOpen] = useState(false)
  const [badge, setBadge] = useState({})
  const loc = useLocation()
  const nav = useNavigate()
  const items = NAV[user.role] || []
  const today = new Date().toLocaleDateString(lang === 'ur' ? 'ur-PK' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' })

  useEffect(() => setOpen(false), [loc.pathname])

  // live counters on the nav (queue sizes)
  usePolling(async () => {
    if (user.role === 'admin') return
    try {
      const { data } = await api.get('/visits/queue/')
      const c = (s) => data.filter((v) => s.includes(v.status)).length
      setBadge(user.role === 'doctor' ? { '/doctor': c(['waiting', 'with_doctor']) } : { '/reception': c(['medicine_pending']) })
    } catch {}
  }, 8000)

  const toggleLang = () => {
    const n = lang === 'en' ? 'ur' : 'en'
    setLang(n)
    api.patch('/auth/me/', { language: n }).catch(() => {})
  }

  return (
    <div className="shell">
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <div className="brand-logo"><HeartPulse size={26} color="#fff" /></div>
          <div>
            <b>Al-Rehman Clinic</b>
            <small>Health Today, Better Tomorrow</small>
          </div>
        </div>
        <nav className="nav">
          {items.map(([to, label, Icon, end]) => (
            <NavLink key={to + label} to={to} end={end}>
              <Icon size={19} />
              {t(label)}
              {!!badge[to] && <span className="badge-count">{badge[to]}</span>}
            </NavLink>
          ))}
        </nav>
        <div className="side-user">
          <div className="avatar">{(user.full_name || user.username)[0].toUpperCase()}</div>
          <div>
            <b>{user.role === 'doctor' ? 'Dr. ' : ''}{user.full_name}</b>
            <small>{user.role}</small>
          </div>
          <button className="icon-btn" title={t('Logout')} onClick={() => { logout(); nav('/login') }}><LogOut size={16} /></button>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <button className="menu-btn" onClick={() => setOpen(true)}><Menu size={20} /></button>
          <GlobalSearch />
          <div className="top-actions">
            <span className="pill hide-sm"><span className="live-dot" /> {t('Live')} · {today}</span>
            <ThemeToggle />
            <button className="pill" onClick={toggleLang} style={{ border: 0, cursor: 'pointer', color: 'var(--indigo)', fontWeight: 600 }}>
              <Languages size={15} /> {lang === 'en' ? 'اردو' : 'English'}
            </button>
          </div>
        </div>
        {children}
      </main>
    </div>
  )
}
