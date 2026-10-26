import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { PersonId } from '../core/types'
import type { Pair, Story } from '../analysis/story'
import { fmtNum } from '../analysis/format'

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches)
  useEffect(() => {
    const mq = matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}

/** Animated number that counts up when mounted (instant with reduced motion). */
export function CountUp({ value, duration = 1400, format = fmtNum }: { value: number; duration?: number; format?: (n: number) => string }) {
  const reduced = useReducedMotion()
  const [n, setN] = useState(reduced ? value : 0)
  useEffect(() => {
    if (reduced) {
      setN(value)
      return
    }
    let raf = 0
    const start = performance.now()
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration)
      setN(value * (1 - Math.pow(1 - p, 4)))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [value, duration, reduced])
  return (
    <span className="tnum" aria-label={format(value)}>
      <span aria-hidden="true">{format(n)}</span>
    </span>
  )
}

export const personColor = (p: PersonId) => (p === 'a' ? 'var(--a)' : 'var(--b)')

export function Name({ story, p }: { story: Story; p: PersonId }) {
  return <span className={p}>{story.people[p === 'a' ? 0 : 1].name}</span>
}

/** Two-tone proportional bar. */
export function SplitBar({ values, height = 14, labels }: { values: Pair; height?: number; labels?: [ReactNode, ReactNode] }) {
  const total = values[0] + values[1] || 1
  const pa = (values[0] / total) * 100
  return (
    <div className="splitbar">
      <div className="splitbar__track" style={{ height }} role="img" aria-label={`${Math.round(pa)}% versus ${Math.round(100 - pa)}%`}>
        <span style={{ width: `${pa}%`, background: 'var(--a)' }} />
        <span style={{ width: `${100 - pa}%`, background: 'var(--b)' }} />
      </div>
      {labels && (
        <div className="splitbar__labels">
          <span>{labels[0]}</span>
          <span>{labels[1]}</span>
        </div>
      )}
    </div>
  )
}

/**
 * The Duet orbs: two glowing bodies in a slow, slightly eccentric orbit,
 * shedding particles. Pure canvas, paused when off-screen, static frame for
 * reduced motion.
 */
export function Orbs({ intensity = 1, className = '' }: { intensity?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    let raf = 0
    let visible = true
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    const resize = () => {
      const r = canvas.getBoundingClientRect()
      canvas.width = Math.max(1, r.width * dpr)
      canvas.height = Math.max(1, r.height * dpr)
    }
    resize()
    const ro = new ResizeObserver(resize)
    ro.observe(canvas)
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting))
    io.observe(canvas)

    type P = { x: number; y: number; vx: number; vy: number; life: number; c: string }
    const particles: P[] = []
    const colors = ['255,122,89', '140,155,255']
    const draw = (time: number) => {
      const w = canvas.width
      const h = canvas.height
      const t = time / 1000
      ctx.clearRect(0, 0, w, h)
      const cx = w / 2
      const cy = h / 2
      const R = Math.min(w, h) * 0.2
      const bodies = [0, 1].map((i) => {
        const ang = t * 0.35 + i * Math.PI
        const ecc = 1 + 0.18 * Math.sin(t * 0.21)
        return { x: cx + Math.cos(ang) * R * 1.35 * ecc, y: cy + Math.sin(ang) * R * 0.75, c: colors[i] }
      })
      ctx.globalCompositeOperation = 'lighter'
      for (const b of bodies) {
        const rad = Math.min(w, h) * 0.32
        const g = ctx.createRadialGradient(b.x, b.y, 0, b.x, b.y, rad)
        g.addColorStop(0, `rgba(${b.c},${0.55 * intensity})`)
        g.addColorStop(0.35, `rgba(${b.c},${0.18 * intensity})`)
        g.addColorStop(1, `rgba(${b.c},0)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, w, h)
        if (!reduced && particles.length < 160 && Math.random() < 0.6) {
          const a = Math.random() * Math.PI * 2
          particles.push({ x: b.x, y: b.y, vx: Math.cos(a) * 0.4 * dpr, vy: Math.sin(a) * 0.4 * dpr, life: 1, c: b.c })
        }
        ctx.fillStyle = `rgba(${b.c},0.95)`
        ctx.beginPath()
        ctx.arc(b.x, b.y, 5 * dpr, 0, Math.PI * 2)
        ctx.fill()
      }
      for (let i = particles.length - 1; i >= 0; i--) {
        const p = particles[i]
        p.x += p.vx
        p.y += p.vy
        p.life -= 0.006
        if (p.life <= 0) {
          particles.splice(i, 1)
          continue
        }
        ctx.fillStyle = `rgba(${p.c},${p.life * 0.7})`
        ctx.fillRect(p.x, p.y, 1.6 * dpr, 1.6 * dpr)
      }
      ctx.globalCompositeOperation = 'source-over'
    }
    const loop = (time: number) => {
      if (visible) draw(time)
      raf = requestAnimationFrame(loop)
    }
    if (reduced) draw(4000)
    else raf = requestAnimationFrame(loop)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
    }
  }, [reduced, intensity])
  return <canvas ref={ref} className={`orbs ${className}`} aria-hidden="true" />
}

// ------------------------------------------------------------- icons ---
const I = (d: ReactNode, size = 20) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {d}
  </svg>
)
export const Icon = {
  arrowRight: () => I(<path d="M5 12h14M13 6l6 6-6 6" />),
  arrowLeft: () => I(<path d="M19 12H5M11 6l-6 6 6 6" />),
  close: () => I(<path d="M6 6l12 12M18 6L6 18" />),
  lock: () => I(<><rect x="4" y="11" width="16" height="10" rx="2" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></>),
  wifiOff: () => I(<><path d="M2 2l20 20M8.5 16.5a5 5 0 0 1 7 0M5 13a10 10 0 0 1 5.2-2.8M19 13a10 10 0 0 0-2.4-1.7M2 8.8a15 15 0 0 1 4.2-2.7M22 8.8A15 15 0 0 0 11 5" /><circle cx="12" cy="20" r="0.6" /></>),
  eyeOff: () => I(<><path d="M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3.2 3.7M6.6 6.6C3.8 8.3 2 12 2 12s4 6 10 6a9.6 9.6 0 0 0 4.1-.9" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></>),
  upload: () => I(<><path d="M12 16V4M6 10l6-6 6 6" /><path d="M4 20h16" /></>),
  download: () => I(<><path d="M12 4v12M6 10l6 6 6-6" /><path d="M4 20h16" /></>),
  sparkle: () => I(<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5L18 18M6 18l2.5-2.5M15.5 8.5L18 6" />),
  trash: () => I(<><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></>),
  play: () => I(<path d="M7 5l12 7-12 7z" />),
  pause: () => I(<><path d="M8 5v14M16 5v14" /></>),
  check: () => I(<path d="M5 12l5 5 9-10" />),
  alert: () => I(<><path d="M12 3l10 18H2z" /><path d="M12 10v5M12 18v.5" /></>),
  shield: () => I(<><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-5" /></>),
  share: () => I(<><circle cx="18" cy="5" r="2.5" /><circle cx="6" cy="12" r="2.5" /><circle cx="18" cy="19" r="2.5" /><path d="M8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4" /></>),
  file: () => I(<><path d="M14 3H6v18h12V7z" /><path d="M14 3v4h4" /></>),
  menu: () => I(<path d="M4 7h16M4 12h16M4 17h16" />),
}

/** Platform glyph: a small coloured badge with the platform initial. */
const PLATFORM_COLORS: Record<string, string> = {
  whatsapp: '#5ad08a',
  instagram: '#e9779e',
  telegram: '#5fb2ec',
  messenger: '#8d84ff',
  imessage: '#6fd27f',
  discord: '#8f97ff',
  sms: '#c9bfcf',
}
export function PlatformMark({ platform, size = 22 }: { platform: string; size?: number }) {
  return (
    <span
      className="platform-mark"
      style={{ width: size, height: size, background: PLATFORM_COLORS[platform] ?? '#999', fontSize: size * 0.5 }}
      aria-hidden="true"
    >
      {platform === 'imessage' ? 'i' : platform[0].toUpperCase()}
    </span>
  )
}
export const platformColor = (p: string) => PLATFORM_COLORS[p] ?? '#999'
