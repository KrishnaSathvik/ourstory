import { beforeAll, describe, expect, it } from 'vitest'
import { Pipeline } from '../src/worker/pipeline'
import type { Story } from '../src/analysis/story'
import { DAY } from '../src/core/time'
import { fmtDate, fmtDuration, fmtPct } from '../src/analysis/format'
import { DEMO_FACTS as F } from '../src/ui/landing/examples'

/** Every number on the landing page must be what the product computes. */
let s: Story
beforeAll(async () => {
  const p = new Pipeline()
  const r = await p.importDemo()
  s = p.analyze(r.suggestion, r.chats.map((c) => c.id))
}, 60_000)

describe('landing page examples match the demo pipeline', () => {
  it('first love you', () => {
    expect(fmtDate(s.firsts.love!.t)).toBe(F.firstLoveDate)
    expect(s.people[s.firsts.love!.p === 'a' ? 0 : 1].name).toBe(F.firstLoveBy)
    expect(Math.round((s.firsts.love!.t - s.firsts.message.t) / DAY)).toBe(F.firstLoveDaysIn)
  })
  it('reply times, streak, night owl', () => {
    const theo = s.people[0].name === 'Theo' ? 0 : 1
    expect(fmtDuration(s.rhythm.medianReply[theo])).toBe(F.replyTheo)
    expect(fmtDuration(s.rhythm.medianReply[1 - theo])).toBe(F.replyMaya)
    expect(s.activity.longestStreak.days).toBe(F.streakDays)
    expect(s.activity.nightShare[theo]).toBeGreaterThan(2 * s.activity.nightShare[1 - theo])
  })
  it('emoji convergence and chapters', () => {
    const c = s.convergence
    expect(fmtPct(c[0].emoji)).toBe(F.emojiAlikeFrom)
    expect(fmtPct(c[c.length - 1].emoji)).toBe(F.emojiAlikeTo)
    expect(s.chapters.find((x) => x.label === F.lateNightChapter.label)?.theme).toBe(F.lateNightChapter.theme)
  })
})
