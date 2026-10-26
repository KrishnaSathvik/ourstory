import type { IdentityMap, PersonId, Platform } from '../core/types'
import { PLATFORM_LABEL } from '../core/types'
import { extractEmoji, hasLink, LEXICON, tokenize, wordCount } from '../core/text'
import { DAY, HOUR, MINUTE, dayIndex, hourOf, monthIndex, socialDay, weekday } from '../core/time'
import type { MergedMessage, MergeReport } from '../merge/merge'
import type { Milestone, Moment, Pair, Story } from './story'
import { ConvergenceAccumulator, EmojiAccumulator, WordAccumulator } from './vocabulary'
import { ChapterAccumulator } from './chapters'
import { buildAwards } from './awards'
import { buildQuiz } from './quiz'
import { fmtDate, fmtNum } from './format'

export interface AnalyzeInput {
  messages: MergedMessage[]
  identity: IdentityMap
  report: MergeReport
  chats: number
  timeZone: string
  demo?: boolean
  notes?: string[]
}

const idx = (p: PersonId) => (p === 'a' ? 0 : 1)
const pair = (): Pair => [0, 0]
const grid = () => Array.from({ length: 7 }, () => new Array<number>(24).fill(0))

/** A new "conversation" starts after this much silence. */
export const CONVERSATION_GAP = 6 * HOUR
/** Replies slower than this aren't replies, they're new conversations. */
const MAX_REPLY = 12 * HOUR
const DOUBLE_TEXT_GAP = 20 * MINUTE

function median(xs: number[]): number {
  if (!xs.length) return -1
  const s = Float64Array.from(xs).sort()
  const mid = s.length >> 1
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2
}

export function analyze(input: AnalyzeInput): Story {
  const { messages, identity } = input
  if (!messages.length) throw new Error('There are no messages from the two people you selected.')
  const first = messages[0].t
  const last = messages[messages.length - 1].t
  const startDay = dayIndex(first)
  const nDays = dayIndex(last) - startDay + 1

  const totals: Story['totals'] = {
    messages: messages.length,
    byPerson: pair(),
    words: pair(),
    characters: pair(),
    emoji: pair(),
    media: pair(),
    voice: pair(),
    stickers: pair(),
    gifs: pair(),
    links: pair(),
    calls: pair(),
    callSeconds: 0,
    deleted: pair(),
    edited: pair(),
    reactionsGiven: pair(),
  }
  const dailyA = new Array<number>(nDays).fill(0)
  const dailyB = new Array<number>(nDays).fill(0)
  const weekHour: Pair<number[][]> = [grid(), grid()]
  const monthlyMap = new Map<number, { m: number; a: number; b: number; platforms: Partial<Record<Platform, number>> }>()
  const sourceMap = new Map<Platform, { platform: Platform; messages: number; first: number; last: number; byPerson: Pair }>()
  const night = pair()
  const morning = pair()
  const style: Story['style'] = { avgWords: pair(), questions: pair(), exclamations: pair(), capsMessages: pair(), laughs: pair() }
  const lexicon: Story['lexicon'] = { love: pair(), miss: pair(), goodnight: pair(), goodmorning: pair(), sorry: pair(), thanks: pair() }
  const firsts: Story['firsts'] = { love: null, miss: null, goodnight: null, call: null, message: { t: first, p: messages[0].p } }
  const textCount = pair()
  const longestMessage = pair()
  const replyTimes: [number[], number[]] = [[], []]
  const rhythm: Story['rhythm'] = {
    medianReply: [-1, -1],
    replyUnderMinute: pair(),
    conversations: 0,
    initiations: pair(),
    lastWord: pair(),
    firstOfDay: pair(),
    lastOfDay: pair(),
    doubleTexts: pair(),
    longestMonologue: { p: messages[0].p, count: 0, t: first },
    jinx: 0,
  }
  const platformStarts = new Map<Platform, { t: number; p: PersonId }>()
  const wordAcc = new WordAccumulator()
  const emojiAcc = new EmojiAccumulator()
  const convAcc = new ConvergenceAccumulator()
  const chapterAcc = new ChapterAccumulator()

  let runP: PersonId | null = null
  let runCount = 0
  let runStart = first
  let lastSocialDay = -1
  let prev: MergedMessage | null = null

  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    const k = idx(m.p)
    totals.byPerson[k]++
    const d = dayIndex(m.t) - startDay
    ;(k === 0 ? dailyA : dailyB)[d]++
    const wd = weekday(m.t)
    const h = hourOf(m.t)
    weekHour[k][wd][h]++
    if (h < 5) night[k]++
    else if (h < 9) morning[k]++

    const mi = monthIndex(m.t)
    let mo = monthlyMap.get(mi)
    if (!mo) monthlyMap.set(mi, (mo = { m: mi, a: 0, b: 0, platforms: {} }))
    if (k === 0) mo.a++
    else mo.b++
    mo.platforms[m.platform] = (mo.platforms[m.platform] ?? 0) + 1

    let src = sourceMap.get(m.platform)
    if (!src) sourceMap.set(m.platform, (src = { platform: m.platform, messages: 0, first: m.t, last: m.t, byPerson: pair() }))
    src.messages++
    src.last = m.t
    src.byPerson[k]++
    if (!platformStarts.has(m.platform)) platformStarts.set(m.platform, { t: m.t, p: m.p })

    switch (m.kind) {
      case 'media':
        totals.media[k]++
        break
      case 'voice':
        totals.voice[k]++
        break
      case 'sticker':
        totals.stickers[k]++
        break
      case 'gif':
        totals.gifs[k]++
        break
      case 'deleted':
        totals.deleted[k]++
        break
      case 'call':
        totals.calls[k]++
        totals.callSeconds += m.callSeconds ?? 0
        if (!firsts.call) firsts.call = { t: m.t, p: m.p }
        break
    }
    if (m.edited) totals.edited[k]++
    if (m.reactions) {
      for (const r of m.reactions) {
        const rk = r.by === 'a' ? 0 : 1
        totals.reactionsGiven[rk]++
        emojiAcc.addReaction(r.emoji)
      }
    }

    if (m.kind === 'text' && m.text) {
      const text = m.text
      textCount[k]++
      const wc = wordCount(text)
      totals.words[k] += wc
      totals.characters[k] += text.length
      if (wc > longestMessage[k]) longestMessage[k] = wc
      // Tokens and emoji are computed once and shared by every accumulator.
      const tokens = tokenize(text)
      const emoji = extractEmoji(text)
      totals.emoji[k] += emoji.length
      wordAcc.add(k, d, tokens)
      emojiAcc.add(k, emoji)
      convAcc.add(mi, k, tokens, emoji)
      chapterAcc.add(m, emoji, wc)
      if (hasLink(text)) totals.links[k]++
      if (text.includes('?')) style.questions[k]++
      if (text.includes('!')) style.exclamations[k]++
      if (text.length >= 4 && /\p{Lu}{4,}/u.test(text) && text === text.toUpperCase()) style.capsMessages[k]++
      if (LEXICON.laugh.test(text)) style.laughs[k]++
      for (const key of ['love', 'miss', 'goodnight', 'goodmorning', 'sorry', 'thanks'] as const) {
        if (LEXICON[key].test(text)) {
          lexicon[key][k]++
          if ((key === 'love' || key === 'miss' || key === 'goodnight') && !firsts[key]) firsts[key] = { t: m.t, p: m.p }
        }
      }
    } else chapterAcc.add(m, null, 0)

    // ---- rhythm: conversations, replies, runs
    const sd = socialDay(m.t)
    if (sd !== lastSocialDay) {
      rhythm.firstOfDay[k]++
      if (prev) rhythm.lastOfDay[idx(prev.p)]++
      lastSocialDay = sd
    }
    if (!prev || m.t - prev.t >= CONVERSATION_GAP) {
      rhythm.conversations++
      rhythm.initiations[k]++
      if (prev) rhythm.lastWord[idx(prev.p)]++
    } else if (prev.p !== m.p) {
      const dt = m.t - prev.t
      if (dt <= MAX_REPLY) {
        replyTimes[k].push(dt)
        if (dt < MINUTE) rhythm.replyUnderMinute[k]++
      }
    } else if (m.t - prev.t >= DOUBLE_TEXT_GAP) {
      rhythm.doubleTexts[k]++
    }
    if (prev && prev.p !== m.p && m.kind === 'text' && prev.kind === 'text' && m.t - prev.t <= MINUTE) {
      const x = m.text.trim().toLowerCase()
      if (x && x.length <= 40 && x === prev.text.trim().toLowerCase()) rhythm.jinx++
    }
    if (m.p === runP) runCount++
    else {
      runP = m.p
      runCount = 1
      runStart = m.t
    }
    if (runCount > rhythm.longestMonologue.count) rhythm.longestMonologue = { p: m.p, count: runCount, t: runStart }
    prev = m
  }
  if (prev) {
    rhythm.lastWord[idx(prev.p)]++
    rhythm.lastOfDay[idx(prev.p)]++
  }
  for (const k of [0, 1] as const) {
    rhythm.medianReply[k] = median(replyTimes[k])
    rhythm.replyUnderMinute[k] = replyTimes[k].length ? rhythm.replyUnderMinute[k] / replyTimes[k].length : 0
    style.avgWords[k] = textCount[k] ? totals.words[k] / textCount[k] : 0
  }

  // ---- calendar: streaks, gaps, busiest day
  let activeDays = 0
  let streak = { days: 0, start: 0, end: 0 }
  let run = 0
  let gap: Story['activity']['longestGap'] = null
  let lastActive = -1
  let busiest = { day: startDay, count: 0 }
  for (let d = 0; d < nDays; d++) {
    const n = dailyA[d] + dailyB[d]
    if (n > 0) {
      activeDays++
      run++
      if (run > streak.days) streak = { days: run, start: (startDay + d - run + 1) * DAY, end: (startDay + d) * DAY }
      if (lastActive >= 0 && d - lastActive - 1 > (gap?.days ?? 0)) {
        gap = { days: d - lastActive - 1, start: (startDay + lastActive) * DAY, end: (startDay + d) * DAY }
      }
      lastActive = d
      if (n > busiest.count) busiest = { day: startDay + d, count: n }
    } else run = 0
  }
  const busiestByPerson: Pair = [dailyA[busiest.day - startDay], dailyB[busiest.day - startDay]]
  const hourly = new Array<number>(24).fill(0)
  for (const m of messages) if (dayIndex(m.t) === busiest.day) hourly[hourOf(m.t)]++

  // ---- peaks
  let peakHour = 0
  let peakWeekday = 0
  {
    const hours = new Array<number>(24).fill(0)
    const days = new Array<number>(7).fill(0)
    for (const g of weekHour) for (let w = 0; w < 7; w++) for (let h = 0; h < 24; h++) {
      hours[h] += g[w][h]
      days[w] += g[w][h]
    }
    peakHour = hours.indexOf(Math.max(...hours))
    peakWeekday = days.indexOf(Math.max(...days))
  }

  const monthly = [...monthlyMap.values()].sort((a, b) => a.m - b.m)
  // Fill empty months so charts have a continuous axis.
  const filled: typeof monthly = []
  for (let mi = monthly[0].m, j = 0; mi <= monthly[monthly.length - 1].m; mi++) {
    if (monthly[j]?.m === mi) filled.push(monthly[j++])
    else filled.push({ m: mi, a: 0, b: 0, platforms: {} })
  }

  const activity: Story['activity'] = {
    startDay,
    dailyA,
    dailyB,
    monthly: filled,
    activeDays,
    longestStreak: streak,
    longestGap: gap,
    busiestDay: { day: busiest.day, count: busiest.count, hourly, byPerson: busiestByPerson },
    weekHour,
    peakHour,
    peakWeekday,
    nightShare: [night[0] / (totals.byPerson[0] || 1), night[1] / (totals.byPerson[1] || 1)],
    morningShare: [morning[0] / (totals.byPerson[0] || 1), morning[1] / (totals.byPerson[1] || 1)],
  }

  const words = wordAcc.finish()
  const emoji = emojiAcc.finish()
  const people = identity.people

  // ---- milestones
  const name = (p: PersonId) => people[idx(p)].name
  const milestones: Milestone[] = []
  milestones.push({
    t: first,
    kind: 'first-message',
    title: 'Where these messages begin',
    detail: `${name(messages[0].p)} sent the earliest message in your imports, on ${PLATFORM_LABEL[messages[0].platform]}.`,
    p: messages[0].p,
    platform: messages[0].platform,
  })
  for (const [platform, s] of platformStarts) {
    if (s.t === first) continue
    milestones.push({
      t: s.t,
      kind: 'platform-start',
      title: `First message on ${PLATFORM_LABEL[platform]}`,
      detail: `${name(s.p)} opened the ${PLATFORM_LABEL[platform]} chapter.`,
      p: s.p,
      platform,
    })
  }
  const lexMilestone = (m: Moment | null, kind: Milestone['kind'], title: string, detail: (n: string) => string) => {
    if (m) milestones.push({ t: m.t, kind, title, detail: detail(name(m.p)), p: m.p })
  }
  lexMilestone(firsts.love, 'first-love', 'The first “love you”', (n) => `The first time “love you” appears in your messages. ${n} said it.`)
  lexMilestone(firsts.miss, 'first-miss', 'The first “miss you”', (n) => `${n} was the first to write it.`)
  lexMilestone(firsts.goodnight, 'first-goodnight', 'The first goodnight', (n) => `${n} said it first. ${fmtNum(lexicon.goodnight[0] + lexicon.goodnight[1])} goodnights since.`)
  lexMilestone(firsts.call, 'first-call', 'First call logged', (n) => `${n} called. ${totals.calls[0] + totals.calls[1]} calls in your exports.`)
  for (const target of [1000, 10_000, 50_000, 100_000, 250_000, 500_000, 1_000_000]) {
    if (messages.length >= target) {
      const m = messages[target - 1]
      milestones.push({ t: m.t, kind: 'message-count', title: `Message #${fmtNum(target)}`, detail: `Sent by ${name(m.p)}.`, p: m.p })
    }
  }
  milestones.push({
    t: busiest.day * DAY,
    kind: 'busiest-day',
    title: 'Your busiest day',
    detail: `${fmtNum(busiest.count)} messages in a single day.`,
  })
  if (streak.days >= 7) {
    milestones.push({ t: streak.start, kind: 'streak', title: `A ${streak.days}-day streak begins`, detail: `You talked every day until ${fmtDate(streak.end)}.` })
  }
  if (gap && gap.days >= 3) {
    milestones.push({
      t: gap.end,
      kind: 'reunion',
      title: 'Back after the longest quiet stretch',
      detail: `${gap.days} days without messages in these exports, then you picked up again.`,
    })
  }
  milestones.sort((a, b) => a.t - b.t)

  const partial: Omit<Story, 'awards' | 'quiz' | 'chapters'> = {
    version: 1,
    demo: !!input.demo,
    generatedAt: Date.now(),
    timeZone: input.timeZone,
    people,
    range: { first, last, days: nDays },
    sources: [...sourceMap.values()].sort((a, b) => a.first - b.first),
    totals,
    activity,
    rhythm,
    style,
    lexicon,
    firsts,
    emoji,
    words,
    convergence: convAcc.finish(),
    milestones,
    fun: {
      novels: (totals.words[0] + totals.words[1]) / 120_000,
      // ~38 wpm average phone typing speed (estimate).
      typingHours: (totals.words[0] + totals.words[1]) / 38 / 60,
      longestMessageWords: longestMessage,
    },
    quality: {
      chats: input.chats,
      duplicatesRemoved: input.report.duplicatesRemoved,
      excludedMessages: input.report.excludedSenders,
      notes: input.notes ?? [],
    },
  }
  const chapters = chapterAcc.finish()
  const withChapters = { ...partial, chapters }
  return { ...withChapters, awards: buildAwards(withChapters), quiz: buildQuiz(withChapters) }
}
