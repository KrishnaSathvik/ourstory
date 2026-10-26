/**
 * Core domain types.
 *
 * PRIVACY BOUNDARY: `Message` and `ParsedChat` contain raw conversation text.
 * They must only ever exist inside the analysis Web Worker. Anything that
 * crosses to the UI thread is a `ChatSummary` or a `Story` (see
 * analysis/story.ts), neither of which carries message text.
 */

export type Platform =
  | 'whatsapp'
  | 'telegram'
  | 'instagram'
  | 'messenger'
  | 'imessage'
  | 'discord'
  | 'sms'

export const PLATFORM_LABEL: Record<Platform, string> = {
  whatsapp: 'WhatsApp',
  telegram: 'Telegram',
  instagram: 'Instagram',
  messenger: 'Messenger',
  imessage: 'iMessage',
  discord: 'Discord',
  sms: 'SMS',
}

export type MessageKind =
  | 'text'
  | 'media' // photo / video / file, contents never read
  | 'voice'
  | 'sticker'
  | 'gif'
  | 'call'
  | 'deleted'
  | 'system' // "X changed the group name", encryption notices …
  | 'other'

export interface Message {
  /**
   * Wall-clock time encoded as a UTC epoch (ms). I.e. a message sent at
   * 23:15 local time has getUTCHours() === 23. All rhythm analysis relies on
   * this; see core/time.ts for how zoned sources are converted.
   */
  t: number
  /** Sender key exactly as it appears in the source (name, handle, id). */
  sender: string
  kind: MessageKind
  /** Message text; '' for non-text kinds. NEVER leaves the worker. */
  text: string
  edited?: boolean
  /** Emoji reactions others put on this message. */
  reactions?: { emoji: string; by: string }[]
  /** Call duration in seconds, when the source provides it. */
  callSeconds?: number
}

export interface ImportWarning {
  code:
    | 'unparsed-lines'
    | 'ambiguous-dates'
    | 'no-messages'
    | 'group-chat'
    | 'unknown-format'
    | 'mojibake-fixed'
    | 'truncated'
    | 'timezone-assumed'
    | 'encrypted'
  message: string
}

export interface ParsedChat {
  id: string
  platform: Platform
  /** File name (or zip entry) the chat came from. */
  source: string
  title?: string
  participants: string[]
  messages: Message[] // sorted ascending by t
  warnings: ImportWarning[]
  /** Sender key the source marks as the exporting user, if known. */
  selfKey?: string
  /**
   * Chats split across several files (Instagram's message_1.json,
   * message_2.json …) share a threadKey and are coalesced after parsing.
   */
  threadKey?: string
}

/** Text-free description of a parsed chat; safe to send to the UI. */
export interface ChatSummary {
  id: string
  platform: Platform
  source: string
  title?: string
  participants: { key: string; count: number }[]
  messageCount: number
  first: number | null
  last: number | null
  warnings: ImportWarning[]
  selfKey?: string
}

export type PersonId = 'a' | 'b'

export interface Person {
  id: PersonId
  name: string
}

/**
 * The user's answer to "who is who": maps each (chat, senderKey) to one of
 * the two people, or null to exclude that sender (e.g. a third person in a
 * group, or "Meta AI").
 */
export interface IdentityMap {
  people: [Person, Person]
  assign: Record<string /* chatId */, Record<string /* senderKey */, PersonId | null>>
}

export interface ImportOptions {
  /** IANA zone used to localise sources that store absolute (UTC) times. */
  timeZone: string
}
