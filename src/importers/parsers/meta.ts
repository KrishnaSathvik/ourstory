import { fixMojibake, stripInvisible } from '../../core/text'
import { makeLocalizer } from '../../core/time'
import type { ImportOptions, ImportWarning, Message, MessageKind, ParsedChat, Platform } from '../../core/types'
import { chatId, type Parser, type SourceFile } from '../source'

/**
 * Meta "Download your information" JSON (Instagram + Facebook Messenger),
 * `messages/inbox/<thread>/message_N.json`, plus best-effort support for the
 * separately exported E2EE Messenger JSON (camelCase keys).
 *
 * Meta writes UTF-8 bytes as \u00XX escapes; every string is repaired with
 * fixMojibake via a JSON reviver. Timestamps are absolute (epoch ms) and
 * localised to `opts.timeZone`. Threads split across message_1.json,
 * message_2.json … share a `threadKey` so the caller can coalesce them.
 */

type Json = any
type MetaPlatform = Extract<Platform, 'instagram' | 'messenger'>

const IG_PATH = /(?:^|[/\\_])(?:your_instagram_activity|instagram)(?:[/\\._-]|$)/i
const FB_PATH = /(?:^|[/\\_])(?:your_facebook_activity|facebook|messenger)(?:[/\\._-]|$)/i

function legacySignals(head: string): boolean {
  return /"participants"\s*:/.test(head) && /"(?:sender_name|timestamp_ms|thread_path|magic_words)"\s*:/.test(head)
}

function e2eeSignals(head: string): boolean {
  return /"participants"\s*:/.test(head) && /"(?:senderName|threadName|isUnsent)"\s*:/.test(head)
}

/** Which Meta platform a file belongs to, or null when nothing hints either way. */
function detectPlatform(path: string, head: string): MetaPlatform | null {
  const ig = IG_PATH.test(path)
  const fb = FB_PATH.test(path)
  if (ig && !fb) return 'instagram'
  if (fb && !ig) return 'messenger'
  if (e2eeSignals(head)) return 'messenger' // E2EE storage export is Messenger-only
  // Facebook-only fields.
  if (/"type"\s*:\s*"(?:Generic|Share|Call|Subscribe|Unsubscribe)"/.test(head)) return 'messenger'
  if (/"(?:thread_type|joinable_mode)"\s*:/.test(head)) return 'messenger'
  if (/"uri"\s*:\s*"[^"]*instagram/i.test(head) || /instagram\.com/i.test(head)) return 'instagram'
  if (/"uri"\s*:\s*"[^"]*facebook/i.test(head)) return 'messenger'
  return null
}

function sniffFor(platform: MetaPlatform) {
  return (file: SourceFile, head: string): number => {
    if (!/^\s*\{/.test(head)) return 0
    const legacy = legacySignals(head)
    const e2ee = e2eeSignals(head)
    if (!legacy && !e2ee) return 0
    const named = /^message_\d+\.json$/i.test(file.name)
    const detected = detectPlatform(file.path, head)
    let score = legacy ? (named ? 0.95 : 0.85) : 0.75
    if (detected === null) {
      // Ambiguous: default to Instagram.
      if (platform === 'messenger') score -= 0.3
    } else if (detected !== platform) {
      score -= 0.5
    }
    return Math.max(0.05, score)
  }
}

const clean = (s: unknown): string | undefined =>
  typeof s === 'string' && s.trim() ? stripInvisible(s).trim() : undefined

// Auto-generated content strings (English; other locales fall through as text).
const RE_REACTION_NOTICE = /^(?:liked a message|(?:.+\s)?reacted\s.{1,16}\sto (?:your|a) message\.?)$/i
const RE_ATTACHMENT = /(?:^|\s)sent an attachment\.?$/i
const RE_VOICE = /(?:^|\s)sent a voice message\.?$/i
const RE_CALL =
  /^(?:you missed an? (?:audio |video )?call(?: from .+)?|.*\bmissed your (?:audio |video )?call|.*\bstarted (?:an? )?(?:audio |video )?call|.*\b(?:audio |video )?call ended|.*\bjoined the (?:audio |video )?call)\.?$/i
const RE_SYSTEM =
  /^(?:.+\s)?(?:named the group|changed the group (?:photo|name)|set (?:the|his|her|their|your) nickname|set the (?:quick reaction|emoji)|changed the (?:chat )?theme|added .+ to the group|left the group|removed .+ from the group|created the group|you are now connected on messenger|changed the chat colou?r)\b.*$/i

function contentKind(content: string): MessageKind | null {
  const c = content.trim()
  if (!c) return null
  if (RE_REACTION_NOTICE.test(c)) return 'system'
  if (/^(?:.+\s)?unsent a message\.?$/i.test(c)) return 'deleted'
  if (RE_ATTACHMENT.test(c)) return 'media'
  if (RE_VOICE.test(c)) return 'voice'
  if (RE_CALL.test(c) && c.length < 100) return 'call'
  if (RE_SYSTEM.test(c) && c.length < 160) return 'system'
  return null
}

const nonEmpty = (v: unknown) => Array.isArray(v) && v.length > 0

function legacyMessage(m: Json, loc: (ms: number) => number): Message | null {
  const ts = Number(m.timestamp_ms)
  if (!Number.isFinite(ts)) return null
  const t = loc(ts)
  const sender = clean(m.sender_name) ?? 'Unknown'
  const content = typeof m.content === 'string' ? m.content : ''
  const msg: Message = { t, sender, kind: 'text', text: '' }

  if (m.is_unsent) msg.kind = 'deleted'
  else if (m.call_duration !== undefined || m.type === 'Call') {
    msg.kind = 'call'
    const d = Number(m.call_duration)
    if (m.call_duration !== undefined && Number.isFinite(d)) msg.callSeconds = d
  } else if (m.type === 'Subscribe' || m.type === 'Unsubscribe') msg.kind = 'system'
  else if (nonEmpty(m.audio_files)) msg.kind = 'voice'
  else if (nonEmpty(m.gifs)) msg.kind = 'gif'
  else if (m.sticker) msg.kind = 'sticker'
  else if (nonEmpty(m.photos) || nonEmpty(m.videos) || nonEmpty(m.files)) msg.kind = 'media'
  else {
    const auto = contentKind(content)
    if (auto) msg.kind = auto
    else if (content.trim()) {
      msg.kind = 'text'
      msg.text = content
    } else if (m.share) msg.kind = 'media'
    else msg.kind = 'other'
  }

  if (Array.isArray(m.reactions)) {
    const reactions = (m.reactions as Json[])
      .filter((r) => r && typeof r.reaction === 'string')
      .map((r) => ({ emoji: r.reaction as string, by: clean(r.actor) ?? 'Unknown' }))
    if (reactions.length) msg.reactions = reactions
  }
  return msg
}

const AUDIO_EXT = /\.(?:m4a|aac|opus|ogg|oga|mp3|wav|amr|caf)$/i
const GIF_EXT = /\.gif$/i

function e2eeMessage(m: Json, loc: (ms: number) => number): Message | null {
  let ts = Number(m.timestamp ?? m.timestampMs ?? m.timestamp_ms)
  if (!Number.isFinite(ts)) return null
  if (ts < 1e12) ts *= 1000
  const sender = clean(m.senderName ?? m.sender_name) ?? 'Unknown'
  const text = typeof m.text === 'string' ? m.text : typeof m.content === 'string' ? m.content : ''
  const type = String(m.type ?? '')
  const msg: Message = { t: loc(ts), sender, kind: 'text', text: '' }
  const media: Json[] = Array.isArray(m.media) ? m.media : []
  if (m.isUnsent || m.is_unsent) msg.kind = 'deleted'
  else if (/call/i.test(type)) msg.kind = 'call'
  else if (media.length) {
    const uri = String(media[0]?.uri ?? '')
    msg.kind = AUDIO_EXT.test(uri) ? 'voice' : GIF_EXT.test(uri) ? 'gif' : 'media'
  } else if (/sticker/i.test(type)) msg.kind = 'sticker'
  else if (text.trim()) {
    const auto = contentKind(text)
    if (auto) msg.kind = auto
    else msg.text = text
  } else msg.kind = 'other'
  if (Array.isArray(m.reactions)) {
    const reactions = (m.reactions as Json[])
      .filter((r) => r && typeof r.reaction === 'string')
      .map((r) => ({ emoji: r.reaction as string, by: clean(r.actor) ?? 'Unknown' }))
    if (reactions.length) msg.reactions = reactions
  }
  return msg
}

async function parseMeta(file: SourceFile, opts: ImportOptions, platform: MetaPlatform): Promise<ParsedChat[]> {
  const text = await file.text()
  const isE2ee = !/"(?:sender_name|timestamp_ms)"\s*:/.test(text.slice(0, 65536)) && e2eeSignals(text.slice(0, 65536))

  let fixed = 0
  let root: Json
  try {
    root = isE2ee
      ? JSON.parse(text)
      : JSON.parse(text, (_k, v) => {
          if (typeof v !== 'string') return v
          const f = fixMojibake(v)
          if (f !== v) fixed++
          return f
        })
  } catch (err) {
    throw new Error(`${file.name}: not valid JSON (${(err as Error).message})`)
  }
  if (!root || typeof root !== 'object' || !Array.isArray(root.messages)) {
    throw new Error(`${file.name}: not a Meta messages file (no "messages" array)`)
  }

  const loc = makeLocalizer(opts.timeZone)
  const raw: Json[] = root.messages
  const messages: Message[] = []
  let bad = 0
  // Meta lists newest first; walk backwards so the stable sort keeps
  // same-millisecond messages in their original order.
  for (let i = raw.length - 1; i >= 0; i--) {
    const m = raw[i]
    const msg = m && typeof m === 'object' ? (isE2ee ? e2eeMessage(m, loc) : legacyMessage(m, loc)) : null
    if (msg) messages.push(msg)
    else bad++
  }
  messages.sort((a, b) => a.t - b.t)

  const listed: string[] = Array.isArray(root.participants)
    ? (root.participants as Json[]).map((p) => clean(typeof p === 'string' ? p : p?.name)).filter((p): p is string => !!p)
    : []

  const participants: string[] = []
  const seen = new Set<string>()
  for (const m of messages) {
    if (!seen.has(m.sender)) {
      seen.add(m.sender)
      participants.push(m.sender)
    }
  }
  for (const p of listed) {
    if (!seen.has(p)) {
      seen.add(p)
      participants.push(p)
    }
  }

  const warnings: ImportWarning[] = []
  if (fixed) {
    warnings.push({ code: 'mojibake-fixed', message: `Repaired garbled characters in ${fixed} text field(s).` })
  }
  if (bad) warnings.push({ code: 'unparsed-lines', message: `${bad} message(s) could not be read and were skipped.` })
  if (messages.length === 0) warnings.push({ code: 'no-messages', message: 'This thread contains no messages.' })
  if (participants.length > 2 || listed.length > 2 || /group/i.test(String(root.thread_type ?? ''))) {
    warnings.push({ code: 'group-chat', message: 'This chat has more than two participants.' })
  }

  const title = clean(root.title ?? root.threadName) ?? (listed.length ? listed.join(', ') : undefined)
  const threadPath = clean(root.thread_path)
  const threadKey = threadPath
    ? `${platform}:${threadPath}`
    : `${platform}:${isE2ee ? 'e2ee:' : ''}${title ?? ''}|${[...listed].sort().join('|')}`

  return [
    {
      id: chatId(platform),
      platform,
      source: file.path,
      title,
      participants,
      messages,
      warnings,
      threadKey,
    },
  ]
}

export const instagramParser: Parser = {
  platform: 'instagram',
  sniff: sniffFor('instagram'),
  parse: (file, opts) => parseMeta(file, opts, 'instagram'),
}

export const messengerParser: Parser = {
  platform: 'messenger',
  sniff: sniffFor('messenger'),
  parse: (file, opts) => parseMeta(file, opts, 'messenger'),
}
