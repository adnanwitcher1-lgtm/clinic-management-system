import { useEffect, useState } from 'react'
import { Moon, Sun } from 'lucide-react'

const KEY = 'alrehman-theme'
const initial = () => {
  try { const s = localStorage.getItem(KEY); if (s === 'light' || s === 'dark') return s } catch {}
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
export const applyTheme = (t) => { document.documentElement.dataset.theme = t }
applyTheme(initial())

/** Sun/moon switch. Choice is remembered; first visit follows the computer's setting. */
export default function ThemeToggle({ floating = false }) {
  const [theme, setTheme] = useState(initial)
  useEffect(() => { applyTheme(theme) }, [theme])
  const flip = () => {
    const n = theme === 'dark' ? 'light' : 'dark'
    const root = document.documentElement
    root.classList.add('theme-anim')
    setTheme(n)
    try { localStorage.setItem(KEY, n) } catch {}
    setTimeout(() => root.classList.remove('theme-anim'), 450)
  }
  return (
    <button type="button" className={`theme-toggle ${floating ? 'floating' : ''}`} onClick={flip} title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'} aria-label="Toggle dark mode">
      <Sun size={14} className="ico l" /><Moon size={14} className="ico r" />
      <span className="knob">{theme === 'dark' ? <Moon size={14} /> : <Sun size={14} />}</span>
    </button>
  )
}
