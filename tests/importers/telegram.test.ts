import { describe, expect, it } from 'vitest'
import { telegramParser } from '../../src/importers/parsers/telegram'
import { fromString } from '../../src/importers/source'

const UTC = { timeZone: 'UTC' }
const head = (s: string) => s.slice(0, 4096)

const single = {
  name: 'Bob Example',
  type: 'personal_chat',
  id: 42,
  messages: [
    { id: 2, type: 'message', date: '2024-03-12T21:05:00', date_unixtime: '1710277500', from: 'Bob Example', from_id: 'user2',
      file: 'stickers/s.webp', media_type: 'sticker', sticker_emoji: '👍', text: '' },
    { id: 1, type: 'message', date: '2024-03-12T21:04:15', date_unixtime: '1710277455', edited: '2024-03-12T21:05:00',
      from: 'Alice Example', from_id: 'user1', text: ['See ', { type: 'link', text: 'https://example.com' }, ' ok?'],
      reactions: [{ type: 'emoji', count: 1, emoji: '❤', recent: [{ from: 'Bob Example', from_id: 'user2', date: '2024-03-12T21:06:00' }] },
                  { type: 'emoji', count: 3, emoji: '🔥' }] },
    { id: 3, type: 'service', date: '2024-03-12T21:08:20', date_unixtime: '1710277700', actor: 'Alice Example', actor_id: 'user1',
      action: 'phone_call', duration_seconds: 42, text: '' },
    { id: 4, type: 'message', date: '2024-03-12T21:09:00', date_unixtime: '1710277740', from: 'Bob Example', from_id: 'user2',
      media_type: 'voice_message', file: 'voice/a.ogg', text: '' },
    { id: 5, type: 'message', date: '2024-03-12T21:10:00', date_unixtime: '1710277800', from: 'Alice Example', from_id: 'user1',
      photo: 'photos/p.jpg', text: 'caption' },
    { id: 6, type: 'message', date: '2024-03-12T21:11:00', date_unixtime: '1710277860', from: 'Bob Example', from_id: 'user2',
      media_type: 'animation', file: 'g.mp4', text: '' },
    { id: 7, type: 'service', date: '2024-03-12T21:12:00', date_unixtime: '1710277920', actor: 'Bob Example', actor_id: 'user2',
      action: 'pin_message', text: '' },
  ],
}

describe('telegramParser', () => {
  it('sniffs single-chat and full exports', () => {
    const s = JSON.stringify(single, null, 1)
    expect(telegramParser.sniff(fromString(s, 'result.json'), head(s))).toBeGreaterThan(0.8)
    const full = JSON.stringify({ about: 'Here is the data you requested. Remember: Telegram is ad free', chats: { list: [] } })
    expect(telegramParser.sniff(fromString(full, 'result.json'), head(full))).toBeGreaterThan(0.9)
    const meta = '{"participants":[{"name":"A"}],"messages":[{"sender_name":"A","timestamp_ms":1}]}'
    expect(telegramParser.sniff(fromString(meta, 'message_1.json'), meta)).toBe(0)
  })

  it('parses a single chat', async () => {
    const [chat] = await telegramParser.parse(fromString(JSON.stringify(single), 'tg/result.json'), UTC)
    expect(chat.platform).toBe('telegram')
    expect(chat.source).toBe('tg/result.json')
    expect(chat.title).toBe('Bob Example')
    expect(chat.participants).toEqual(['Alice Example', 'Bob Example'])
    expect(chat.selfKey).toBe('Alice Example')
    expect(chat.warnings).toEqual([])
    const k = chat.messages.map((m) => m.kind)
    expect(k).toEqual(['text', 'sticker', 'call', 'voice', 'media', 'gif', 'system'])
    const [first, , call, , photo] = chat.messages
    expect(first.text).toBe('See https://example.com ok?')
    expect(first.edited).toBe(true)
    expect(first.reactions).toEqual([{ emoji: '❤', by: 'Bob Example' }])
    expect(new Date(first.t).toISOString()).toBe('2024-03-12T21:04:15.000Z')
    expect(call.callSeconds).toBe(42)
    expect(call.sender).toBe('Alice Example')
    expect(photo.text).toBe('')
  })

  it('localises unix times to the chosen zone', async () => {
    const [chat] = await telegramParser.parse(fromString(JSON.stringify(single), 'r.json'), { timeZone: 'America/New_York' })
    // 21:04 UTC on 12 March 2024 = 17:04 EDT
    expect(new Date(chat.messages[0].t).getUTCHours()).toBe(17)
  })

  it('falls back to wall-clock date when unixtime is missing', async () => {
    const c = { name: 'X', type: 'personal_chat', id: 1, messages: [{ id: 1, type: 'message', date: '2024-01-02T03:04:05', from: 'X', text: 'hi' }] }
    const [chat] = await telegramParser.parse(fromString(JSON.stringify(c), 'r.json'), { timeZone: 'Asia/Tokyo' })
    expect(new Date(chat.messages[0].t).toISOString()).toBe('2024-01-02T03:04:05.000Z')
    expect(chat.warnings.map((w) => w.code)).toContain('timezone-assumed')
  })

  it('parses a full export with left chats, self name and group warnings', async () => {
    const group = {
      name: 'Trip', type: 'private_supergroup', id: 7,
      messages: [
        { id: 1, type: 'message', date_unixtime: '1700000000', from: 'Carol Example', from_id: 'user3', text: 'hey' },
        { id: 2, type: 'message', date_unixtime: '1700000001', from: null, from_id: 'user9', text: 'hello' },
      ],
    }
    const full = {
      about: 'Here is the data you requested. Telegram',
      personal_information: { user_id: 1, first_name: 'Alice', last_name: 'Example' },
      chats: { list: [single, { name: 'Empty', type: 'personal_chat', id: 8, messages: [] }] },
      left_chats: { list: [group] },
    }
    const chats = await telegramParser.parse(fromString(JSON.stringify(full), 'result.json'), UTC)
    expect(chats).toHaveLength(2)
    expect(chats[0].selfKey).toBe('Alice Example')
    expect(chats[1].participants).toEqual(['Carol Example', 'user9'])
    expect(chats[1].warnings.map((w) => w.code)).toContain('group-chat')
    expect(new Set(chats.map((c) => c.id)).size).toBe(2)
  })

  it('rejects malformed input descriptively', async () => {
    await expect(telegramParser.parse(fromString('{"name": "x", ', 'result.json'), UTC)).rejects.toThrow(/not valid JSON/)
    await expect(telegramParser.parse(fromString('{"hello": 1}', 'result.json'), UTC)).rejects.toThrow(/no Telegram chats/)
  })
})
