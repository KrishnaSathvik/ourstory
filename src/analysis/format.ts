/** Formatting helpers. All dates are wall-clock-as-UTC, so we format in UTC. */

const num = new Intl.NumberFormat('en-US')
export const fmtNum = (n: number) => num.format(Math.round(n))

export const fmtCompact = (n: number) =>
  n >= 10_000 ? new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n) : fmtNum(n)

const dateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'long', year: 'numeric' })
const shortDateFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', day: 'numeric', month: 'short', year: 'numeric' })
const monthFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'long', year: 'numeric' })
const monthShortFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', month: 'short' })
const weekdayFmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'UTC', weekday: 'long' })

export const fmtDate = (t: number) => dateFmt.format(t)
export const fmtShortDate = (t: number) => shortDateFmt.format(t)
export const fmtMonth = (t: number) => monthFmt.format(t)
export const fmtMonthShort = (t: number) => monthShortFmt.format(t)
export const fmtWeekday = (t: number) => weekdayFmt.format(t)

export const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

export function fmtHour(h: number): string {
  if (h === 0) return 'midnight'
  if (h === 12) return 'noon'
  return h < 12 ? `${h} am` : `${h - 12} pm`
}

export function fmtDuration(ms: number): string {
  if (ms < 0) return '—'
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s} sec`
  const m = Math.round(s / 60)
  if (m < 60) return `${m} min`
  const h = Math.floor(m / 60)
  const rem = m % 60
  return rem ? `${h} h ${rem} min` : `${h} h`
}

export const fmtPct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`

export function plural(n: number, one: string, many = one + 's') {
  return `${fmtNum(n)} ${n === 1 ? one : many}`
}
