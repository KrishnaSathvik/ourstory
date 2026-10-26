import type { Person, PersonId, Platform } from '../core/types'
import type { LexiconKey } from '../core/text'

/**
 * The Story: everything the UI knows about a relationship.
 *
 * PRIVACY CONTRACT
 * - Contains only aggregates: counts, durations, dates, and single words /
 *   emoji that pass `isDisplayableWord` and frequency thresholds.
 * - Never contains a message, a phrase, or anything quoted.
 * - tests/privacy.test.ts enforces this against generated data.
 *
 * Times are wall-clock-as-UTC ms (see core/time.ts). Pairs are [a, b].
 */
export type Pair<T = number> = [T, T]

export interface Moment {
  t: number
  p: PersonId
}

export interface Milestone {
  t: number
  kind:
    | 'first-message'
    | 'message-count'
    | 'first-love'
    | 'first-miss'
    | 'first-goodnight'
    | 'first-call'
    | 'platform-start'
    | 'busiest-day'
    | 'streak'
    | 'reunion'
  title: string
  detail: string
  p?: PersonId
  platform?: Platform
}

export interface Chapter {
  label: string // "2021" or "Spring 2023"
  start: number
  end: number
  messages: number
  byPerson: Pair
  /** Data-literal theme, e.g. "The late-night year". */
  theme: string
  themeDetail: string
  topEmoji?: string
  platform?: Platform
  peakMonth?: number // month index
}

export interface Award {
  id: string
  title: string
  p: PersonId
  /** Short headline stat, e.g. "62%". */
  stat: string
  detail: string
  emoji: string
}

export type QuizAnswer = { kind: 'person'; p: PersonId } | { kind: 'choice'; index: number }

export interface QuizQuestion {
  id: string
  prompt: string
  /** For 'person' questions options are the two names. */
  options: string[]
  answer: QuizAnswer
  reveal: string
  category: 'habits' | 'numbers' | 'time' | 'emoji' | 'words'
}

export interface WordStat {
  w: string
  a: number
  b: number
}

export interface Story {
  version: 1
  /** True when built from the synthetic demo couple. */
  demo: boolean
  generatedAt: number
  timeZone: string
  people: [Person, Person]
  range: { first: number; last: number; days: number }
  sources: { platform: Platform; messages: number; first: number; last: number; byPerson: Pair }[]
  totals: {
    messages: number
    byPerson: Pair
    words: Pair
    characters: Pair
    emoji: Pair
    media: Pair
    voice: Pair
    stickers: Pair
    gifs: Pair
    links: Pair
    calls: Pair
    callSeconds: number
    deleted: Pair
    edited: Pair
    reactionsGiven: Pair
  }
  activity: {
    startDay: number // day index of daily[0]
    dailyA: number[]
    dailyB: number[]
    monthly: { m: number; a: number; b: number; platforms: Partial<Record<Platform, number>> }[]
    activeDays: number
    longestStreak: { days: number; start: number; end: number }
    longestGap: { days: number; start: number; end: number } | null
    busiestDay: { day: number; count: number; hourly: number[]; byPerson: Pair }
    /** 7×24 weekday(Mon=0) × hour, per person. */
    weekHour: Pair<number[][]>
    peakHour: number
    peakWeekday: number
    nightShare: Pair // 00:00–04:59
    morningShare: Pair // 05:00–08:59
  }
  rhythm: {
    medianReply: Pair // ms, null-ish as -1 when unknown
    replyUnderMinute: Pair // share 0..1
    conversations: number
    initiations: Pair
    lastWord: Pair
    firstOfDay: Pair
    lastOfDay: Pair
    doubleTexts: Pair
    longestMonologue: { p: PersonId; count: number; t: number }
    jinx: number
  }
  style: {
    avgWords: Pair
    questions: Pair
    exclamations: Pair
    capsMessages: Pair
    laughs: Pair
  }
  lexicon: Record<Exclude<LexiconKey, 'question' | 'laugh'>, Pair>
  firsts: { love: Moment | null; miss: Moment | null; goodnight: Moment | null; call: Moment | null; message: Moment }
  emoji: {
    top: WordStat[] // keyed by emoji in .w
    signature: Pair<string | null>
    reactions: { e: string; n: number }[]
    distinct: Pair
  }
  words: {
    shared: WordStat[]
    distinctive: Pair<{ w: string; n: number }[]>
    vocabulary: Pair
  }
  convergence: { m: number; emoji: number; words: number }[]
  milestones: Milestone[]
  chapters: Chapter[]
  awards: Award[]
  quiz: QuizQuestion[]
  fun: {
    novels: number // total words / 120k
    typingHours: number // estimated
    longestMessageWords: Pair
  }
  quality: {
    chats: number
    duplicatesRemoved: number
    excludedMessages: number
    notes: string[]
  }
}
