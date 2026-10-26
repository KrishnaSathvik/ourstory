import { describe, expect, it } from 'vitest'
import { parseWhatsAppText, resolveDateOrder, whatsappParser } from '../src/importers/parsers/whatsapp'
import { fromString } from '../src/importers/source'

const iso = (t: number) => new Date(t).toISOString().slice(0, 19)

describe('WhatsApp parser', () => {
  it('parses iOS en-GB format with seconds, multi-line and media', () => {
    const chat = parseWhatsAppText(
      [
        '[12/03/2024, 21:04:15] Alice Example: ‎Messages and calls are end-to-end encrypted. No one outside of this chat can read them.',
        '[12/03/2024, 21:04:15] Alice Example: Are we still on for Saturday?',
        'Second line of the same message',
        '[13/03/2024, 08:01:02] Bob Example: ‎image omitted',
        '[13/03/2024, 08:01:09] Bob Example: ‎audio omitted',
        '[13/03/2024, 08:02:00] Bob Example: See you at 8 <This message was edited>',
        '[13/03/2024, 08:03:00] Alice Example: You deleted this message',
      ].join('\n'),
      'WhatsApp Chat - Bob Example/_chat.txt',
    )
    const real = chat.messages.filter((m) => m.kind !== 'system')
    expect(real).toHaveLength(5)
    expect(real[0].text).toBe('Are we still on for Saturday?\nSecond line of the same message')
    expect(iso(real[0].t)).toBe('2024-03-12T21:04:15')
    expect(real[1].kind).toBe('media')
    expect(real[2].kind).toBe('voice')
    expect(real[3]).toMatchObject({ text: 'See you at 8', edited: true })
    expect(real[4].kind).toBe('deleted')
    expect(chat.participants).toEqual(['Alice Example', 'Bob Example'])
    expect(chat.title).toBe('Bob Example')
    expect(chat.selfKey).toBe('Alice Example')
  })

  it('parses Android en-US 12h with narrow no-break space and resolves month-first', () => {
    const chat = parseWhatsAppText(
      [
        '3/12/24, 9:04 PM - Alice: hi',
        '3/13/24, 12:15 AM - Bob: <Media omitted>',
        '3/13/24, 12:30 PM - Bob: lunch?',
        '3/14/24, 7:00 AM - Messages and calls are end-to-end encrypted.',
      ].join('\n'),
      'WhatsApp Chat with Bob.txt',
    )
    const real = chat.messages.filter((m) => m.kind !== 'system')
    expect(iso(real[0].t)).toBe('2024-03-12T21:04:00')
    expect(iso(real[1].t)).toBe('2024-03-13T00:15:00')
    expect(iso(real[2].t)).toBe('2024-03-13T12:30:00')
    expect(chat.messages.filter((m) => m.kind === 'system')).toHaveLength(1)
  })

  it('parses German dotted dates and Spanish a. m./p. m.', () => {
    const de = parseWhatsAppText('[24.12.23, 18:30:00] Anna: Frohe Weihnachten\n[25.12.23, 09:00:00] Ben: Danke', 'x.txt')
    expect(iso(de.messages[0].t)).toBe('2023-12-24T18:30:00')
    const es = parseWhatsAppText('13/3/24, 9:04 p. m. - Ana: Hola\n14/3/24, 10:00 a. m. - Luis: Buenas', 'y.txt')
    expect(iso(es.messages[0].t)).toBe('2024-03-13T21:04:00')
    expect(iso(es.messages[1].t)).toBe('2024-03-14T10:00:00')
  })

  it('resolves date order using sequence when all components ≤ 12', () => {
    // Month-first: second component (day) changes, first stays.
    expect(resolveDateOrder(['01/02/24', '01/03/24', '01/05/24', '02/01/24']).order).toEqual([1, 0, 2])
    // Day-first: 05/01 then 02/02 – first component decreases → it's the day.
    expect(resolveDateOrder(['05/01/24', '02/02/24']).order).toEqual([0, 1, 2])
    expect(resolveDateOrder(['2024-03-01']).order).toEqual([2, 1, 0])
  })

  it('does not treat system lines containing ": " as authors in large chats', () => {
    const lines: string[] = []
    for (let i = 0; i < 30; i++) lines.push(`12/03/2024, 10:${String(i).padStart(2, '0')} - ${i % 2 ? 'Alice' : 'Bob'}: msg ${i}`)
    lines.push('12/03/2024, 11:00 - Bob changed the subject to "Re: trip"')
    const chat = parseWhatsAppText(lines.join('\n'), 'g.txt')
    expect(chat.participants).toEqual(['Bob', 'Alice'])
  })

  it('sniffs WhatsApp text but not random text', () => {
    const f = fromString('', 'chat.txt')
    expect(whatsappParser.sniff(f, '[12/03/2024, 21:04:15] A: hi\n')).toBeGreaterThan(0.5)
    expect(whatsappParser.sniff(f, 'Dear diary, today was nice.')).toBe(0)
  })
})
