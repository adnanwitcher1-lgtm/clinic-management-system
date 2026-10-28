import axios from 'axios'

const BASE = (import.meta.env.VITE_API_URL || '') + '/api'

const api = axios.create({ baseURL: BASE })

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

let refreshing = null
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && !original._retry && localStorage.getItem('refresh') && !original.url.includes('/auth/')) {
      original._retry = true
      try {
        refreshing =
          refreshing ||
          axios.post(`${BASE}/auth/refresh/`, { refresh: localStorage.getItem('refresh') }).finally(() => (refreshing = null))
        const { data } = await refreshing
        localStorage.setItem('access', data.access)
        original.headers.Authorization = `Bearer ${data.access}`
        return api(original)
      } catch {
        localStorage.clear()
        window.location.href = '/login'
      }
    }
    return Promise.reject(error)
  }
)

export const errMsg = (e) => {
  const d = e?.response?.data
  if (!d) return e?.message || 'Something went wrong'
  if (typeof d === 'string') return d.slice(0, 200)
  if (d.detail) return d.detail
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : typeof v === 'object' ? JSON.stringify(v) : v}`)
    .join(' • ')
}

// Fetch a PDF with auth and open it in a new tab (user prints from there).
export async function openPdf(path, params = {}) {
  const win = window.open('', '_blank')
  try {
    const res = await api.get(path, { params, responseType: 'blob' })
    const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }))
    if (win) win.location.href = url
    else window.location.href = url
  } catch (e) {
    win?.close()
    throw e
  }
}

export async function download(path, params, filename) {
  const res = await api.get(path, { params, responseType: 'blob' })
  const url = URL.createObjectURL(res.data)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

export const list = (data) => (Array.isArray(data) ? data : data?.results || [])
export const money = (n) => `Rs ${Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })}`
export const today = () => new Date().toLocaleDateString('en-CA')
export default api
