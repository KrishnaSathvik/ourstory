import { isDisplayableWord, normalizeEmoji } from '../core/text'
import type { Pair, Story, WordStat } from './story'

/**
 * PRIVACY THRESHOLDS for any single word shown to the user.
 * A word must be used at least MIN_TOTAL times, on at least MIN_DAYS
 * distinct days. This keeps one-off sensitive tokens (an address, a
 * password pasted five times in one message, a diagnosis mentioned once)
 * out of the Story entirely.
 */
export const MIN_TOTAL = 6
export const MIN_DAYS = 3

interface WordEntry {
  a: number
  b: number
  days: number
  lastDay: number
}

/**
 * Accumulators are fed once per text message from the main analysis loop
 * (tokens and emoji are computed once and shared), then finished.
 */
export class WordAccumulator {
  private acc = new Map<string, WordEntry>()
  private vocab: [Set<string>, Set<string>] = [new Set(), new Set()]
  private tokens: Pair = [0, 0]

  add(k: 0 | 1, day: number, words: string[]) {
    for (const w of words) {
      if (!/^\p{L}+$/u.test(w)) continue
      this.vocab[k].add(w)
      if (!isDisplayableWord(w)) continue
      this.tokens[k]++
      let e = this.acc.get(w)
      if (!e) this.acc.set(w, (e = { a: 0, b: 0, days: 0, lastDay: -1 }))
      if (k === 0) e.a++
      else e.b++
      if (e.lastDay !== day) {
        e.days++
        e.lastDay = day
      }
    }
  }

  finish(): Story['words'] {
    const eligible: WordStat[] = []
    for (const [w, e] of this.acc) if (e.a + e.b >= MIN_TOTAL && e.days >= MIN_DAYS) eligible.push({ w, a: e.a, b: e.b })

    const shared = eligible
      .filter((x) => x.a >= 3 && x.b >= 3)
      .map((x) => ({ x, s: (x.a + x.b) * Math.sqrt(Math.min(x.a, x.b) / Math.max(x.a, x.b)) }))
      .sort((p, q) => q.s - p.s)
      .slice(0, 40)
      .map((p) => p.x)

    // Distinctive words: smoothed log-ratio of relative frequencies, weighted by use.
    const V = this.acc.size || 1
    const tokens = this.tokens
    const distinct = (k: 0 | 1) =>
      eligible
        .map((x) => {
          const mine = k === 0 ? x.a : x.b
          const theirs = k === 0 ? x.b : x.a
          const ratio = Math.log((mine + 1) / (tokens[k] + V)) - Math.log((theirs + 1) / (tokens[1 - k] + V))
          return { w: x.w, n: mine, s: ratio * Math.log(1 + mine) }
        })
        .filter((x) => x.n >= MIN_TOTAL && x.s > 0.6)
        .sort((p, q) => q.s - p.s)
        .slice(0, 15)
        .map(({ w, n }) => ({ w, n }))

    return { shared, distinctive: [distinct(0), distinct(1)], vocabulary: [this.vocab[0].size, this.vocab[1].size] }
  }
}

export class EmojiAccumulator {
  private counts = new Map<string, Pair>()
  private totals: Pair = [0, 0]
  private reactions = new Map<string, number>()

  add(k: 0 | 1, emoji: string[]) {
    for (const e of emoji) {
      let c = this.counts.get(e)
      if (!c) this.counts.set(e, (c = [0, 0]))
      c[k]++
      this.totals[k]++
    }
  }

  addReaction(emoji: string) {
    const e = normalizeEmoji(emoji)
    this.reactions.set(e, (this.reactions.get(e) ?? 0) + 1)
  }

  finish(): Story['emoji'] {
    const totals = this.totals
    const all = [...this.counts].map(([w, [a, b]]) => ({ w, a, b }))
    const top = [...all].sort((x, y) => y.a + y.b - (x.a + x.b)).slice(0, 24)
    const signature = (k: 0 | 1): string | null => {
      let best: string | null = null
      let bestScore = 0
      for (const x of all) {
        const mine = k === 0 ? x.a : x.b
        const theirs = k === 0 ? x.b : x.a
        if (mine < 5) continue
        const s = (mine / (totals[k] || 1) / ((theirs + 1) / (totals[1 - k] + 1))) * Math.log(mine)
        if (s > bestScore) {
          bestScore = s
          best = x.w
        }
      }
      return best
    }
    const reactions = [...this.reactions].map(([e, n]) => ({ e, n })).sort((a, b) => b.n - a.n).slice(0, 8)
    let distinctA = 0
    let distinctB = 0
    for (const x of all) {
      if (x.a) distinctA++
      if (x.b) distinctB++
    }
    return { top, signature: [signature(0), signature(1)], reactions, distinct: [distinctA, distinctB] }
  }
}

function cosine(x: Map<string, number>, y: Map<string, number>): number {
  let dot = 0
  let nx = 0
  let ny = 0
  for (const [k, v] of x) {
    nx += v * v
    const w = y.get(k)
    if (w) dot += v * w
  }
  for (const v of y.values()) ny += v * v
  return nx && ny ? dot / Math.sqrt(nx * ny) : 0
}

interface Quarter {
  words: [Map<string, number>, Map<string, number>]
  emoji: [Map<string, number>, Map<string, number>]
  n: Pair
}

/**
 * "Speaking the same language": per quarter, cosine similarity of the two
 * people's content-word and emoji frequency vectors.
 */
export class ConvergenceAccumulator {
  private quarters = new Map<number, Quarter>()

  /** `month` is a month index (core/time monthIndex). */
  add(month: number, k: 0 | 1, words: string[], emoji: string[]) {
    const q = Math.floor(month / 3) * 3
    let acc = this.quarters.get(q)
    if (!acc) this.quarters.set(q, (acc = { words: [new Map(), new Map()], emoji: [new Map(), new Map()], n: [0, 0] }))
    acc.n[k]++
    const wm = acc.words[k]
    for (const w of words) if (isDisplayableWord(w)) wm.set(w, (wm.get(w) ?? 0) + 1)
    const em = acc.emoji[k]
    for (const e of emoji) em.set(e, (em.get(e) ?? 0) + 1)
  }

  finish(): Story['convergence'] {
    return [...this.quarters]
      .filter(([, q]) => q.n[0] >= 30 && q.n[1] >= 30)
      .sort((a, b) => a[0] - b[0])
      .map(([m, q]) => ({ m, words: cosine(q.words[0], q.words[1]), emoji: cosine(q.emoji[0], q.emoji[1]) }))
  }
}
