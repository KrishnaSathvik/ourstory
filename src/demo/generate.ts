/**
 * Synthetic demo data.
 *
 * Generates a FICTIONAL couple's history (Maya & Theo) as real export files
 * in three platform formats. The demo runs these files through exactly the
 * same parsers and analysis as user imports, so the demo exercises the real
 * product, but the people, messages and events are entirely invented.
 */

import { DAY, HOUR, MINUTE } from '../core/time'

export interface DemoFile {
  path: string
  content: string
}

export const DEMO_PEOPLE = {
  maya: { whatsapp: 'Maya Okafor', instagram: 'Maya O.', telegram: 'Maya' },
  theo: { whatsapp: 'Theo Lindqvist', instagram: 'theo', telegram: 'Theo Lindqvist' },
} as const

type Who = 'maya' | 'theo'
type Kind = 'text' | 'media' | 'voice' | 'sticker' | 'call'
interface GenMsg {
  t: number // wall-clock as UTC
  who: Who
  kind: Kind
  text: string
  callSeconds?: number
  reaction?: string
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const START = Date.UTC(2022, 2, 14, 21, 12, 0) // 14 Mar 2022
const END = Date.UTC(2025, 9, 20, 23, 0, 0)
const INSTAGRAM_UNTIL = Date.UTC(2022, 5, 3)
const TELEGRAM_FROM = Date.UTC(2024, 8, 1)
const TELEGRAM_UNTIL = Date.UTC(2025, 0, 20)
const QUIET_FROM = Date.UTC(2023, 7, 9)
const QUIET_UNTIL = Date.UTC(2023, 7, 17)
const BIG_DAY = Date.UTC(2023, 10, 4) // a (fictional) moving day

const OPENERS = [
  'hey you', 'are you up', 'guess what', 'okay so', 'quick question', 'random thought', 'you will not believe this',
  'did you see the news', 'what are you doing', 'i have a confession', 'are you free later', 'tell me about your day',
]
const CHAT = [
  'what do you want for dinner', 'i am so hungry', 'on my way', 'running ten minutes late', 'just got home',
  'the train is delayed again', 'can you pick up milk', 'that meeting went on forever', 'i finished the book',
  'we should watch the next episode', 'it is raining so hard here', 'i miss the beach', 'my mum says hi',
  'did you call the landlord', 'i found the best bakery', 'can we get croissants tomorrow', 'pickle knocked over my plant',
  'pickle is sleeping on my laptop', 'the playlist is perfect', 'send me that song', 'how was the gym',
  'i cannot stop thinking about that pasta', 'let us go to the market on saturday', 'i booked the table',
  'what time is the film', 'i am wearing your hoodie', 'the noodle place was closed', 'should we get noodles anyway',
  'your plant is thriving', 'i need a nap', 'the coffee here is terrible', 'we should plan a trip', 'what about lisbon',
  'the flights are cheap in may', 'i love that idea', 'that is so us', 'remember the ferris wheel', 'i am outside',
  'bring an umbrella', 'my boss liked the presentation', 'i nailed it', 'proud of you', 'you are ridiculous',
  'stop making me laugh in the library', 'okay but seriously', 'that cat has no shame', 'pickle says hello',
  'want to bake something', 'the oven is making a weird noise', 'i burnt the toast again', 'bean is that you',
  'yes bean', 'noodle please', 'i am cooking tonight', 'try the new ramen place', 'we have no more coffee',
  'i put the laundry on', 'do we need anything', 'the sunset right now', 'look outside', 'can not wait to see you',
]
const REPLIES = [
  'haha', 'hahaha', 'lol', 'yes', 'yes please', 'no way', 'omg', 'same', 'okay', 'sounds good', 'deal', 'perfect',
  'you are the best', 'thank you', 'thanks bean', 'sorry', 'sorry i was in a meeting', 'wait what', 'stop', 'love that',
  'obviously', 'tell me everything', 'ugh', 'i know', 'right', 'exactly', 'yesss', 'agreed', 'hmm', 'maybe',
]
const MORNING = ['good morning', 'morning bean', 'good morning sunshine', 'morning', 'did you sleep well']
const NIGHT = ['good night', 'goodnight bean', 'sweet dreams', 'night night', 'sleep well']
const LOVE = ['love you', 'i love you', 'love you so much', 'miss you', 'i miss you already']
const EMOJI: Record<Who, { early: string[]; late: string[] }> = {
  maya: { early: ['🥹', '✨', '🌸', '😊', '💛'], late: ['🥹', '✨', '😂', '🫶', '💛', '🍜'] },
  theo: { early: ['😂', '👍', '😎', '🙌', '🔥'], late: ['😂', '🥹', '✨', '🫶', '🍜', '😴'] },
}

/** Hour preference weights per person (Theo is the night owl). */
const HOURS: Record<Who, number[]> = {
  maya: [1, 0.3, 0.1, 0, 0, 0.3, 2, 4, 5, 3, 3, 3, 4, 4, 3, 3, 4, 5, 6, 7, 7, 6, 4, 2],
  theo: [3, 2, 1, 0.5, 0.1, 0, 0.2, 1, 2, 2, 3, 3, 4, 4, 3, 3, 4, 5, 6, 7, 8, 8, 7, 5],
}

function pickWeighted(weights: number[], r: number): number {
  const sum = weights.reduce((a, b) => a + b, 0)
  let x = r * sum
  for (let i = 0; i < weights.length; i++) {
    x -= weights[i]
    if (x <= 0) return i
  }
  return weights.length - 1
}

export function generateDemoMessages(seed = 7): GenMsg[] {
  const r = rng(seed)
  const pick = <T>(xs: T[]) => xs[Math.floor(r() * xs.length)]
  const msgs: GenMsg[] = []
  const span = END - START
  let saidLove = false

  for (let day = Math.floor(START / DAY); day <= Math.floor(END / DAY); day++) {
    const t0 = day * DAY
    if (t0 >= QUIET_FROM && t0 < QUIET_UNTIL) continue
    const progress = (t0 - START) / span
    // Ramp up during the first months, then a steady, slightly noisy plateau.
    const ramp = Math.min(1, 0.15 + progress * 5)
    const weekdayBoost = [1, 1, 1, 1.1, 1.25, 1.3, 1.05][(new Date(t0).getUTCDay() + 6) % 7]
    let sessions = Math.round((1.2 + r() * 3.2) * ramp * weekdayBoost)
    if (t0 === BIG_DAY) sessions = 18
    if (r() < 0.04) sessions = 0

    let lastT = -Infinity
    for (let s = 0; s < sessions; s++) {
      let initiator: Who = r() < 0.58 ? 'maya' : 'theo'
      const hour = pickWeighted(HOURS[initiator], r())
      if (hour < 5 && r() < 0.8) initiator = 'theo'
      let t = Math.max(t0 + hour * HOUR + Math.floor(r() * 60) * MINUTE + Math.floor(r() * 60) * 1000, lastT + 3 * MINUTE)
      if (t0 === BIG_DAY) t = Math.max(t0 + (7 + s * 0.85) * HOUR, lastT + MINUTE)
      if (t >= (day + 1) * DAY + 3 * HOUR) break
      let who = initiator
      const length = Math.round(4 + r() * 14 * ramp + (t0 === BIG_DAY ? 25 : 0))
      const h = new Date(t).getUTCHours()
      for (let i = 0; i < length; i++) {
        const lateness = progress
        const emojiPool = r() < lateness ? EMOJI[who].late : EMOJI[who].early
        let text: string
        if (i === 0) {
          text = h < 10 && r() < 0.6 ? pick(MORNING) : pick(OPENERS)
        } else if (h >= 22 && i === length - 1 && r() < 0.6) {
          text = pick(NIGHT)
        } else {
          text = r() < 0.45 ? pick(REPLIES) : pick(CHAT)
        }
        // Theo gradually picks up Maya's nicknames (vocabulary convergence).
        if (who === 'theo' && text.includes('bean') && r() > progress) text = text.replace('bean', 'mate')
        if (progress > 0.03 && r() < (who === 'theo' ? 0.035 : 0.028)) {
          text = pick(LOVE)
          saidLove = true
        }
        if (!saidLove && /love you|miss you/.test(text)) text = 'that is so us'
        if (who === 'theo' && r() < 0.05) text = text.toUpperCase()
        if (r() < (who === 'maya' ? 0.12 : 0.05)) text += '?'
        else if (r() < (who === 'maya' ? 0.06 : 0.09)) text += '!'
        if (r() < (who === 'maya' ? 0.42 : 0.3)) text += ' ' + pick(emojiPool) + (r() < 0.3 ? pick(emojiPool) : '')

        let kind: Kind = 'text'
        const k = r()
        if (k < 0.035) kind = 'media'
        else if (k < 0.05 && who === 'maya') kind = 'voice'
        else if (k < 0.062 && who === 'theo') kind = 'sticker'
        else if (k < 0.064) kind = 'call'

        const m: GenMsg = { t, who, kind, text: kind === 'text' ? text : '' }
        if (kind === 'call') m.callSeconds = Math.floor(60 + r() * 2400)
        if (kind === 'text' && r() < 0.06) m.reaction = who === 'maya' ? pick(['😂', '❤️']) : pick(['❤️', '🥹'])
        msgs.push(m)

        // Next sender: bursts (same person) or a reply after a delay.
        const same = r() < (who === 'maya' ? 0.38 : 0.28)
        const replyMedian = (who === 'maya' ? 1.6 : 4.2) * MINUTE // the *next* person's delay
        const delay = same ? 5000 + r() * 40_000 : Math.exp(Math.log(replyMedian) + (r() - 0.5) * 2.2)
        // Occasional double text after a long wait.
        t += r() < 0.025 ? 25 * MINUTE + r() * 40 * MINUTE : delay
        t = Math.round(t / 1000) * 1000
        if (!same) who = who === 'maya' ? 'theo' : 'maya'
        // After midnight Maya is usually asleep: Theo's late sessions fizzle out.
        const nowH = new Date(t).getUTCHours()
        if (who === 'maya' && nowH < 5 && r() < 0.6) {
          if (r() < 0.5) msgs.push({ t: t + 2 * MINUTE, who: 'theo', kind: 'text', text: pick(NIGHT) })
          break
        }
      }
      lastT = t
    }
  }
  return msgs.sort((a, b) => a.t - b.t)
}

const pad = (n: number) => String(n).padStart(2, '0')

function whatsappLine(m: GenMsg): string {
  const d = new Date(m.t)
  const stamp = `[${pad(d.getUTCDate())}/${pad(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}, ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}]`
  const name = DEMO_PEOPLE[m.who].whatsapp
  const body =
    m.kind === 'media'
      ? '‎image omitted'
      : m.kind === 'voice'
        ? '‎audio omitted'
        : m.kind === 'sticker'
          ? '‎sticker omitted'
          : m.kind === 'call'
            ? '‎Missed voice call'
            : m.text
  return `${stamp} ${name}: ${body}`
}

/** Meta writes UTF-8 bytes as \u00XX escapes; reproduce that faithfully. */
function metaJson(value: unknown): string {
  const json = JSON.stringify(value, null, 2)
  let out = ''
  for (const ch of json) {
    const cp = ch.codePointAt(0)!
    if (cp < 0x80) out += ch
    else for (const b of new TextEncoder().encode(ch)) out += `\\u00${b.toString(16).padStart(2, '0')}`
  }
  return out
}

export function generateDemoFiles(seed = 7): DemoFile[] {
  const all = generateDemoMessages(seed)
  const insta = all.filter((m) => m.t < INSTAGRAM_UNTIL)
  const rest = all.filter((m) => m.t >= INSTAGRAM_UNTIL)
  const tg = rest.filter((m, i) => m.t >= TELEGRAM_FROM && m.t < TELEGRAM_UNTIL && i % 3 === 0)
  const tgSet = new Set(tg)
  const wa = rest.filter((m) => !tgSet.has(m))

  const waText = [
    `[${'14/03/2022, 20:00:00'}] Theo Lindqvist: ‎Messages and calls are end-to-end encrypted. No one outside of this chat, not even WhatsApp, can read or listen to them.`,
    ...wa.map(whatsappLine),
  ].join('\n')

  const instaJson = metaJson({
    participants: [{ name: DEMO_PEOPLE.theo.instagram }, { name: DEMO_PEOPLE.maya.instagram }],
    messages: [...insta].reverse().map((m) => {
      const base: Record<string, unknown> = { sender_name: DEMO_PEOPLE[m.who].instagram, timestamp_ms: m.t, is_geoblocked_for_viewer: false }
      if (m.kind === 'text') base.content = m.text
      else if (m.kind === 'media') base.photos = [{ uri: 'your_instagram_activity/messages/inbox/theo_123/photos/1.jpg', creation_timestamp: Math.floor(m.t / 1000) }]
      else if (m.kind === 'voice') base.audio_files = [{ uri: 'audio/1.mp4', creation_timestamp: Math.floor(m.t / 1000) }]
      else if (m.kind === 'sticker') base.sticker = { uri: 'stickers/1.png' }
      else base.content = 'You missed a call'
      if (m.reaction) base.reactions = [{ reaction: m.reaction, actor: DEMO_PEOPLE[m.who === 'maya' ? 'theo' : 'maya'].instagram }]
      return base
    }),
    title: DEMO_PEOPLE.theo.instagram,
    is_still_participant: true,
    thread_path: 'inbox/theo_1234567890',
    magic_words: [],
  })

  const ids = { maya: 'user1000000001', theo: 'user1000000002' }
  const telegramJson = JSON.stringify(
    {
      name: DEMO_PEOPLE.theo.telegram,
      type: 'personal_chat',
      id: 1000000002,
      messages: tg.map((m, i) => {
        const date = new Date(m.t).toISOString().slice(0, 19)
        const unix = String(Math.floor(m.t / 1000))
        if (m.kind === 'call')
          return { id: i + 1, type: 'service', date, date_unixtime: unix, actor: DEMO_PEOPLE[m.who].telegram, actor_id: ids[m.who], action: 'phone_call', duration_seconds: m.callSeconds, text: '', text_entities: [] }
        const base: Record<string, unknown> = { id: i + 1, type: 'message', date, date_unixtime: unix, from: DEMO_PEOPLE[m.who].telegram, from_id: ids[m.who] }
        if (m.kind === 'text') base.text = m.text
        else base.text = ''
        if (m.kind === 'media') base.photo = 'photos/photo_1.jpg'
        if (m.kind === 'voice') Object.assign(base, { file: 'voice_messages/audio_1.ogg', media_type: 'voice_message' })
        if (m.kind === 'sticker') Object.assign(base, { file: 'stickers/sticker.webp', media_type: 'sticker', sticker_emoji: '🙃' })
        base.text_entities = m.text ? [{ type: 'plain', text: m.text }] : []
        if (m.reaction)
          base.reactions = [{ type: 'emoji', count: 1, emoji: m.reaction, recent: [{ from: DEMO_PEOPLE[m.who === 'maya' ? 'theo' : 'maya'].telegram, from_id: ids[m.who === 'maya' ? 'theo' : 'maya'], date }] }]
        return base
      }),
    },
    null,
    1,
  )

  return [
    { path: 'WhatsApp Chat - Theo Lindqvist/_chat.txt', content: waText },
    { path: 'instagram-maya/your_instagram_activity/messages/inbox/theo_1234567890/message_1.json', content: instaJson },
    { path: 'Telegram Desktop/ChatExport_2025-01-20/result.json', content: telegramJson },
  ]
}
