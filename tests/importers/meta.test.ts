import { describe, expect, it } from 'vitest'
import { instagramParser, messengerParser } from '../../src/importers/parsers/meta'
import { fromString } from '../../src/importers/source'

const UTC = { timeZone: 'UTC' }
/** Encode like Meta's buggy exporter: each UTF-8 byte becomes one code unit. */
const moji = (s: string) => String.fromCharCode(...new TextEncoder().encode(s))

const T0 = Date.UTC(2024, 2, 12, 21, 0, 0)

const thread = {
  participants: [{ name: moji('Zoë Example') }, { name: 'Bob Example' }],
  messages: [
    { sender_name: 'Bob Example', timestamp_ms: T0 + 9000, content: 'Liked a message' },
    { sender_name: moji('Zoë Example'), timestamp_ms: T0 + 8000, content: 'You missed a call from Bob Example' },
    { sender_name: 'Bob Example', timestamp_ms: T0 + 7000, call_duration: 125, content: 'The video call ended.' },
    { sender_name: 'Bob Example', timestamp_ms: T0 + 6000, is_unsent: true },
    { sender_name: moji('Zoë Example'), timestamp_ms: T0 + 5000, audio_files: [{ uri: 'a.mp4' }] },
    { sender_name: 'Bob Example', timestamp_ms: T0 + 4000, share: { link: 'https://www.instagram.com/p/X/' }, content: 'Bob Example sent an attachment.' },
    { sender_name: moji('Zoë Example'), timestamp_ms: T0 + 3000, photos: [{ uri: 'p.jpg' }] },
    { sender_name: 'Bob Example', timestamp_ms: T0 + 2000, content: moji('Reacted 😂 to your message ') },
    {
      sender_name: 'Bob Example', timestamp_ms: T0 + 1000, content: moji('Café at 8? 😀'),
      reactions: [{ reaction: moji('❤'), actor: moji('Zoë Example') }],
    },
  ],
  title: 'Bob Example',
  is_still_participant: true,
  thread_path: 'inbox/bobexample_123',
  magic_words: [],
}
const json = JSON.stringify(thread)
const IG_PATH = 'instagram-zoe.zip/your_instagram_activity/messages/inbox/bobexample_123/message_1.json'
const FB_PATH = 'facebook-zoe.zip/your_facebook_activity/messages/inbox/bobexample_123/message_1.json'

describe('meta parsers', () => {
  it('sniffs and routes by path', () => {
    const ig = fromString(json, IG_PATH)
    const fb = fromString(json, FB_PATH)
    const h = json.slice(0, 4096)
    expect(instagramParser.sniff(ig, h)).toBeGreaterThan(messengerParser.sniff(ig, h))
    expect(messengerParser.sniff(fb, h)).toBeGreaterThan(instagramParser.sniff(fb, h))
    // No hint at all: default to Instagram.
    const bare = fromString(json, 'message_1.json')
    expect(instagramParser.sniff(bare, h)).toBeGreaterThan(messengerParser.sniff(bare, h))
    // FB-only "type" field hints Messenger even without a path.
    const fbish = JSON.stringify({ ...thread, messages: [{ sender_name: 'A', timestamp_ms: 1, content: 'x', type: 'Generic' }] })
    expect(messengerParser.sniff(bare, fbish)).toBeGreaterThan(instagramParser.sniff(bare, fbish))
    expect(instagramParser.sniff(fromString('{"name":"x","messages":[]}', 'result.json'), '{"name":"x","messages":[]}')).toBe(0)
  })

  it('fixes mojibake, classifies auto content, sorts ascending', async () => {
    const [chat] = await instagramParser.parse(fromString(json, IG_PATH), UTC)
    expect(chat.platform).toBe('instagram')
    expect(chat.threadKey).toBe('instagram:inbox/bobexample_123')
    expect(chat.warnings.map((w) => w.code)).toContain('mojibake-fixed')
    expect(chat.participants).toEqual(['Bob Example', 'Zoë Example'])
    const ms = chat.messages
    expect(ms.map((m) => m.kind)).toEqual(['text', 'system', 'media', 'media', 'voice', 'deleted', 'call', 'call', 'system'])
    expect(ms[0].text).toBe('Café at 8? 😀')
    expect(ms[0].reactions).toEqual([{ emoji: '❤', by: 'Zoë Example' }])
    expect(ms[6].callSeconds).toBe(125)
    expect(ms.every((m, i) => i === 0 || ms[i - 1].t <= m.t)).toBe(true)
    expect(ms.every((m) => m.kind === 'text' || m.text === '')).toBe(true)
  })

  it('fixes the classic cafÃ© case and leaves clean text alone', async () => {
    const a = { participants: [{ name: 'A' }], messages: [{ sender_name: 'A', timestamp_ms: T0, content: 'cafÃ©' }], thread_path: 'inbox/a_1' }
    const [chat] = await instagramParser.parse(fromString(JSON.stringify(a), 'message_1.json'), UTC)
    expect(chat.messages[0].text).toBe('café')
    const b = { participants: [{ name: 'A' }], messages: [{ sender_name: 'A', timestamp_ms: T0, content: 'café ok' }], thread_path: 'inbox/a_1' }
    const [clean] = await instagramParser.parse(fromString(JSON.stringify(b), 'message_1.json'), UTC)
    expect(clean.messages[0].text).toBe('café ok')
    expect(clean.warnings.map((w) => w.code)).not.toContain('mojibake-fixed')
  })

  it('messenger parse sets platform, group warning, and localises', async () => {
    const g = {
      participants: [{ name: 'A Example' }, { name: 'B Example' }, { name: 'C Example' }],
      messages: [{ sender_name: 'A Example', timestamp_ms: T0, content: 'hi all', type: 'Generic' }],
      title: 'Crew', thread_path: 'inbox/crew_9',
    }
    const [chat] = await messengerParser.parse(fromString(JSON.stringify(g), FB_PATH), { timeZone: 'America/New_York' })
    expect(chat.platform).toBe('messenger')
    expect(chat.participants).toEqual(['A Example', 'B Example', 'C Example'])
    expect(chat.warnings.map((w) => w.code)).toContain('group-chat')
    expect(new Date(chat.messages[0].t).getUTCHours()).toBe(17) // 21:00 UTC → 17:00 EDT
  })

  it('handles the E2EE Messenger JSON shape (best effort)', async () => {
    const e = {
      participants: ['Alice Example', 'Bob Example'],
      threadName: 'Bob Example',
      messages: [
        { senderName: 'Bob Example', timestamp: T0 + 2000, text: '', type: 'media', isUnsent: false, media: [{ uri: 'media/v.m4a' }], reactions: [] },
        { senderName: 'Alice Example', timestamp: T0 + 1000, text: 'Hi there', type: 'text', isUnsent: false, media: [], reactions: [{ actor: 'Bob Example', reaction: '👍' }] },
        { senderName: 'Bob Example', timestamp: T0 + 3000, text: '', type: 'text', isUnsent: true, media: [], reactions: [] },
      ],
    }
    const s = JSON.stringify(e)
    const f = fromString(s, 'secure_storage.zip/bob.json')
    expect(messengerParser.sniff(f, s)).toBeGreaterThan(instagramParser.sniff(f, s))
    const [chat] = await messengerParser.parse(f, UTC)
    expect(chat.messages.map((m) => m.kind)).toEqual(['text', 'voice', 'deleted'])
    expect(chat.messages[0].reactions).toEqual([{ emoji: '👍', by: 'Bob Example' }])
    expect(chat.title).toBe('Bob Example')
    expect(chat.threadKey).toContain('e2ee')
  })

  it('throws on non-Meta JSON', async () => {
    await expect(instagramParser.parse(fromString('{"participants": []}', 'message_1.json'), UTC)).rejects.toThrow(/no "messages"/)
  })
})
