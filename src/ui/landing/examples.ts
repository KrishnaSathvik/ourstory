/**
 * Example insights shown on the landing page. They come from the fictional
 * demo couple and are verified against the real pipeline output by
 * tests/landing-examples.test.ts, so marketing copy can't drift from what
 * the product actually computes.
 */
export interface Example {
  tone: 'a' | 'b' | 'blend'
  kicker: string
  big: string
  small: string
}

export const DEMO_FACTS = {
  firstLoveDate: '29 April 2022',
  firstLoveBy: 'Maya',
  firstLoveDaysIn: 45,
  replyTheo: '2 min',
  replyMaya: '4 min',
  streakDays: 145,
  emojiAlikeFrom: '2%',
  emojiAlikeTo: '74%',
  lateNightChapter: { label: '2025', theme: 'The late-night year' },
}

const F = DEMO_FACTS
export const EXAMPLES: Example[] = [
  { tone: 'a', kicker: 'The first “love you”', big: F.firstLoveDate, small: `${F.firstLoveBy} wrote it, ${F.firstLoveDaysIn} days after the first message.` },
  { tone: 'b', kicker: 'Speed replier', big: F.replyTheo, small: `Theo’s typical reply time. Maya’s is ${F.replyMaya}.` },
  { tone: 'blend', kicker: 'Talking every day', big: `${F.streakDays} days`, small: 'The longest run without a single silent day.' },
  { tone: 'a', kicker: 'Speaking the same language', big: `${F.emojiAlikeFrom} → ${F.emojiAlikeTo}`, small: 'How alike their emoji habits became, first season to latest.' },
  { tone: 'b', kicker: 'Night Owl', big: '🦉', small: 'Theo sends more than twice Maya’s share of messages after midnight.' },
  { tone: 'blend', kicker: 'Their chapters', big: F.lateNightChapter.label, small: `${F.lateNightChapter.theme}.` },
]
