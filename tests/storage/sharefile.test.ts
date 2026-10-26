import { beforeAll, describe, expect, it } from 'vitest'
import type { Story } from '../../src/analysis/story'
import { exportStoryFile, MAX_FILE_BYTES, readStoryFile, redactStory, validateStory } from '../../src/storage/sharefile'
import { Pipeline } from '../../src/worker/pipeline'

let cached: Story | null = null

/** The real demo story, built once per test file. */
async function demoStory(): Promise<Story> {
  if (!cached) {
    const p = new Pipeline()
    const r = await p.importDemo()
    cached = p.analyze(r.suggestion, r.chats.map((c) => c.id))
  }
  return structuredClone(cached)
}



let story: Story
beforeAll(async () => {
  story = await demoStory()
}, 60_000)

const all = { includeWords: true, includeEmoji: true }
const fileOf = (x: unknown) => new Blob([typeof x === 'string' ? x : JSON.stringify(x)])
const wrap = (payload: unknown) => fileOf({ format: 'duet-story', version: 1, encrypted: false, payload })
const mutate = (fn: (s: any) => void) => {
  const s: any = structuredClone(story)
  fn(s)
  return s
}

describe('redactStory', () => {
  it('keeps everything with everything included, without mutating', () => {
    const before = structuredClone(story)
    expect(redactStory(story, all)).toEqual(story)
    expect(story).toEqual(before)
  })

  it('removes word stats and word quiz questions but keeps lexicon counts', () => {
    const r = redactStory(story, { includeWords: false, includeEmoji: true })
    expect(r.words.shared).toEqual([])
    expect(r.words.distinctive).toEqual([[], []])
    expect(r.quiz.some((q) => q.category === 'words')).toBe(false)
    expect(r.quiz.length).toBeGreaterThan(0)
    expect(r.lexicon).toEqual(story.lexicon)
    expect(r.words.vocabulary).toEqual(story.words.vocabulary)
    expect(JSON.stringify(r)).not.toContain('pickle')
  })

  it('removes emoji lists, signatures and emoji quiz questions', () => {
    const r = redactStory(story, { includeWords: true, includeEmoji: false })
    expect(r.emoji.top).toEqual([])
    expect(r.emoji.reactions).toEqual([])
    expect(r.emoji.signature).toEqual([null, null])
    expect(r.quiz.some((q) => q.category === 'emoji')).toBe(false)
    expect(r.chapters.every((c) => c.topEmoji === undefined)).toBe(true)
    expect(r.totals.emoji).toEqual(story.totals.emoji)
  })

  it('always removes hidden words everywhere', () => {
    const r = redactStory(story, { ...all, hiddenWords: ['Pickle', 'sorry', '💛'] })
    const json = JSON.stringify(r).toLowerCase()
    expect(json).not.toContain('pickle')
    expect(r.words.shared.some((w) => w.w === 'sorry')).toBe(false)
    expect(r.awards.some((a) => /sorry/i.test(a.detail))).toBe(false)
    expect(r.emoji.top.some((e) => e.w === '💛')).toBe(false)
    expect(r.emoji.signature[0]).toBeNull()
    expect(r.words.shared.length).toBe(story.words.shared.length - 2)
  })
})

describe('story files', () => {
  it('roundtrips an unencrypted file with defaults applied', async () => {
    const blob = await exportStoryFile(story, { includeWords: false, includeEmoji: true })
    const doc = JSON.parse(await blob.text())
    expect(doc).toMatchObject({ format: 'duet-story', version: 1, encrypted: false })
    const back = await readStoryFile(blob)
    expect(back).toEqual(redactStory(story, { includeWords: false, includeEmoji: true }))
  })

  it('roundtrips an encrypted file and needs the passphrase', async () => {
    const blob = await exportStoryFile(story, { ...all, passphrase: 'for theo' })
    const text = await blob.text()
    expect(JSON.parse(text).encrypted).toBe(true)
    expect(text).not.toContain('Maya')
    await expect(readStoryFile(blob)).rejects.toThrow('needs-passphrase')
    await expect(readStoryFile(blob, 'nope')).rejects.toThrow('Wrong passphrase')
    expect(await readStoryFile(blob, 'for theo')).toEqual(story)
  }, 30_000)

  it('rejects files that are not Duet files', async () => {
    await expect(readStoryFile(fileOf('hello'))).rejects.toThrow(/not a Duet story/)
    await expect(readStoryFile(fileOf({ format: 'other' }))).rejects.toThrow(/not a Duet story/)
    await expect(readStoryFile(fileOf({ format: 'duet-story', version: 99, encrypted: false, payload: {} }))).rejects.toThrow(/newer version/)
    await expect(readStoryFile(new Blob([]))).rejects.toThrow(/empty/)
  })

  it('rejects files over 5 MB without reading them', async () => {
    const big = new Blob([new Uint8Array(MAX_FILE_BYTES + 1)])
    await expect(readStoryFile(big)).rejects.toThrow(/too large/)
  })

  it('refuses __proto__ / constructor keys anywhere', async () => {
    const good = JSON.stringify({ format: 'duet-story', version: 1, encrypted: false, payload: story })
    const evil1 = good.replace('"version":1,"demo"', '"__proto__":{"polluted":true},"version":1,"demo"')
    expect(evil1).not.toBe(good)
    await expect(readStoryFile(fileOf(evil1))).rejects.toThrow()
    const evil2 = good.replace('"people":[{', '"people":[{"constructor":{"prototype":{"x":1}},')
    await expect(readStoryFile(fileOf(evil2))).rejects.toThrow()
    expect(({} as any).polluted).toBeUndefined()
    // Direct validator call with an own __proto__ key (as JSON.parse creates).
    const obj = JSON.parse(JSON.stringify(story).replace('"totals":{', '"totals":{"__proto__":{"x":1},'))
    expect(() => validateStory(obj)).toThrow(/forbidden key/)
  })
})

describe('validateStory', () => {
  it('accepts the real story and returns a fresh copy', () => {
    const v = validateStory(story)
    expect(v).toEqual(story)
    expect(v).not.toBe(story)
    expect(v.activity.weekHour).not.toBe(story.activity.weekHour)
  })

  it('drops unknown keys', () => {
    const v: any = validateStory(mutate((s) => ((s.extra = '<script>'), (s.people[0].html = '<img onerror>'))))
    expect(v.extra).toBeUndefined()
    expect(v.people[0].html).toBeUndefined()
  })

  const hostile: [string, (s: any) => void, RegExp?][] = [
    ['non-object', (s) => Object.keys(s).forEach((k) => delete s[k])],
    ['wrong version', (s) => (s.version = 2)],
    ['name too long', (s) => (s.people[0].name = 'x'.repeat(41)), /people\.0\.name/],
    ['empty name', (s) => (s.people[1].name = '   ')],
    ['name with bidi override', (s) => (s.people[1].name = 'Theo‮')],
    ['people swapped', (s) => (s.people = [s.people[1], s.people[0]])],
    ['name is a number', (s) => (s.people[0].name = 42)],
    ['bad platform', (s) => (s.sources[0].platform = 'myspace'), /sources\.0\.platform/],
    ['bad monthly platform key', (s) => (s.activity.monthly[0].platforms = { evil: 3 })],
    ['NaN count', (s) => (s.totals.messages = NaN)],
    ['Infinity in pair', (s) => (s.totals.words = [Infinity, 1])],
    ['negative count', (s) => (s.totals.byPerson = [-1, 5])],
    ['string number', (s) => (s.totals.messages = '38821')],
    ['huge daily array', (s) => (s.activity.dailyA = new Array(20_001).fill(1)), /too long/],
    ['mismatched daily arrays', (s) => s.activity.dailyB.pop()],
    ['fractional daily count', (s) => (s.activity.dailyA[3] = 1.5)],
    ['weekHour 6 rows', (s) => s.activity.weekHour[0].pop(), /weekHour/],
    ['weekHour 25 hours', (s) => s.activity.weekHour[1][2].push(1)],
    ['weekHour three people', (s) => s.activity.weekHour.push(s.activity.weekHour[0])],
    ['hourly not 24', (s) => (s.activity.busiestDay.hourly = [1, 2])],
    ['peakHour 24', (s) => (s.activity.peakHour = 24)],
    ['share > 1', (s) => (s.activity.nightShare = [1.5, 0])],
    ['timestamp in year 3000', (s) => (s.range.first = Date.UTC(3000, 0, 1))],
    ['range reversed', (s) => (s.range.last = s.range.first - 1)],
    ['huge milestone list', (s) => (s.milestones = new Array(201).fill(s.milestones[0]))],
    ['bad milestone kind', (s) => (s.milestones[0].kind = 'hacked')],
    ['award title too long', (s) => (s.awards[0].title = 'A'.repeat(500))],
    ['award p is c', (s) => (s.awards[0].p = 'c')],
    ['quiz answer index out of range', (s) => (s.quiz.find((q: any) => q.answer.kind === 'choice').answer.index = 9)],
    ['quiz unknown answer kind', (s) => (s.quiz[0].answer = { kind: 'eval', code: 'x' })],
    ['quiz bad category', (s) => (s.quiz[0].category = 'secrets')],
    ['emoji too long', (s) => (s.emoji.top[0].w = '😀'.repeat(20))],
    ['word is object', (s) => (s.words.shared[0].w = { toString: 1 })],
    ['missing first message', (s) => (s.firsts.message = null)],
    ['lexicon missing key', (s) => delete s.lexicon.love],
    ['demo not boolean', (s) => (s.demo = 'yes')],
    ['array instead of object', (s) => (s.totals = [])],
    ['notes too many', (s) => (s.quality.notes = new Array(21).fill('x'))],
  ]
  it.each(hostile)('rejects %s with a friendly error', (_name, fn, where) => {
    const bad = mutate(fn)
    expect(() => validateStory(bad)).toThrow(/damaged or wasn't made by Duet/)
    if (where) expect(() => validateStory(bad)).toThrow(where)
  })

  it('rejects hostile top-level values', () => {
    for (const x of [null, undefined, 42, 'story', [], [story], new Date()]) expect(() => validateStory(x)).toThrow()
  })

  it('falls back to UTC for an unknown time zone', () => {
    expect(validateStory(mutate((s) => (s.timeZone = 'Mars/Olympus'))).timeZone).toBe('UTC')
  })

  it('rejects hostile payloads inside a file', async () => {
    await expect(readStoryFile(wrap(mutate((s) => (s.activity.weekHour = 'x'))))).rejects.toThrow(/damaged/)
    const enc = fileOf({ format: 'duet-story', version: 1, encrypted: true, payload: { v: 1, kdf: 'PBKDF2-SHA256', cipher: 'AES-GCM-256', iter: 1e12, salt: '', iv: '', ct: '' } })
    await expect(readStoryFile(enc, 'pw')).rejects.toThrow(/damaged/)
  })
})
