import { stripInvisible } from '../../core/text'
import { makeLocalizer } from '../../core/time'
import type { ImportWarning, Message, MessageKind, ParsedChat } from '../../core/types'
import { chatId, type Parser } from '../source'

/**
 * Telegram Desktop "Machine-readable JSON" export (result.json).
 *
 * Handles both a single-chat export (root is the chat) and a full account
 * export (`chats.list[]` + `left_chats.list[]`). Times come from
 * `date_unixtime` (absolute) and are localised to `opts.timeZone`; when
 * absent, the zoneless `date` string is taken as wall-clock time.
 */

type Json = any

const GROUP_TYPES = new Set(['private_group', 'private_supergroup', 'public_supergroup'])
const CHANNEL_TYPES = new Set(['private_channel', 'public_channel'])

function flattenText(m: Json): string {
  const ents = m.text_entities
  if (Array.isArray(ents)) return ents.map((e: Json) => (typeof e === 'string' ? e : (e?.text ?? ''))).join('')
  const t = m.text
  if (typeof t === 'string') return t
  if (Array.isArray(t)) return t.map((p: Json) => (typeof p === 'string' ? p : (p?.text ?? ''))).join('')
  return ''
}

function mediaKind(m: Json): MessageKind | null {
  switch (m.media_type) {
    case 'voice_message':
      return 'voice'
    case 'sticker':
      return 'sticker'
    case 'animation':
      return 'gif'
    case 'video_message':
    case 'video_file':
    case 'audio_file':
      return 'media'
  }
  if (m.photo !== undefined || m.file !== undefined) return 'media'
  if (m.poll || m.location_information || m.contact_information || m.place_name) return 'other'
  return null
}

const name = (s: unknown): string | undefined =>
  typeof s === 'string' && s.trim() ? stripInvisible(s).trim() : undefined

function parseChat(chat: Json, source: string, timeZone: string, self?: { name?: string; fromId?: string }): ParsedChat | null {
  if (!chat || !Array.isArray(chat.messages)) return null
  const loc = makeLocalizer(timeZone)
  const messages: Message[] = []
  const fromIdToName = new Map<string, string>()
  let bad = 0
  let wallClockFallback = 0

  for (const m of chat.messages as Json[]) {
    if (!m || typeof m !== 'object') {
      bad++
      continue
    }
    let t: number
    const unix = Number(m.date_unixtime)
    if (m.date_unixtime !== undefined && Number.isFinite(unix)) {
      t = loc(unix * 1000)
    } else if (typeof m.date === 'string' && !Number.isNaN(Date.parse(m.date.replace(/Z$/, '') + 'Z'))) {
      t = Date.parse(m.date.replace(/Z$/, '') + 'Z')
      wallClockFallback++
    } else {
      bad++
      continue
    }

    if (m.type === 'service') {
      const sender = name(m.actor) ?? name(m.actor_id) ?? ''
      if (m.action === 'phone_call' || m.action === 'group_call') {
        const msg: Message = { t, sender, kind: 'call', text: '' }
        const d = Number(m.duration_seconds)
        if (m.duration_seconds !== undefined && Number.isFinite(d)) msg.callSeconds = d
        messages.push(msg)
      } else {
        messages.push({ t, sender, kind: 'system', text: '' })
      }
      continue
    }

    const sender = name(m.from) ?? name(m.from_id) ?? 'Unknown'
    if (typeof m.from_id === 'string' && name(m.from)) fromIdToName.set(m.from_id, sender)
    const kind = mediaKind(m) ?? 'text'
    const text = flattenText(m)
    const msg: Message = { t, sender, kind, text: kind === 'text' ? text : '' }
    if (kind === 'text' && !text.trim()) msg.kind = 'other'
    if (m.edited || m.edited_unixtime) msg.edited = true

    if (Array.isArray(m.reactions)) {
      const reactions: { emoji: string; by: string }[] = []
      for (const r of m.reactions as Json[]) {
        if (!r || typeof r.emoji !== 'string' || !Array.isArray(r.recent)) continue
        for (const who of r.recent as Json[]) {
          const by = name(who?.from) ?? name(who?.from_id)
          if (by) reactions.push({ emoji: r.emoji, by })
        }
      }
      if (reactions.length) msg.reactions = reactions
    }
    messages.push(msg)
  }

  if (messages.length === 0) return null
  messages.sort((a, b) => a.t - b.t)

  // Resolve system-message actors that appear only as ids.
  for (const m of messages) {
    const resolved = fromIdToName.get(m.sender)
    if (resolved) m.sender = resolved
  }

  const participants: string[] = []
  const seen = new Set<string>()
  for (const m of messages) {
    if (m.sender && !seen.has(m.sender)) {
      seen.add(m.sender)
      participants.push(m.sender)
    }
  }

  const warnings: ImportWarning[] = []
  if (bad) warnings.push({ code: 'unparsed-lines', message: `${bad} message(s) could not be read and were skipped.` })
  if (wallClockFallback) {
    warnings.push({
      code: 'timezone-assumed',
      message: `${wallClockFallback} message(s) had no unix timestamp; the exporting computer's local time was used.`,
    })
  }
  const type = String(chat.type ?? '')
  if (GROUP_TYPES.has(type) || CHANNEL_TYPES.has(type) || participants.length > 2) {
    warnings.push({ code: 'group-chat', message: 'This chat has more than two participants.' })
  }

  let selfKey: string | undefined
  if (self?.name && seen.has(self.name)) selfKey = self.name
  else if (self?.fromId && fromIdToName.has(self.fromId)) selfKey = fromIdToName.get(self.fromId)
  else if (type === 'personal_chat' && participants.length === 2) {
    const other = name(chat.name)
    if (other && seen.has(other)) selfKey = participants.find((p) => p !== other)
  } else if (type === 'saved_messages' && participants.length === 1) selfKey = participants[0]

  return {
    id: chatId('telegram'),
    platform: 'telegram',
    source,
    title: name(chat.name) ?? (type === 'saved_messages' ? 'Saved Messages' : undefined),
    participants,
    messages,
    warnings,
    selfKey,
  }
}

export const telegramParser: Parser = {
  platform: 'telegram',
  sniff(file, head) {
    if (!/^\s*\{/.test(head)) return 0
    const isResult = /^result\.json$/i.test(file.name)
    if (/"about"\s*:\s*"[^"]*Telegram/.test(head)) return 0.98
    if (/"personal_information"\s*:/.test(head) && /"(?:chats|contacts)"\s*:/.test(head)) return 0.95
    const chatType = /"type"\s*:\s*"(?:personal_chat|bot_chat|private_group|private_supergroup|public_supergroup|private_channel|public_channel|saved_messages|replies)"/.test(head)
    if (chatType && /"messages"\s*:\s*\[/.test(head)) return 0.95
    if (/"date_unixtime"\s*:/.test(head) && /"from_id"\s*:\s*"(?:user|channel|chat)\d/.test(head)) return 0.9
    if (isResult && /"messages"\s*:/.test(head)) return 0.5
    return 0
  },
  async parse(file, opts) {
    let root: Json
    try {
      root = JSON.parse(await file.text())
    } catch (err) {
      throw new Error(`${file.name}: not valid JSON (${(err as Error).message})`)
    }
    if (!root || typeof root !== 'object') throw new Error(`${file.name}: not a Telegram export`)

    const chats: Json[] = []
    const isFull = Array.isArray(root.chats?.list) || Array.isArray(root.left_chats?.list)
    if (isFull) {
      if (Array.isArray(root.chats?.list)) chats.push(...root.chats.list)
      if (Array.isArray(root.left_chats?.list)) chats.push(...root.left_chats.list)
    } else if (Array.isArray(root.messages)) {
      chats.push(root)
    } else {
      throw new Error(`${file.name}: no Telegram chats found (expected "messages" or "chats.list")`)
    }

    let self: { name?: string; fromId?: string } | undefined
    const pi = root.personal_information
    if (pi && typeof pi === 'object') {
      const full = [pi.first_name, pi.last_name].filter((s) => typeof s === 'string' && s.trim()).join(' ')
      self = { name: name(full), fromId: pi.user_id !== undefined ? `user${pi.user_id}` : undefined }
    }

    const out: ParsedChat[] = []
    for (const c of chats) {
      const parsed = parseChat(c, file.path, opts.timeZone, self)
      if (parsed) out.push(parsed)
    }
    return out
  },
}
