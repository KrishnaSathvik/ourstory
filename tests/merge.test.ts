import { describe, expect, it } from 'vitest'
import { mergeChats, nameSimilarity, suggestIdentity } from '../src/merge/merge'
import type { ChatSummary, IdentityMap, Message, ParsedChat } from '../src/core/types'
import { summarize } from '../src/importers'

const msg = (t: number, sender: string, text: string): Message => ({ t, sender, kind: 'text', text })
const chat = (id: string, platform: ParsedChat['platform'], messages: Message[], selfKey?: string): ParsedChat => ({
  id,
  platform,
  source: id,
  participants: [...new Set(messages.map((m) => m.sender))],
  messages,
  warnings: [],
  selfKey,
})

describe('identity', () => {
  it('scores name similarity', () => {
    expect(nameSimilarity('Maya Okafor', 'maya okafor')).toBe(1)
    expect(nameSimilarity('Maya Okafor', 'Maya O.')).toBeGreaterThan(0.8)
    expect(nameSimilarity('Theo Lindqvist', 'theo')).toBeGreaterThan(0.6)
    expect(nameSimilarity('Theo', 'Maya')).toBe(0)
  })

  it('matches people across platforms using selfKey and names', () => {
    const wa = chat('wa', 'whatsapp', [msg(1, 'Maya Okafor', 'hi'), msg(2, 'Theo Lindqvist', 'yo')], 'Maya Okafor')
    const ig = chat('ig', 'instagram', [msg(1, 'theo', 'hey'), msg(2, 'Maya O.', 'hi')])
    const summaries: ChatSummary[] = [summarize(ig), summarize(wa)]
    const id = suggestIdentity(summaries)
    expect(id.assign.wa).toEqual({ 'Maya Okafor': 'a', 'Theo Lindqvist': 'b' })
    expect(id.assign.ig).toEqual({ 'Maya O.': 'a', theo: 'b' })
    expect(id.people.map((p) => p.name)).toEqual(['Maya', 'Theo'])
  })
})

describe('merge & dedupe', () => {
  const identity: IdentityMap = {
    people: [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
    ],
    assign: { x: { Ann: 'a', Bo: 'b' }, y: { 'Ann K': 'a', Bo: 'b', Carl: null }, z: { ann: 'a', bo: 'b' } },
  }

  it('removes duplicates from two exports of the same chat, keeping genuine repeats', () => {
    const base = Date.UTC(2024, 0, 1, 10)
    // Export 1 (iOS, seconds), export 2 (Android, minutes) — same conversation.
    const x = chat('x', 'whatsapp', [msg(base + 5_000, 'Ann', 'ok'), msg(base + 9_000, 'Ann', 'ok'), msg(base + 20_000, 'Bo', 'Fine'), msg(base + 120_000, 'Bo', 'later')])
    const y = chat('y', 'whatsapp', [msg(base, 'Ann K', 'ok'), msg(base, 'Ann K', 'ok'), msg(base, 'Bo', 'fine'), msg(base, 'Carl', 'who am i')])
    const { messages, report } = mergeChats([x, y], identity)
    expect(messages.map((m) => m.text.toLowerCase())).toEqual(['ok', 'ok', 'fine', 'later'])
    expect(report.duplicatesRemoved).toBe(3)
    expect(report.excludedSenders).toBe(1)
  })

  it('never de-duplicates across different platforms', () => {
    const base = Date.UTC(2024, 0, 1, 10)
    const x = chat('x', 'whatsapp', [msg(base, 'Ann', 'hi')])
    const z = chat('z', 'telegram', [msg(base, 'ann', 'hi')])
    expect(mergeChats([x, z], identity).messages).toHaveLength(2)
  })
})
