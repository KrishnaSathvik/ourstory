/**
 * Time handling.
 *
 * Messaging exports disagree about time: WhatsApp writes the exporting
 * phone's local wall-clock time with no zone, Telegram writes both local
 * and unix time, Meta exports write UTC epoch milliseconds, iMessage stores
 * nanoseconds since 2001-01-01 UTC.
 *
 * We normalise everything to "wall-clock as UTC" (see Message.t): the moment
 * a person would have seen on their clock. Absolute sources are shifted into
 * the user-selected IANA zone. DST is respected because the offset is
 * computed per instant (cached per hour for speed).
 */

export const HOUR = 3_600_000
export const DAY = 86_400_000
export const MINUTE = 60_000

const formatterCache = new Map<string, Intl.DateTimeFormat>()

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatterCache.set(timeZone, f)
  }
  return f
}

/** Offset (ms) of `timeZone` from UTC at the given absolute instant. */
export function zoneOffset(utcMs: number, timeZone: string): number {
  if (timeZone === 'UTC') return 0
  const parts = formatter(timeZone).formatToParts(new Date(utcMs))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'), get('second'))
  return asUtc - Math.floor(utcMs / 1000) * 1000
}

/** Returns a converter from absolute UTC ms → wall-clock-as-UTC ms. */
export function makeLocalizer(timeZone: string): (utcMs: number) => number {
  const cache = new Map<number, number>()
  return (utcMs: number) => {
    const bucket = Math.floor(utcMs / HOUR)
    let off = cache.get(bucket)
    if (off === undefined) {
      off = zoneOffset(bucket * HOUR, timeZone)
      cache.set(bucket, off)
    }
    return utcMs + off
  }
}

export function isValidTimeZone(tz: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function defaultTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
  } catch {
    return 'UTC'
  }
}

/** Day index (days since epoch) of a wall-clock time. */
export const dayIndex = (t: number) => Math.floor(t / DAY)

/** ISO date (YYYY-MM-DD) for a wall-clock time. */
export const isoDate = (t: number) => new Date(t).toISOString().slice(0, 10)

/** 0 = Monday … 6 = Sunday */
export const weekday = (t: number) => (new Date(t).getUTCDay() + 6) % 7

export const hourOf = (t: number) => new Date(t).getUTCHours()

/** Month index (months since Jan 1970). */
export const monthIndex = (t: number) => {
  const d = new Date(t)
  return d.getUTCFullYear() * 12 + d.getUTCMonth() - 1970 * 12
}

export const monthStart = (m: number) => Date.UTC(1970 + Math.floor(m / 12), m % 12, 1)

/** "Social day": a day that ends at 4am, so 1am chats belong to the evening before. */
export const SOCIAL_DAY_SHIFT = 4 * HOUR
export const socialDay = (t: number) => Math.floor((t - SOCIAL_DAY_SHIFT) / DAY)
