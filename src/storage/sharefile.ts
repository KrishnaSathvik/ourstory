/**
 * Portable ".duet" story files: a partner can open the story in their own
 * browser, no server involved.
 *
 * File = JSON { format: 'duet-story', version: 1, encrypted, payload }
 * where payload is a Story or, when encrypted, a crypto Envelope.
 *
 * SECURITY: an imported file is untrusted input. `validateStory` rebuilds a
 * brand-new Story from scratch, copying only known fields after checking
 * type, range and size. Unknown keys are dropped, prototype keys are refused
 * at parse time, nothing is ever evaluated.
 */
import type { Award, Chapter, Milestone, Moment, Pair, QuizAnswer, QuizQuestion, Story, WordStat } from '../analysis/story'
import type { Person, PersonId, Platform } from '../core/types'
import { decryptJson, encryptJson, safeJsonParse } from './crypto'

export const STORY_FILE_FORMAT = 'duet-story'
export const STORY_FILE_VERSION = 1
export const MAX_FILE_BYTES = 5 * 1024 * 1024
export const STORY_FILE_MIME = 'application/x-duet-story+json'

export interface RedactOptions {
  includeWords: boolean
  includeEmoji: boolean
  hiddenWords?: string[]
}

// ============================================================ redaction ===

const norm = (s: string) => s.normalize('NFC').toLowerCase().trim()

function mentions(text: string, hidden: Set<string>): boolean {
  if (!hidden.size) return false
  const lower = norm(text)
  for (const h of hidden) {
    if (!h) continue
    // Whole-word for words, substring for emoji / non-letter tokens.
    if (/^[\p{L}\p{N}'’-]+$/u.test(h)) {
      const esc = h.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, 'u').test(lower)) return true
    } else if (lower.includes(h)) return true
  }
  return false
}

/**
 * Returns a redacted deep copy. Never mutates the input.
 * - !includeWords: no shared/distinctive words, no 'words' quiz questions
 *   (lexicon counts stay: they are counts, not words).
 * - !includeEmoji: no emoji lists, no signatures, no emoji quiz questions.
 * - hiddenWords are always removed everywhere they appear.
 */
export function redactStory(story: Story, opts: RedactOptions): Story {
  const s: Story = structuredClone(story)
  const hidden = new Set((opts.hiddenWords ?? []).map(norm).filter(Boolean))
  const isHidden = (w: string) => hidden.has(norm(w))

  if (!opts.includeWords) {
    s.words.shared = []
    s.words.distinctive = [[], []]
    s.quiz = s.quiz.filter((q) => q.category !== 'words')
  }
  if (!opts.includeEmoji) {
    s.emoji.top = []
    s.emoji.reactions = []
    s.emoji.signature = [null, null]
    s.quiz = s.quiz.filter((q) => q.category !== 'emoji')
    for (const c of s.chapters) delete c.topEmoji
  }
  if (hidden.size) {
    s.words.shared = s.words.shared.filter((x) => !isHidden(x.w))
    s.words.distinctive = [s.words.distinctive[0].filter((x) => !isHidden(x.w)), s.words.distinctive[1].filter((x) => !isHidden(x.w))]
    s.emoji.top = s.emoji.top.filter((x) => !isHidden(x.w))
    s.emoji.reactions = s.emoji.reactions.filter((x) => !isHidden(x.e))
    s.emoji.signature = s.emoji.signature.map((e) => (e && isHidden(e) ? null : e)) as Pair<string | null>
    for (const c of s.chapters) if (c.topEmoji && isHidden(c.topEmoji)) delete c.topEmoji
    s.quiz = s.quiz.filter((q) => ![q.prompt, q.reveal, ...q.options].some((t) => mentions(t, hidden)))
    s.awards = s.awards.filter((a) => ![a.title, a.stat, a.detail].some((t) => mentions(t, hidden)))
    s.milestones = s.milestones.filter((m) => ![m.title, m.detail].some((t) => mentions(t, hidden)))
  }
  return s
}

// ============================================================ file I/O ===

export async function exportStoryFile(story: Story, opts: RedactOptions & { passphrase?: string }): Promise<Blob> {
  // Validate our own output too: guarantees the partner can read it back.
  const clean = validateStory(redactStory(story, opts))
  const encrypted = !!opts.passphrase
  const payload = encrypted ? await encryptJson(clean, opts.passphrase!) : clean
  const json = JSON.stringify({ format: STORY_FILE_FORMAT, version: STORY_FILE_VERSION, encrypted, payload })
  if (json.length > MAX_FILE_BYTES) throw new Error('This story is too large to export as a file.')
  return new Blob([json], { type: STORY_FILE_MIME })
}

/** Reads an untrusted .duet file. Throws Error('needs-passphrase') if encrypted and none given. */
export async function readStoryFile(file: Blob, passphrase?: string): Promise<Story> {
  if (file.size > MAX_FILE_BYTES) throw new Error('That file is too large to be a Duet story (the limit is 5 MB).')
  if (file.size === 0) throw new Error('That file is empty.')
  const text = await file.text()
  if (text.length > MAX_FILE_BYTES) throw new Error('That file is too large to be a Duet story (the limit is 5 MB).')
  let doc: unknown
  try {
    doc = safeJsonParse(text)
  } catch {
    throw new Error('That file is not a Duet story file.')
  }
  if (!isPlainObject(doc) || doc.format !== STORY_FILE_FORMAT) throw new Error('That file is not a Duet story file.')
  if (doc.version !== STORY_FILE_VERSION) throw new Error('This story file was made by a newer version of Duet.')
  if (typeof doc.encrypted !== 'boolean') throw new Error('That story file is damaged.')
  let payload = doc.payload
  if (doc.encrypted) {
    if (!passphrase) throw new Error('needs-passphrase')
    payload = await decryptJson(payload, passphrase)
  }
  return validateStory(payload)
}

// =========================================================== validation ===

const PLATFORMS: readonly Platform[] = ['whatsapp', 'telegram', 'instagram', 'messenger', 'imessage', 'discord', 'sms']
const MILESTONE_KINDS: readonly Milestone['kind'][] = [
  'first-message',
  'message-count',
  'first-love',
  'first-miss',
  'first-goodnight',
  'first-call',
  'platform-start',
  'busiest-day',
  'streak',
  'reunion',
]
const QUIZ_CATEGORIES: readonly QuizQuestion['category'][] = ['habits', 'numbers', 'time', 'emoji', 'words']
const LEXICON_KEYS = ['love', 'miss', 'goodnight', 'goodmorning', 'sorry', 'thanks'] as const

const MAX_DAYS = 20_000
/** Plausible wall-clock range: 1990 … 2100. */
const T_MIN = Date.UTC(1990, 0, 1)
const T_MAX = Date.UTC(2100, 0, 1)
const MAX_COUNT = 1e9

class StoryError extends Error {}

function isPlainObject(x: unknown): x is Record<string, unknown> {
  if (x === null || typeof x !== 'object' || Array.isArray(x)) return false
  const proto = Object.getPrototypeOf(x)
  return proto === Object.prototype || proto === null
}

/** Small path-aware validator. Every reader returns a fresh value. */
class V {
  private readonly path: string
  constructor(path: string) {
    this.path = path
  }
  fail(what: string): never {
    throw new StoryError(`This story file is damaged or wasn't made by Duet (${what} at “${this.path || 'root'}”).`)
  }
  at(key: string | number) {
    return new V(this.path ? `${this.path}.${key}` : String(key))
  }
  obj(x: unknown): Record<string, unknown> {
    if (!isPlainObject(x)) this.fail('expected an object')
    for (const k of Object.keys(x)) if (k === '__proto__' || k === 'constructor' || k === 'prototype') this.fail('forbidden key')
    return x
  }
  arr(x: unknown, max: number, min = 0): unknown[] {
    if (!Array.isArray(x)) this.fail('expected a list')
    if (x.length > max) this.fail(`list too long (${x.length} > ${max})`)
    if (x.length < min) this.fail('list too short')
    return x
  }
  num(x: unknown, min = -Infinity, max = Infinity): number {
    if (typeof x !== 'number' || !Number.isFinite(x)) this.fail('expected a number')
    if (x < min || x > max) this.fail('number out of range')
    return x
  }
  int(x: unknown, min = 0, max = MAX_COUNT): number {
    const n = this.num(x, min, max)
    if (!Number.isInteger(n)) this.fail('expected a whole number')
    return n
  }
  count = (x: unknown) => this.num(x, 0, MAX_COUNT)
  time = (x: unknown) => this.num(x, T_MIN, T_MAX)
  share = (x: unknown) => this.num(x, 0, 1)
  str(x: unknown, max: number, min = 0): string {
    if (typeof x !== 'string') this.fail('expected text')
    if (x.length > max) this.fail('text too long')
    if (x.length < min) this.fail('text missing')
    // Control characters (except tab/newline) have no business in a story.
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u0008\u000b-\u001f\u007f‪-‮⁦-⁩]/.test(x)) this.fail('unexpected characters')
    return x
  }
  bool(x: unknown): boolean {
    if (typeof x !== 'boolean') this.fail('expected true/false')
    return x
  }
  oneOf<T extends string>(x: unknown, allowed: readonly T[]): T {
    if (typeof x !== 'string' || !(allowed as readonly string[]).includes(x)) this.fail('unexpected value')
    return x as T
  }
  person = (x: unknown): PersonId => this.oneOf(x, ['a', 'b'] as const)
  pair<T>(x: unknown, item: (v: V, x: unknown) => T): Pair<T> {
    const a = this.arr(x, 2, 2)
    return [item(this.at(0), a[0]), item(this.at(1), a[1])]
  }
  countPair = (x: unknown): Pair => this.pair(x, (v, y) => v.count(y))
  sharePair = (x: unknown): Pair => this.pair(x, (v, y) => v.share(y))
  list<T>(x: unknown, max: number, item: (v: V, x: unknown) => T, min = 0): T[] {
    return this.arr(x, max, min).map((y, i) => item(this.at(i), y))
  }
  optional<T>(o: Record<string, unknown>, key: string, read: (v: V, x: unknown) => T): T | undefined {
    return o[key] === undefined ? undefined : read(this.at(key), o[key])
  }
}

const WORD_MAX = 40
const EMOJI_MAX = 16
const LINE_MAX = 200
const PARA_MAX = 600

function readWordStat(v: V, x: unknown, max = WORD_MAX): WordStat {
  const o = v.obj(x)
  return { w: v.at('w').str(o.w, max, 1), a: v.at('a').count(o.a), b: v.at('b').count(o.b) }
}

function readMoment(v: V, x: unknown): Moment | null {
  if (x === null) return null
  const o = v.obj(x)
  return { t: v.at('t').time(o.t), p: v.at('p').person(o.p) }
}

function readSpan(v: V, x: unknown) {
  const o = v.obj(x)
  return { days: v.at('days').int(o.days, 0, MAX_DAYS), start: v.at('start').time(o.start), end: v.at('end').time(o.end) }
}

/** Structurally validates an untrusted value and returns a fresh, clean Story. */
export function validateStory(x: unknown): Story {
  const v = new V('')
  const o = v.obj(x)
  if (o.version !== 1) v.at('version').fail('unsupported version')

  // ----------------------------------------------------------- people ---
  const people = v.at('people').pair(o.people, (pv, px): Person => {
    const p = pv.obj(px)
    const name = pv.at('name').str(p.name, 40, 1).trim()
    if (!name) pv.at('name').fail('empty name')
    return { id: pv.at('id').person(p.id), name }
  }) as [Person, Person]
  if (people[0].id !== 'a' || people[1].id !== 'b') v.at('people').fail('people out of order')

  const rv = v.at('range')
  const r = rv.obj(o.range)
  const range = { first: rv.at('first').time(r.first), last: rv.at('last').time(r.last), days: rv.at('days').int(r.days, 0, MAX_DAYS) }
  if (range.last < range.first) rv.fail('range ends before it starts')

  const sources = v.at('sources').list(o.sources, 64, (sv, sx) => {
    const s = sv.obj(sx)
    return {
      platform: sv.at('platform').oneOf(s.platform, PLATFORMS),
      messages: sv.at('messages').count(s.messages),
      first: sv.at('first').time(s.first),
      last: sv.at('last').time(s.last),
      byPerson: sv.at('byPerson').countPair(s.byPerson),
    }
  })

  // ----------------------------------------------------------- totals ---
  const tv = v.at('totals')
  const t = tv.obj(o.totals)
  const tp = (k: string) => tv.at(k).countPair(t[k])
  const totals: Story['totals'] = {
    messages: tv.at('messages').count(t.messages),
    byPerson: tp('byPerson'),
    words: tp('words'),
    characters: tp('characters'),
    emoji: tp('emoji'),
    media: tp('media'),
    voice: tp('voice'),
    stickers: tp('stickers'),
    gifs: tp('gifs'),
    links: tp('links'),
    calls: tp('calls'),
    callSeconds: tv.at('callSeconds').count(t.callSeconds),
    deleted: tp('deleted'),
    edited: tp('edited'),
    reactionsGiven: tp('reactionsGiven'),
  }

  // --------------------------------------------------------- activity ---
  const av = v.at('activity')
  const a = av.obj(o.activity)
  const dayList = (k: string) => av.at(k).list(a[k], MAX_DAYS, (dv, dx) => dv.int(dx, 0, 1_000_000))
  const dailyA = dayList('dailyA')
  const dailyB = dayList('dailyB')
  if (dailyA.length !== dailyB.length) av.at('dailyB').fail('daily lists differ in length')
  const hourRow = (hv: V, hx: unknown) => hv.list(hx, 24, (cv, cx) => cv.count(cx), 24)
  const weekGrid = (gv: V, gx: unknown) => gv.list(gx, 7, hourRow, 7)
  const bv = av.at('busiestDay')
  const bd = bv.obj(a.busiestDay)
  const activity: Story['activity'] = {
    startDay: av.at('startDay').int(a.startDay, 0, 100_000),
    dailyA,
    dailyB,
    monthly: av.at('monthly').list(a.monthly, 1000, (mv, mx) => {
      const m = mv.obj(mx)
      const pv = mv.at('platforms')
      const p = pv.obj(m.platforms)
      const platforms: Partial<Record<Platform, number>> = {}
      for (const k of Object.keys(p)) platforms[pv.oneOf(k, PLATFORMS)] = pv.at(k).count(p[k])
      return { m: mv.at('m').int(m.m, 0, 5000), a: mv.at('a').count(m.a), b: mv.at('b').count(m.b), platforms }
    }),
    activeDays: av.at('activeDays').int(a.activeDays, 0, MAX_DAYS),
    longestStreak: readSpan(av.at('longestStreak'), a.longestStreak),
    longestGap: a.longestGap === null ? null : readSpan(av.at('longestGap'), a.longestGap),
    busiestDay: {
      day: bv.at('day').int(bd.day, 0, 100_000),
      count: bv.at('count').count(bd.count),
      hourly: hourRow(bv.at('hourly'), bd.hourly),
      byPerson: bv.at('byPerson').countPair(bd.byPerson),
    },
    weekHour: av.at('weekHour').pair(a.weekHour, weekGrid),
    peakHour: av.at('peakHour').int(a.peakHour, 0, 23),
    peakWeekday: av.at('peakWeekday').int(a.peakWeekday, 0, 6),
    nightShare: av.at('nightShare').sharePair(a.nightShare),
    morningShare: av.at('morningShare').sharePair(a.morningShare),
  }

  // ----------------------------------------------------------- rhythm ---
  const hv = v.at('rhythm')
  const h = hv.obj(o.rhythm)
  const lm = hv.at('longestMonologue')
  const lmo = lm.obj(h.longestMonologue)
  const rhythm: Story['rhythm'] = {
    medianReply: hv.at('medianReply').pair(h.medianReply, (pv, px) => pv.num(px, -1, 1e12)),
    replyUnderMinute: hv.at('replyUnderMinute').sharePair(h.replyUnderMinute),
    conversations: hv.at('conversations').count(h.conversations),
    initiations: hv.at('initiations').countPair(h.initiations),
    lastWord: hv.at('lastWord').countPair(h.lastWord),
    firstOfDay: hv.at('firstOfDay').countPair(h.firstOfDay),
    lastOfDay: hv.at('lastOfDay').countPair(h.lastOfDay),
    doubleTexts: hv.at('doubleTexts').countPair(h.doubleTexts),
    longestMonologue: { p: lm.at('p').person(lmo.p), count: lm.at('count').count(lmo.count), t: lm.at('t').time(lmo.t) },
    jinx: hv.at('jinx').count(h.jinx),
  }

  const yv = v.at('style')
  const y = yv.obj(o.style)
  const style: Story['style'] = {
    avgWords: yv.at('avgWords').countPair(y.avgWords),
    questions: yv.at('questions').countPair(y.questions),
    exclamations: yv.at('exclamations').countPair(y.exclamations),
    capsMessages: yv.at('capsMessages').countPair(y.capsMessages),
    laughs: yv.at('laughs').countPair(y.laughs),
  }

  const lv = v.at('lexicon')
  const l = lv.obj(o.lexicon)
  const lexicon = {} as Story['lexicon']
  for (const k of LEXICON_KEYS) lexicon[k] = lv.at(k).countPair(l[k])

  const fv = v.at('firsts')
  const f = fv.obj(o.firsts)
  const firstMessage = readMoment(fv.at('message'), f.message) ?? fv.at('message').fail('missing first message')
  const firsts: Story['firsts'] = {
    love: readMoment(fv.at('love'), f.love),
    miss: readMoment(fv.at('miss'), f.miss),
    goodnight: readMoment(fv.at('goodnight'), f.goodnight),
    call: readMoment(fv.at('call'), f.call),
    message: firstMessage,
  }

  // ------------------------------------------------------ emoji/words ---
  const ev = v.at('emoji')
  const e = ev.obj(o.emoji)
  const emoji: Story['emoji'] = {
    top: ev.at('top').list(e.top, 200, (wv, wx) => readWordStat(wv, wx, EMOJI_MAX)),
    signature: ev.at('signature').pair(e.signature, (sv, sx) => (sx === null ? null : sv.str(sx, EMOJI_MAX, 1))),
    reactions: ev.at('reactions').list(e.reactions, 100, (rv2, rx) => {
      const ro = rv2.obj(rx)
      return { e: rv2.at('e').str(ro.e, EMOJI_MAX, 1), n: rv2.at('n').count(ro.n) }
    }),
    distinct: ev.at('distinct').countPair(e.distinct),
  }

  const wv = v.at('words')
  const w = wv.obj(o.words)
  const distinctive = (dv: V, dx: unknown) =>
    dv.list(dx, 200, (iv, ix) => {
      const io = iv.obj(ix)
      return { w: iv.at('w').str(io.w, WORD_MAX, 1), n: iv.at('n').count(io.n) }
    })
  const words: Story['words'] = {
    shared: wv.at('shared').list(w.shared, 500, (sv, sx) => readWordStat(sv, sx)),
    distinctive: wv.at('distinctive').pair(w.distinctive, distinctive),
    vocabulary: wv.at('vocabulary').countPair(w.vocabulary),
  }

  const convergence = v.at('convergence').list(o.convergence, 1000, (cv, cx) => {
    const c = cv.obj(cx)
    return { m: cv.at('m').int(c.m, 0, 5000), emoji: cv.at('emoji').num(c.emoji, 0, 1), words: cv.at('words').num(c.words, 0, 1) }
  })

  // --------------------------------------------------------- narrative ---
  const milestones = v.at('milestones').list(o.milestones, 200, (mv, mx): Milestone => {
    const m = mv.obj(mx)
    const out: Milestone = {
      t: mv.at('t').time(m.t),
      kind: mv.at('kind').oneOf(m.kind, MILESTONE_KINDS),
      title: mv.at('title').str(m.title, LINE_MAX),
      detail: mv.at('detail').str(m.detail, PARA_MAX),
    }
    const p = mv.optional(m, 'p', (pv, px) => pv.person(px))
    if (p) out.p = p
    const platform = mv.optional(m, 'platform', (pv, px) => pv.oneOf(px, PLATFORMS))
    if (platform) out.platform = platform
    return out
  })

  const chapters = v.at('chapters').list(o.chapters, 100, (cv, cx): Chapter => {
    const c = cv.obj(cx)
    const out: Chapter = {
      label: cv.at('label').str(c.label, 60, 1),
      start: cv.at('start').time(c.start),
      end: cv.at('end').time(c.end),
      messages: cv.at('messages').count(c.messages),
      byPerson: cv.at('byPerson').countPair(c.byPerson),
      theme: cv.at('theme').str(c.theme, LINE_MAX),
      themeDetail: cv.at('themeDetail').str(c.themeDetail, PARA_MAX),
    }
    const topEmoji = cv.optional(c, 'topEmoji', (pv, px) => pv.str(px, EMOJI_MAX, 1))
    if (topEmoji) out.topEmoji = topEmoji
    const platform = cv.optional(c, 'platform', (pv, px) => pv.oneOf(px, PLATFORMS))
    if (platform) out.platform = platform
    const peakMonth = cv.optional(c, 'peakMonth', (pv, px) => pv.int(px, 0, 5000))
    if (peakMonth !== undefined) out.peakMonth = peakMonth
    return out
  })

  const awards = v.at('awards').list(o.awards, 50, (wv2, wx): Award => {
    const aw = wv2.obj(wx)
    return {
      id: wv2.at('id').str(aw.id, 40, 1),
      title: wv2.at('title').str(aw.title, 80, 1),
      p: wv2.at('p').person(aw.p),
      stat: wv2.at('stat').str(aw.stat, 40),
      detail: wv2.at('detail').str(aw.detail, PARA_MAX),
      emoji: wv2.at('emoji').str(aw.emoji, EMOJI_MAX),
    }
  })

  const quiz = v.at('quiz').list(o.quiz, 100, (qv, qx): QuizQuestion => {
    const q = qv.obj(qx)
    const options = qv.at('options').list(q.options, 8, (ov, ox) => ov.str(ox, 80, 1), 2)
    const anv = qv.at('answer')
    const an = anv.obj(q.answer)
    let answer: QuizAnswer
    if (an.kind === 'person') answer = { kind: 'person', p: anv.at('p').person(an.p) }
    else if (an.kind === 'choice') answer = { kind: 'choice', index: anv.at('index').int(an.index, 0, options.length - 1) }
    else answer = anv.at('kind').fail('unexpected value')
    return {
      id: qv.at('id').str(q.id, 40, 1),
      prompt: qv.at('prompt').str(q.prompt, LINE_MAX, 1),
      options,
      answer,
      reveal: qv.at('reveal').str(q.reveal, PARA_MAX),
      category: qv.at('category').oneOf(q.category, QUIZ_CATEGORIES),
    }
  })

  const nv = v.at('fun')
  const n = nv.obj(o.fun)
  const fun: Story['fun'] = {
    novels: nv.at('novels').count(n.novels),
    typingHours: nv.at('typingHours').count(n.typingHours),
    longestMessageWords: nv.at('longestMessageWords').countPair(n.longestMessageWords),
  }

  const qv = v.at('quality')
  const ql = qv.obj(o.quality)
  const quality: Story['quality'] = {
    chats: qv.at('chats').int(ql.chats, 0, 10_000),
    duplicatesRemoved: qv.at('duplicatesRemoved').count(ql.duplicatesRemoved),
    excludedMessages: qv.at('excludedMessages').count(ql.excludedMessages),
    notes: qv.at('notes').list(ql.notes, 20, (sv, sx) => sv.str(sx, PARA_MAX)),
  }

  const timeZone = v.at('timeZone').str(o.timeZone, 64, 1)

  return {
    version: 1,
    demo: v.at('demo').bool(o.demo),
    generatedAt: v.at('generatedAt').time(o.generatedAt),
    timeZone: isZone(timeZone) ? timeZone : 'UTC',
    people,
    range,
    sources,
    totals,
    activity,
    rhythm,
    style,
    lexicon,
    firsts,
    emoji,
    words,
    convergence,
    milestones,
    chapters,
    awards,
    quiz,
    fun,
    quality,
  }
}

function isZone(tz: string): boolean {
  if (!/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz })
    return true
  } catch {
    return false
  }
}
