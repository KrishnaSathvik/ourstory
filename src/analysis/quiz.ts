import type { PersonId } from '../core/types'
import { DAY } from '../core/time'
import type { Pair, QuizQuestion, Story } from './story'
import { WEEKDAYS, fmtDate, fmtDuration, fmtHour, fmtNum, fmtPct } from './format'

type StoryCore = Omit<Story, 'awards' | 'quiz'>

/** Deterministic PRNG so the same story always yields the same quiz. */
function mulberry32(seed: number) {
  return () => {
    seed |= 0
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffleWithAnswer<T>(correct: T, decoys: T[], rnd: () => number): { options: T[]; index: number } {
  const options = [correct, ...decoys]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return { options, index: options.indexOf(correct) }
}

const niceRound = (n: number) => {
  if (n < 100) return Math.round(n)
  const mag = 10 ** Math.floor(Math.log10(n) - 1)
  return Math.round(n / mag) * mag
}

/**
 * "How well do you know your chat?" Every answer is computed from the
 * Story; person-questions are only asked when the gap is decisive (≥ 12%),
 * so no one loses a point to a rounding error.
 */
export function buildQuiz(s: StoryCore): QuizQuestion[] {
  const rnd = mulberry32(s.totals.messages * 31 + s.range.first / DAY)
  const names = [s.people[0].name, s.people[1].name]
  const qs: QuizQuestion[] = []

  const who = (id: string, prompt: string, v: Pair, reveal: (w: string, o: string) => string, opts: { lowerWins?: boolean; min?: number; category?: QuizQuestion['category'] } = {}) => {
    const [a, b] = v
    if (!(a >= 0 && b >= 0) || Math.max(a, b) < (opts.min ?? 0)) return
    const hi = Math.max(a, b)
    const lo = Math.min(a, b)
    if (lo > 0 && hi / lo < 1.12) return
    if (hi === 0) return
    const aWins = opts.lowerWins ? a < b : a > b
    const p: PersonId = aWins ? 'a' : 'b'
    const w = names[aWins ? 0 : 1]
    const o = names[aWins ? 1 : 0]
    qs.push({ id, prompt, options: names, answer: { kind: 'person', p }, reveal: reveal(w, o), category: opts.category ?? 'habits' })
  }

  const n = s.totals.byPerson
  who('more-messages', 'Who sends more messages?', n, (w) => `${w}: ${fmtNum(Math.max(...n))} messages to ${fmtNum(Math.min(...n))}.`)
  who('starter', 'After a quiet spell, who usually texts first?', s.rhythm.initiations, (w) => `${w} started ${fmtNum(Math.max(...s.rhythm.initiations))} of your ${fmtNum(s.rhythm.conversations)} conversations.`)
  who('night', 'Who is the bigger night owl?', s.activity.nightShare, (w) => `${w} sends ${fmtPct(Math.max(...s.activity.nightShare))} of their messages between midnight and 5 am.`, { min: 0.02, category: 'time' })
  const mr = s.rhythm.medianReply
  if (mr[0] > 0 && mr[1] > 0)
    who('faster', 'Who replies faster?', mr, (w, o) => `${w}, typically in ${fmtDuration(Math.min(...mr))}. ${o} takes ${fmtDuration(Math.max(...mr))}.`, { lowerWins: true, category: 'time' })
  who('love', 'Who says “love you” more often?', s.lexicon.love, (w) => `${w}, ${fmtNum(Math.max(...s.lexicon.love))} times.`, { min: 5, category: 'words' })
  who('sorry', 'Who apologises more?', s.lexicon.sorry, (w) => `${w}, with ${fmtNum(Math.max(...s.lexicon.sorry))} sorries.`, { min: 5, category: 'words' })
  who('laugh', 'Who laughs more in your chats?', [s.style.laughs[0] / (n[0] || 1), s.style.laughs[1] / (n[1] || 1)], (w) => `${w}. Hahas, lols and 😂s included.`, { category: 'words' })
  who('voice', 'Who sends more voice notes?', s.totals.voice, (w) => `${w}: ${fmtNum(Math.max(...s.totals.voice))} voice notes.`, { min: 10 })
  who('questions', 'Who asks more questions?', [s.style.questions[0] / (n[0] || 1), s.style.questions[1] / (n[1] || 1)], (w) => `${w}, with ${fmtNum(Math.max(...s.style.questions))} question marks.`)
  who('emoji', 'Who uses more emoji?', [s.totals.emoji[0] / (n[0] || 1), s.totals.emoji[1] / (n[1] || 1)], (w) => `${w}: ${fmtNum(Math.max(...s.totals.emoji))} emoji in total.`, { category: 'emoji' })

  if (s.firsts.love) {
    const p = s.firsts.love.p
    qs.push({
      id: 'first-love',
      prompt: 'Who wrote “love you” first?',
      options: names,
      answer: { kind: 'person', p },
      reveal: `${names[p === 'a' ? 0 : 1]}, on ${fmtDate(s.firsts.love.t)}.`,
      category: 'words',
    })
  }

  // ---- choice questions
  {
    const total = s.totals.messages
    const decoys = [0.35, 0.6, 1.8, 2.7].map((f) => niceRound(total * f))
    const pickDecoys = decoys.sort(() => rnd() - 0.5).slice(0, 3)
    const { options, index } = shuffleWithAnswer(niceRound(total), pickDecoys, rnd)
    qs.push({
      id: 'total',
      prompt: 'Roughly how many messages are in your history?',
      options: options.map((x) => `≈ ${fmtNum(x)}`),
      answer: { kind: 'choice', index },
      reveal: `${fmtNum(total)} messages exactly.`,
      category: 'numbers',
    })
  }
  {
    const peak = s.activity.peakHour
    const pool = [8, 12, 15, 18, 21, 23, 1].filter((h) => Math.abs(h - peak) >= 3 && Math.abs(h - peak) <= 21)
    const decoys = pool.sort(() => rnd() - 0.5).slice(0, 3)
    const { options, index } = shuffleWithAnswer(peak, decoys, rnd)
    qs.push({
      id: 'peak-hour',
      prompt: 'Which hour of the day are you busiest?',
      options: options.map((h) => `${fmtHour(h)}–${fmtHour((h + 1) % 24)}`),
      answer: { kind: 'choice', index },
      reveal: `Your chat peaks between ${fmtHour(peak)} and ${fmtHour((peak + 1) % 24)}.`,
      category: 'time',
    })
  }
  {
    const wd = s.activity.peakWeekday
    const decoys = [0, 1, 2, 3, 4, 5, 6].filter((d) => d !== wd).sort(() => rnd() - 0.5).slice(0, 3)
    const { options, index } = shuffleWithAnswer(wd, decoys, rnd)
    qs.push({
      id: 'weekday',
      prompt: 'Which day of the week do you talk the most?',
      options: options.map((d) => WEEKDAYS[d]),
      answer: { kind: 'choice', index },
      reveal: `${WEEKDAYS[wd]}s are your busiest.`,
      category: 'time',
    })
  }
  for (const k of [0, 1] as const) {
    const sig = s.emoji.top.filter((e) => (k === 0 ? e.a : e.b) > 0).sort((x, y) => (k === 0 ? y.a - x.a : y.b - x.b))[0]?.w
    const others = s.emoji.top.map((e) => e.w).filter((e) => e !== sig)
    if (sig && others.length >= 3) {
      const { options, index } = shuffleWithAnswer(sig, others.slice(0, 6).sort(() => rnd() - 0.5).slice(0, 3), rnd)
      qs.push({
        id: `emoji-${k}`,
        prompt: `What is ${names[k]}'s most-used emoji?`,
        options,
        answer: { kind: 'choice', index },
        reveal: `${sig}, used ${fmtNum(k === 0 ? s.emoji.top.find((e) => e.w === sig)!.a : s.emoji.top.find((e) => e.w === sig)!.b)} times.`,
        category: 'emoji',
      })
    }
  }
  if (s.activity.longestStreak.days >= 5) {
    const d = s.activity.longestStreak.days
    const decoys = [Math.max(2, Math.round(d * 0.4)), Math.round(d * 0.7), Math.round(d * 1.6)].filter((x) => x !== d)
    const { options, index } = shuffleWithAnswer(d, [...new Set(decoys)], rnd)
    qs.push({
      id: 'streak',
      prompt: 'What is your longest run of talking every single day?',
      options: options.map((x) => `${fmtNum(x)} days`),
      answer: { kind: 'choice', index },
      reveal: `${fmtNum(d)} days in a row, starting ${fmtDate(s.activity.longestStreak.start)}.`,
      category: 'numbers',
    })
  }

  // Interleave categories, cap at 12.
  const out: QuizQuestion[] = []
  const pools = new Map<string, QuizQuestion[]>()
  for (const q of qs) pools.set(q.category, [...(pools.get(q.category) ?? []), q])
  while (out.length < 12 && [...pools.values()].some((p) => p.length)) {
    for (const p of pools.values()) if (p.length && out.length < 12) out.push(p.shift()!)
  }
  return out
}
