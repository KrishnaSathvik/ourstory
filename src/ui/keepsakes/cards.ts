/**
 * Shareable 9:16 keepsake cards, drawn on canvas from Story aggregates.
 * Same identity as the fingerprint: ink, Ember & Tide, Instrument Serif.
 * No card ever contains message text; only counts, dates, app-written
 * labels (award titles, chapter themes) and single emoji.
 */
import type { Story } from '../../analysis/story'
import type { PersonId } from '../../core/types'
import { fmtCompact, fmtHour, fmtNum, fmtShortDate } from '../../analysis/format'
import {
  drawDemoMark,
  drawEyebrow,
  drawNames,
  drawWordmark,
  duetColor,
  EMOJI,
  ensureKeepsakeFonts,
  fitSize,
  K,
  paintBackground,
  paintGrain,
  rgba,
  SANS,
  SERIF,
  setFont,
  shortName,
  storySeed,
  wrapLines,
} from './fingerprint'

export { ensureKeepsakeFonts }

export interface CardOptions {
  width: number
  height: number
}

/** Person colour for text (ink variant, legible at small sizes on paper). */
const pc = (p: PersonId) => (p === 'a' ? K.aInk : K.bInk)
const pname = (s: Story, p: PersonId) => s.people[p === 'a' ? 0 : 1].name
const sum = (xs: number[]) => xs.reduce((p, q) => p + q, 0)

/** Common frame: background, header (names + eyebrow), title, footer. Returns content top & unit. */
function frame(ctx: CanvasRenderingContext2D, _story: Story, o: CardOptions, eyebrow: string, title: [string, string], glow: Parameters<typeof paintBackground>[3]) {
  const { width: W, height: H } = o
  const u = W / 1080
  ctx.clearRect(0, 0, W, H)
  paintBackground(ctx, W, H, glow)
  const x = 96 * u
  drawEyebrow(ctx, eyebrow, x, 150 * u, 20 * u, K.text3)
  // Title: first part roman, second italic.
  const size = 132 * u
  setFont(ctx, `400 ${size}px ${SERIF}`, -size * 0.01)
  ctx.fillStyle = K.text
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  const [roman, italic] = title
  const ty = 300 * u
  ctx.fillText(roman, x, ty)
  const rw = ctx.measureText(roman + ' ').width
  setFont(ctx, `italic 400 ${size}px ${SERIF}`, -size * 0.01)
  const grad = ctx.createLinearGradient(x + rw, 0, x + rw + ctx.measureText(italic).width, 0)
  grad.addColorStop(0, K.a)
  grad.addColorStop(0.5, K.mid)
  grad.addColorStop(1, K.b)
  ctx.fillStyle = grad
  ctx.fillText(italic, x + rw, ty)
  setFont(ctx, ctx.font, 0)
  return { W, H, u, x, top: ty + 70 * u, inner: W - 2 * x }
}

function footer(ctx: CanvasRenderingContext2D, story: Story, W: number, H: number, u: number) {
  const fy = H - 96 * u
  ctx.save()
  ctx.strokeStyle = 'rgba(43,33,48,0.14)'
  ctx.lineWidth = Math.max(1, u)
  ctx.beginPath()
  ctx.moveTo(96 * u, fy - 70 * u)
  ctx.lineTo(W - 96 * u, fy - 70 * u)
  ctx.stroke()
  ctx.restore()
  drawNames(ctx, story, 96 * u, fy, 46 * u, W * 0.5, 'left')
  drawWordmark(ctx, W - 96 * u, fy, 40 * u, 'right')
  if (story.demo) drawDemoMark(ctx, W / 2, 72 * u, u, 'center')
  paintGrain(ctx, W, H, storySeed(story))
}

/** Thin two-tone bar, with a little gap between the halves. */
function splitBar(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, pair: [number, number], u: number) {
  const total = pair[0] + pair[1] || 1
  const gap = 4 * u
  const wa = Math.max(0, (w - gap) * (pair[0] / total))
  ctx.save()
  ctx.fillStyle = K.a
  ctx.beginPath()
  ctx.roundRect(x, y, Math.max(h, wa), h, h / 2)
  ctx.fill()
  ctx.fillStyle = K.b
  ctx.beginPath()
  ctx.roundRect(x + wa + gap, y, Math.max(h, w - wa - gap), h, h / 2)
  ctx.fill()
  ctx.restore()
}

function pairLine(ctx: CanvasRenderingContext2D, story: Story, x: number, y: number, pair: [number, number], u: number, fmt = fmtNum) {
  ctx.save()
  setFont(ctx, `500 ${26 * u}px ${SANS}`, 0)
  ctx.textBaseline = 'alphabetic'
  ctx.textAlign = 'left'
  const total = pair[0] + pair[1] || 1
  const parts: [string, string][] = [
    [`${pname(story, 'a')} ${fmt(pair[0])}`, K.aInk],
    [`  ·  `, K.text3],
    [`${pname(story, 'b')} ${fmt(pair[1])}`, K.bInk],
    [`   ${Math.round((pair[0] / total) * 100)} / ${100 - Math.round((pair[0] / total) * 100)}`, K.text3],
  ]
  let cx = x
  for (const [t, c] of parts) {
    ctx.fillStyle = c
    ctx.fillText(t, cx, y)
    cx += ctx.measureText(t).width
  }
  ctx.restore()
}

// ============================================================ numbers ===

export function drawNumbersCard(ctx: CanvasRenderingContext2D, story: Story, o: CardOptions) {
  ctx.save()
  const { W, H, u, x, top, inner } = frame(ctx, story, o, 'Our story, counted', ['By the', 'numbers'], { ax: 0.1, ay: 0.12, bx: 0.95, by: 0.85, r: 0.55 })
  const words = story.totals.words
  const streak = story.activity.longestStreak
  const rows: { value: string; label: string; draw?: (y: number) => void }[] = [
    { value: fmtNum(story.totals.messages), label: 'messages', draw: (y) => (splitBar(ctx, x, y, inner, 10 * u, story.totals.byPerson, u), pairLine(ctx, story, x, y + 52 * u, story.totals.byPerson, u)) },
    {
      value: fmtNum(story.range.days),
      label: 'days of us',
      draw: (y) => {
        setFont(ctx, `400 ${26 * u}px ${SANS}`, 0)
        ctx.fillStyle = K.text2
        ctx.fillText(`${fmtNum(story.activity.activeDays)} of them with at least one message`, x, y + 26 * u)
      },
    },
    { value: fmtCompact(words[0] + words[1]), label: 'words', draw: (y) => (splitBar(ctx, x, y, inner, 10 * u, words, u), pairLine(ctx, story, x, y + 52 * u, words, u, fmtCompact)) },
    {
      value: fmtNum(streak.days),
      label: 'day streak',
      draw: (y) => {
        setFont(ctx, `400 ${26 * u}px ${SANS}`, 0)
        ctx.fillStyle = K.text2
        ctx.fillText(streak.days ? `${fmtShortDate(streak.start)} – ${fmtShortDate(streak.end)}, never a day apart` : 'still to come', x, y + 26 * u)
      },
    },
  ]
  const avail = H - 260 * u - top
  const rowH = avail / rows.length
  rows.forEach((r, i) => {
    const y = top + rowH * i + 168 * u
    const size = fitSize(ctx, r.value, inner * 0.72, (s) => `400 ${s}px ${SERIF}`, 172 * u, 90 * u)
    setFont(ctx, `400 ${size}px ${SERIF}`, -size * 0.015)
    ctx.fillStyle = K.text
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    ctx.fillText(r.value, x - 4 * u, y)
    const vw = ctx.measureText(r.value).width
    setFont(ctx, `italic 400 ${54 * u}px ${SERIF}`, 0)
    ctx.fillStyle = K.text2
    ctx.fillText(r.label, x + vw + 22 * u, y)
    setFont(ctx, ctx.font, 0)
    r.draw?.(y + 40 * u)
  })
  footer(ctx, story, W, H, u)
  ctx.restore()
}

export const numbersAlt = (s: Story) =>
  `By the numbers: ${fmtNum(s.totals.messages)} messages, ${fmtNum(s.range.days)} days, ${fmtNum(s.totals.words[0] + s.totals.words[1])} words, and a longest streak of ${fmtNum(s.activity.longestStreak.days)} days.`

// ============================================================= awards ===

export function drawAwardsCard(ctx: CanvasRenderingContext2D, story: Story, o: CardOptions) {
  ctx.save()
  const { W, H, u, x, top, inner } = frame(ctx, story, o, 'And the award goes to', ['The', 'awards'], { ax: 0.9, ay: 0.1, bx: 0.05, by: 0.9, r: 0.55 })
  const awards = story.awards.slice(0, 5)
  const avail = H - 250 * u - top
  const rowH = Math.min(270 * u, avail / Math.max(awards.length, 1))
  if (!awards.length) {
    setFont(ctx, `italic 400 ${56 * u}px ${SERIF}`, 0)
    ctx.fillStyle = K.text2
    ctx.fillText('Awards appear once there is enough to go on.', x, top + 200 * u)
  }
  awards.forEach((a, i) => {
    const y = top + 40 * u + rowH * i
    const c = pc(a.p)
    const rgb = duetColor(a.p === 'a' ? 0 : 1)
    const disc = 66 * u
    const dcx = x + disc
    const dcy = y + disc + 8 * u
    // Glowing disc behind the emoji.
    const g = ctx.createRadialGradient(dcx, dcy, 0, dcx, dcy, disc * 1.5)
    g.addColorStop(0, rgba(rgb, 0.2))
    g.addColorStop(0.6, rgba(rgb, 0.07))
    g.addColorStop(1, rgba(rgb, 0))
    ctx.fillStyle = g
    ctx.fillRect(dcx - disc * 1.6, dcy - disc * 1.6, disc * 3.2, disc * 3.2)
    ctx.strokeStyle = rgba(rgb, 0.55)
    ctx.lineWidth = 1.5 * u
    ctx.beginPath()
    ctx.arc(dcx, dcy, disc, 0, Math.PI * 2)
    ctx.stroke()
    ctx.font = `${62 * u}px ${EMOJI}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillStyle = K.text
    ctx.fillText(a.emoji || '★', dcx, dcy + 4 * u)

    const tx = x + disc * 2 + 40 * u
    const tw = inner - (tx - x)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    const ts = fitSize(ctx, a.title, tw, (s) => `400 ${s}px ${SERIF}`, 62 * u, 36 * u)
    setFont(ctx, `400 ${ts}px ${SERIF}`, 0)
    ctx.fillStyle = K.text
    ctx.fillText(a.title, tx, y + 54 * u)
    setFont(ctx, `700 ${30 * u}px ${SANS}`, 0.3 * u)
    ctx.fillStyle = c
    const name = pname(story, a.p)
    ctx.fillText(name, tx, y + 102 * u)
    const nw = ctx.measureText(name).width
    setFont(ctx, `500 ${30 * u}px ${SANS}`, 0)
    ctx.fillStyle = K.text2
    if (a.stat) ctx.fillText(`  ·  ${a.stat}`, tx + nw, y + 102 * u)
    setFont(ctx, `400 ${24 * u}px ${SANS}`, 0)
    ctx.fillStyle = K.text3
    wrapLines(ctx, a.detail, tw, 2).forEach((line, li) => ctx.fillText(line, tx, y + 146 * u + li * 32 * u))
  })
  footer(ctx, story, W, H, u)
  ctx.restore()
}

export const awardsAlt = (s: Story) =>
  `The awards: ${s.awards
    .slice(0, 5)
    .map((a) => `${a.title} goes to ${pname(s, a.p)}${a.stat ? ` (${a.stat})` : ''}`)
    .join('; ')}.`

// ============================================================== hours ===

function hourTotals(story: Story): [number[], number[]] {
  const [wa, wb] = story.activity.weekHour
  const col = (g: number[][]) => Array.from({ length: 24 }, (_, h) => sum(g.map((row) => row[h] ?? 0)))
  return [col(wa), col(wb)]
}

const argmax = (xs: number[]) => xs.reduce((best, x, i) => (x > xs[best] ? i : best), 0)

export function drawHoursCard(ctx: CanvasRenderingContext2D, story: Story, o: CardOptions) {
  ctx.save()
  const { W, H, u, x, top, inner } = frame(ctx, story, o, 'Around the clock', ['Our', 'hours'], { ax: 0.2, ay: 0.55, bx: 0.8, by: 0.55, r: 0.5 })
  const [ha, hb] = hourTotals(story)
  const max = Math.max(1, ...ha, ...hb)
  const cx = W / 2
  const cy = top + 470 * u
  const r0 = 150 * u
  const r1 = 410 * u
  const step = (Math.PI * 2) / 24

  // Rings + hour ticks.
  ctx.save()
  ctx.strokeStyle = 'rgba(43,33,48,0.08)'
  ctx.lineWidth = Math.max(1, u)
  for (const f of [0, 0.5, 1]) {
    ctx.beginPath()
    ctx.arc(cx, cy, r0 + (r1 - r0) * f, 0, Math.PI * 2)
    ctx.stroke()
  }
  for (let h = 0; h < 24; h++) {
    const a = -Math.PI / 2 + h * step
    ctx.strokeStyle = h % 6 === 0 ? 'rgba(43,33,48,0.3)' : 'rgba(43,33,48,0.1)'
    ctx.beginPath()
    ctx.moveTo(cx + Math.cos(a) * (r0 - 10 * u), cy + Math.sin(a) * (r0 - 10 * u))
    ctx.lineTo(cx + Math.cos(a) * (r1 + (h % 6 === 0 ? 22 : 10) * u), cy + Math.sin(a) * (r1 + (h % 6 === 0 ? 22 : 10) * u))
    ctx.stroke()
  }
  ctx.restore()

  // Night arc (midnight–5am) as a faint gold band.
  ctx.save()
  ctx.strokeStyle = 'rgba(168,106,18,0.4)'
  ctx.lineWidth = 4 * u
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.arc(cx, cy, r0 - 26 * u, -Math.PI / 2 + 0.03, -Math.PI / 2 + 5 * step - 0.03)
  ctx.stroke()
  ctx.restore()

  // Petals: A takes the first half of each hour, B the second.
  const petal = (h: number, half: 0 | 1, v: number, color: string, rgb: [number, number, number]) => {
    const len = (r1 - r0) * Math.sqrt(v / max)
    if (len <= 0) return
    const pad = step * 0.06
    const a0 = -Math.PI / 2 + h * step + half * (step / 2) + pad
    const a1 = a0 + step / 2 - pad * 2
    const rr = r0 + len
    ctx.beginPath()
    ctx.arc(cx, cy, r0, a0, a1)
    ctx.arc(cx, cy, rr, a1, a0, true)
    ctx.closePath()
    const g = ctx.createRadialGradient(cx, cy, r0, cx, cy, rr)
    g.addColorStop(0, rgba(rgb, 0.35))
    g.addColorStop(1, color)
    ctx.fillStyle = g
    ctx.fill()
  }
  ctx.save()
  ctx.shadowBlur = 24 * u
  for (let h = 0; h < 24; h++) {
    ctx.shadowColor = 'rgba(226,96,63,0.28)'
    petal(h, 0, ha[h], K.a, duetColor(0))
    ctx.shadowColor = 'rgba(122,120,230,0.3)'
    petal(h, 1, hb[h], K.b, duetColor(1))
  }
  ctx.restore()

  // Hour labels.
  ctx.save()
  setFont(ctx, `600 ${22 * u}px ${SANS}`, 1.5 * u)
  ctx.fillStyle = K.text2
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const labels: [number, string][] = [
    [0, 'MIDNIGHT'],
    [6, '6 AM'],
    [12, 'NOON'],
    [18, '6 PM'],
  ]
  for (const [h, t] of labels) {
    const a = -Math.PI / 2 + h * step
    const rr = r1 + 58 * u
    ctx.fillText(t, cx + Math.cos(a) * rr, cy + Math.sin(a) * rr)
  }
  ctx.restore()

  // Centre: the shared peak hour.
  ctx.save()
  ctx.textAlign = 'center'
  ctx.textBaseline = 'alphabetic'
  setFont(ctx, `400 ${84 * u}px ${SERIF}`, 0)
  ctx.fillStyle = K.text
  ctx.fillText(fmtHour(story.activity.peakHour), cx, cy + 18 * u)
  drawEyebrow(ctx, 'our hour', cx, cy + 62 * u, 17 * u, K.text3, 'center')
  ctx.restore()

  // Facts under the clock.
  const fy = cy + r1 + 150 * u
  const col = inner / 2
  const facts: [PersonId, string, string][] = [
    ['a', fmtHour(argmax(ha)), `${Math.round(story.activity.nightShare[0] * 100)}% after midnight`],
    ['b', fmtHour(argmax(hb)), `${Math.round(story.activity.nightShare[1] * 100)}% after midnight`],
  ]
  facts.forEach(([p, hour, night], i) => {
    const fx = x + col * i
    drawEyebrow(ctx, `${shortName(pname(story, p), 14)}’s hour`, fx, fy, 19 * u, pc(p))
    setFont(ctx, `400 ${78 * u}px ${SERIF}`, 0)
    ctx.fillStyle = K.text
    ctx.textAlign = 'left'
    ctx.fillText(hour, fx, fy + 82 * u)
    setFont(ctx, `400 ${25 * u}px ${SANS}`, 0)
    ctx.fillStyle = K.text2
    ctx.fillText(night, fx, fy + 126 * u)
  })
  // Tiny key.
  ctx.save()
  const ky = fy + 200 * u
  setFont(ctx, `400 ${22 * u}px ${SANS}`, 0)
  ctx.fillStyle = K.text3
  ctx.textAlign = 'left'
  ctx.fillText('petal length = messages in that hour, all days combined', x, ky)
  ctx.restore()
  footer(ctx, story, W, H, u)
  ctx.restore()
}

export function hoursAlt(s: Story): string {
  const [ha, hb] = hourTotals(s)
  return `Our hours: a 24-hour clock of when messages were sent. Busiest together at ${fmtHour(s.activity.peakHour)}; ${s.people[0].name} peaks at ${fmtHour(argmax(ha))}, ${s.people[1].name} at ${fmtHour(argmax(hb))}.`
}

// =========================================================== chapters ===

/** Up to `n` chapters in order, preferring the busiest when there are more. */
function pickChapters(story: Story, n: number) {
  if (story.chapters.length <= n) return story.chapters
  const keep = new Set(
    [...story.chapters]
      .map((c, i) => ({ c, i }))
      .sort((p, q) => q.c.messages - p.c.messages)
      .slice(0, n)
      .map((x) => x.i),
  )
  return story.chapters.filter((_, i) => keep.has(i))
}

export function drawChaptersCard(ctx: CanvasRenderingContext2D, story: Story, o: CardOptions) {
  ctx.save()
  const { W, H, u, x, top, inner } = frame(ctx, story, o, `${new Date(story.range.first).getUTCFullYear()} — ${new Date(story.range.last).getUTCFullYear()}`, ['Our', 'chapters'], { ax: 0.05, ay: 0.3, bx: 0.95, by: 0.7, r: 0.55 })
  const chapters = pickChapters(story, 6)
  const maxMsgs = Math.max(1, ...chapters.map((c) => c.messages))
  const lineX = x + 14 * u
  const avail = H - 270 * u - top - 30 * u
  const rowH = Math.min(330 * u, avail / Math.max(chapters.length, 1))
  const y0 = top + 70 * u

  if (chapters.length) {
    ctx.save()
    const g = ctx.createLinearGradient(0, y0, 0, y0 + rowH * (chapters.length - 1))
    g.addColorStop(0, rgba(duetColor(0), 0.6))
    g.addColorStop(1, rgba(duetColor(1), 0.6))
    ctx.strokeStyle = g
    ctx.lineWidth = 2 * u
    ctx.beginPath()
    ctx.moveTo(lineX, y0)
    ctx.lineTo(lineX, y0 + rowH * (chapters.length - 1))
    ctx.stroke()
    ctx.restore()
  }

  chapters.forEach((c, i) => {
    const y = y0 + rowH * i
    const total = c.byPerson[0] + c.byPerson[1] || 1
    const rgb = duetColor(0.5 + (c.byPerson[1] / total - 0.5) * 3)
    // Node.
    ctx.save()
    const g = ctx.createRadialGradient(lineX, y, 0, lineX, y, 28 * u)
    g.addColorStop(0, rgba(rgb, 0.35))
    g.addColorStop(1, rgba(rgb, 0))
    ctx.fillStyle = g
    ctx.fillRect(lineX - 28 * u, y - 28 * u, 56 * u, 56 * u)
    ctx.fillStyle = K.paper
    ctx.strokeStyle = rgba(rgb, 1)
    ctx.lineWidth = 3 * u
    ctx.beginPath()
    ctx.arc(lineX, y, 10 * u, 0, Math.PI * 2)
    ctx.fill()
    ctx.stroke()
    ctx.restore()

    const tx = x + 70 * u
    const tw = inner - 70 * u
    drawEyebrow(ctx, c.label, tx, y + 8 * u, 20 * u, K.text2)
    ctx.textAlign = 'left'
    ctx.textBaseline = 'alphabetic'
    setFont(ctx, `400 ${56 * u}px ${SERIF}`, 0)
    ctx.fillStyle = K.text
    const lines = wrapLines(ctx, c.theme, tw - (c.topEmoji ? 80 * u : 0), rowH > 250 * u ? 2 : 1)
    lines.forEach((l, li) => ctx.fillText(l, tx, y + 68 * u + li * 58 * u))
    if (c.topEmoji) {
      ctx.font = `${52 * u}px ${EMOJI}`
      ctx.textAlign = 'right'
      ctx.fillText(c.topEmoji, x + inner, y + 64 * u)
      ctx.textAlign = 'left'
    }
    const by = y + 68 * u + (lines.length - 1) * 58 * u + 34 * u
    const bw = Math.max(24 * u, tw * 0.62 * (c.messages / maxMsgs))
    splitBar(ctx, tx, by, bw, 8 * u, c.byPerson, u)
    setFont(ctx, `500 ${24 * u}px ${SANS}`, 0)
    ctx.fillStyle = K.text3
    ctx.fillText(`${fmtNum(c.messages)} messages`, tx + bw + 18 * u, by + 9 * u)
    // App-written detail line(s), as space allows.
    const room = Math.floor((y + rowH - 60 * u - (by + 52 * u)) / (32 * u)) + 1
    if (room > 0 && c.themeDetail) {
      setFont(ctx, `400 ${24 * u}px ${SANS}`, 0)
      ctx.fillStyle = K.text3
      wrapLines(ctx, c.themeDetail, tw, Math.min(2, room)).forEach((l, li) => ctx.fillText(l, tx, by + 52 * u + li * 32 * u))
    }
  })
  if (!chapters.length) {
    setFont(ctx, `italic 400 ${56 * u}px ${SERIF}`, 0)
    ctx.fillStyle = K.text2
    ctx.fillText('Your first chapter is still being written.', x, top + 200 * u)
  }
  footer(ctx, story, W, H, u)
  ctx.restore()
}

export const chaptersAlt = (s: Story) => `Our chapters: ${pickChapters(s, 6)
  .map((c) => `${c.label}, “${c.theme}”, ${fmtNum(c.messages)} messages`)
  .join('; ')}.`

// ============================================================ registry ===

export interface CardDef {
  id: 'numbers' | 'awards' | 'hours' | 'chapters'
  title: string
  blurb: string
  draw: (ctx: CanvasRenderingContext2D, story: Story, o: CardOptions) => void
  alt: (story: Story) => string
}

export const CARDS: CardDef[] = [
  { id: 'numbers', title: 'By the numbers', blurb: 'Messages, days, words and your longest streak.', draw: drawNumbersCard, alt: numbersAlt },
  { id: 'awards', title: 'The awards', blurb: 'Who won what, in each other’s colours.', draw: drawAwardsCard, alt: awardsAlt },
  { id: 'hours', title: 'Our hours', blurb: 'A 24-hour clock of when you talk.', draw: drawHoursCard, alt: hoursAlt },
  { id: 'chapters', title: 'Our chapters', blurb: 'Each era, in a line.', draw: drawChaptersCard, alt: chaptersAlt },
]
