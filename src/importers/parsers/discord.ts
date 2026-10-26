import { stripInvisible } from '../../core/text'
import { makeLocalizer } from '../../core/time'
import type { ImportWarning, Message, MessageKind, ParsedChat } from '../../core/types'
import { chatId, type Parser } from '../source'

/**
 * DiscordChatExporter (Tyrrrz) JSON: { guild, channel, dateRange, messages[] }.
 * Timestamps are ISO 8601 with an offset (absolute) and are localised to
 * `opts.timeZone`. Discord's own data package (only the user's messages) is
 * not supported.
 */

type Json = any

const NORMAL_TYPES = new Set(['Default', 'Reply', 'ChatInputCommand', 'ContextMenuCommand', 'ThreadStarterMessage', ''])
const GIF_LINK = /^<?https?:\/\/(?:www\.)?(?:tenor\.com|giphy\.com|media\d*\.giphy\.com|[^\s/]+\/\S+\.gif)\S*>?$/i
const AUDIO = /\.(?:ogg|oga|opus|mp3|m4a|wav|aac)$/i

const who = (a: Json): string | undefined => {
  if (!a || typeof a !== 'object') return undefined
  const n = typeof a.nickname === 'string' && a.nickname.trim() ? a.nickname : a.name
  return typeof n === 'string' && n.trim() ? stripInvisible(n).trim() : typeof a.id === 'string' ? a.id : undefined
}

export const discordParser: Parser = {
  platform: 'discord',
  sniff(_file, head) {
    if (!/^\s*\{/.test(head)) return 0
    const guild = /"guild"\s*:\s*\{/.test(head)
    const channel = /"channel"\s*:\s*\{/.test(head)
    if (guild && channel && /"(?:dateRange|messages|exportedAt)"\s*:/.test(head)) return 0.95
    if (guild && channel) return 0.7
    return 0
  },
  async parse(file, opts) {
    let root: Json
    try {
      root = JSON.parse(await file.text())
    } catch (err) {
      throw new Error(`${file.name}: not valid JSON (${(err as Error).message})`)
    }
    if (!root || !Array.isArray(root.messages)) {
      throw new Error(`${file.name}: not a DiscordChatExporter file (no "messages" array)`)
    }
    const loc = makeLocalizer(opts.timeZone)
    const messages: Message[] = []
    let bad = 0

    for (const m of root.messages as Json[]) {
      const utc = typeof m?.timestamp === 'string' ? Date.parse(m.timestamp) : NaN
      if (!Number.isFinite(utc)) {
        bad++
        continue
      }
      const sender = who(m.author) ?? 'Unknown'
      const type = String(m.type ?? '')
      const content = typeof m.content === 'string' ? m.content : ''
      const attachments: Json[] = Array.isArray(m.attachments) ? m.attachments : []
      const msg: Message = { t: loc(utc), sender, kind: 'text', text: '' }

      let kind: MessageKind
      if (type === 'Call') {
        kind = 'call'
        const end = typeof m.callEndedTimestamp === 'string' ? Date.parse(m.callEndedTimestamp) : NaN
        if (Number.isFinite(end) && end >= utc) msg.callSeconds = Math.round((end - utc) / 1000)
      } else if (!NORMAL_TYPES.has(type)) kind = 'system'
      else if (content.trim()) kind = GIF_LINK.test(content.trim()) ? 'gif' : 'text'
      else if (Array.isArray(m.stickers) && m.stickers.length) kind = 'sticker'
      else if (attachments.length) {
        const names = attachments.map((a) => String(a?.fileName ?? a?.url ?? ''))
        if (names.every((n) => /\.gif$/i.test(n))) kind = 'gif'
        else if (names.every((n) => AUDIO.test(n) || /voice-message/i.test(n))) kind = 'voice'
        else kind = 'media'
      } else if (Array.isArray(m.embeds) && m.embeds.length) kind = 'media'
      else kind = 'other'
      msg.kind = kind
      if (kind === 'text') msg.text = content
      if (m.timestampEdited) msg.edited = true

      if (Array.isArray(m.reactions)) {
        const reactions: { emoji: string; by: string }[] = []
        for (const r of m.reactions as Json[]) {
          const emoji = r?.emoji?.name
          if (typeof emoji !== 'string' || !emoji || !Array.isArray(r.users)) continue
          for (const u of r.users as Json[]) {
            const by = who(u)
            if (by) reactions.push({ emoji, by })
          }
        }
        if (reactions.length) msg.reactions = reactions
      }
      messages.push(msg)
    }

    messages.sort((a, b) => a.t - b.t)
    const participants: string[] = []
    const seen = new Set<string>()
    for (const m of messages) {
      if (!seen.has(m.sender)) {
        seen.add(m.sender)
        participants.push(m.sender)
      }
    }

    const warnings: ImportWarning[] = []
    if (bad) warnings.push({ code: 'unparsed-lines', message: `${bad} message(s) could not be read and were skipped.` })
    const channelType = String(root.channel?.type ?? '')
    if ((channelType && channelType !== 'DirectTextChat') || participants.length > 2) {
      warnings.push({ code: 'group-chat', message: 'This channel has more than two participants.' })
    }
    if (messages.length === 0) return []

    const guildName = typeof root.guild?.name === 'string' ? root.guild.name : ''
    const channelName = typeof root.channel?.name === 'string' ? root.channel.name : ''
    const title =
      !guildName || guildName === 'Direct Messages' ? channelName || undefined : `${guildName} / #${channelName}`

    const chat: ParsedChat = {
      id: chatId('discord'),
      platform: 'discord',
      source: file.path,
      title,
      participants,
      messages,
      warnings,
    }
    return [chat]
  },
}
