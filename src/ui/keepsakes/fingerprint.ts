/**
 * "Our Fingerprint": the signature keepsake.
 *
 * Every day since the first message is one mark on an Archimedean spiral,
 * one revolution per year, starting near the centre. The angle is the day of
 * the year (1 January at twelve o'clock), the radius grows with elapsed time.
 * Each day is a short radial stroke: length ∝ √(messages that day), colour
 * mixed between Ember (person A) and Tide (person B) by who sent more.
 * Silent days are faint dots.
 *
 * Pure canvas drawing from aggregates only. Deterministic: no Math.random,
 * no time-dependence, so the preview and the downloaded PNG are identical.
 *
 * This module also holds the shared keepsake visual identity (palette, type,
 * background, wordmark) used by cards.ts.
 */
import type { Story } from '../../analysis/story'
import { fmtDate, fmtNum } from '../../analysis/format'
import { DAY } from '../../core/time'

// ============================================================ identity ===

export const K = {
  ink: '#0f0b14',
  ink2: '#17111f',
  ink3: '#211a2c',
  cream: '#f4ebdd',
  cream2: '#c9bfcf',
  cream3: '#9a90a6',
  a: '#ff7a59',
  mid: '#e58fc0',
  b: '#8c9bff',
  gold: '#f2c46d',
} as const

export const SERIF = `'Instrument Serif', 'Iowan Old Style', Georgia, serif`
export const SANS = `'Bricolage Grotesque Variable', ui-sans-serif, system-ui, sans-serif`
export const EMOJI = `'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif`

export type RGB = [number, number, number]
const hex = (h: string): RGB => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]
const A_RGB = hex(K.a)
const MID_RGB = hex(K.mid)
const B_RGB = hex(K.b)

export const rgba = (c: RGB, alpha: number) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${alpha})`
const lerp = (x: number, y: number, t: number) => x + (y - x) * t
const lerpRgb = (p: RGB, q: RGB, t: number): RGB => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)]
const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x))

/** 0 = all Ember (A), 1 = all Tide (B), through the duet pink in between. */
export function duetColor(shareB: number): RGB {
  const s = clamp(shareB, 0, 1)
  return s < 0.5 ? lerpRgb(A_RGB, MID_RGB, s * 2) : lerpRgb(MID_RGB, B_RGB, (s - 0.5) * 2)
}

/** Load the keepsake fonts before drawing (canvas won't trigger font loads). */
export async function ensureKeepsakeFonts(): Promise<void> {
  const fonts = typeof document !== 'undefined' ? document.fonts : undefined
  if (!fonts) return
  try {
    await Promise.all([
      fonts.load(`400 64px 'Instrument Serif'`),
      fonts.load(`italic 400 64px 'Instrument Serif'`),
      fonts.load(`600 32px 'Bricolage Grotesque Variable'`),
      fonts.load(`400 32px 'Bricolage Grotesque Variable'`),
    ])
    await fonts.ready
  } catch {
    /* fall back to system fonts */
  }
}

/** Small deterministic PRNG for grain. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const storySeed = (s: Story) => (s.totals.messages * 2654435761 + s.range.days * 40503 + s.activity.startDay) >>> 0

/** Ink background with two soft person-coloured glows and a vignette. */
export function paintBackground(ctx: CanvasRenderingContext2D, w: number, h: number, glow: { ax: number; ay: number; bx: number; by: number; r: number }) {
  ctx.save()
  ctx.fillStyle = K.ink
  ctx.fillRect(0, 0, w, h)
  const m = Math.max(w, h)
  const blob = (x: number, y: number, c: RGB, alpha: number) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, glow.r * m)
    g.addColorStop(0, rgba(c, alpha))
    g.addColorStop(0.45, rgba(c, alpha * 0.35))
    g.addColorStop(1, rgba(c, 0))
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
  ctx.globalCompositeOperation = 'lighter'
  blob(glow.ax * w, glow.ay * h, A_RGB, 0.16)
  blob(glow.bx * w, glow.by * h, B_RGB, 0.16)
  ctx.globalCompositeOperation = 'source-over'
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, m * 0.75)
  v.addColorStop(0, 'rgba(15,11,20,0)')
  v.addColorStop(1, 'rgba(8,6,11,0.65)')
  ctx.fillStyle = v
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

/** Film grain, as on the site, from a seeded tile. */
export function paintGrain(ctx: CanvasRenderingContext2D, w: number, h: number, seed: number, strength = 1) {
  if (typeof document === 'undefined') return
  const tile = document.createElement('canvas')
  tile.width = tile.height = 192
  const tctx = tile.getContext('2d')
  if (!tctx) return
  const img = tctx.createImageData(192, 192)
  const rnd = mulberry32(seed)
  for (let i = 0; i < img.data.length; i += 4) {
    const v = rnd()
    const light = v > 0.5
    img.data[i] = img.data[i + 1] = img.data[i + 2] = light ? 255 : 0
    img.data[i + 3] = Math.abs(v - 0.5) * 2 * 26 * strength
  }
  tctx.putImageData(img, 0, 0)
  const pattern = ctx.createPattern(tile, 'repeat')
  if (!pattern) return
  ctx.save()
  // Grain scales with output so it reads the same in preview and at full size.
  const s = Math.max(1, w / 1080)
  pattern.setTransform(new DOMMatrix([s, 0, 0, s, 0, 0]))
  ctx.fillStyle = pattern
  ctx.fillRect(0, 0, w, h)
  ctx.restore()
}

export function setFont(ctx: CanvasRenderingContext2D, font: string, spacing = 0) {
  ctx.font = font
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${spacing}px`
}

/** Largest size ≤ max (≥ min) at which `text` fits in `width`. */
export function fitSize(ctx: CanvasRenderingContext2D, text: string, width: number, font: (size: number) => string, max: number, min = max * 0.4): number {
  let size = max
  for (; size > min; size *= 0.94) {
    ctx.font = font(size)
    if (ctx.measureText(text).width <= width) break
  }
  return Math.max(size, min)
}

/** Greedy word wrap with an ellipsis on the last allowed line. */
export function wrapLines(ctx: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  const lines: string[] = []
  let line = ''
  for (let i = 0; i < words.length; i++) {
    const next = line ? `${line} ${words[i]}` : words[i]
    if (ctx.measureText(next).width <= width || !line) {
      line = next
    } else {
      lines.push(line)
      line = words[i]
      if (lines.length === maxLines) {
        line = ''
        break
      }
    }
  }
  if (line) lines.push(line)
  if (lines.length > maxLines || (lines.length === maxLines && words.join(' ') !== lines.join(' '))) {
    lines.length = maxLines
    let last = lines[maxLines - 1]
    while (last && ctx.measureText(last + '…').width > width) last = last.slice(0, -1)
    lines[maxLines - 1] = last.trimEnd() + '…'
  }
  return lines
}

/** Shortens a name for small labels. */
export const shortName = (name: string, max = 16) => (name.length > max ? name.slice(0, max - 1).trimEnd() + '…' : name)

/** "Maya & Theo": names in their colours, ampersand in cream italic. Centered or left-aligned at x. */
export function drawNames(
  ctx: CanvasRenderingContext2D,
  story: Story,
  x: number,
  y: number,
  maxSize: number,
  maxWidth: number,
  align: 'center' | 'left' = 'center',
  opts: { wrap?: boolean } = {},
): { size: number; extra: number } {
  const [a, b] = [story.people[0].name, story.people[1].name]
  const font = (s: number, italic = false) => `${italic ? 'italic ' : ''}400 ${s}px ${SERIF}`
  const amp = ' & '
  const measure = (s: number) => {
    ctx.font = font(s)
    const wa = ctx.measureText(a).width
    const wb = ctx.measureText(b).width
    ctx.font = font(s, true)
    const wm = ctx.measureText(amp).width
    return { wa, wb, wm, total: wa + wb + wm }
  }
  let size = maxSize
  let m = measure(size)
  while (m.total > maxWidth && size > maxSize * 0.35) {
    size *= 0.94
    m = measure(size)
  }
  // Long names: centred titles break onto two lines rather than shrinking away.
  if (align === 'center' && opts.wrap && size < maxSize * 0.62) {
    let s2 = maxSize * 0.72
    const widest = () => {
      ctx.font = font(s2)
      const wa = ctx.measureText(a).width
      ctx.font = font(s2, true)
      const wm = ctx.measureText('& ').width
      ctx.font = font(s2)
      return Math.max(wa, wm + ctx.measureText(b).width)
    }
    while (widest() > maxWidth && s2 > maxSize * 0.3) s2 *= 0.94
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    setFont(ctx, font(s2), 0)
    ctx.fillStyle = K.a
    ctx.fillText(a, x, y)
    const lh = s2 * 0.98
    ctx.font = font(s2, true)
    const wm = ctx.measureText('& ').width
    ctx.font = font(s2)
    const wb = ctx.measureText(b).width
    const left = x - (wm + wb) / 2
    ctx.textAlign = 'left'
    ctx.font = font(s2, true)
    ctx.fillStyle = K.cream
    ctx.fillText('& ', left, y + lh)
    ctx.font = font(s2)
    ctx.fillStyle = K.b
    ctx.fillText(b, left + wm, y + lh)
    return { size: s2, extra: lh }
  }
  setFont(ctx, font(size), -size * 0.01)
  let cx = align === 'center' ? x - m.total / 2 : x
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = K.a
  ctx.fillText(a, cx, y)
  cx += m.wa
  ctx.font = font(size, true)
  ctx.fillStyle = K.cream
  ctx.fillText(amp, cx, y)
  cx += m.wm
  ctx.font = font(size)
  ctx.fillStyle = K.b
  ctx.fillText(b, cx, y)
  setFont(ctx, ctx.font, 0)
  return { size, extra: 0 }
}

/** The "duet" wordmark: two small orbs and an italic serif word. */
export function drawWordmark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, align: 'left' | 'right' | 'center' = 'left') {
  ctx.save()
  setFont(ctx, `italic 400 ${size}px ${SERIF}`, 0)
  const tw = ctx.measureText('duet').width
  const orbR = size * 0.13
  const gap = size * 0.12
  const total = orbR * 4 + gap * 0.5 + gap + tw
  let left = align === 'left' ? x : align === 'right' ? x - total : x - total / 2
  const oy = y - size * 0.3
  ctx.globalCompositeOperation = 'lighter'
  for (const [c, dx] of [
    [A_RGB, orbR],
    [B_RGB, orbR * 2.6],
  ] as const) {
    const g = ctx.createRadialGradient(left + dx, oy, 0, left + dx, oy, orbR * 3.2)
    g.addColorStop(0, rgba(c, 0.55))
    g.addColorStop(1, rgba(c, 0))
    ctx.fillStyle = g
    ctx.fillRect(left + dx - orbR * 3.2, oy - orbR * 3.2, orbR * 6.4, orbR * 6.4)
    ctx.fillStyle = rgba(c, 1)
    ctx.beginPath()
    ctx.arc(left + dx, oy, orbR, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.globalCompositeOperation = 'source-over'
  left += orbR * 3.6 + gap
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillStyle = K.cream
  ctx.fillText('duet', left, y)
  ctx.restore()
}

/** Gold pill: "DEMO · fictional couple". */
export function drawDemoMark(ctx: CanvasRenderingContext2D, x: number, y: number, u: number, align: 'left' | 'right' | 'center' = 'center') {
  ctx.save()
  const text = 'DEMO · fictional couple'
  setFont(ctx, `700 ${20 * u}px ${SANS}`, 1.2 * u)
  const tw = ctx.measureText(text).width
  const ph = 40 * u
  const pw = tw + 36 * u
  const left = align === 'left' ? x : align === 'right' ? x - pw : x - pw / 2
  ctx.fillStyle = K.gold
  ctx.beginPath()
  ctx.roundRect(left, y - ph / 2, pw, ph, ph / 2)
  ctx.fill()
  ctx.fillStyle = K.ink
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, left + 18 * u, y + 1 * u)
  ctx.restore()
}

/** Tracked uppercase label. */
export function drawEyebrow(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, size: number, color: string = K.cream3, align: CanvasTextAlign = 'left') {
  ctx.save()
  setFont(ctx, `600 ${size}px ${SANS}`, size * 0.22)
  ctx.fillStyle = color
  ctx.textAlign = align
  ctx.textBaseline = 'alphabetic'
  // letterSpacing adds trailing space; nudge centred text back.
  const nudge = align === 'center' ? (size * 0.22) / 2 : 0
  ctx.fillText(text.toUpperCase(), x + nudge, y)
  ctx.restore()
}

// ========================================================= fingerprint ===

export interface FingerprintOptions {
  width: number
  height: number
  variant: 'poster' | 'story'
}

const YEAR_MS = 365.2425 * DAY

interface Mark {
  x0: number
  y0: number
  x1: number
  y1: number
  w: number
  c: RGB
  n: number
}

function percentile(sorted: number[], p: number) {
  if (!sorted.length) return 0
  return sorted[Math.min(sorted.length - 1, Math.floor(p * (sorted.length - 1)))]
}

/** Draws the spiral itself, centred at (cx, cy) with outer radius R. */
function drawSpiral(ctx: CanvasRenderingContext2D, story: Story, cx: number, cy: number, R: number, u: number) {
  const { dailyA, dailyB, startDay } = story.activity
  const n = Math.min(dailyA.length, dailyB.length)
  if (!n) return
  const t0 = startDay * DAY
  const years = n / 365.2425
  const r0 = R * 0.12
  const pitch = (R - r0) / Math.max(years, 0.75)
  const maxLen = Math.min(pitch * 0.92, R * 0.26)

  const totals: number[] = []
  for (let i = 0; i < n; i++) totals.push(dailyA[i] + dailyB[i])
  // Normalise to the busiest day (99.8th pct guards against a single freak
  // outlier), so ordinary days are slim ridges and big days really stand out.
  const ref = Math.max(1, percentile([...totals].sort((p, q) => p - q), 0.998))

  const angleOf = (t: number) => {
    const d = new Date(t)
    const y0 = Date.UTC(d.getUTCFullYear(), 0, 1)
    const y1 = Date.UTC(d.getUTCFullYear() + 1, 0, 1)
    return -Math.PI / 2 + ((t - y0) / (y1 - y0)) * Math.PI * 2
  }
  const radiusOf = (t: number) => r0 + ((t - t0) / YEAR_MS) * pitch

  // Faint guide thread along the whole spiral.
  ctx.save()
  ctx.strokeStyle = 'rgba(244,235,221,0.07)'
  ctx.lineWidth = Math.max(1, 1.1 * u)
  ctx.beginPath()
  for (let i = 0; i <= n; i++) {
    const t = t0 + i * DAY
    const a = angleOf(t)
    const r = radiusOf(t)
    const x = cx + Math.cos(a) * r
    const y = cy + Math.sin(a) * r
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()

  // Month initials around the outside, Jan at the top.
  ctx.save()
  const outer = radiusOf(t0 + n * DAY) + maxLen * 0.5 + 34 * u
  setFont(ctx, `600 ${15 * u}px ${SANS}`, 2 * u)
  ctx.fillStyle = K.cream3
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  'JFMAMJJASOND'.split('').forEach((ch, m) => {
    const a = -Math.PI / 2 + ((m + 0.5) / 12) * Math.PI * 2
    ctx.fillText(ch, cx + Math.cos(a) * outer + u, cy + Math.sin(a) * outer)
  })
  ctx.strokeStyle = 'rgba(244,235,221,0.10)'
  ctx.lineWidth = Math.max(1, u)
  for (let m = 0; m < 12; m++) {
    const a = -Math.PI / 2 + (m / 12) * Math.PI * 2
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * (outer - 9 * u), cy + Math.sin(a) * (outer - 9 * u))
    ctx.lineTo(cx + Math.cos(a) * (outer + 9 * u), cy + Math.sin(a) * (outer + 9 * u))
    ctx.stroke()
  }
  ctx.restore()

  // Build marks.
  const marks: Mark[] = []
  const silent: [number, number][] = []
  let busiest = { i: -1, n: -1 }
  for (let i = 0; i < n; i++) {
    const t = t0 + i * DAY + DAY / 2
    const a = angleOf(t)
    const r = radiusOf(t)
    const total = totals[i]
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    if (total === 0) {
      silent.push([cx + ca * r, cy + sa * r])
      continue
    }
    if (total > busiest.n) busiest = { i, n: total }
    const len = Math.max(2.5 * u, maxLen * Math.min(1.1, Math.sqrt(total / ref)))
    const arc = (r * Math.PI * 2) / 365.2425
    const w = clamp(arc * 0.5, 1.2 * u, 3.6 * u)
    // Amplify the share a little so balanced days still read as "who led".
    const shareB = 0.5 + (dailyB[i] / total - 0.5) * 2
    marks.push({ x0: cx + ca * (r - len / 2), y0: cy + sa * (r - len / 2), x1: cx + ca * (r + len / 2), y1: cy + sa * (r + len / 2), w, c: duetColor(shareB), n: total })
  }

  // Silent days: faint dots on the thread.
  ctx.save()
  ctx.fillStyle = 'rgba(201,191,207,0.32)'
  for (const [x, y] of silent) {
    ctx.beginPath()
    ctx.arc(x, y, 1.6 * u, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()

  // Two additive passes: a wide soft glow, then the crisp core.
  ctx.save()
  ctx.lineCap = 'round'
  ctx.globalCompositeOperation = 'lighter'
  for (const m of marks) {
    ctx.strokeStyle = rgba(m.c, 0.06)
    ctx.lineWidth = m.w * 3.2
    ctx.beginPath()
    ctx.moveTo(m.x0, m.y0)
    ctx.lineTo(m.x1, m.y1)
    ctx.stroke()
  }
  ctx.restore()
  ctx.save()
  ctx.lineCap = 'round'
  for (const m of marks) {
    ctx.strokeStyle = rgba(m.c, 0.92)
    ctx.lineWidth = m.w
    ctx.beginPath()
    ctx.moveTo(m.x0, m.y0)
    ctx.lineTo(m.x1, m.y1)
    ctx.stroke()
  }
  ctx.restore()

  // The busiest day: a small gold ring at its outer tip.
  if (busiest.i >= 0) {
    const m = marks.find((k) => k.n === busiest.n)
    if (m) {
      ctx.save()
      ctx.strokeStyle = K.gold
      ctx.lineWidth = 1.8 * u
      ctx.beginPath()
      ctx.arc(m.x1, m.y1, 7 * u, 0, Math.PI * 2)
      ctx.stroke()
      ctx.restore()
    }
  }

  // Year labels on the New Year line (twelve o'clock), between the rings.
  ctx.save()
  const firstYear = new Date(t0).getUTCFullYear()
  const lastYear = new Date(t0 + n * DAY).getUTCFullYear()
  setFont(ctx, `italic 400 ${22 * u}px ${SERIF}`, 0)
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  for (let y = firstYear; y <= lastYear; y++) {
    const t = Math.max(t0, Date.UTC(y, 0, 1))
    if (t > t0 + n * DAY) break
    const r = radiusOf(t)
    const x = cx + 10 * u
    const yy = cy - r
    ctx.fillStyle = 'rgba(15,11,20,0.55)'
    const tw = ctx.measureText(String(y)).width
    ctx.beginPath()
    ctx.roundRect(x - 5 * u, yy - 13 * u, tw + 10 * u, 26 * u, 6 * u)
    ctx.fill()
    ctx.fillStyle = K.cream2
    ctx.fillText(String(y), x, yy + u)
  }
  ctx.restore()

  // A first-light dot where it all begins.
  ctx.save()
  const sa0 = angleOf(t0)
  const sx = cx + Math.cos(sa0) * r0
  const sy = cy + Math.sin(sa0) * r0
  const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, 22 * u)
  g.addColorStop(0, 'rgba(244,235,221,0.9)')
  g.addColorStop(0.25, 'rgba(244,235,221,0.25)')
  g.addColorStop(1, 'rgba(244,235,221,0)')
  ctx.fillStyle = g
  ctx.fillRect(sx - 22 * u, sy - 22 * u, 44 * u, 44 * u)
  ctx.restore()
}

/** Legend row: sample mark + description, and a who-spoke-more colour bar. */
function drawLegend(ctx: CanvasRenderingContext2D, story: Story, cx: number, y: number, u: number, width: number) {
  ctx.save()
  const text = 'each mark is a day · longer = more messages · colour = who spoke more'
  const size = fitSize(ctx, text, width, (s) => `400 ${s}px ${SANS}`, 19 * u, 12 * u)
  setFont(ctx, `400 ${size}px ${SANS}`, 0.2 * u)
  ctx.fillStyle = K.cream2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(text, cx, y)

  // Colour scale: Maya ——— Theo, with silent-day dot and busiest-day ring.
  const by = y + 42 * u
  const bw = Math.min(width * 0.5, 380 * u)
  const grad = ctx.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0)
  grad.addColorStop(0, K.a)
  grad.addColorStop(0.5, K.mid)
  grad.addColorStop(1, K.b)
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.roundRect(cx - bw / 2, by - 3 * u, bw, 6 * u, 3 * u)
  ctx.fill()
  const nameSize = 17 * u
  setFont(ctx, `600 ${nameSize}px ${SANS}`, 0.5 * u)
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ctx.fillStyle = K.a
  ctx.fillText(shortName(story.people[0].name), cx - bw / 2 - 14 * u, by + u)
  ctx.textAlign = 'left'
  ctx.fillStyle = K.b
  ctx.fillText(shortName(story.people[1].name), cx + bw / 2 + 14 * u, by + u)

  const ly = by + 40 * u
  setFont(ctx, `400 ${15 * u}px ${SANS}`, 0.3 * u)
  const items: [string, (x: number) => void][] = [
    [
      'quiet day',
      (x) => {
        ctx.fillStyle = 'rgba(201,191,207,0.6)'
        ctx.beginPath()
        ctx.arc(x, ly, 2.4 * u, 0, Math.PI * 2)
        ctx.fill()
      },
    ],
    [
      'busiest day',
      (x) => {
        ctx.strokeStyle = K.gold
        ctx.lineWidth = 1.8 * u
        ctx.beginPath()
        ctx.arc(x, ly, 6 * u, 0, Math.PI * 2)
        ctx.stroke()
      },
    ],
    [
      'first message',
      (x) => {
        const g = ctx.createRadialGradient(x, ly, 0, x, ly, 10 * u)
        g.addColorStop(0, 'rgba(244,235,221,0.95)')
        g.addColorStop(1, 'rgba(244,235,221,0)')
        ctx.fillStyle = g
        ctx.fillRect(x - 10 * u, ly - 10 * u, 20 * u, 20 * u)
      },
    ],
  ]
  const gap = 34 * u
  const widths = items.map(([t]) => ctx.measureText(t).width + 22 * u)
  let x = cx - (widths.reduce((p, q) => p + q, 0) + gap * (items.length - 1)) / 2
  ctx.textAlign = 'left'
  items.forEach(([t, glyph], i) => {
    glyph(x + 6 * u)
    ctx.fillStyle = K.cream3
    ctx.fillText(t, x + 20 * u, ly + u)
    x += widths[i] + gap
  })
  ctx.restore()
}

function drawStatTriplet(ctx: CanvasRenderingContext2D, story: Story, cx: number, y: number, u: number, width: number, numSize: number) {
  const stats: [string, string][] = [
    [fmtNum(story.totals.messages), 'messages'],
    [fmtNum(story.range.days), 'days'],
    [fmtNum(story.activity.longestStreak.days), 'day streak'],
  ]
  const col = width / 3
  ctx.save()
  stats.forEach(([value, label], i) => {
    const x = cx - width / 2 + col * (i + 0.5)
    setFont(ctx, `400 ${numSize}px ${SERIF}`, 0)
    ctx.fillStyle = K.cream
    ctx.textAlign = 'center'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(value, x, y)
    drawEyebrow(ctx, label, x, y + numSize * 0.42, Math.max(11 * u, numSize * 0.2), K.cream3, 'center')
    if (i > 0) {
      ctx.strokeStyle = 'rgba(244,235,221,0.14)'
      ctx.lineWidth = Math.max(1, u)
      ctx.beginPath()
      ctx.moveTo(cx - width / 2 + col * i, y - numSize * 0.75)
      ctx.lineTo(cx - width / 2 + col * i, y + numSize * 0.4)
      ctx.stroke()
    }
  })
  ctx.restore()
}

/** Whether drawNames(..., { wrap: true }) will break the title onto two lines. */
function namesWrap(ctx: CanvasRenderingContext2D, story: Story, maxSize: number, maxWidth: number): boolean {
  const s = maxSize * 0.62
  ctx.font = `400 ${s}px ${SERIF}`
  const w = ctx.measureText(story.people[0].name).width + ctx.measureText(story.people[1].name).width
  ctx.font = `italic 400 ${s}px ${SERIF}`
  return w + ctx.measureText(' & ').width > maxWidth
}

export function fingerprintAlt(story: Story): string {
  const [a, b] = story.people.map((p) => p.name)
  return `Our Fingerprint: a spiral of ${fmtNum(story.range.days)} days of messages between ${a} and ${b}, ${fmtDate(story.range.first)} to ${fmtDate(story.range.last)}. One ring per year; each day is a mark, longer for more messages, coloured by who sent more. ${fmtNum(story.totals.messages)} messages in total.`
}

export function drawFingerprint(ctx: CanvasRenderingContext2D, story: Story, opts: FingerprintOptions) {
  const { width: W, height: H, variant } = opts
  const u = W / 1080
  ctx.save()
  ctx.clearRect(0, 0, W, H)
  const poster = variant === 'poster'
  const cy = poster ? 520 * u : H * 0.47
  const R = poster ? 300 * u : W * 0.4
  paintBackground(ctx, W, H, poster ? { ax: 0.2, ay: 0.28, bx: 0.82, by: 0.5, r: 0.55 } : { ax: 0.15, ay: 0.38, bx: 0.88, by: 0.58, r: 0.5 })

  // A soft halo behind the spiral.
  const halo = ctx.createRadialGradient(W / 2, cy, R * 0.1, W / 2, cy, R * 1.25)
  halo.addColorStop(0, 'rgba(229,143,192,0.10)')
  halo.addColorStop(1, 'rgba(229,143,192,0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, W, H)

  drawSpiral(ctx, story, W / 2, cy, R, u)

  const range = `${fmtDate(story.range.first)} — ${fmtDate(story.range.last)}`
  const inner = W - 2 * 96 * u
  if (poster) {
    // Poster is laid out on a 1080 × 1440 grid (u = W / 1080).
    drawEyebrow(ctx, 'Our fingerprint', W / 2, 78 * u, 18 * u, K.cream3, 'center')
    if (story.demo) drawDemoMark(ctx, W / 2, 122 * u, u * 0.9, 'center')
    const wraps = namesWrap(ctx, story, 112 * u, inner)
    const n = drawNames(ctx, story, W / 2, (wraps ? 948 : 978) * u, 112 * u, inner, 'center', { wrap: true })
    const ry = wraps ? 948 * u + n.extra + 50 * u : 1040 * u
    setFont(ctx, `italic 400 ${36 * u}px ${SERIF}`, 0)
    ctx.fillStyle = K.cream2
    ctx.textAlign = 'center'
    ctx.fillText(range, W / 2, ry)
    drawStatTriplet(ctx, story, W / 2, ry + (wraps ? 94 : 104) * u, u, Math.min(inner, 720 * u), wraps ? 52 * u : 60 * u)
    drawLegend(ctx, story, W / 2, H - 196 * u, u * 0.9, inner)
    drawWordmark(ctx, W / 2, H - 46 * u, 30 * u, 'center')
  } else {
    drawEyebrow(ctx, 'Our fingerprint', W / 2, 150 * u, 20 * u, K.cream3, 'center')
    const y0 = namesWrap(ctx, story, 104 * u, inner) ? 222 * u : 262 * u
    const n = drawNames(ctx, story, W / 2, y0, 104 * u, inner, 'center', { wrap: true })
    const base = y0 + n.extra
    setFont(ctx, `italic 400 ${34 * u}px ${SERIF}`, 0)
    ctx.fillStyle = K.cream2
    ctx.textAlign = 'center'
    ctx.fillText(range, W / 2, base + n.size * 0.25 + 30 * u)
    drawStatTriplet(ctx, story, W / 2, H * 0.79, u, Math.min(inner, 820 * u), 76 * u)
    drawLegend(ctx, story, W / 2, H * 0.855, u, inner)
    drawWordmark(ctx, W / 2, H - 84 * u, 34 * u, 'center')
    if (story.demo) drawDemoMark(ctx, W / 2, 84 * u, u, 'center')
  }

  paintGrain(ctx, W, H, storySeed(story))
  ctx.restore()
}
