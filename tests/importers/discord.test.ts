import { describe, expect, it } from 'vitest'
import { discordParser } from '../../src/importers/parsers/discord'
import { fromString } from '../../src/importers/source'

const UTC = { timeZone: 'UTC' }
const alice = { id: '1', name: 'alice_ex', nickname: 'Alice', isBot: false }
const bob = { id: '2', name: 'bob_ex', nickname: 'Bob', isBot: false }

const dce = {
  guild: { id: '0', name: 'Direct Messages', iconUrl: '' },
  channel: { id: '9', type: 'DirectTextChat', name: 'Bob' },
  dateRange: { after: null, before: null },
  messages: [
    { id: '11', type: 'Default', timestamp: '2024-03-12T23:04:15.123+02:00', timestampEdited: '2024-03-12T23:05:00+02:00',
      content: 'hey there', author: alice, attachments: [], stickers: [],
      reactions: [{ emoji: { id: '', name: '🔥' }, count: 1, users: [bob] }, { emoji: { name: '👍' }, count: 2 }] },
    { id: '10', type: 'Default', timestamp: '2024-03-12T20:00:00+00:00', content: '', author: bob,
      attachments: [{ url: 'x', fileName: 'photo.png' }], stickers: [], reactions: [] },
    { id: '12', type: 'Call', timestamp: '2024-03-12T21:10:00+00:00', callEndedTimestamp: '2024-03-12T21:12:30+00:00', content: '', author: bob },
    { id: '13', type: 'Default', timestamp: '2024-03-12T21:20:00+00:00', content: 'https://tenor.com/view/fun-gif-123', author: bob },
    { id: '14', type: 'Default', timestamp: '2024-03-12T21:21:00+00:00', content: '', author: alice, stickers: [{ id: '1', name: 'wave' }] },
    { id: '15', type: 'Default', timestamp: '2024-03-12T21:22:00+00:00', content: '', author: alice, attachments: [{ fileName: 'voice-message.ogg' }] },
    { id: '16', type: 'ChannelPinnedMessage', timestamp: '2024-03-12T21:23:00+00:00', content: 'Pinned a message.', author: alice },
    { id: '17', type: 'Default', timestamp: 'garbage', content: 'x', author: alice },
  ],
  messageCount: 8,
}
const json = JSON.stringify(dce, null, 2)

describe('discordParser', () => {
  it('sniffs DCE JSON only', () => {
    expect(discordParser.sniff(fromString(json, 'Direct Messages - Bob [9].json'), json.slice(0, 4096))).toBeGreaterThan(0.9)
    const tg = '{"name":"x","type":"personal_chat","messages":[]}'
    expect(discordParser.sniff(fromString(tg, 'result.json'), tg)).toBe(0)
  })

  it('parses messages with kinds, offsets, reactions, calls', async () => {
    const [chat] = await discordParser.parse(fromString(json, 'dm.json'), UTC)
    expect(chat.platform).toBe('discord')
    expect(chat.title).toBe('Bob')
    expect(chat.participants).toEqual(['Bob', 'Alice'])
    expect(chat.warnings.map((w) => w.code)).toEqual(['unparsed-lines'])
    const ms = chat.messages
    expect(ms.map((m) => m.kind)).toEqual(['media', 'text', 'call', 'gif', 'sticker', 'voice', 'system'])
    expect(new Date(ms[1].t).toISOString()).toBe('2024-03-12T21:04:15.123Z')
    expect(ms[1].text).toBe('hey there')
    expect(ms[1].edited).toBe(true)
    expect(ms[1].reactions).toEqual([{ emoji: '🔥', by: 'Bob' }])
    expect(ms[2].callSeconds).toBe(150)
  })

  it('localises to a non-UTC zone', async () => {
    const [chat] = await discordParser.parse(fromString(json, 'dm.json'), { timeZone: 'America/New_York' })
    expect(new Date(chat.messages[1].t).getUTCHours()).toBe(17)
  })

  it('warns on guild channels and throws on wrong shape', async () => {
    const g = { ...dce, guild: { id: '5', name: 'Fun Server' }, channel: { id: '6', type: 'GuildTextChat', name: 'general' } }
    const [chat] = await discordParser.parse(fromString(JSON.stringify(g), 'g.json'), UTC)
    expect(chat.title).toBe('Fun Server / #general')
    expect(chat.warnings.map((w) => w.code)).toContain('group-chat')
    await expect(discordParser.parse(fromString('{"guild":{}}', 'g.json'), UTC)).rejects.toThrow(/no "messages"/)
  })
})
