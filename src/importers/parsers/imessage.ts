import { stripInvisible } from '../../core/text'
import type { ImportWarning, Message, MessageKind } from '../../core/types'
import { chatId, type Parser } from '../source'

/**
 * iMessage via ReagentX/imessage-exporter `-f txt` (one .txt per chat):
 *
 *   Mar 12, 2024  9:04:15 PM (Read by them after 1 minute)
 *   Me
 *   Are we still on for Saturday?
 *   Tapbacks:
 *       Loved by +15555550100
 *
 *   Mar 12, 2024  9:05:02 PM
 *   +15555550100
 *   Yes!
 *
 * Timestamps are written in the exporting Mac's local time with no zone, so
 * they are already wall-clock and are not shifted. Announcements ("Me named
 * the conversation …") are a single timestamped line and become 'system'.
 *
 * chat.db (SQLite) is intentionally NOT handled here: reading it in the
 * browser needs sql.js (~1 MB WASM), typedstream decoding of attributedBody,
 * and care with multi-GB databases holding every conversation. See
 * docs/research/export-formats.md §4; to be considered later.
 */

const MONTHS: Record<string, number> = {
  jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
}

// "Mar 12, 2024  9:04:15 PM" optionally followed by " (Read …)" or an announcement.
const HEADER_RE =
  /^\s*(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.? +(\d{1,2}), +(\d{4})[ ,]+(\d{1,2}):(\d{2})(?::(\d{2}))?[\s ]*([AaPp]\.?[Mm]\.?)?(?:\s+(.*))?$/

const ATTACH_EXT =
  /\.(?:heic|heif|jpe?g|png|gif|webp|tiff?|bmp|mov|mp4|m4v|3gp|avi|caf|m4a|amr|aac|mp3|wav|opus|ogg|pdf|vcf|pkpass|zip|docx?|xlsx?|pptx?|key|pages|numbers|txt|usdz|pluginpayloadattachment)$/i
const AUDIO_EXT = /\.(?:caf|amr|m4a|aac|opus|ogg|wav|mp3)$/i

const TAPBACK_RE =
  /^\s*(Loved|Liked|Disliked|Laughed(?: at)?|Emphasized|Questioned|Reacted\s+(.+?))\s+by\s+(.+?)\s*$/
const TAPBACK_EMOJI: Record<string, string> = {
  Loved: '❤️',
  Liked: '👍',
  Disliked: '👎',
  Laughed: '😂',
  'Laughed at': '😂',
  Emphasized: '‼️',
  Questioned: '❓',
}

function parseHeader(line: string): { t: number; rest: string } | null {
  const m = HEADER_RE.exec(line)
  if (!m) return null
  const month = MONTHS[m[1].toLowerCase()]
  const day = Number(m[2])
  const year = Number(m[3])
  let hour = Number(m[4])
  const minute = Number(m[5])
  const second = m[6] ? Number(m[6]) : 0
  const ampm = m[7]?.replace(/\./g, '').toLowerCase()
  if (ampm) {
    if (hour < 1 || hour > 12) return null
    if (ampm === 'am') hour = hour === 12 ? 0 : hour
    else hour = hour === 12 ? 12 : hour + 12
  }
  if (day < 1 || day > 31 || hour > 23 || minute > 59 || second > 60) return null
  return { t: Date.UTC(year, month, day, hour, minute, second), rest: (m[8] ?? '').trim() }
}

const isAttachmentLine = (l: string) => {
  const s = l.trim()
  if (/^(?:Attachment (?:missing|does not exist)!?|Attachment: .*|\[Attachment.*\])$/i.test(s)) return true
  return ATTACH_EXT.test(s) && !/\s{2,}/.test(s) && (/[\\/]/.test(s) || !/\s/.test(s))
}

interface Draft {
  t: number
  sender: string
  lines: string[]
  announcement?: string
}

function finish(d: Draft): Message {
  if (d.announcement !== undefined) return { t: d.t, sender: '', kind: 'system', text: '' }
  const textLines: string[] = []
  const reactions: { emoji: string; by: string }[] = []
  let attachments = 0
  let audio = 0
  let gif = 0
  let sticker = false
  let edited = false
  let deleted = false
  let inTapbacks = false

  for (const raw of d.lines) {
    let line = raw
    const tbIdx = line.indexOf('Tapbacks:')
    if (tbIdx >= 0) {
      const before = line.slice(0, tbIdx).trim()
      if (before) textLines.push(before)
      inTapbacks = true
      line = line.slice(tbIdx + 'Tapbacks:'.length)
      if (!line.trim()) continue
    }
    if (inTapbacks) {
      const tb = TAPBACK_RE.exec(line)
      if (tb) {
        const kind = tb[2] ? 'Reacted' : tb[1]
        const emoji = tb[2] ? tb[2].trim() : TAPBACK_EMOJI[kind]
        if (emoji) reactions.push({ emoji, by: tb[3] })
        continue
      }
      if (/^\s*Sticker from /i.test(line) || !line.trim()) continue
      inTapbacks = false
    }
    const s = line.trim()
    if (/^(?:This message was (?:deleted|unsent)|.+ unsent this message(?: part)?\b)/i.test(s)) {
      deleted = true
      continue
    }
    const ed = /^Edited(?:\s+[^:]{0,60}\b(?:later|after|ago|sending)\b[^:]*)?:?\s*(.*)$/i.exec(s)
    if (ed && (s === 'Edited' || /:/.test(s) || /\b(?:later|after|ago|sending)\b/i.test(s))) {
      edited = true
      if (ed[1]) textLines.push(ed[1])
      continue
    }
    if (/^Sticker(?: from .+)?:?/i.test(s) && s.length < 80) {
      sticker = true
      continue
    }
    if (isAttachmentLine(s)) {
      attachments++
      if (AUDIO_EXT.test(s)) audio++
      if (/\.gif$/i.test(s)) gif++
      continue
    }
    textLines.push(line)
  }
  const text = textLines.join('\n').trim()
  let kind: MessageKind
  if (deleted && !text) kind = 'deleted'
  else if (text) kind = 'text'
  else if (sticker) kind = 'sticker'
  else if (attachments && audio === attachments) kind = 'voice'
  else if (attachments && gif === attachments) kind = 'gif'
  else if (attachments) kind = 'media'
  else kind = 'other'
  const msg: Message = { t: d.t, sender: d.sender, kind, text: kind === 'text' ? text : '' }
  if (edited) msg.edited = true
  if (reactions.length) msg.reactions = reactions
  return msg
}

export const imessageParser: Parser = {
  platform: 'imessage',
  sniff(file, head) {
    if (!/\.txt$/i.test(file.name)) return 0
    const lines = head.replace(/^﻿/, '').split(/\r?\n/)
    let i = 0
    while (i < lines.length && !lines[i].trim()) i++
    const h = parseHeader(lines[i] ?? '')
    if (!h) return 0
    // Regular message: header with no trailing text (or a read receipt), then a sender line.
    if ((!h.rest || h.rest.startsWith('(')) && lines[i + 1]?.trim()) return 0.85
    return 0.5
  },
  async parse(file) {
    const lines = stripInvisible((await file.text()).replace(/^﻿/, '')).split(/\r?\n/)
    const drafts: Draft[] = []
    let cur: Draft | null = null
    let expectSender = false
    let prevBlank = true
    let unparsed = 0

    for (const line of lines) {
      const blank = !line.trim()
      const h = prevBlank && !blank ? parseHeader(line) : null
      if (h) {
        if (cur) drafts.push(cur)
        if (h.rest && !h.rest.startsWith('(')) {
          cur = { t: h.t, sender: '', lines: [], announcement: h.rest }
          expectSender = false
        } else {
          cur = { t: h.t, sender: '', lines: [] }
          expectSender = true
        }
      } else if (cur && expectSender) {
        if (!blank) {
          cur.sender = line.trim()
          expectSender = false
        }
      } else if (cur && cur.announcement === undefined) {
        cur.lines.push(line)
      } else if (!blank) {
        unparsed++
      }
      prevBlank = blank
    }
    if (cur) drafts.push(cur)

    const messages = drafts.filter((d) => d.announcement !== undefined || d.sender).map(finish)

    // Attribute announcements to a known sender where the text starts with one.
    const known = [...new Set(messages.filter((m) => m.sender).map((m) => m.sender))].sort((a, b) => b.length - a.length)
    drafts
      .filter((d) => d.announcement !== undefined || d.sender)
      .forEach((d, idx) => {
        if (d.announcement === undefined) return
        const who = known.find((k) => d.announcement!.startsWith(k + ' '))
        if (who) messages[idx].sender = who
        else if (d.announcement.startsWith('Me ')) messages[idx].sender = 'Me'
      })

    messages.sort((a, b) => a.t - b.t)
    const participants: string[] = []
    const seen = new Set<string>()
    for (const m of messages) {
      if (m.sender && !seen.has(m.sender)) {
        seen.add(m.sender)
        participants.push(m.sender)
      }
    }

    const warnings: ImportWarning[] = [
      {
        code: 'timezone-assumed',
        message: "Times are as written by imessage-exporter (the exporting Mac's local time).",
      },
    ]
    if (unparsed) warnings.push({ code: 'unparsed-lines', message: `${unparsed} line(s) could not be read.` })
    if (participants.length > 2) warnings.push({ code: 'group-chat', message: 'This chat has more than two participants.' })
    if (messages.length === 0) return []

    return [
      {
        id: chatId('imessage'),
        platform: 'imessage',
        source: file.path,
        title: file.name.replace(/\.txt$/i, ''),
        participants,
        messages,
        warnings,
        selfKey: 'Me',
      },
    ]
  },
}
