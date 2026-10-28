import { Navigate, Route, Routes } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import { homeFor, useAuth } from './auth'
import Layout from './components/Layout'
import Login from './pages/Login'
import Queue from './pages/reception/Queue'
import NewVisit from './pages/reception/NewVisit'
import Patients from './pages/Patients'
import Appointments from './pages/Appointments'
import Stock from './pages/reception/Stock'
import Billing from './pages/reception/Billing'
import DoctorQueue from './pages/doctor/DoctorQueue'
import Consult from './pages/doctor/Consult'
import Dashboard from './pages/admin/Dashboard'
import Records from './pages/admin/Records'
import Medicines from './pages/admin/Medicines'
import Users from './pages/admin/Users'
import Settings from './pages/admin/Settings'
import Audit from './pages/admin/Audit'

function Guard({ roles, children }) {
  const { user, loading } = useAuth()
  if (loading)
    return (
      <div style={{ height: '100vh', display: 'grid', placeItems: 'center' }}>
        <Loader2 className="spin" size={36} color="#4b3cc0" />
      </div>
    )
  if (!user) return <Navigate to="/login" replace />
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />
  return <Layout>{children}</Layout>
}

export default function App() {
  const { user, loading } = useAuth()
  return (
    <>
      <Routes>
        <Route path="/login" element={user && !loading ? <Navigate to={homeFor(user.role)} replace /> : <Login />} />

        <Route path="/reception" element={<Guard roles={['receptionist', 'admin']}><Queue /></Guard>} />
        <Route path="/reception/new" element={<Guard roles={['receptionist', 'admin']}><NewVisit /></Guard>} />
        <Route path="/reception/patients" element={<Guard roles={['receptionist', 'admin']}><Patients /></Guard>} />
        <Route path="/reception/appointments" element={<Guard roles={['receptionist', 'admin']}><Appointments /></Guard>} />
        <Route path="/reception/stock" element={<Guard roles={['receptionist', 'admin']}><Stock /></Guard>} />
        <Route path="/reception/billing" element={<Guard roles={['receptionist', 'admin']}><Billing /></Guard>} />

        <Route path="/doctor" element={<Guard roles={['doctor']}><DoctorQueue /></Guard>} />
        <Route path="/doctor/visit/:id" element={<Guard roles={['doctor']}><Consult /></Guard>} />
        <Route path="/doctor/patients" element={<Guard roles={['doctor']}><Patients /></Guard>} />
        <Route path="/doctor/appointments" element={<Guard roles={['doctor']}><Appointments /></Guard>} />

        <Route path="/admin" element={<Guard roles={['admin']}><Dashboard /></Guard>} />
        <Route path="/admin/records" element={<Guard roles={['admin']}><Records /></Guard>} />
        <Route path="/admin/medicines" element={<Guard roles={['admin']}><Medicines /></Guard>} />
        <Route path="/admin/users" element={<Guard roles={['admin']}><Users /></Guard>} />
        <Route path="/admin/settings" element={<Guard roles={['admin']}><Settings /></Guard>} />
        <Route path="/admin/audit" element={<Guard roles={['admin']}><Audit /></Guard>} />

        <Route path="*" element={<Navigate to={user ? homeFor(user.role) : '/login'} replace />} />
      </Routes>
    </>
  )
}
