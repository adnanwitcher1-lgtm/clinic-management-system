import { useState } from 'react'
import ThemeToggle from '../components/ThemeToggle'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { CalendarClock, FileText, HeartPulse, Loader2, LockKeyhole, MessageCircle, UserRound } from 'lucide-react'
import { errMsg } from '../api'
import { homeFor, useAuth } from '../auth'
import { useLang } from '../i18n'
import { useToast } from '../components/ui'

export default function Login() {
  const { login } = useAuth()
  const { t } = useLang()
  const toast = useToast()
  const nav = useNavigate()
  const [f, setF] = useState({ username: '', password: '' })
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    try {
      const u = await login(f.username.trim(), f.password)
      nav(homeFor(u.role), { replace: true })
    } catch (err) {
      toast(err?.response?.status === 401 ? 'Wrong username or password' : errMsg(err), 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="login-wrap">
      <ThemeToggle floating />
      <div className="login-art">
        <div className="blob" style={{ width: 280, height: 280, top: -80, right: -60 }} />
        <div className="blob" style={{ width: 180, height: 180, bottom: 60, left: -50, animationDelay: '-3s' }} />
        <div className="blob" style={{ width: 90, height: 90, bottom: 220, right: 90, animationDelay: '-6s' }} />
        <motion.div initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="brand-logo" style={{ width: 70, height: 70, borderRadius: 22, position: 'relative' }}>
          <HeartPulse size={40} color="#fff" />
        </motion.div>
        <motion.h1 initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ delay: 0.1 }}>Al-Rehman Clinic<br />Management System</motion.h1>
        <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.25 }}>Health Today, Better Tomorrow. Tokens, prescriptions, pharmacy and billing — all in one place.</motion.p>
        {[[CalendarClock, 'Live patient queue with auto tokens'], [FileText, 'One-click prescription PDF & print'], [MessageCircle, 'Send prescriptions on WhatsApp']].map(([I, s], i) => (
          <motion.div key={s} className="feat" initial={{ x: -24, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ delay: 0.4 + i * 0.12 }}>
            <span><I size={19} /></span>{s}
          </motion.div>
        ))}
      </div>

      <div className="login-form">
        <motion.form className="login-box stack" onSubmit={submit} initial={{ y: 24, opacity: 0 }} animate={{ y: 0, opacity: 1 }} style={{ gap: 16 }}>
          <div>
            <h2 style={{ fontSize: 28 }}>{t('Welcome Back')} 👋</h2>
            <div className="muted" style={{ marginTop: 4 }}>Sign in to continue</div>
          </div>
          <label className="field">
            <span>{t('Username')}</span>
            <div style={{ position: 'relative' }}>
              <UserRound size={17} style={{ position: 'absolute', insetInlineStart: 13, top: 13, color: 'var(--muted)' }} />
              <input style={{ paddingInlineStart: 40 }} autoFocus required value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} />
            </div>
          </label>
          <label className="field">
            <span>{t('Password')}</span>
            <div style={{ position: 'relative' }}>
              <LockKeyhole size={17} style={{ position: 'absolute', insetInlineStart: 13, top: 13, color: 'var(--muted)' }} />
              <input style={{ paddingInlineStart: 40 }} type="password" required value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} />
            </div>
          </label>
          <button className="btn" disabled={busy} style={{ height: 46 }}>
            {busy ? <Loader2 className="spin" size={18} /> : t('Sign in')}
          </button>
        </motion.form>
      </div>
    </div>
  )
}
