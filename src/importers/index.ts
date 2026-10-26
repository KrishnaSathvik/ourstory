import type { ChatSummary, ImportOptions, ParsedChat } from '../core/types'
import { fromBlob, type Parser, type SourceFile } from './source'
import { openZip } from './zip'
import { whatsappParser } from './parsers/whatsapp'
import { telegramParser } from './parsers/telegram'
import { instagramParser, messengerParser } from './parsers/meta'
import { imessageParser } from './parsers/imessage'
import { discordParser } from './parsers/discord'
import { smsParser } from './parsers/sms'

export const PARSERS: Parser[] = [whatsappParser, telegramParser, instagramParser, messengerParser, imessageParser, discordParser, smsParser]

export interface InputFile {
  blob: Blob
  path: string
}

export interface ImportProgress {
  phase: 'scanning' | 'parsing'
  done: number
  total: number
  /** File currently being processed (file name only). */
  current?: string
}

export interface ImportResult {
  chats: ParsedChat[]
  skipped: { path: string; reason: string }[]
}

const MAX_TEXT_BYTES = 1.5 * 1024 ** 3 // refuse single text files above 1.5 GB

/** Paths inside archives that could contain chats; everything else (media!) is never read. */
export function isCandidatePath(path: string): boolean {
  const p = path.toLowerCase()
  if (/(^|\/)(__macosx|\.)/.test(p)) return false
  if (p.endsWith('.txt')) return true
  if (p.endsWith('.xml')) return true
  if (p.endsWith('.json')) {
    if (/(^|\/)result\.json$/.test(p)) return true
    if (/\/messages\/.*message_\d+\.json$/.test(p)) return true
    if (/(^|\/)message_\d+\.json$/.test(p)) return true
    // Discord exports and other loose JSON files at shallow depth.
    return p.split('/').length <= 3
  }
  return false
}

function memo(file: SourceFile): SourceFile {
  let bytes: Promise<Uint8Array> | null = null
  let text: Promise<string> | null = null
  return {
    ...file,
    bytes: () => (bytes ??= file.bytes()),
    text: () => (text ??= (async () => new TextDecoder().decode(await (bytes ??= file.bytes())))()),
  }
}

async function expand(inputs: InputFile[], skipped: ImportResult['skipped']): Promise<SourceFile[]> {
  const out: SourceFile[] = []
  for (const input of inputs) {
    const isZip = /\.zip$/i.test(input.path) || (await isZipMagic(input.blob))
    if (isZip) {
      try {
        const entries = await openZip(input.blob, input.path)
        for (const e of entries) if (isCandidatePath(e.path)) out.push(memo(e))
      } catch (err) {
        skipped.push({ path: input.path, reason: err instanceof Error ? err.message : 'Could not open archive' })
      }
    } else if (isCandidatePath(input.path)) {
      out.push(memo(fromBlob(input.blob, input.path)))
    } else {
      skipped.push({ path: input.path, reason: 'Not a chat export file (media and other files are ignored).' })
    }
  }
  return out
}

async function isZipMagic(blob: Blob): Promise<boolean> {
  if (blob.size < 4) return false
  const b = new Uint8Array(await blob.slice(0, 4).arrayBuffer())
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04
}

async function headOf(file: SourceFile): Promise<string> {
  // Zip entries must be inflated anyway; plain files are sliced cheaply.
  const bytes = await file.bytes()
  return new TextDecoder().decode(bytes.subarray(0, 4096))
}

export async function importFiles(inputs: InputFile[], opts: ImportOptions, onProgress?: (p: ImportProgress) => void): Promise<ImportResult> {
  const skipped: ImportResult['skipped'] = []
  onProgress?.({ phase: 'scanning', done: 0, total: inputs.length })
  const files = await expand(inputs, skipped)
  const chats: ParsedChat[] = []

  for (let i = 0; i < files.length; i++) {
    const file = files[i]
    onProgress?.({ phase: 'parsing', done: i, total: files.length, current: file.name })
    if (file.size > MAX_TEXT_BYTES) {
      skipped.push({ path: file.path, reason: 'File is too large to process in the browser.' })
      continue
    }
    try {
      const head = await headOf(file)
      let best: Parser | null = null
      let bestScore = 0
      for (const p of PARSERS) {
        const s = p.sniff(file, head)
        if (s > bestScore) {
          bestScore = s
          best = p
        }
      }
      if (!best || bestScore < 0.3) {
        skipped.push({ path: file.path, reason: 'Format not recognised.' })
        continue
      }
      const parsed = await best.parse(file, opts)
      const nonEmpty = parsed.filter((c) => c.messages.some((m) => m.kind !== 'system'))
      if (!nonEmpty.length) skipped.push({ path: file.path, reason: 'No messages found.' })
      chats.push(...nonEmpty)
    } catch (err) {
      skipped.push({ path: file.path, reason: err instanceof Error ? err.message : 'Could not read file' })
    }
  }
  onProgress?.({ phase: 'parsing', done: files.length, total: files.length })
  return { chats: coalesce(chats), skipped }
}

/** Joins chats split over several files (same platform + threadKey). */
export function coalesce(chats: ParsedChat[]): ParsedChat[] {
  const out: ParsedChat[] = []
  const byKey = new Map<string, ParsedChat>()
  for (const c of chats) {
    if (!c.threadKey) {
      out.push(c)
      continue
    }
    const key = `${c.platform}|${c.threadKey}`
    const existing = byKey.get(key)
    if (!existing) {
      const copy = { ...c, messages: [...c.messages], participants: [...c.participants], warnings: [...c.warnings] }
      byKey.set(key, copy)
      out.push(copy)
      continue
    }
    existing.messages.push(...c.messages)
    for (const p of c.participants) if (!existing.participants.includes(p)) existing.participants.push(p)
    for (const w of c.warnings) if (!existing.warnings.some((x) => x.code === w.code)) existing.warnings.push(w)
    existing.source = existing.source === c.source ? existing.source : `${existing.source} (+ more parts)`
    existing.selfKey ??= c.selfKey
  }
  for (const c of byKey.values()) c.messages.sort((a, b) => a.t - b.t)
  return out
}

export function summarize(chat: ParsedChat): ChatSummary {
  const counts = new Map<string, number>()
  let first: number | null = null
  let last: number | null = null
  let n = 0
  for (const m of chat.messages) {
    if (m.kind === 'system' || !m.sender) continue
    counts.set(m.sender, (counts.get(m.sender) ?? 0) + 1)
    if (first === null || m.t < first) first = m.t
    if (last === null || m.t > last) last = m.t
    n++
  }
  return {
    id: chat.id,
    platform: chat.platform,
    source: chat.source,
    title: chat.title,
    participants: [...counts].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count),
    messageCount: n,
    first,
    last,
    warnings: chat.warnings,
    selfKey: chat.selfKey,
  }
}
