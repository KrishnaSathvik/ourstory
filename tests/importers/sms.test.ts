import { describe, expect, it } from 'vitest'
import { smsParser } from '../../src/importers/parsers/sms'
import { fromString } from '../../src/importers/source'

const UTC = { timeZone: 'UTC' }
const T = Date.UTC(2024, 2, 12, 21, 0, 0)
const b64 = 'QUJD'.repeat(50_000)

const XML = `<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>
<!--File Created By SMS Backup & Restore-->
<smses count="7" backup_set="x">
  <sms protocol="0" address="+1 555-555-0100" date="${T}" type="1" subject="null" body="Hi! &amp; &lt;3 &#55357;&#56832;" readable_date="Mar 12, 2024 9:00:00 PM" contact_name="Alice Example" />
  <sms protocol="0" address="+15555550100" date="${T + 60_000}" type="2" body="a > b" contact_name="Alice Example" />
  <sms protocol="0" address="+15555550100" date="${T + 30_000}" type="3" body="draft" contact_name="Alice Example" />
  <sms address="+15555550199" date="${T + 5000}" type="1" body="who dis" contact_name="(Unknown)" />
  <mms date="${T + 120_000}" msg_box="1" address="+15555550100" contact_name="Alice Example" m_type="132">
    <parts>
      <part seq="-1" ct="application/smil" text="&lt;smil&gt;" />
      <part seq="0" ct="image/jpeg" name="pic.jpg" data="${b64}" />
    </parts>
    <addrs><addr address="+15555550100" type="137" charset="106" /><addr address="insert-address-token" type="151" /></addrs>
  </mms>
  <mms date="${T + 180_000}" msg_box="2" address="+15555550100" contact_name="Alice Example">
    <parts><part ct="text/plain" text="Look at this" /><part ct="image/png" data="${b64}" /></parts>
    <addrs><addr address="+15555550100" type="151" /></addrs>
  </mms>
  <mms date="${T + 240_000}" msg_box="1" address="+15555550100~+15555550101" contact_name="Alice Example, Carl Example">
    <parts><part ct="text/plain" text="group hi" /></parts>
    <addrs><addr address="+15555550101" type="137" /><addr address="+15555550100" type="151" /></addrs>
  </mms>
</smses>`

describe('smsParser', () => {
  it('sniffs', () => {
    expect(smsParser.sniff(fromString(XML, 'sms-20240312.xml'), XML.slice(0, 4096))).toBeGreaterThan(0.9)
    expect(smsParser.sniff(fromString('{"a":1}', 'a.json'), '{"a":1}')).toBe(0)
  })

  it('groups by address, decodes entities, classifies mms', async () => {
    const chats = await smsParser.parse(fromString(XML, 'backup/sms.xml'), UTC)
    expect(chats).toHaveLength(3)
    const alice = chats.find((c) => c.title === 'Alice Example')!
    expect(alice.selfKey).toBe('Me')
    expect(alice.source).toBe('backup/sms.xml')
    expect(alice.participants).toEqual(['Alice Example', 'Me'])
    expect(alice.messages.map((m) => [m.sender, m.kind])).toEqual([
      ['Alice Example', 'text'],
      ['Me', 'text'],
      ['Alice Example', 'media'],
      ['Me', 'text'],
    ])
    expect(alice.messages[0].text).toBe('Hi! & <3 😀')
    expect(alice.messages[1].text).toBe('a > b')
    expect(alice.messages[3].text).toBe('Look at this')
    expect(new Date(alice.messages[0].t).toISOString()).toBe('2024-03-12T21:00:00.000Z')

    const unknown = chats.find((c) => c.title === '+15555550199')!
    expect(unknown.participants).toEqual(['+15555550199'])

    const group = chats.find((c) => c.warnings.some((w) => w.code === 'group-chat'))!
    expect(group.messages[0].sender).toBe('+15555550101')
    expect(group.title).toBe('Alice Example, +15555550101')
  })

  it('localises epoch dates', async () => {
    const chats = await smsParser.parse(fromString(XML, 's.xml'), { timeZone: 'America/New_York' })
    const alice = chats.find((c) => c.title === 'Alice Example')!
    expect(new Date(alice.messages[0].t).getUTCHours()).toBe(17)
  })

  it('reports truncated files and rejects non-SMS XML', async () => {
    const cut = XML.slice(0, XML.indexOf('<mms date') + 40)
    const chats = await smsParser.parse(fromString(cut, 's.xml'), UTC)
    expect(chats[0].warnings.map((w) => w.code)).toContain('truncated')
    await expect(smsParser.parse(fromString('<html><body/></html>', 'x.xml'), UTC)).rejects.toThrow(/not an SMS Backup/)
  })
})
