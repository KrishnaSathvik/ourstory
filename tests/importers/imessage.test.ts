import { describe, expect, it } from 'vitest'
import { imessageParser } from '../../src/importers/parsers/imessage'
import { fromString } from '../../src/importers/source'

const UTC = { timeZone: 'UTC' }

const TXT = `Jan 05, 2024  9:41:02 PM (Read by them after 2 seconds)
Me
Are we still on for Saturday?
It's at 8

Jan 05, 2024  9:42:10 PM
+15555550100
Yes! See you there
Tapbacks:
    Loved by Me
    Laughed at by Me

Jan 05, 2024 10:01:00 PM
+15555550100
/Users/fake/Library/Messages/Attachments/ab/12/IMG_0001.HEIC

Jan 06, 2024 12:15:30 AM
Me
attachments/1/Audio Message.caf

Jan 06, 2024 12:20:00 PM
Me
Edited 1 minute later: fixed typo

Jan 06, 2024 12:30:00 PM Me named the conversation Weekend

Jan 05, 2024  9:30:00 PM
+15555550100
earlier msg out of order
`

describe('imessageParser', () => {
  it('sniffs imessage-exporter txt but not WhatsApp', () => {
    expect(imessageParser.sniff(fromString(TXT, '+15555550100.txt'), TXT)).toBeGreaterThan(0.8)
    const wa = '[12/03/24, 21:04:15] Alice Example: hi\n'
    expect(imessageParser.sniff(fromString(wa, '_chat.txt'), wa)).toBe(0)
    expect(imessageParser.sniff(fromString(TXT, 'chat.json'), TXT)).toBe(0)
  })

  it('parses messages, tapbacks, attachments, announcements', async () => {
    const [chat] = await imessageParser.parse(fromString(TXT, 'out/+15555550100.txt'), UTC)
    expect(chat.platform).toBe('imessage')
    expect(chat.selfKey).toBe('Me')
    expect(chat.title).toBe('+15555550100')
    expect(chat.participants).toEqual(['+15555550100', 'Me'])
    const ms = chat.messages
    expect(ms.map((m) => m.kind)).toEqual(['text', 'text', 'text', 'media', 'voice', 'text', 'system'])
    expect(ms[0].text).toBe('earlier msg out of order')
    expect(ms[1].text).toBe("Are we still on for Saturday?\nIt's at 8")
    expect(new Date(ms[1].t).toISOString()).toBe('2024-01-05T21:41:02.000Z')
    expect(ms[2].text).toBe('Yes! See you there')
    expect(ms[2].reactions).toEqual([
      { emoji: '❤️', by: 'Me' },
      { emoji: '😂', by: 'Me' },
    ])
    expect(new Date(ms[3].t).getUTCHours()).toBe(22)
    expect(new Date(ms[4].t).toISOString()).toBe('2024-01-06T00:15:30.000Z')
    expect(ms[5].edited).toBe(true)
    expect(ms[5].text).toBe('fixed typo')
    expect(ms[6].sender).toBe('Me')
  })

  it('treats times as wall-clock regardless of zone', async () => {
    const [chat] = await imessageParser.parse(fromString(TXT, 'a.txt'), { timeZone: 'America/New_York' })
    expect(new Date(chat.messages[1].t).getUTCHours()).toBe(21)
  })

  it('flags group chats and returns [] for empty input', async () => {
    const g = `Feb 01, 2024  1:00:00 PM\nMe\nhi\n\nFeb 01, 2024  1:01:00 PM\nalice@example.com\nhey\n\nFeb 01, 2024  1:02:00 PM\n+15555550199\nyo\n`
    const [chat] = await imessageParser.parse(fromString(g, 'g.txt'), UTC)
    expect(chat.warnings.map((w) => w.code)).toContain('group-chat')
    expect(await imessageParser.parse(fromString('\n\n', 'e.txt'), UTC)).toEqual([])
  })
})
