import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ElementType, type ReactNode } from 'react'
import type { PersonId } from '../../core/types'
import type { Pair, Story } from '../../analysis/story'
import { fmtNum, fmtPct } from '../../analysis/format'
import { useReducedMotion } from '../shared'

/* ------------------------------------------------------------ colour --- */

/**
 * JS mirrors of the person tokens (--a, the blend midpoint, --b). Charts that
 * colour individual marks by share need real numbers to interpolate.
 */
const A_RGB: [number, number, number] = [226, 96, 63]
const MID_RGB: [number, number, number] = [212, 112, 154]
const B_RGB: [number, number, number] = [122, 120, 230]

const lerp = (x: number, y: number, t: number) => x + (y - x) * t

/** Colour along the Ember → Tide blend. `shareA` = 1 is pure A, 0 is pure B. */
export function blendColor(shareA: number, alpha = 1): string {
  const t = 1 - Math.max(0, Math.min(1, shareA))
  const [from, to, k] = t < 0.5 ? [A_RGB, MID_RGB, t * 2] : [MID_RGB, B_RGB, (t - 0.5) * 2]
  const c = from.map((v, i) => Math.round(lerp(v, to[i], k)))
  return alpha >= 1 ? `rgb(${c[0]} ${c[1]} ${c[2]})` : `rgb(${c[0]} ${c[1]} ${c[2]} / ${alpha.toFixed(3)})`
}

/* ------------------------------------------------------------ people --- */

export const nameOf = (story: Story, p: PersonId) => story.people[p === 'a' ? 0 : 1].name
export const pick = <T,>(pair: Pair<T>, p: PersonId): T => (p === 'a' ? pair[0] : pair[1])
export const other = (p: PersonId): PersonId => (p === 'a' ? 'b' : 'a')

/** Who has the bigger value; null on a tie. */
export function leader(pair: Pair): PersonId | null {
  if (pair[0] === pair[1]) return null
  return pair[0] > pair[1] ? 'a' : 'b'
}

export const shareOf = (pair: Pair, p: PersonId) => {
  const total = pair[0] + pair[1]
  return total ? pick(pair, p) / total : 0
}

export function P({ story, p }: { story: Story; p: PersonId }) {
  return <strong className={`ex-name ${p}`}>{nameOf(story, p)}</strong>
}

/** "Maya 1,203 · Theo 980" with person colours. */
export function PairFigures({ story, values, format = fmtNum }: { story: Story; values: Pair; format?: (n: number) => string }) {
  return (
    <span className="ex-pairfig tnum">
      <span>
        <span className="dot dot--a" aria-hidden="true" /> <span className="sr-only">{nameOf(story, 'a')}: </span>
        {format(values[0])}
      </span>
      <span>
        <span className="dot dot--b" aria-hidden="true" /> <span className="sr-only">{nameOf(story, 'b')}: </span>
        {format(values[1])}
      </span>
    </span>
  )
}

export const pct = (x: number) => fmtPct(x, x > 0 && x < 0.01 ? 1 : 0)

/* ------------------------------------------------------------ hooks --- */

/** Element width via ResizeObserver; `fallback` is used for SSR / first paint. */
export function useWidth<T extends HTMLElement>(fallback = 720) {
  const ref = useRef<T>(null)
  const [w, setW] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => {
      const next = Math.round(el.getBoundingClientRect().width)
      if (next > 0) setW(next)
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, w] as const
}

/**
 * Staggered reveal on scroll. Content is fully visible on the server and
 * before hydration; we only arm the hidden state in a layout effect (before
 * first paint) when motion is allowed and IntersectionObserver exists.
 */
export function Reveal({
  as: Tag = 'div',
  children,
  delay = 0,
  className = '',
  style,
}: {
  as?: ElementType
  children: ReactNode
  delay?: number
  className?: string
  style?: CSSProperties
}) {
  const ref = useRef<HTMLElement>(null)
  const reduced = useReducedMotion()
  const [state, setState] = useState<'static' | 'armed' | 'in'>('static')
  useLayoutEffect(() => {
    if (reduced || typeof IntersectionObserver === 'undefined') return
    setState((s) => (s === 'static' ? 'armed' : s))
  }, [reduced])
  useEffect(() => {
    const el = ref.current
    if (!el || state !== 'armed') return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setState('in')
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -8% 0px', threshold: 0.05 },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [state])
  return (
    <Tag
      ref={ref}
      className={`ex-rv ${state === 'armed' ? 'ex-rv--armed' : ''} ${className}`}
      style={{ ...style, '--d': `${Math.min(delay, 12) * 70}ms` } as CSSProperties}
    >
      {children}
    </Tag>
  )
}

/* ------------------------------------------------------- page pieces --- */

export function SectionHead({ id, eyebrow, title, lede }: { id: string; eyebrow: string; title: ReactNode; lede?: ReactNode }) {
  return (
    <Reveal as="header" className="ex-sechead">
      <p className="eyebrow">{eyebrow}</p>
      <h2 id={`${id}-title`} className="display ex-h2">
        {title}
      </h2>
      {lede && <p className="ex-lede">{lede}</p>}
    </Reveal>
  )
}

export function Stat({ label, value, note, delay = 0 }: { label: ReactNode; value: ReactNode; note?: ReactNode; delay?: number }) {
  return (
    <Reveal className="ex-stat" delay={delay}>
      <div className="ex-stat__value display">{value}</div>
      <div className="ex-stat__label">{label}</div>
      {note && <div className="ex-stat__note">{note}</div>}
    </Reveal>
  )
}

/** A tiny two-tone meter for inline comparisons. */
export function MiniSplit({ values, label }: { values: Pair; label: string }) {
  const total = values[0] + values[1]
  const a = total ? (values[0] / total) * 100 : 50
  return (
    <span className="ex-minisplit" role="img" aria-label={label}>
      <span style={{ width: `${a}%` }} className="ex-minisplit__a" />
      <span style={{ width: `${100 - a}%` }} className="ex-minisplit__b" />
    </span>
  )
}
