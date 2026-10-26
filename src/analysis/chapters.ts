import type { Platform } from '../core/types'
import { PLATFORM_LABEL } from '../core/types'
import { hourOf, monthIndex, monthStart } from '../core/time'
import type { MergedMessage } from '../merge/merge'
import type { Chapter, Pair } from './story'
import { fmtPct, fmtNum, fmtMonth } from './format'

interface Acc {
  key: number
  label: string
  start: number
  end: number
  n: number
  byPerson: Pair
  night: number
  voice: number
  emoji: number
  words: number
  texts: number
  platforms: Map<Platform, number>
  emojiCounts: Map<string, number>
  months: Map<number, number>
}

const SEASONS = ['Winter', 'Spring', 'Summer', 'Autumn']

/**
 * Splits the history into chapters (calendar years, or seasons for shorter
 * histories) and gives each a theme derived from whichever of its stats
 * stands out most compared with the other chapters. Themes are data-literal:
 * they describe what happened in the messages, never why.
 */
export class ChapterAccumulator {
  private accs = new Map<number, Acc>()
  private years = new Map<number, number>()
  private seasonal: Map<number, Acc> = new Map()

  /** Called once per message; `emoji`/`words` only for text messages. */
  add(m: MergedMessage, emoji: string[] | null, words: number) {
    const d = new Date(m.t)
    const y = d.getUTCFullYear()
    this.years.set(y, (this.years.get(y) ?? 0) + 1)
    // Accumulate both granularities; pick one at the end.
    this.bump(this.accs, y, String(y), Date.UTC(y, 0, 1), Date.UTC(y + 1, 0, 1) - 1, m, emoji, words)
    const mi = monthIndex(m.t)
    const s = Math.floor(((mi + 1) % 12) / 3)
    const seasonYear = y + (d.getUTCMonth() === 11 ? 1 : 0)
    const firstMonth = (seasonYear - 1970) * 12 + s * 3 - 1
    this.bump(this.seasonal, seasonYear * 4 + s, `${SEASONS[s]} ${seasonYear}`, monthStart(firstMonth), monthStart(firstMonth + 3) - 1, m, emoji, words)
  }

  private bump(map: Map<number, Acc>, key: number, label: string, start: number, end: number, m: MergedMessage, emoji: string[] | null, words: number) {
    let a = map.get(key)
    if (!a)
      map.set(
        key,
        (a = { key, label, start, end, n: 0, byPerson: [0, 0], night: 0, voice: 0, emoji: 0, words: 0, texts: 0, platforms: new Map(), emojiCounts: new Map(), months: new Map() }),
      )
    a.n++
    a.byPerson[m.p === 'a' ? 0 : 1]++
    if (hourOf(m.t) < 5) a.night++
    if (m.kind === 'voice') a.voice++
    if (emoji) {
      a.texts++
      a.words += words
      for (const e of emoji) {
        a.emoji++
        a.emojiCounts.set(e, (a.emojiCounts.get(e) ?? 0) + 1)
      }
    }
    a.platforms.set(m.platform, (a.platforms.get(m.platform) ?? 0) + 1)
    const mi = monthIndex(m.t)
    a.months.set(mi, (a.months.get(mi) ?? 0) + 1)
  }

  finish(): Chapter[] {
    const byYear = [...this.years.values()].filter((n) => n >= 50).length >= 2
    return themeChapters(byYear ? this.accs : this.seasonal, byYear ? 'year' : 'season')
  }
}

function themeChapters(accs: Map<number, Acc>, unit: 'year' | 'season'): Chapter[] {
  const list = [...accs.values()].filter((a) => a.n >= 20).sort((x, y) => x.key - y.key)
  if (!list.length) return []
  const avg = (f: (a: Acc) => number) => list.reduce((s, a) => s + f(a), 0) / list.length
  const msgAvg = avg((a) => a.n)
  const nightAvg = avg((a) => a.night / a.n)
  const voiceAvg = avg((a) => a.voice / a.n)
  const emojiAvg = avg((a) => a.emoji / (a.texts || 1))
  const wordsAvg = avg((a) => a.words / (a.texts || 1))
  const top = <K>(m: Map<K, number>) => [...m].sort((x, y) => y[1] - x[1])[0]?.[0]

  const used = new Set<string>()
  return list.map((a, i) => {
    const prev = list[i - 1]
    const platform = top(a.platforms)
    const prevPlatform = prev ? top(prev.platforms) : undefined
    const nightShare = a.night / a.n
    const balance = Math.min(...a.byPerson) / Math.max(...a.byPerson)
    const candidates: { id: string; score: number; theme: string; detail: string }[] = []
    if (i === 0) candidates.push({ id: 'start', score: 2.2, theme: 'Where it starts', detail: `The ${unit} your messages begin: ${fmtNum(a.n)} of them.` })
    candidates.push({ id: 'loud', score: a.n / msgAvg, theme: `The loudest ${unit}`, detail: `${fmtNum(a.n)} messages, more than any other ${unit}.` })
    if (list.length >= 3)
      candidates.push({ id: 'quiet', score: (msgAvg / a.n) * 0.8, theme: `The quieter ${unit}`, detail: `${fmtNum(a.n)} messages; the fewest of any ${unit} in your history.` })
    if (nightShare > 0.04)
      candidates.push({ id: 'night', score: nightShare / (nightAvg || 1), theme: `The late-night ${unit}`, detail: `${fmtPct(nightShare)} of messages were sent between midnight and 5 am.` })
    if (a.voice >= 10)
      candidates.push({ id: 'voice', score: a.voice / a.n / (voiceAvg || 1), theme: `The voice-note ${unit}`, detail: `${fmtNum(a.voice)} voice notes.` })
    if (a.emoji >= 20)
      candidates.push({ id: 'emoji', score: a.emoji / (a.texts || 1) / (emojiAvg || 1), theme: `The emoji ${unit}`, detail: `${(a.emoji / (a.texts || 1)).toFixed(2)} emoji per message, your most expressive.` })
    candidates.push({ id: 'long', score: a.words / (a.texts || 1) / (wordsAvg || 1), theme: `The long-message ${unit}`, detail: `Messages averaged ${(a.words / (a.texts || 1)).toFixed(1)} words.` })
    if (prev && a.n >= prev.n * 1.8)
      candidates.push({ id: `grow-${i}`, score: (a.n / prev.n) * 0.9, theme: `The ${unit} things picked up`, detail: `${(a.n / prev.n).toFixed(1)}× more messages than the ${unit} before.` })
    if (platform && prevPlatform && platform !== prevPlatform)
      candidates.push({ id: `plat-${platform}`, score: 1.9, theme: `The ${PLATFORM_LABEL[platform]} ${unit}`, detail: `Most messages moved to ${PLATFORM_LABEL[platform]}.` })
    if (balance > 0.95) candidates.push({ id: 'balance', score: 1.05 + balance * 0.1, theme: `The perfectly even ${unit}`, detail: `You each sent almost exactly half the messages.` })

    candidates.sort((x, y) => y.score - x.score)
    const pick = candidates.find((c) => !used.has(c.id)) ?? candidates[0]
    used.add(pick.id)
    const peak = top(a.months)
    return {
      label: a.label,
      start: a.start,
      end: a.end,
      messages: a.n,
      byPerson: a.byPerson,
      theme: pick.theme,
      themeDetail: pick.detail + (peak !== undefined && a.months.size > 2 ? ` Peak month: ${fmtMonth(monthStart(peak))}.` : ''),
      topEmoji: top(a.emojiCounts),
      platform,
      peakMonth: peak,
    }
  })
}
