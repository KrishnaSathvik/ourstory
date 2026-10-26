import type { ChatSummary, IdentityMap, Message, ParsedChat, PersonId, Platform } from '../core/types'
import { hash32, normalizeEmoji } from '../core/text'
import { MINUTE } from '../core/time'

export interface MergedMessage extends Message {
  p: PersonId
  platform: Platform
  chat: number // index into the merged chat list
}

export interface MergeReport {
  total: number
  duplicatesRemoved: number
  excludedSenders: number
}

/** Normalise a display name for fuzzy comparison. */
export function normName(s: string): string {
  return s
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 0..1 similarity between two sender names / handles. */
export function nameSimilarity(a: string, b: string): number {
  const x = normName(a)
  const y = normName(b)
  if (!x || !y) return 0
  if (x === y) return 1
  const xs = x.split(' ')
  const ys = y.split(' ')
  if (xs[0] === ys[0] && xs[0].length >= 2) return 0.85
  const compactX = x.replace(/ /g, '')
  const compactY = y.replace(/ /g, '')
  if (compactX.length >= 3 && compactY.length >= 3 && (compactX.includes(compactY) || compactY.includes(compactX))) return 0.7
  if (xs.some((t) => t.length >= 3 && ys.includes(t))) return 0.6
  return 0
}

const SELF_ALIASES = new Set(['me', 'you', 'yo', 'moi', 'ich', 'eu'])

function displayName(key: string): string {
  const cleaned = key.replace(/^[@+]/, '').trim()
  if (/^\+?[\d\s()-]{6,}$/.test(key)) return key.trim()
  const first = cleaned.split(/[\s._]+/)[0] ?? cleaned
  return first ? first[0].toUpperCase() + first.slice(1) : cleaned
}

/**
 * Best-effort guess of who is who across chats. Person "a" is the exporting
 * user where that is detectable. The UI always lets the user correct this.
 */
export function suggestIdentity(chats: ChatSummary[]): IdentityMap {
  const assign: IdentityMap['assign'] = {}
  const known: Record<PersonId, string[]> = { a: [], b: [] }

  const score = (key: string, p: PersonId) => Math.max(0, ...known[p].map((k) => nameSimilarity(k, key)))

  // Process chats with a known self first, then the largest.
  const ordered = [...chats].sort((x, y) => Number(!!y.selfKey) - Number(!!x.selfKey) || y.messageCount - x.messageCount)
  for (const chat of ordered) {
    const map: Record<string, PersonId | null> = {}
    const keys = chat.participants.map((p) => p.key)
    const self = chat.selfKey ?? keys.find((k) => SELF_ALIASES.has(k.toLowerCase()))
    const candidates = keys.slice(0, 8)
    let aKey: string | undefined
    let bKey: string | undefined

    if (self && keys.includes(self)) {
      aKey = self
      bKey = candidates.filter((k) => k !== self).sort((x, y) => score(y, 'b') - score(x, 'b'))[0]
    } else if (known.a.length || known.b.length) {
      // Pick the pairing that best matches names we've already seen.
      let best = -1
      for (const x of candidates)
        for (const y of candidates) {
          if (x === y) continue
          const s = score(x, 'a') + score(y, 'b')
          if (s > best) {
            best = s
            aKey = x
            bKey = y
          }
        }
    } else {
      ;[aKey, bKey] = candidates
    }
    for (const k of keys) map[k] = k === aKey ? 'a' : k === bKey ? 'b' : null
    if (aKey) known.a.push(aKey)
    if (bKey) known.b.push(bKey)
    assign[chat.id] = map
  }

  const nameFor = (p: PersonId) => {
    const real = known[p].filter((k) => !SELF_ALIASES.has(k.toLowerCase()))
    return real.length ? displayName(real[0]) : p === 'a' ? 'You' : 'Them'
  }
  return { people: [{ id: 'a', name: nameFor('a') }, { id: 'b', name: nameFor('b') }], assign }
}

function dedupeKey(m: MergedMessage): string {
  const text = m.kind === 'text' ? m.text.trim().toLowerCase() : ''
  return `${m.p}|${m.platform}|${Math.floor(m.t / MINUTE)}|${m.kind}|${hash32(normalizeEmoji(text))}`
}

/**
 * Applies the identity map and merges all chats into one sorted stream.
 *
 * De-duplication: the same conversation is often exported twice (both
 * partners export, or an older and a newer export). Within one platform,
 * messages are keyed by (person, minute, kind, text hash) and each key is
 * kept max(count per chat) times — multiset semantics, so genuinely
 * repeated messages ("ok", "ok") inside one export are preserved.
 * Different platforms are never de-duplicated against each other.
 */
export function mergeChats(chats: ParsedChat[], identity: IdentityMap): { messages: MergedMessage[]; report: MergeReport } {
  let excluded = 0
  const perChat: MergedMessage[][] = chats.map((chat, ci) => {
    const map = identity.assign[chat.id] ?? {}
    const out: MergedMessage[] = []
    for (const m of chat.messages) {
      if (m.kind === 'system') continue
      const p = map[m.sender]
      if (!p) {
        excluded++
        continue
      }
      const reactions = m.reactions?.filter((r) => map[r.by]).map((r) => ({ emoji: r.emoji, by: map[r.by] as string }))
      out.push({ ...m, p, platform: chat.platform, chat: ci, reactions: reactions?.length ? reactions : undefined })
    }
    return out
  })

  // Duplicates are only possible when one platform has several exports.
  const perPlatform = new Map<Platform, number>()
  for (const c of chats) perPlatform.set(c.platform, (perPlatform.get(c.platform) ?? 0) + 1)
  if ([...perPlatform.values()].every((n) => n === 1)) {
    const messages = perChat.length === 1 ? perChat[0] : perChat.flat().sort((a, b) => a.t - b.t || a.chat - b.chat)
    return { messages, report: { total: messages.length, duplicatesRemoved: 0, excludedSenders: excluded } }
  }

  // Count occurrences per key per chat; allow max across chats.
  const allowed = new Map<string, number>()
  for (const list of perChat) {
    const local = new Map<string, number>()
    for (const m of list) {
      const k = dedupeKey(m)
      local.set(k, (local.get(k) ?? 0) + 1)
    }
    for (const [k, n] of local) allowed.set(k, Math.max(allowed.get(k) ?? 0, n))
  }

  const all = perChat.flat().sort((a, b) => a.t - b.t || a.chat - b.chat)
  const used = new Map<string, number>()
  const messages: MergedMessage[] = []
  for (const m of all) {
    const k = dedupeKey(m)
    const n = used.get(k) ?? 0
    if (n < (allowed.get(k) ?? 0)) {
      used.set(k, n + 1)
      messages.push(m)
    }
  }
  return { messages, report: { total: messages.length, duplicatesRemoved: all.length - messages.length, excludedSenders: excluded } }
}
