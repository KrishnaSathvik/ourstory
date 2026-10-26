import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import type { Pair, Story } from '../../analysis/story'
import { PLATFORM_LABEL, type Platform } from '../../core/types'
import { DAY, monthStart } from '../../core/time'
import { WEEKDAYS, fmtCompact, fmtDate, fmtHour, fmtMonth, fmtNum, fmtShortDate } from '../../analysis/format'
import { platformColor } from '../shared'
import { blendColor, nameOf, useWidth } from './kit'

/* ------------------------------------------------------- scrubbing --- */

/**
 * Shared hover + keyboard model for "one index at a time" charts.
 * Arrow keys step, PageUp/PageDown jump `bigStep`, Home/End go to the ends,
 * Escape clears.
 */
function useScrub(n: number, bigStep: number) {
  const [active, setActive] = useState<number | null>(null)
  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const cur = active ?? -1
      let next: number | null = cur
      switch (e.key) {
        case 'ArrowRight':
        case 'ArrowUp':
          next = Math.min(n - 1, cur + (e.shiftKey ? bigStep : 1))
          break
        case 'ArrowLeft':
        case 'ArrowDown':
          next = Math.max(0, (cur < 0 ? n : cur) - (e.shiftKey ? bigStep : 1))
          break
        case 'PageUp':
          next = Math.min(n - 1, cur + bigStep)
          break
        case 'PageDown':
          next = Math.max(0, (cur < 0 ? n : cur) - bigStep)
          break
        case 'Home':
          next = 0
          break
        case 'End':
          next = n - 1
          break
        case 'Escape':
          next = null
          break
        default:
          return
      }
      e.preventDefault()
      setActive(next)
    },
    [active, n, bigStep],
  )
  return { active, setActive, onKeyDown }
}

function Tip({ x, width, children }: { x: number; width: number; children: ReactNode }) {
  const left = Math.max(80, Math.min(width - 80, x))
  return (
    <div className="ex-tip" style={{ left }} aria-hidden="true">
      {children}
    </div>
  )
}

const KEY_HINT = 'Use arrow keys to step through, Shift+arrow to jump.'

/* --------------------------------------------------- monthly chart --- */

interface MonthRow {
  m: number
  a: number
  b: number
  platform: Platform | null
  platforms: Partial<Record<Platform, number>>
}

function monthRows(story: Story): MonthRow[] {
  const src = story.activity.monthly
  if (!src.length) return []
  const byM = new Map(src.map((r) => [r.m, r]))
  const rows: MonthRow[] = []
  for (let m = src[0].m; m <= src[src.length - 1].m; m++) {
    const r = byM.get(m)
    let platform: Platform | null = null
    let best = 0
    for (const [p, n] of Object.entries(r?.platforms ?? {}) as [Platform, number][]) {
      if (n > best) {
        best = n
        platform = p
      }
    }
    rows.push({ m, a: r?.a ?? 0, b: r?.b ?? 0, platform, platforms: r?.platforms ?? {} })
  }
  return rows
}

function niceMax(v: number) {
  if (v <= 0) return 1
  const p = Math.pow(10, Math.floor(Math.log10(v)))
  const f = v / p
  const steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10]
  return (steps.find((s) => f <= s) ?? 10) * p
}

export function MonthlyChart({ story }: { story: Story }) {
  const rows = useMemo(() => monthRows(story), [story])
  const [ref, width] = useWidth<HTMLDivElement>(760)
  const { active, setActive, onKeyDown } = useScrub(rows.length, 12)
  const H = width < 520 ? 190 : 250
  const band = 8
  const axis = 26
  const top = 14
  const plotH = H - top
  const total = H + band + axis + 6
  const max = niceMax(Math.max(1, ...rows.map((r) => r.a + r.b)))
  const step = rows.length ? width / rows.length : width
  const gap = step > 6 ? Math.min(3, step * 0.22) : 0
  const bw = Math.max(0.6, step - gap)
  const y = (v: number) => top + plotH - (v / max) * plotH
  const nameA = nameOf(story, 'a')
  const nameB = nameOf(story, 'b')

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.floor(((e.clientX - r.left) / r.width) * rows.length)
    setActive(Math.max(0, Math.min(rows.length - 1, i)))
  }

  const peak = rows.reduce<MonthRow | null>((best, r) => (!best || r.a + r.b > best.a + best.b ? r : best), null)
  const label = peak
    ? `Messages per month from ${fmtMonth(monthStart(rows[0].m))} to ${fmtMonth(monthStart(rows[rows.length - 1].m))}, stacked by person. Busiest month: ${fmtMonth(monthStart(peak.m))} with ${fmtNum(peak.a + peak.b)} messages. ${KEY_HINT}`
    : 'No monthly data'

  // One path per person keeps the DOM small even with a decade of months.
  let pathA = ''
  let pathB = ''
  rows.forEach((r, i) => {
    const x = i * step + gap / 2
    const ya = y(r.a)
    const yb = y(r.a + r.b)
    if (r.a) pathA += `M${x.toFixed(2)},${(top + plotH).toFixed(2)}V${ya.toFixed(2)}h${bw.toFixed(2)}V${(top + plotH).toFixed(2)}z`
    if (r.b) pathB += `M${x.toFixed(2)},${ya.toFixed(2)}V${yb.toFixed(2)}h${bw.toFixed(2)}V${ya.toFixed(2)}z`
  })

  const cur = active != null ? rows[active] : null
  const years = rows.map((r, i) => ({ r, i })).filter(({ r, i }) => r.m % 12 === 0 || i === 0)
  const yearEvery = Math.max(1, Math.ceil(years.length / Math.max(2, Math.floor(width / 70))))

  return (
    <figure className="ex-chart">
      <div
        ref={ref}
        className="ex-chart__plot"
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={label}
        onKeyDown={onKeyDown}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={total} viewBox={`0 0 ${width} ${total}`} aria-hidden="true">
          {[0.5, 1].map((f) => (
            <g key={f}>
              <line x1={0} x2={width} y1={y(max * f)} y2={y(max * f)} className="ex-grid" />
              <text x={0} y={y(max * f) - 5} className="ex-axis">
                {fmtCompact(max * f)}
              </text>
            </g>
          ))}
          <path d={pathA} fill="var(--a)" className="ex-grow" />
          <path d={pathB} fill="var(--b)" className="ex-grow" />
          {cur && active != null && (
            <rect x={active * step} y={top} width={step} height={plotH + band + 4} className="ex-cursor" />
          )}
          {rows.map((r, i) =>
            r.platform ? (
              <rect key={r.m} x={i * step} y={H + 4} width={step + 0.5} height={band} fill={platformColor(r.platform)} opacity={0.85} />
            ) : null,
          )}
          {years.map(({ r, i }, k) =>
            k % yearEvery === 0 ? (
              <g key={r.m}>
                <line x1={i * step} x2={i * step} y1={H + band + 6} y2={H + band + 12} className="ex-grid" />
                <text x={i * step + 3} y={H + band + 24} className="ex-axis">
                  {new Date(monthStart(r.m)).getUTCFullYear()}
                </text>
              </g>
            ) : null,
          )}
        </svg>
        {cur && active != null && (
          <Tip x={(active + 0.5) * step} width={width}>
            <strong>{fmtMonth(monthStart(cur.m))}</strong>
            <span className="tnum">{fmtNum(cur.a + cur.b)} messages</span>
            <span className="tnum">
              <span className="a">{nameA}</span> {fmtNum(cur.a)} · <span className="b">{nameB}</span> {fmtNum(cur.b)}
            </span>
            {cur.platform && <span className="faint">Mostly {PLATFORM_LABEL[cur.platform]}</span>}
          </Tip>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {cur ? `${fmtMonth(monthStart(cur.m))}: ${fmtNum(cur.a + cur.b)} messages, ${nameA} ${fmtNum(cur.a)}, ${nameB} ${fmtNum(cur.b)}.` : ''}
      </p>
      <figcaption className="ex-legend">
        <span>
          <span className="dot dot--a" aria-hidden="true" /> {nameA}
        </span>
        <span>
          <span className="dot dot--b" aria-hidden="true" /> {nameB}
        </span>
        <span className="faint">Band: main app that month</span>
        {[...new Set(rows.map((r) => r.platform).filter((p): p is Platform => !!p))].map((p) => (
          <span key={p}>
            <span className="ex-swatch" style={{ background: platformColor(p) }} aria-hidden="true" /> {PLATFORM_LABEL[p]}
          </span>
        ))}
      </figcaption>
    </figure>
  )
}

/* -------------------------------------------------------- barcode --- */

const BUCKETS = 9

/**
 * One thin bar per day. Bars are grouped into a handful of colour buckets
 * (by A's share) so thousands of days render as ~9 SVG paths.
 */
export function Barcode({ story }: { story: Story }) {
  const { dailyA, dailyB, startDay } = story.activity
  const n = dailyA.length
  const [ref, width] = useWidth<HTMLDivElement>(760)
  const { active, setActive, onKeyDown } = useScrub(n, 7)
  const H = 64
  const max = useMemo(() => {
    let m = 1
    for (let i = 0; i < n; i++) m = Math.max(m, dailyA[i] + dailyB[i])
    return m
  }, [dailyA, dailyB, n])
  const paths = useMemo(() => {
    const out: string[] = Array.from({ length: BUCKETS }, () => '')
    for (let i = 0; i < n; i++) {
      const v = dailyA[i] + dailyB[i]
      if (!v) continue
      const h = Math.max(1.5, Math.sqrt(v / max) * H)
      const k = Math.round((dailyA[i] / v) * (BUCKETS - 1))
      out[k] += `M${i},${H}v-${h.toFixed(1)}h1v${h.toFixed(1)}z`
    }
    return out
  }, [dailyA, dailyB, n, max])

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const i = Math.floor(((e.clientX - r.left) / r.width) * n)
    setActive(Math.max(0, Math.min(n - 1, i)))
  }

  const years = useMemo(() => {
    const out: { i: number; y: number }[] = []
    for (let i = 0; i < n; i++) {
      const d = new Date((startDay + i) * DAY)
      if (d.getUTCMonth() === 0 && d.getUTCDate() === 1) out.push({ i, y: d.getUTCFullYear() })
    }
    return out
  }, [n, startDay])

  const nameA = nameOf(story, 'a')
  const nameB = nameOf(story, 'b')
  const cur = active != null ? { t: (startDay + active) * DAY, a: dailyA[active], b: dailyB[active] } : null

  return (
    <figure className="ex-chart">
      <div
        ref={ref}
        className="ex-barcode"
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`Every day from ${fmtDate(startDay * DAY)} to ${fmtDate((startDay + n - 1) * DAY)}, one bar per day; taller means more messages, colour shows who sent more. ${KEY_HINT}`}
        onKeyDown={onKeyDown}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        <svg viewBox={`0 0 ${Math.max(1, n)} ${H}`} preserveAspectRatio="none" width="100%" height={H} aria-hidden="true">
          {paths.map((d, k) => (d ? <path key={k} d={d} fill={blendColor(k / (BUCKETS - 1))} /> : null))}
          {active != null && <rect x={active - Math.max(0.5, n / width)} width={Math.max(1, (2 * n) / width)} y={0} height={H} fill="var(--text)" opacity={0.9} />}
        </svg>
        <div className="ex-barcode__years" aria-hidden="true">
          {years.map(({ i, y }) => (
            <span key={y} style={{ left: `${(i / n) * 100}%` }}>
              {y}
            </span>
          ))}
        </div>
        {cur && active != null && (
          <Tip x={((active + 0.5) / n) * width} width={width}>
            <strong>{fmtShortDate(cur.t)}</strong>
            {cur.a + cur.b ? (
              <span className="tnum">
                <span className="a">{nameA}</span> {fmtNum(cur.a)} · <span className="b">{nameB}</span> {fmtNum(cur.b)}
              </span>
            ) : (
              <span className="faint">Quiet in these exports</span>
            )}
          </Tip>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {cur ? `${fmtDate(cur.t)}: ${nameA} ${fmtNum(cur.a)}, ${nameB} ${fmtNum(cur.b)} messages.` : ''}
      </p>
      <figcaption className="ex-legend">
        <span className="ex-blendkey" aria-hidden="true" />
        <span className="faint">
          Mostly <span className="a">{nameA}</span> → evenly shared → mostly <span className="b">{nameB}</span>
        </span>
      </figcaption>
    </figure>
  )
}

/* -------------------------------------------------------- heatmap --- */

export type Who = 'both' | 'a' | 'b'

export function Heatmap({ story, who }: { story: Story; who: Who }) {
  const [wa, wb] = story.activity.weekHour
  const [hover, setHover] = useState<{ d: number; h: number } | null>(null)
  const value = (d: number, h: number) => (who === 'a' ? wa[d][h] : who === 'b' ? wb[d][h] : wa[d][h] + wb[d][h])
  let max = 1
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) max = Math.max(max, value(d, h))
  let peak = { d: 0, h: 0, v: -1 }
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) if (value(d, h) > peak.v) peak = { d, h, v: value(d, h) }
  const subject = who === 'both' ? 'both of you' : nameOf(story, who)
  const color = (d: number, h: number) => {
    const v = value(d, h)
    if (!v) return 'transparent'
    const alpha = 0.08 + 0.92 * Math.pow(v / max, 0.7)
    if (who === 'a') return blendColor(1, alpha)
    if (who === 'b') return blendColor(0, alpha)
    return blendColor(wa[d][h] / (wa[d][h] + wb[d][h]), alpha)
  }
  const tip = hover ? `${WEEKDAYS[hover.d]}s, ${fmtHour(hover.h)}: ${fmtNum(value(hover.d, hover.h))} messages` : ' '
  return (
    <figure className="ex-chart">
      <div
        className="ex-heat"
        role="img"
        aria-label={`Messages by weekday and hour for ${subject}. Most active: ${WEEKDAYS[peak.d]}s around ${fmtHour(peak.h)}.`}
        onPointerLeave={() => setHover(null)}
      >
        <span aria-hidden="true" />
        {Array.from({ length: 24 }, (_, h) => (
          <span key={`h${h}`} className="ex-heat__hour" aria-hidden="true">
            {h % 6 === 0 ? (h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`) : ''}
          </span>
        ))}
        {WEEKDAYS.map((wd, d) => (
          <Row key={wd} label={wd.slice(0, 3)}>
            {Array.from({ length: 24 }, (_, h) => (
              <span
                key={h}
                className="ex-heat__cell"
                style={{ background: color(d, h) }}
                onPointerEnter={() => setHover({ d, h })}
                aria-hidden="true"
              />
            ))}
          </Row>
        ))}
      </div>
      <figcaption className="ex-heat__tip tnum" aria-hidden="true">
        {tip}
      </figcaption>
    </figure>
  )
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <span className="ex-heat__day" aria-hidden="true">
        {label}
      </span>
      {children}
    </>
  )
}

/* ----------------------------------------------------- radial clock --- */

export function hourlyOf(story: Story): Pair<number[]> {
  const [wa, wb] = story.activity.weekHour
  const a = Array.from({ length: 24 }, (_, h) => wa.reduce((s, row) => s + row[h], 0))
  const b = Array.from({ length: 24 }, (_, h) => wb.reduce((s, row) => s + row[h], 0))
  return [a, b]
}

/** A 24-hour clock face: each person's share of messages per hour as a petal. */
export function RadialClock({ story }: { story: Story }) {
  const [ha, hb] = useMemo(() => hourlyOf(story), [story])
  const sa = ha.reduce((s, v) => s + v, 0) || 1
  const sb = hb.reduce((s, v) => s + v, 0) || 1
  const da = ha.map((v) => v / sa)
  const db = hb.map((v) => v / sb)
  const max = Math.max(0.0001, ...da, ...db)
  const C = 160
  const r0 = 38
  const r1 = 136
  const pt = (h: number, v: number) => {
    const ang = (h / 24) * Math.PI * 2 - Math.PI / 2
    const r = r0 + Math.sqrt(v / max) * (r1 - r0)
    return [C + Math.cos(ang) * r, C + Math.sin(ang) * r]
  }
  const shape = (d: number[]) =>
    d
      .map((v, h) => pt(h, v))
      .map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`)
      .join('') + 'Z'
  const peakA = da.indexOf(Math.max(...da))
  const peakB = db.indexOf(Math.max(...db))
  const nameA = nameOf(story, 'a')
  const nameB = nameOf(story, 'b')
  return (
    <figure className="ex-chart ex-clock">
      <svg viewBox="-30 -6 380 332" role="img" aria-labelledby="ex-clock-title">
        <title id="ex-clock-title">{`24-hour clock of when each of you writes. ${nameA} peaks around ${fmtHour(peakA)}, ${nameB} around ${fmtHour(peakB)}.`}</title>
        {[0.25, 0.5, 0.75, 1].map((f) => (
          <circle key={f} cx={C} cy={C} r={r0 + Math.sqrt(f) * (r1 - r0)} className="ex-grid" fill="none" />
        ))}
        {Array.from({ length: 24 }, (_, h) => {
          const [x1, y1] = pt(h, 0)
          const ang = (h / 24) * Math.PI * 2 - Math.PI / 2
          const len = h % 6 === 0 ? 10 : 4
          return (
            <line key={h} x1={x1} y1={y1} x2={C + Math.cos(ang) * (r0 - len)} y2={C + Math.sin(ang) * (r0 - len)} className="ex-grid" />
          )
        })}
        <path d={shape(da)} fill="var(--a)" fillOpacity={0.28} stroke="var(--a)" strokeWidth={1.6} strokeLinejoin="round" className="ex-bloom" />
        <path d={shape(db)} fill="var(--b)" fillOpacity={0.28} stroke="var(--b)" strokeWidth={1.6} strokeLinejoin="round" className="ex-bloom" />
        {[
          [0, 'midnight'],
          [6, '6 am'],
          [12, 'noon'],
          [18, '6 pm'],
        ].map(([h, t]) => {
          const ang = ((h as number) / 24) * Math.PI * 2 - Math.PI / 2
          const r = r1 + 14
          return (
            <text key={h} x={C + Math.cos(ang) * r} y={C + Math.sin(ang) * r + 4} textAnchor="middle" className="ex-axis">
              {t}
            </text>
          )
        })}
        <text x={C} y={C + 5} textAnchor="middle" className="ex-clock__center">
          24h
        </text>
      </svg>
    </figure>
  )
}

/* ------------------------------------------------------- sparkline --- */

export function HourBars({ hourly, label }: { hourly: number[]; label: string }) {
  const max = Math.max(1, ...hourly)
  const W = 240
  const H = 56
  const bw = W / 24
  return (
    <svg className="ex-spark" viewBox={`0 0 ${W} ${H + 14}`} role="img" aria-labelledby="ex-spark-t">
      <title id="ex-spark-t">{label}</title>
      {hourly.map((v, h) => {
        const hh = v ? Math.max(2, (v / max) * H) : 1
        return <rect key={h} x={h * bw + 1} y={H - hh} width={bw - 2} height={hh} rx={1.5} fill={v ? 'url(#ex-spark-g)' : 'var(--line)'} />
      })}
      <defs>
        <linearGradient id="ex-spark-g" x1="0" x2="0" y1="1" y2="0">
          <stop offset="0" stopColor="var(--a)" />
          <stop offset="1" stopColor="var(--b)" />
        </linearGradient>
      </defs>
      {[0, 6, 12, 18].map((h) => (
        <text key={h} x={h * bw + 1} y={H + 12} className="ex-axis">
          {h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
        </text>
      ))}
    </svg>
  )
}

/* ----------------------------------------------------- convergence --- */

const quarterLabel = (m: number) => {
  const d = new Date(monthStart(m))
  return `Q${Math.floor(d.getUTCMonth() / 3) + 1} ${d.getUTCFullYear()}`
}

export function ConvergenceChart({ story }: { story: Story }) {
  const data = story.convergence
  const [ref, width] = useWidth<HTMLDivElement>(760)
  const { active, setActive, onKeyDown } = useScrub(data.length, 4)
  const H = 200
  const padT = 16
  const padB = 28
  const padX = 10
  const plotW = Math.max(1, width - padX * 2)
  const x = (i: number) => padX + (data.length > 1 ? (i / (data.length - 1)) * plotW : plotW / 2)
  const y = (v: number) => padT + (1 - v) * (H - padT - padB)
  const line = (k: 'words' | 'emoji') => data.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d[k]).toFixed(1)}`).join('')
  const area = data.length ? `${line('words')}L${x(data.length - 1)},${y(0)}L${x(0)},${y(0)}Z` : ''
  const lineRef = useRef<SVGPathElement>(null)
  const [len, setLen] = useState(0)
  useEffect(() => {
    if (lineRef.current && typeof lineRef.current.getTotalLength === 'function') setLen(lineRef.current.getTotalLength())
  }, [width, data])

  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const f = (e.clientX - r.left - padX) / plotW
    setActive(Math.max(0, Math.min(data.length - 1, Math.round(f * (data.length - 1)))))
  }
  if (data.length < 2) return <p className="faint">Not enough quarters with messages from both of you to chart this yet.</p>
  const cur = active != null ? data[active] : null
  const first = data[0]
  const last = data[data.length - 1]
  const labelEvery = Math.max(1, Math.ceil(data.length / Math.max(2, Math.floor(width / 90))))
  return (
    <figure className="ex-chart">
      <div
        ref={ref}
        className="ex-chart__plot"
        tabIndex={0}
        role="group"
        aria-roledescription="chart"
        aria-label={`Vocabulary similarity per quarter, from ${quarterLabel(first.m)} to ${quarterLabel(last.m)}. Words went from ${Math.round(first.words * 100)} to ${Math.round(last.words * 100)} out of 100; emoji from ${Math.round(first.emoji * 100)} to ${Math.round(last.emoji * 100)}. ${KEY_HINT}`}
        onKeyDown={onKeyDown}
        onPointerMove={onMove}
        onPointerLeave={() => setActive(null)}
        onBlur={() => setActive(null)}
      >
        <svg width={width} height={H} viewBox={`0 0 ${width} ${H}`} aria-hidden="true">
          <defs>
            <linearGradient id="ex-conv-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0" style={{ stopColor: 'var(--mid)', stopOpacity: 0.3 }} />
              <stop offset="1" style={{ stopColor: 'var(--mid)', stopOpacity: 0 }} />
            </linearGradient>
            <linearGradient id="ex-conv-line" x1="0" x2="1" y1="0" y2="0">
              <stop offset="0" stopColor="var(--a)" />
              <stop offset="1" stopColor="var(--b)" />
            </linearGradient>
          </defs>
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line x1={padX} x2={width - padX} y1={y(f)} y2={y(f)} className="ex-grid" />
              <text x={padX} y={y(f) - 4} className="ex-axis">
                {f === 1 ? '100 · identical' : f === 0 ? '0' : '50'}
              </text>
            </g>
          ))}
          <path d={area} fill="url(#ex-conv-fill)" />
          <path
            ref={lineRef}
            d={line('words')}
            fill="none"
            stroke="url(#ex-conv-line)"
            strokeWidth={2.5}
            strokeLinejoin="round"
            strokeLinecap="round"
            className={len ? 'ex-draw' : ''}
            style={len ? { strokeDasharray: len, ['--len' as string]: len } : undefined}
          />
          <path d={line('emoji')} fill="none" stroke="var(--gold)" strokeWidth={1.8} strokeDasharray="4 5" strokeLinecap="round" />
          {active != null && cur && (
            <g>
              <line x1={x(active)} x2={x(active)} y1={padT} y2={H - padB} stroke="var(--line-strong)" />
              <circle cx={x(active)} cy={y(cur.words)} r={4.5} fill="var(--text)" />
              <circle cx={x(active)} cy={y(cur.emoji)} r={4} fill="var(--gold)" />
            </g>
          )}
          {data.map((d, i) =>
            i % labelEvery === 0 ? (
              <text key={d.m} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle'} className="ex-axis">
                {quarterLabel(d.m)}
              </text>
            ) : null,
          )}
        </svg>
        {cur && active != null && (
          <Tip x={x(active)} width={width}>
            <strong>{quarterLabel(cur.m)}</strong>
            <span className="tnum">Words {Math.round(cur.words * 100)} / 100</span>
            <span className="tnum" style={{ color: 'var(--gold)' }}>
              Emoji {Math.round(cur.emoji * 100)} / 100
            </span>
          </Tip>
        )}
      </div>
      <p className="sr-only" aria-live="polite">
        {cur ? `${quarterLabel(cur.m)}: words ${Math.round(cur.words * 100)}, emoji ${Math.round(cur.emoji * 100)} out of 100.` : ''}
      </p>
      <figcaption className="ex-legend">
        <span>
          <span className="ex-swatch ex-swatch--blend" aria-hidden="true" /> Words
        </span>
        <span>
          <span className="ex-swatch ex-swatch--dash" aria-hidden="true" /> Emoji
        </span>
      </figcaption>
    </figure>
  )
}
