import { beforeAll, describe, expect, it } from 'vitest'
import { Pipeline } from '../src/worker/pipeline'
import type { Story } from '../src/analysis/story'
import { generateDemoFiles, generateDemoMessages } from '../src/demo/generate'

/**
 * End-to-end: synthetic export files → real parsers → identity → merge →
 * analysis. Also the privacy contract: no message text in the Story.
 */
let story: Story
let imported: Awaited<ReturnType<Pipeline['importDemo']>>

beforeAll(async () => {
  const p = new Pipeline()
  imported = await p.importDemo()
  story = p.analyze(imported.suggestion, imported.chats.map((c) => c.id))
}, 60_000)

describe('demo pipeline', () => {
  it('imports three platforms and identifies the couple', () => {
    expect(imported.skipped).toEqual([])
    expect(imported.chats.map((c) => c.platform).sort()).toEqual(['instagram', 'telegram', 'whatsapp'])
    expect(story.people.map((p) => p.name).sort()).toEqual(['Maya', 'Theo'])
    expect(story.demo).toBe(true)
  })

  it('accounts for every generated message exactly once', () => {
    const generated = generateDemoMessages()
    expect(story.totals.messages).toBe(generated.length)
    expect(story.quality.duplicatesRemoved).toBe(0)
  })

  it('repairs Instagram mojibake (emoji survive)', () => {
    expect(imported.chats.find((c) => c.platform === 'instagram')!.warnings.some((w) => w.code === 'mojibake-fixed')).toBe(true)
    expect(story.emoji.top.length).toBeGreaterThan(5)
  })

  it('finds the designed patterns', () => {
    const maya = story.people[0].name === 'Maya' ? 0 : 1
    const theo = 1 - maya
    expect(story.activity.nightShare[theo]).toBeGreaterThan(story.activity.nightShare[maya])
    expect(story.rhythm.initiations[maya]).toBeGreaterThan(story.rhythm.initiations[theo])
    expect(story.totals.voice[maya]).toBeGreaterThan(story.totals.voice[theo])
    expect(story.activity.longestGap!.days).toBeGreaterThanOrEqual(8)
    expect(story.firsts.love).not.toBeNull()
    expect(story.sources).toHaveLength(3)
    expect(story.chapters.length).toBeGreaterThanOrEqual(3)
    expect(story.awards.length).toBeGreaterThanOrEqual(6)
    expect(story.quiz.length).toBeGreaterThanOrEqual(8)
    expect(story.words.shared.length).toBeGreaterThan(5)
  })

  it('quiz answers are consistent', () => {
    for (const q of story.quiz) {
      if (q.answer.kind === 'choice') {
        expect(q.answer.index).toBeGreaterThanOrEqual(0)
        expect(q.answer.index).toBeLessThan(q.options.length)
        expect(new Set(q.options).size).toBe(q.options.length)
      } else expect(q.options).toHaveLength(2)
    }
  })
})

describe('privacy contract', () => {
  it('the Story contains no multi-word message text', () => {
    const json = JSON.stringify(story).toLowerCase()
    const texts = new Set<string>()
    for (const f of generateDemoFiles()) void f
    for (const m of generateDemoMessages()) {
      const t = m.text.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').trim()
      if (t.split(/\s+/).length >= 2) texts.add(t)
    }
    expect(texts.size).toBeGreaterThan(50)
    const leaks = [...texts].filter((t) => json.includes(t))
    // Template copy may legitimately contain lexicon phrases like "love you".
    const allowed = new Set(['love you', 'miss you', 'good night', 'thank you'])
    expect(leaks.filter((l) => !allowed.has(l))).toEqual([])
  })

  it('only shows words that pass frequency thresholds', () => {
    for (const w of story.words.shared) expect(w.a + w.b).toBeGreaterThanOrEqual(6)
    for (const list of story.words.distinctive) for (const w of list) expect(w.w).toMatch(/^\p{L}[\p{L}']+$/u)
  })
})
