import type { ImportWarning, Message, MessageKind, ParsedChat } from '../../core/types'
import { stripInvisible } from '../../core/text'
import { chatId, type Parser, type SourceFile } from '../source'

/**
 * WhatsApp .txt exports (iOS & Android, all locales we know of).
 *
 * Header regex adapted from Pustur/whatsapp-chat-parser (MIT). Timestamps
 * are the exporting phone's wall-clock time without zone, which is exactly
 * our Message.t representation, so no zone conversion happens here.
 */
const HEADER =
  /^[‎‏‪-‮]*\[?(\d{1,4}[-/.]\s?\d{1,4}[-/.]\s?\d{1,4})[,.]?\s\D*?(\d{1,2}[.:]\d{1,2}(?:[.:]\d{1,2})?)(?:[\s  ]?([ap]\.?\s?m\.?))?\]?(?:\s-|:)?\s/i

interface RawLine {
  date: string
  time: string
  ampm?: string
  body: string // everything after the header, may contain "Author: text"
  index: number
}

const MEDIA_EXACT = [
  '<media omitted>',
  '<medien weggelassen>',
  '<multimedia omitido>',
  '<médias omis>',
  '<mídia oculta>',
  '<arquivo de mídia oculto>',
  '<media weggelaten>',
  '<media omessi>',
  '<multimedia omessi>',
  '<медиа без файлов>',
  '<без медиафайлов>',
  'null',
]
const MEDIA_SUFFIX: [string, MessageKind][] = [
  ['image omitted', 'media'],
  ['video omitted', 'media'],
  ['document omitted', 'media'],
  ['contact card omitted', 'media'],
  ['audio omitted', 'voice'],
  ['sticker omitted', 'sticker'],
  ['gif omitted', 'gif'],
  ['imagen omitida', 'media'],
  ['video omitido', 'media'],
  ['audio omitido', 'voice'],
  ['sticker omitido', 'sticker'],
  ['gif omitido', 'gif'],
  ['bild weggelassen', 'media'],
  ['video weggelassen', 'media'],
  ['audio weggelassen', 'voice'],
  ['sticker weggelassen', 'sticker'],
  ['image absente', 'media'],
  ['vidéo absente', 'media'],
  ['audio omis', 'voice'],
  ['imagem ocultada', 'media'],
  ['áudio ocultado', 'voice'],
  ['figurinha omitida', 'sticker'],
]
const DELETED = [
  'this message was deleted',
  'you deleted this message',
  'se eliminó este mensaje',
  'eliminaste este mensaje',
  'diese nachricht wurde gelöscht',
  'du hast diese nachricht gelöscht',
  'ce message a été supprimé',
  'vous avez supprimé ce message',
  'mensagem apagada',
  'você apagou esta mensagem',
  'questo messaggio è stato eliminato',
  'hai eliminato questo messaggio',
]
const SELF_DELETED = ['you deleted this message', 'eliminaste este mensaje', 'du hast diese nachricht gelöscht', 'vous avez supprimé ce message', 'você apagou esta mensagem', 'hai eliminato questo messaggio']
const EDITED_SUFFIX = /\s*<[^<>]*(?:edited|editó|bearbeitet|modifié|editada|modificato|bewerkt)[^<>]*>\s*$/i
const CALL = /^(?:missed )?(?:voice|video|group voice|group video) call\b|^(?:llamada|videollamada) (?:perdida|de voz)|^verpasster (?:sprach|video)anruf/i
const SYSTEM_PATTERNS = [
  /end-to-end encrypted/i,
  /cifrados de extremo a extremo/i,
  /ende-zu-ende-verschlüsselt/i,
  /chiffrés de bout en bout/i,
  /security code (?:with .* )?changed/i,
  /changed (?:the subject|this group's|the group|their phone number|the group description)/i,
  /\b(?:created group|added|removed|left|joined using this group's invite link)\b/i,
  /disappearing messages/i,
  /turned (?:on|off) disappearing/i,
  /is a contact\.?$/i,
  /blocked this contact|unblocked this contact/i,
  /pinned a message/i,
  /^waiting for this message/i,
]
const ATTACHED = /^<attached:\s*(.+)>$|^([\w-]+\.\w+)\s[(<].+[)>]$/i

function classify(text: string): { kind: MessageKind; text: string; edited?: boolean } {
  let edited = false
  let t = text
  if (EDITED_SUFFIX.test(t)) {
    edited = true
    t = t.replace(EDITED_SUFFIX, '')
  }
  const lower = t.trim().toLowerCase().replace(/\.$/, '')
  if (MEDIA_EXACT.includes(lower)) return { kind: 'media', text: '' }
  for (const [suffix, kind] of MEDIA_SUFFIX) if (lower.endsWith(suffix)) return { kind, text: '' }
  const att = ATTACHED.exec(t.trim())
  if (att) {
    const file = (att[1] ?? att[2] ?? '').toUpperCase()
    let kind: MessageKind = 'media'
    if (file.includes('PTT-') || file.includes('-AUDIO-') || /\.(OPUS|M4A|AAC)$/.test(file)) kind = 'voice'
    else if (file.includes('STICKER') || file.endsWith('.WEBP')) kind = 'sticker'
    else if (file.includes('-GIF-')) kind = 'gif'
    return { kind, text: '' }
  }
  if (DELETED.includes(lower)) return { kind: 'deleted', text: '' }
  if (CALL.test(lower)) return { kind: 'call', text: '' }
  return { kind: 'text', text: t, edited: edited || undefined }
}

/**
 * Decide day/month order from all date strings (whatsapp-chat-parser's
 * daysBeforeMonths heuristic). Returns order indices [dayIdx, monthIdx, yearIdx]
 * into the component triple, and whether the decision was a guess.
 */
export function resolveDateOrder(dates: string[]): { order: [number, number, number]; guessed: boolean } {
  const triples = dates.map((d) => d.split(/[-/.]\s?/).map((x) => x.trim()))
  if (triples.length && triples[0][0].length === 4) return { order: [2, 1, 0], guessed: false } // ISO y-m-d
  const nums = triples.map((t) => t.map(Number))
  if (nums.some((n) => n[0] > 12)) return { order: [0, 1, 2], guessed: false }
  if (nums.some((n) => n[1] > 12)) return { order: [1, 0, 2], guessed: false }
  // Within a year, the month never decreases between consecutive dates.
  const byYear = new Map<number, number[][]>()
  for (const n of nums) {
    const arr = byYear.get(n[2]) ?? []
    const last = arr[arr.length - 1]
    if (!last || last[0] !== n[0] || last[1] !== n[1]) arr.push(n)
    byYear.set(n[2], arr)
  }
  for (const arr of byYear.values()) {
    for (let i = 1; i < arr.length; i++) {
      if (arr[i][0] < arr[i - 1][0]) return { order: [0, 1, 2], guessed: false }
      if (arr[i][1] < arr[i - 1][1]) return { order: [1, 0, 2], guessed: false }
    }
  }
  // Fall back: the component that changes more often is the day.
  let d0 = 0
  let d1 = 0
  for (let i = 1; i < nums.length; i++) {
    d0 += Math.abs(nums[i][0] - nums[i - 1][0])
    d1 += Math.abs(nums[i][1] - nums[i - 1][1])
  }
  return { order: d1 > d0 ? [1, 0, 2] : [0, 1, 2], guessed: true }
}

function toWallClock(date: string, time: string, ampm: string | undefined, order: [number, number, number]): number {
  const c = date.split(/[-/.]\s?/).map((x) => Number(x.trim()))
  const day = c[order[0]]
  const month = c[order[1]]
  let year = c[order[2]]
  if (year < 100) year += 2000
  const tp = time.split(/[.:]/).map(Number)
  let h = tp[0]
  if (ampm) {
    const pm = /p/i.test(ampm)
    if (h === 12) h = pm ? 12 : 0
    else if (pm) h += 12
  }
  return Date.UTC(year, month - 1, day, h, tp[1] ?? 0, tp[2] ?? 0)
}

export function parseWhatsAppText(text: string, source: string): ParsedChat {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/)
  const raw: RawLine[] = []
  let unparsed = 0
  for (const line of lines) {
    const m = HEADER.exec(line)
    if (m) {
      raw.push({ date: m[1], time: m[2], ampm: m[3], body: line.slice(m[0].length), index: raw.length })
    } else if (raw.length) {
      raw[raw.length - 1].body += '\n' + line
    } else if (line.trim()) {
      unparsed++
    }
  }

  const warnings: ImportWarning[] = []
  if (!raw.length) {
    warnings.push({ code: 'no-messages', message: 'No WhatsApp messages were found in this file.' })
  }
  const { order, guessed } = resolveDateOrder(raw.map((r) => r.date))
  if (guessed && raw.length > 1) {
    warnings.push({
      code: 'ambiguous-dates',
      message: 'We could not tell whether dates are day-first or month-first, so we guessed from the order of messages.',
    })
  }

  // First pass: split "Author: text" and count authors so we can reject
  // false authors produced by system lines that contain ": ".
  const split = raw.map((r) => {
    const i = r.body.indexOf(': ')
    if (i <= 0) return { r, author: null as string | null, text: r.body }
    return { r, author: stripInvisible(r.body.slice(0, i)).trim(), text: r.body.slice(i + 2) }
  })
  const authorCount = new Map<string, number>()
  for (const s of split) if (s.author) authorCount.set(s.author, (authorCount.get(s.author) ?? 0) + 1)
  const plausibleAuthor = (a: string) => (authorCount.get(a) ?? 0) >= 2 || (authorCount.size <= 2 && a.length <= 60) || raw.length < 20

  const messages: Message[] = []
  let selfKey: string | undefined
  for (const { r, author, text: body } of split) {
    const t = toWallClock(r.date, r.time, r.ampm, order)
    if (!Number.isFinite(t)) {
      unparsed++
      continue
    }
    const textRaw = stripInvisible(body)
    if (!author || !plausibleAuthor(author)) {
      messages.push({ t, sender: '', kind: 'system', text: '' })
      continue
    }
    if (SYSTEM_PATTERNS.some((p) => p.test(textRaw)) && textRaw.length < 200 && body.startsWith('‎')) {
      messages.push({ t, sender: '', kind: 'system', text: '' })
      continue
    }
    if (/end-to-end encrypted|cifrados de extremo|ende-zu-ende|chiffrés de bout/i.test(textRaw) && textRaw.length < 200) {
      messages.push({ t, sender: '', kind: 'system', text: '' })
      continue
    }
    const c = classify(textRaw)
    if (SELF_DELETED.includes(textRaw.trim().toLowerCase().replace(/\.$/, ''))) selfKey = author
    const msg: Message = { t, sender: author, kind: c.kind, text: c.text }
    if (c.edited) msg.edited = true
    messages.push(msg)
  }
  // Stable sort: lines are occasionally out of order in exports.
  messages.sort((a, b) => a.t - b.t)

  const participants: string[] = []
  for (const m of messages) if (m.sender && !participants.includes(m.sender)) participants.push(m.sender)

  const fileName = source.split('/').pop() ?? source
  const titleMatch = /(?:WhatsApp Chat (?:with|-)|Chat de WhatsApp con|WhatsApp Chat mit|Discussion WhatsApp avec|Conversa do WhatsApp com|Chat WhatsApp con)[\s_]+(.+?)(?:\.txt|\.zip)?$/i.exec(
    source.split('/').find((p) => /whatsapp/i.test(p)) ?? fileName,
  )
  const title = titleMatch?.[1]?.replace(/_/g, ' ').trim()
  if (!selfKey && title && participants.length === 2 && participants.includes(title)) {
    selfKey = participants.find((p) => p !== title)
  }

  if (unparsed > 0) {
    warnings.push({ code: 'unparsed-lines', message: `${unparsed} line(s) at the start of the file did not look like messages and were skipped.` })
  }
  if (participants.length > 2) {
    warnings.push({ code: 'group-chat', message: `This looks like a group chat with ${participants.length} people.` })
  }

  return {
    id: chatId('whatsapp'),
    platform: 'whatsapp',
    source,
    title,
    participants,
    messages,
    warnings,
    selfKey,
  }
}

export const whatsappParser: Parser = {
  platform: 'whatsapp',
  sniff(file: SourceFile, head: string) {
    if (!/\.txt$/i.test(file.name)) return 0
    const lines = head.split(/\r?\n/).slice(0, 12)
    const hits = lines.filter((l) => HEADER.test(l)).length
    if (!hits) return 0
    const nameHint = /whatsapp|_chat\.txt$/i.test(file.path) ? 0.1 : 0
    return Math.min(1, 0.6 + hits * 0.05 + nameHint)
  },
  async parse(file) {
    return [parseWhatsAppText(await file.text(), file.path)]
  },
}
