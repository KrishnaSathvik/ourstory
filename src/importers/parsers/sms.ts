import { stripInvisible } from '../../core/text'
import { makeLocalizer } from '../../core/time'
import type { ImportWarning, Message, ParsedChat } from '../../core/types'
import { chatId, type Parser } from '../source'

/**
 * "SMS Backup & Restore" (Android) XML:
 *   <smses><sms address date type body contact_name …/><mms …><parts>…</parts><addrs>…</addrs></mms></smses>
 *
 * A hand-rolled tag scanner (no DOMParser, so it runs in a Worker). Attribute
 * values are located with indexOf, and the huge base64 `data` attribute of
 * MMS parts is skipped without ever being copied. One chat per address (or
 * per MMS group address set). `date` is epoch ms (absolute) → localised.
 */

const SELF = 'Me'

function decodeEntities(s: string): string {
  if (s.indexOf('&') < 0) return s
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (whole, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      if (!Number.isFinite(n)) return whole
      // SMS Backup & Restore writes emoji as two numeric surrogate refs.
      return n <= 0xffff ? String.fromCharCode(n) : String.fromCodePoint(n)
    }
    switch (e.toLowerCase()) {
      case 'amp':
        return '&'
      case 'lt':
        return '<'
      case 'gt':
        return '>'
      case 'quot':
        return '"'
      default:
        return "'"
    }
  })
}

interface Tag {
  name: string
  attrs: Record<string, string>
  selfClosing: boolean
  end: number
  /** Names of attributes skipped (present but value not materialised). */
  skipped?: Set<string>
}

const SKIP_ATTRS = new Set(['data'])
const isSpace = (c: number) => c === 32 || c === 9 || c === 10 || c === 13

/** Parses an opening tag starting at `pos` (which points at '<'). */
function readTag(xml: string, pos: number): Tag | null {
  let i = pos + 1
  const n = xml.length
  const nameStart = i
  while (i < n) {
    const c = xml.charCodeAt(i)
    if (isSpace(c) || c === 47 /* / */ || c === 62 /* > */) break
    i++
  }
  const name = xml.slice(nameStart, i)
  const attrs: Record<string, string> = {}
  let skipped: Set<string> | undefined
  while (i < n) {
    while (i < n && isSpace(xml.charCodeAt(i))) i++
    const c = xml.charCodeAt(i)
    if (c === 62) return { name, attrs, selfClosing: false, end: i + 1, skipped }
    if (c === 47 && xml.charCodeAt(i + 1) === 62) return { name, attrs, selfClosing: true, end: i + 2, skipped }
    const aStart = i
    while (i < n) {
      const d = xml.charCodeAt(i)
      if (d === 61 /* = */ || isSpace(d) || d === 62 || d === 47) break
      i++
    }
    const aName = xml.slice(aStart, i)
    while (i < n && isSpace(xml.charCodeAt(i))) i++
    if (xml.charCodeAt(i) !== 61) {
      if (!aName) i++ // stray character; avoid an infinite loop
      continue
    }
    i++
    while (i < n && isSpace(xml.charCodeAt(i))) i++
    const q = xml[i]
    if (q !== '"' && q !== "'") return null
    const close = xml.indexOf(q, i + 1)
    if (close < 0) return null
    if (SKIP_ATTRS.has(aName)) (skipped ??= new Set()).add(aName)
    else attrs[aName] = decodeEntities(xml.slice(i + 1, close))
    i = close + 1
  }
  return null
}

const normAddr = (a: string) => {
  const s = a.trim()
  if (s.includes('@')) return s.toLowerCase()
  const digits = s.replace(/[^\d+]/g, '')
  return digits || s
}

const goodName = (s: string | undefined) => {
  const v = s ? stripInvisible(s).trim() : ''
  return v && v !== '(Unknown)' && v !== 'null' ? v : undefined
}

interface Raw {
  t: number
  key: string
  fromSelf: boolean
  fromAddr?: string
  contact?: string
  text: string
  media: boolean
  order: number
}

interface Pending {
  attrs: Record<string, string>
  texts: string[]
  media: boolean
  from?: string
}

export const smsParser: Parser = {
  platform: 'sms',
  sniff(file, head) {
    if (/<smses[\s>]/.test(head)) return 0.97
    if (/<\?xml/.test(head) && /<(?:sms|mms)\s[^>]*\baddress=/.test(head)) return 0.85
    if (/\.xml$/i.test(file.name) && /^sms-\d/i.test(file.name)) return 0.4
    return 0
  },
  async parse(file, opts) {
    const xml = await file.text()
    if (!/<smses[\s>]|<(?:sms|mms)\s/.test(xml.slice(0, 65536))) {
      throw new Error(`${file.name}: not an SMS Backup & Restore XML file`)
    }
    const loc = makeLocalizer(opts.timeZone)
    const raws: Raw[] = []
    const names = new Map<string, string>() // normalised address -> contact name
    let bad = 0
    let order = 0
    let mms: Pending | null = null
    let truncated = false

    const finishMms = (p: Pending) => {
      const a = p.attrs
      const date = Number(a.date)
      const box = a.msg_box
      if (!Number.isFinite(date)) {
        bad++
        return
      }
      if (box !== '1' && box !== '2') {
        return // drafts / outbox / failed: not conversation
      }
      const addrs = (a.address ?? '')
        .split('~')
        .map(normAddr)
        .filter(Boolean)
      if (!addrs.length) {
        bad++
        return
      }
      const key = [...new Set(addrs)].sort().join('~')
      const text = p.texts.join('\n').trim()
      const contact = addrs.length === 1 ? goodName(a.contact_name) : undefined
      if (contact) names.set(addrs[0], contact)
      raws.push({
        t: loc(date),
        key,
        fromSelf: box === '2',
        fromAddr: p.from ? normAddr(p.from) : addrs.length === 1 ? addrs[0] : undefined,
        contact,
        text,
        media: !text && p.media,
        order: order++,
      })
    }

    let pos = 0
    const n = xml.length
    while (pos < n) {
      const lt = xml.indexOf('<', pos)
      if (lt < 0) break
      const next = xml.charCodeAt(lt + 1)
      if (next === 63 /* ? */) {
        const e = xml.indexOf('?>', lt)
        pos = e < 0 ? n : e + 2
        continue
      }
      if (next === 33 /* ! */) {
        const isComment = xml.startsWith('<!--', lt)
        const e = isComment ? xml.indexOf('-->', lt) : xml.indexOf('>', lt)
        pos = e < 0 ? n : e + (isComment ? 3 : 1)
        continue
      }
      if (next === 47 /* / */) {
        const e = xml.indexOf('>', lt)
        const name = xml.slice(lt + 2, e < 0 ? n : e).trim()
        if (name === 'mms' && mms) {
          finishMms(mms)
          mms = null
        }
        pos = e < 0 ? n : e + 1
        continue
      }
      const tag = readTag(xml, lt)
      if (!tag) {
        truncated = true
        break
      }
      pos = tag.end
      const a = tag.attrs
      switch (tag.name) {
        case 'sms': {
          const date = Number(a.date)
          const addr = normAddr(a.address ?? '')
          if (!Number.isFinite(date) || !addr) {
            bad++
            break
          }
          if (a.type !== '1' && a.type !== '2') {
            break // drafts / outbox / failed: not conversation
          }
          const contact = goodName(a.contact_name)
          if (contact) names.set(addr, contact)
          const body = a.body ?? ''
          raws.push({
            t: loc(date),
            key: addr,
            fromSelf: a.type === '2',
            fromAddr: addr,
            contact,
            text: body === 'null' ? '' : body,
            media: false,
            order: order++,
          })
          break
        }
        case 'mms':
          mms = { attrs: a, texts: [], media: false }
          if (tag.selfClosing) {
            finishMms(mms)
            mms = null
          }
          break
        case 'part':
          if (mms) {
            const ct = (a.ct ?? '').toLowerCase()
            if (ct === 'text/plain') {
              if (a.text && a.text !== 'null') mms.texts.push(a.text)
            } else if (ct !== 'application/smil' && ct) mms.media = true
          }
          break
        case 'addr':
          if (mms && a.type === '137' && a.address && a.address !== 'insert-address-token') mms.from = a.address
          break
      }
    }
    if (mms) {
      truncated = true
      finishMms(mms)
    }

    // Group into chats.
    const groups = new Map<string, Raw[]>()
    for (const r of raws) {
      let g = groups.get(r.key)
      if (!g) groups.set(r.key, (g = []))
      g.push(r)
    }

    const out: ParsedChat[] = []
    for (const [key, list] of groups) {
      list.sort((x, y) => x.t - y.t || x.order - y.order)
      const messages: Message[] = list.map((r): Message => {
        const sender = r.fromSelf ? SELF : r.fromAddr ? (names.get(r.fromAddr) ?? r.contact ?? r.fromAddr) : 'Unknown'
        return r.media || !r.text.trim()
          ? { t: r.t, sender, kind: r.media ? 'media' : 'other', text: '' }
          : { t: r.t, sender, kind: 'text', text: r.text }
      })
      const participants: string[] = []
      const seen = new Set<string>()
      for (const m of messages) {
        if (!seen.has(m.sender)) {
          seen.add(m.sender)
          participants.push(m.sender)
        }
      }
      const addrs = key.split('~')
      const warnings: ImportWarning[] = []
      if (addrs.length > 1 || participants.length > 2) {
        warnings.push({ code: 'group-chat', message: 'This conversation has more than two participants.' })
      }
      out.push({
        id: chatId('sms'),
        platform: 'sms',
        source: file.path,
        title: addrs.map((a) => names.get(a) ?? a).join(', '),
        participants,
        messages,
        warnings,
        selfKey: SELF,
      })
    }

    // File-level problems are attached to every chat (there is no other place).
    const fileWarnings: ImportWarning[] = []
    if (bad) fileWarnings.push({ code: 'unparsed-lines', message: `${bad} record(s) could not be read and were skipped.` })
    if (truncated) fileWarnings.push({ code: 'truncated', message: 'The backup file appears to be cut off.' })
    for (const c of out) c.warnings.push(...fileWarnings)
    out.sort((x, y) => y.messages.length - x.messages.length)
    return out
  },
}
