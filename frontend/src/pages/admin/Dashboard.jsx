import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { AlertTriangle, CalendarClock, Hourglass, Pill, Timer, TrendingUp, Users, Wallet } from 'lucide-react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api, { errMsg, money } from '../../api'
import { useAuth } from '../../auth'
import { useLang } from '../../i18n'
import { Empty, Page, Skeleton, StatCard, useToast, usePolling } from '../../components/ui'

const COLORS = ['#2f6bff', '#8e3fc4', '#16c07a', '#ff9f43', '#f0455a', '#00b8d9', '#7c4dff', '#9aa0c9']
const tip = { borderRadius: 12, border: 'none', boxShadow: '0 10px 30px rgba(59,63,208,.18)', fontSize: 12.5 }

function Chart({ title, icon: Icon, children, empty, delay = 0 }) {
  return (
    <motion.div className="card hover" initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 + delay * 0.08 }}>
      <h3><Icon size={17} color="#4b3cc0" /> {title}</h3>
      <div style={{ height: 270, direction: 'ltr' }}>{empty ? <Empty text="No data yet" /> : <ResponsiveContainer>{children}</ResponsiveContainer>}</div>
    </motion.div>
  )
}

export default function Dashboard() {
  const { user } = useAuth()
  const { t } = useLang()
  const nav = useNavigate()
  const toast = useToast()
  const [d, setD] = useState(null)
  usePolling(() => api.get('/reports/dashboard/').then((r) => setD(r.data)).catch((e) => !d && toast(errMsg(e), 'error')), 30000, [])
  if (!d) return <Skeleton n={4} />
  const c = d.cards
  const daily = d.daily_patients.map((x) => ({ ...x, label: x.date.slice(5) }))
  const q = d.queue || {}

  return (
    <Page>
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('Welcome Back')}, {user.full_name}! 👋</h1>
          <div className="page-sub">Here's what's happening at the clinic today</div>
        </div>
        <div className="row">
          {[['waiting', 'Waiting'], ['with_doctor', 'With doctor'], ['medicine_pending', 'Medicine'], ['completed', 'Done']].map(([k, l]) => <span key={k} className={`badge b-${k}`}>{l}: {q[k] || 0}</span>)}
        </div>
      </div>

      <div className="grid g4" style={{ marginBottom: 18 }}>
        <StatCard icon={Users} color="#2f6bff" label={t("Today's Patients")} value={c.today_patients} hint={`${c.total_patients} total registered`} delay={0} />
        <StatCard icon={Wallet} color="#16c07a" label={t('Today Revenue')} value={c.today_revenue} prefix={`${d.currency} `} hint="Collected today" delay={1} />
        <StatCard icon={Hourglass} color="#8e3fc4" label={t('Pending Patients')} value={c.pending_patients} hint="Not completed yet" delay={2} />
        <StatCard icon={AlertTriangle} color="#f0455a" label={t('Low Stock')} value={c.low_stock} hint={`${c.expiring_soon} expiring soon`} delay={3} />
      </div>

      <div className="grid g2" style={{ marginBottom: 18 }}>
        <Chart title="Daily patients · last 30 days" icon={TrendingUp} delay={0}>
          <AreaChart data={daily} margin={{ left: -18, right: 8, top: 8 }}>
            <defs><linearGradient id="gp" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8e3fc4" stopOpacity={0.45} /><stop offset="1" stopColor="#2f6bff" stopOpacity={0.02} /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={4} axisLine={false} tickLine={false} />
            <YAxis allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tip} />
            <Area type="monotone" dataKey="patients" stroke="#6a3cc6" strokeWidth={3} fill="url(#gp)" animationDuration={1200} />
          </AreaChart>
        </Chart>
        <Chart title="Monthly revenue" icon={Wallet} delay={1}>
          <BarChart data={d.monthly_revenue} margin={{ left: -6, right: 8, top: 8 }}>
            <defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2f6bff" /><stop offset="1" stopColor="#8e3fc4" /></linearGradient></defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : v)} />
            <Tooltip contentStyle={tip} formatter={(v) => money(v)} cursor={{ fill: 'rgba(142,63,196,.07)' }} />
            <Bar dataKey="revenue" fill="url(#gb)" radius={[8, 8, 0, 0]} animationDuration={1200} />
          </BarChart>
        </Chart>
        <Chart title="Top prescribed medicines" icon={Pill} delay={2} empty={!d.top_medicines.length}>
          <BarChart data={d.top_medicines} layout="vertical" margin={{ left: 16, right: 16 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" horizontal={false} />
            <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 11.5 }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={tip} cursor={{ fill: 'rgba(47,107,255,.06)' }} />
            <Bar dataKey="count" radius={[0, 8, 8, 0]} animationDuration={1200}>{d.top_medicines.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}</Bar>
          </BarChart>
        </Chart>
        <Chart title="Common diagnoses" icon={CalendarClock} delay={3} empty={!d.common_diagnoses.length}>
          <PieChart>
            <Pie data={d.common_diagnoses} dataKey="count" nameKey="name" innerRadius={62} outerRadius={100} paddingAngle={3} animationDuration={1200} label={({ name, percent }) => `${name.slice(0, 14)} ${(percent * 100).toFixed(0)}%`} labelLine={false} style={{ fontSize: 11 }}>
              {d.common_diagnoses.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
            </Pie>
            <Tooltip contentStyle={tip} />
          </PieChart>
        </Chart>
      </div>

      <div className="row">
        <button className="btn ghost" onClick={() => nav('/admin/medicines')}><Pill size={16} /> Manage medicines</button>
        <button className="btn ghost" onClick={() => nav('/admin/records')}><Timer size={16} /> View records &amp; export</button>
      </div>
    </Page>
  )
}
