import type { PersonId } from '../core/types'
import type { Award, Pair, Story } from './story'
import { fmtDuration, fmtNum, fmtPct, fmtHour } from './format'

type StoryCore = Omit<Story, 'awards' | 'quiz'>

interface Candidate {
  id: string
  title: string
  emoji: string
  /** Values per person; higher wins unless `lowerWins`. */
  values: Pair
  lowerWins?: boolean
  /** Minimum winning value for the award to be meaningful. */
  min: number
  stat: (v: number, wi: 0 | 1) => string
  detail: (winner: string, other: string, v: Pair) => string
}

const per = (x: Pair, d: Pair): Pair => [x[0] / (d[0] || 1), x[1] / (d[1] || 1)]

/**
 * Superlatives. Each is a plain comparison of one measurable habit, awarded
 * only when the gap is clear (≥ 15%), so we never crown a coin-flip.
 */
export function buildAwards(s: StoryCore): Award[] {
  const n = s.totals.byPerson
  const [A, B] = s.people.map((p) => p.name)
  const lex = s.lexicon
  const sum = (x: Pair) => x[0] + x[1]

  const candidates: Candidate[] = [
    {
      id: 'night-owl',
      title: 'Night Owl',
      emoji: '🦉',
      values: s.activity.nightShare,
      min: 0.03,
      stat: (v) => fmtPct(v),
      detail: (w, o, v) => `${fmtPct(v[w === A ? 0 : 1])} of ${w}'s messages are sent between midnight and 5 am, vs ${fmtPct(v[w === A ? 1 : 0])} for ${o}.`,
    },
    {
      id: 'early-bird',
      title: 'Early Bird',
      emoji: '🌅',
      values: s.activity.morningShare,
      min: 0.04,
      stat: (v) => fmtPct(v),
      detail: (w, _o, v) => `${fmtPct(Math.max(...v))} of ${w}'s messages land between 5 and 9 am.`,
    },
    {
      id: 'starter',
      title: 'Conversation Starter',
      emoji: '👋',
      values: per(s.rhythm.initiations, [sum(s.rhythm.initiations), sum(s.rhythm.initiations)]),
      min: 0.5,
      stat: (v) => fmtPct(v),
      detail: (w) => `${w} sends the first message after a quiet spell ${fmtPct(Math.max(...per(s.rhythm.initiations, [sum(s.rhythm.initiations), sum(s.rhythm.initiations)])))} of the time.`,
    },
    {
      id: 'last-word',
      title: 'The Last Word',
      emoji: '🌙',
      values: per(s.rhythm.lastWord, [sum(s.rhythm.lastWord), sum(s.rhythm.lastWord)]),
      min: 0.5,
      stat: (v) => fmtPct(v),
      detail: (w) => `When a conversation winds down, ${w} usually sends the final message.`,
    },
    {
      id: 'speed',
      title: 'Speed Replier',
      emoji: '⚡',
      values: s.rhythm.medianReply.map((x) => (x < 0 ? Infinity : x)) as Pair,
      lowerWins: true,
      min: 0,
      stat: (v) => fmtDuration(v),
      detail: (w, o) => {
        const wi = w === A ? 0 : 1
        return `${w}'s typical reply comes in ${fmtDuration(s.rhythm.medianReply[wi])}. ${o}: ${fmtDuration(s.rhythm.medianReply[1 - wi])}.`
      },
    },
    {
      id: 'novelist',
      title: 'The Novelist',
      emoji: '📜',
      values: s.style.avgWords,
      min: 3,
      stat: (v) => `${v.toFixed(1)} words`,
      detail: (w, _o, v) => `${w}'s messages average ${Math.max(...v).toFixed(1)} words. Longest single message: ${fmtNum(s.fun.longestMessageWords[w === A ? 0 : 1])} words.`,
    },
    {
      id: 'double',
      title: 'Double Texter',
      emoji: '💬',
      values: per(s.rhythm.doubleTexts, n),
      min: 0.005,
      stat: (_v, wi) => `${fmtNum(s.rhythm.doubleTexts[wi])}×`,
      detail: (w) => `${fmtNum(s.rhythm.doubleTexts[w === A ? 0 : 1])} times, ${w} followed up without waiting for a reply.`,
    },
    {
      id: 'emoji',
      title: 'Emoji Maximalist',
      emoji: '🎨',
      values: per(s.totals.emoji, n),
      min: 0.05,
      stat: (v) => `${v.toFixed(2)}/msg`,
      detail: (w) => `${fmtNum(s.totals.emoji[w === A ? 0 : 1])} emoji and counting.`,
    },
    {
      id: 'laugh',
      title: 'Laugh Track',
      emoji: '😂',
      values: per(s.style.laughs, n),
      min: 0.02,
      stat: (v) => fmtPct(v),
      detail: (w) => `${w} laughs (haha, lol, 😂 and friends) in ${fmtNum(s.style.laughs[w === A ? 0 : 1])} messages.`,
    },
    {
      id: 'curious',
      title: 'The Curious One',
      emoji: '❓',
      values: per(s.style.questions, n),
      min: 0.05,
      stat: (v) => fmtPct(v),
      detail: (w) => `${fmtNum(s.style.questions[w === A ? 0 : 1])} questions asked.`,
    },
    {
      id: 'voice',
      title: 'Voice Note Virtuoso',
      emoji: '🎙️',
      values: s.totals.voice,
      min: 15,
      stat: (v) => fmtNum(v),
      detail: (w, o, v) => `${fmtNum(Math.max(...v))} voice notes from ${w}, ${fmtNum(Math.min(...v))} from ${o}.`,
    },
    {
      id: 'sticker',
      title: 'Sticker Collector',
      emoji: '🧸',
      values: [s.totals.stickers[0] + s.totals.gifs[0], s.totals.stickers[1] + s.totals.gifs[1]],
      min: 15,
      stat: (v) => fmtNum(v),
      detail: (w, _o, v) => `${fmtNum(Math.max(...v))} stickers and GIFs from ${w}.`,
    },
    {
      id: 'photo',
      title: 'Chief Photographer',
      emoji: '📸',
      values: s.totals.media,
      min: 20,
      stat: (v) => fmtNum(v),
      detail: (w, _o, v) => `${fmtNum(Math.max(...v))} photos, videos and files shared by ${w}.`,
    },
    {
      id: 'romantic',
      title: 'The Romantic',
      emoji: '❤️',
      values: [lex.love[0] + lex.miss[0], lex.love[1] + lex.miss[1]],
      min: 10,
      stat: (v) => fmtNum(v),
      detail: (w, _o, v) => `“Love you” and “miss you”, ${fmtNum(Math.max(...v))} times from ${w}.`,
    },
    {
      id: 'sleepy',
      title: 'Goodnight Keeper',
      emoji: '😴',
      values: lex.goodnight,
      min: 10,
      stat: (v) => fmtNum(v),
      detail: (w, _o, v) => `${fmtNum(Math.max(...v))} goodnights from ${w}.`,
    },
    {
      id: 'grateful',
      title: 'Most Grateful',
      emoji: '🌻',
      values: lex.thanks,
      min: 10,
      stat: (v) => fmtNum(v),
      detail: (w, _o, v) => `${w} said thank you ${fmtNum(Math.max(...v))} times.`,
    },
    {
      id: 'sorry',
      title: 'Chief Apologiser',
      emoji: '🙏',
      values: lex.sorry,
      min: 10,
      stat: (v) => fmtNum(v),
      detail: (w, _o, v) => `“Sorry”, ${fmtNum(Math.max(...v))} times from ${w}.`,
    },
    {
      id: 'reactor',
      title: 'Reaction Machine',
      emoji: '💖',
      values: s.totals.reactionsGiven,
      min: 20,
      stat: (v) => fmtNum(v),
      detail: (w, _o, v) => `${w} reacted to ${fmtNum(Math.max(...v))} messages.`,
    },
    {
      id: 'caps',
      title: 'CAPS LOCK ENERGY',
      emoji: '📢',
      values: per(s.style.capsMessages, n),
      min: 0.004,
      stat: (v) => fmtPct(v, 1),
      detail: (w) => `${fmtNum(s.style.capsMessages[w === A ? 0 : 1])} messages from ${w} were written ENTIRELY IN CAPITALS.`,
    },
  ]

  const results: (Award & { margin: number })[] = []
  for (const c of candidates) {
    const [a, b] = c.values
    if (!Number.isFinite(a) && !Number.isFinite(b)) continue
    const aWins = c.lowerWins ? a < b : a > b
    const wi = aWins ? 0 : 1
    const win = c.values[wi]
    const lose = c.values[1 - wi]
    if (!Number.isFinite(win)) continue
    if (!c.lowerWins && win < c.min) continue
    const margin = c.lowerWins ? (Number.isFinite(lose) ? lose / Math.max(win, 1) : 2) : win / Math.max(lose, 1e-9)
    if (margin < 1.15) continue
    const p: PersonId = wi === 0 ? 'a' : 'b'
    const winner = wi === 0 ? A : B
    const other = wi === 0 ? B : A
    results.push({ id: c.id, title: c.title, emoji: c.emoji, p, stat: c.stat(win, wi as 0 | 1), detail: c.detail(winner, other, c.values), margin })
  }

  // The longest monologue isn't a comparison, but it's always fun.
  const mono = s.rhythm.longestMonologue
  if (mono.count >= 15) {
    const who = mono.p === 'a' ? A : B
    results.push({
      id: 'monologue',
      title: 'The Monologue',
      emoji: '🎤',
      p: mono.p,
      stat: `${mono.count} in a row`,
      detail: `${who} once sent ${mono.count} messages in a row without a reply. Peak hour of your chat overall: ${fmtHour(s.activity.peakHour)}.`,
      margin: 1.2,
    })
  }

  // Greedy pick, keeping things balanced between the two people.
  // Signature habits get a small boost so they surface when they apply.
  const SIGNATURE = new Set(['night-owl', 'early-bird', 'starter', 'speed', 'romantic'])
  const rank = (r: { id: string; margin: number }) => Math.min(r.margin, 6) + (SIGNATURE.has(r.id) ? 1.5 : 0)
  results.sort((x, y) => rank(y) - rank(x))
  const picked: Award[] = []
  const count = { a: 0, b: 0 }
  for (const r of results) {
    if (picked.length >= 10) break
    if (count[r.p] >= 6) continue
    count[r.p]++
    const { margin: _m, ...award } = r
    void _m
    picked.push(award)
  }
  return picked
}
