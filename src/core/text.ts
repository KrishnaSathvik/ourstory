/**
 * Text utilities used inside the worker. Nothing here produces output that
 * contains full message text; callers aggregate into counts.
 */

/** Bidi/format marks WhatsApp and others sprinkle into exports. */
const INVISIBLE = /[‎‏‪-‮⁦-⁩﻿]/g
export const stripInvisible = (s: string) => s.replace(INVISIBLE, '')

/**
 * Repairs Meta's "mojibake" export bug: UTF-8 bytes written as \u00XX escapes.
 * Only applied when every code unit is <= 0xFF and at least one is >= 0x80,
 * and the result decodes as valid UTF-8.
 */
export function fixMojibake(s: string): string {
  let high = false
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c > 0xff) return s
    if (c >= 0x80) high = true
  }
  if (!high) return s
  const bytes = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) bytes[i] = s.charCodeAt(i)
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes)
  } catch {
    return s
  }
}

// ---------------------------------------------------------------- emoji ---

const EMOJI_RE =
  /\p{Regional_Indicator}{2}|[#*0-9]️?⃣|\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?(?:‍\p{Extended_Pictographic}(?:️|\p{Emoji_Modifier})?)*/gu

/** Emoji in a string; FE0F and skin tones normalised so variants count together. */
export function extractEmoji(s: string): string[] {
  const m = s.match(EMOJI_RE)
  if (!m) return []
  return m.map(normalizeEmoji)
}

export function normalizeEmoji(e: string): string {
  return e.replace(/️/g, '').replace(/[\u{1F3FB}-\u{1F3FF}]/gu, '')
}

// ---------------------------------------------------------------- words ---

const URL_RE = /\b(?:https?:\/\/|www\.)\S+/gi
const EMAIL_RE = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g
const MENTION_RE = /@\w+/g

export const hasLink = (s: string) => /\b(?:https?:\/\/|www\.)\S+/i.test(s)

/** Lower-cased word tokens with URLs, emails and @mentions removed. */
export function tokenize(s: string): string[] {
  const cleaned = s.replace(URL_RE, ' ').replace(EMAIL_RE, ' ').replace(MENTION_RE, ' ').toLowerCase()
  const out: string[] = []
  for (const raw of cleaned.split(/[^\p{L}\p{M}\p{N}'’]+/u)) {
    const w = raw.replace(/^['’]+|['’]+$/g, '').replace(/’/g, "'")
    if (w) out.push(w)
  }
  return out
}

/**
 * Whether a token may ever be shown to users as part of a word statistic.
 * Rejects anything that could be a secret or identifier: numbers, codes,
 * very long strings, mixed letter/digit tokens.
 */
export function isDisplayableWord(w: string): boolean {
  if (w.length < 3 || w.length > 18) return false
  if (/\p{N}/u.test(w)) return false
  if (!/^\p{L}[\p{L}\p{M}']*$/u.test(w)) return false
  // Collapse stretched words ("sooooo") – too noisy to be "a word".
  if (/(.)\1\1\1/u.test(w)) return false
  return !STOPWORDS.has(w)
}

// ------------------------------------------------------------- lexicons ---

/**
 * Phrase lexicons. These are counted, never quoted, and are the only basis
 * for "milestone" moments like the first "love you". English first, with
 * common Spanish / Portuguese / French / German / Italian forms.
 */
export const LEXICON = {
  love: /\b(?:i\s+)?(?:love|luv)\s+(?:you|u|ya)\b(?!r)|\bily(?:sm)?\b|\bte\s+amo\b|\bte\s+quiero\b|\bje\s+t['’]?aime\b|\bich\s+liebe\s+dich\b|\bti\s+amo\b|\bhab\s+dich\s+lieb\b/i,
  miss: /\bmiss(?:ing)?\s+(?:you|u|ya)\b|\bte\s+extra[ñn]o\b|\bsaudades?\b|\btu\s+me\s+manques\b|\bmi\s+manchi\b|\bvermisse\s+dich\b/i,
  goodnight:
    /\b(?:good\s*night|g'?nite|nighty?[\s-]*night|night\s*night|sweet\s+dreams|gn|buenas\s+noches|bonne\s+nuit|gute\s+nacht|boa\s+noite|buonanotte)\b/i,
  goodmorning: /\b(?:good\s*morning|g'?morning|morning|gm|buenos\s+d[ií]as|bonjour|guten\s+morgen|bom\s+dia|buongiorno)\b/i,
  sorry: /\b(?:sorry|sry|soz|my\s+bad|apologi[sz]e|perd[oó]n|lo\s+siento|d[ée]sol[ée]e?|desculpa|scusa|entschuldigung)\b/i,
  thanks: /\b(?:thank\s*(?:s|you|u)|thx|tysm|ty|gracias|merci|danke|obrigad[oa]|grazie)\b/i,
  laugh:
    /\b(?:a?ha(?:ha)+h?|ah(?:ah)+|he(?:he)+|hi(?:hi)+|lo+l+|lmf?a+o+|rofl|ja(?:ja)+|je(?:je)+|k{4,}|rs(?:rs)+|mdr+|xd+|jsjs\w*)\b|[😂🤣😆😹💀]/iu,
  question: /\?/,
} as const

export type LexiconKey = keyof typeof LEXICON

// Compact multi-language stopword list (function words that carry no story).
const STOPWORD_TEXT = `
a about above after again against all am an and any are aren't as at be because been before being below between both but by
can can't cannot could couldn't did didn't do does doesn't doing don't down during each few for from further had hadn't has hasn't
have haven't having he he'd he'll he's her here here's hers herself him himself his how how's i i'd i'll i'm i've if in into is
isn't it it's its itself let's me more most mustn't my myself no nor not of off on once only or other ought our ours ourselves
out over own same shan't she she'd she'll she's should shouldn't so some such than that that's the their theirs them themselves
then there there's these they they'd they'll they're they've this those through to too under until up very was wasn't we we'd
we'll we're we've were weren't what what's when when's where where's which while who who's whom why why's with won't would
wouldn't you you'd you'll you're you've your yours yourself yourselves
im ive id ill dont doesnt didnt cant wont isnt arent wasnt youre theyre thats whats its lets u ur ya yeah yes yep yup ok okay
okk okey oh ah um uh hmm hm mm like just got get gonna wanna gotta also really much well still even now then too one two
will would could should might must shall may also back going go know think see say said want need make made take come came
thing things something anything nothing everything way lot bit sure though tho bc cuz cause because idk tbh btw omg lol haha
hahaha lmao yea nah na ok oki alright right good bad time day today tomorrow yesterday tonight
el la los las un una unos unas y o pero que de del en con por para es son está estoy eso esto ese esta como más muy ya si no
lo le les se su sus mi mis tu tus me te nos al hay fue ser era qué cómo
le la les un une des et ou mais que qui de du en avec pour est sont je tu il elle nous vous ils elles ce cette ça pas ne
der die das ein eine und oder aber dass ist sind ich du er sie wir ihr es nicht mit von zu auf für den dem
o a os as um uma e ou mas que de do da em com por para é são eu você ele ela nós não isso
il lo la gli le un una e o ma che di da in con per è sono io tu lui lei noi voi non
`
export const STOPWORDS = new Set(STOPWORD_TEXT.split(/\s+/).filter(Boolean))

/** Rough word count of a message (for "you wrote N novels"). */
export const wordCount = (s: string) => {
  let n = 0
  let inWord = false
  for (let i = 0; i < s.length; i++) {
    const space = s.charCodeAt(i) <= 32
    if (!space && !inWord) n++
    inWord = !space
  }
  return n
}

/** Cheap 32-bit FNV-1a hash, used for de-duplication keys. */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
