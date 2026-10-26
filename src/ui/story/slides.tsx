import type { ReactNode } from 'react'
import type { PersonId } from '../../core/types'
import { PLATFORM_LABEL } from '../../core/types'
import { DAY, monthStart } from '../../core/time'
import type { Pair, Story } from '../../analysis/story'
import { WEEKDAYS, fmtDate, fmtDuration, fmtHour, fmtMonth, fmtNum, fmtPct, fmtShortDate } from '../../analysis/format'
import { CountUp, PlatformMark, SplitBar, platformColor } from '../shared'

export type Tone = 'a' | 'b' | 'blend' | 'night'

export interface SlideDef {
  id: string
  label: string
  tone: Tone
  predict?: { prompt: string; options: string[]; answer: number }
  body: ReactNode
}

const ratio = (v: Pair) => Math.max(...v) / Math.max(Math.min(...v), 1e-9)

export function buildSlides(s: Story): SlideDef[] {
  const names = [s.people[0].name, s.people[1].name] as const
  const nm = (p: PersonId) => names[p === 'a' ? 0 : 1]
  const N = (p: PersonId) => <span className={p}>{nm(p)}</span>
  const winner = (v: Pair, lower = false): PersonId => ((lower ? v[0] < v[1] : v[0] > v[1]) ? 'a' : 'b')
  const other = (p: PersonId): PersonId => (p === 'a' ? 'b' : 'a')
  const ix = (p: PersonId) => (p === 'a' ? 0 : 1)
  const slides: SlideDef[] = []
  const apps = s.sources.length

  // 1 — Title
  slides.push({
    id: 'intro',
    label: 'Introduction',
    tone: 'blend',
    body: (
      <div className="sl sl--center">
        <p className="eyebrow sl-in">A duet for</p>
        <h2 className="display sl-names sl-in" style={{ '--i': 1 } as React.CSSProperties}>
          <span className="a">{names[0]}</span> <em className="sl-amp">&amp;</em> <span className="b">{names[1]}</span>
        </h2>
        <p className="sl-lede muted sl-in" style={{ '--i': 2 } as React.CSSProperties}>
          {fmtNum(s.range.days)} days. {fmtNum(s.totals.messages)} messages{apps > 1 ? `. ${apps} apps` : ''}.
          <br />
          Let’s play it back.
        </p>
        <p className="faint sl-hint sl-in" style={{ '--i': 4 } as React.CSSProperties}>
          Tap, or press →, to begin
        </p>
      </div>
    ),
  })

  // 2 — First message
  const fm = s.firsts.message
  slides.push({
    id: 'first',
    label: 'The first message',
    tone: fm.p,
    predict: { prompt: 'Who sent the very first message?', options: [...names], answer: ix(fm.p) },
    body: (
      <div className="sl">
        <p className="eyebrow sl-in">It begins on</p>
        <h2 className="display sl-huge sl-in" style={{ '--i': 1 } as React.CSSProperties}>
          {fmtDate(fm.t)}
        </h2>
        <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
          {N(fm.p)} sent the first message{s.sources[0] ? <>, on {PLATFORM_LABEL[s.sources[0].platform]}</> : null}.
        </p>
        <p className="faint sl-small sl-in" style={{ '--i': 3 } as React.CSSProperties}>
          The earliest message in what you imported. It may not be your first ever.
        </p>
      </div>
    ),
  })

  // 3 — The total
  const words = s.totals.words[0] + s.totals.words[1]
  slides.push({
    id: 'total',
    label: 'Total messages',
    tone: 'night',
    body: (
      <div className="sl">
        <p className="eyebrow sl-in">Since then, you’ve sent each other</p>
        <h2 className="display sl-giant sl-in" style={{ '--i': 1 } as React.CSSProperties}>
          <CountUp value={s.totals.messages} duration={2200} />
        </h2>
        <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
          messages.
        </p>
        <dl className="sl-facts sl-in" style={{ '--i': 3 } as React.CSSProperties}>
          <div>
            <dt>words</dt>
            <dd className="display">{fmtNum(words)}</dd>
          </div>
          {s.fun.novels >= 0.2 && (
            <div>
              <dt>novels’ worth</dt>
              <dd className="display">≈ {s.fun.novels >= 10 ? fmtNum(s.fun.novels) : s.fun.novels.toFixed(1)}</dd>
            </div>
          )}
          <div>
            <dt>days you talked</dt>
            <dd className="display">{fmtNum(s.activity.activeDays)}</dd>
          </div>
        </dl>
        <p className="faint sl-small sl-in" style={{ '--i': 4 } as React.CSSProperties}>
          A novel ≈ 120,000 words. At phone-typing speed that’s roughly {fmtNum(s.fun.typingHours)} hours of typing (an estimate).
        </p>
      </div>
    ),
  })

  // 4 — Who talks more
  const n = s.totals.byPerson
  const talker = winner(n)
  const even = ratio(n) < 1.08
  slides.push({
    id: 'split',
    label: 'Who sends more',
    tone: even ? 'blend' : talker,
    predict: even ? undefined : { prompt: 'Who sends more messages?', options: [...names], answer: ix(talker) },
    body: (
      <div className="sl">
        <p className="eyebrow sl-in">Who does the talking</p>
        <h2 className="display sl-big sl-in" style={{ '--i': 1 } as React.CSSProperties}>
          {even ? (
            <>
              Almost perfectly <em>even.</em>
            </>
          ) : (
            <>
              {N(talker)} sends <em>{fmtPct(n[ix(talker)] / (n[0] + n[1]))}</em> of your messages.
            </>
          )}
        </h2>
        <div className="sl-in" style={{ '--i': 2 } as React.CSSProperties}>
          <SplitBar
            values={n}
            height={22}
            labels={[
              <span key="a">
                <span className="a">{names[0]}</span> {fmtNum(n[0])}
              </span>,
              <span key="b">
                {fmtNum(n[1])} <span className="b">{names[1]}</span>
              </span>,
            ]}
          />
        </div>
      </div>
    ),
  })

  // 5 — Platforms
  if (apps > 1) {
    const min = s.range.first
    const span = s.range.last - min || 1
    const moves = s.milestones.filter((m) => m.kind === 'platform-start')
    slides.push({
      id: 'apps',
      label: 'Your apps',
      tone: 'night',
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">One story, {apps} apps</p>
          <h2 className="display sl-big sl-in" style={{ '--i': 1 } as React.CSSProperties}>
            {s.sources.map((x, i) => (
              <span key={x.platform}>
                {i > 0 && <em className="faint"> → </em>}
                <span style={{ color: platformColor(x.platform) }}>{PLATFORM_LABEL[x.platform]}</span>
              </span>
            ))}
          </h2>
          <ul className="sl-river sl-in" style={{ '--i': 2 } as React.CSSProperties}>
            {s.sources.map((x) => (
              <li key={x.platform}>
                <span className="sl-river__label">
                  <PlatformMark platform={x.platform} size={18} /> {fmtNum(x.messages)}
                </span>
                <span className="sl-river__track">
                  <span
                    className="sl-river__bar"
                    style={{
                      left: `${((x.first - min) / span) * 100}%`,
                      width: `${Math.max(1.5, ((x.last - x.first) / span) * 100)}%`,
                      background: platformColor(x.platform),
                    }}
                  />
                </span>
              </li>
            ))}
          </ul>
          {moves[0] && (
            <p className="sl-lede sl-in" style={{ '--i': 3 } as React.CSSProperties}>
              {N(moves[0].p!)} sent the first {PLATFORM_LABEL[moves[0].platform!]} message on {fmtDate(moves[0].t)}.
            </p>
          )}
        </div>
      ),
    })
  }

  // 6 — The hour
  const hourly = new Array<number>(24).fill(0)
  for (const g of s.activity.weekHour) for (const row of g) row.forEach((v, h) => (hourly[h] += v))
  slides.push({
    id: 'hour',
    label: 'Your hour',
    tone: 'night',
    predict: (() => {
      const peak = s.activity.peakHour
      const opts = [peak, (peak + 6) % 24, (peak + 12) % 24, (peak + 18) % 24].sort((x, y) => x - y)
      return { prompt: 'When is your chat at its busiest?', options: opts.map((h) => `${fmtHour(h)}`), answer: opts.indexOf(peak) }
    })(),
    body: (
      <div className="sl">
        <p className="eyebrow sl-in">Your chat’s favourite hour</p>
        <div className="sl-clockwrap sl-in" style={{ '--i': 1 } as React.CSSProperties}>
          <Clock values={hourly} peak={s.activity.peakHour} />
          <h2 className="display sl-clock-label">{fmtHour(s.activity.peakHour)}</h2>
        </div>
        <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
          Between {fmtHour(s.activity.peakHour)} and {fmtHour((s.activity.peakHour + 1) % 24)} is when you talk most, and {WEEKDAYS[s.activity.peakWeekday]}s are
          your busiest day.
        </p>
      </div>
    ),
  })

  // 7 — Night owl
  const ns = s.activity.nightShare
  if (Math.max(...ns) > 0.015 && ratio(ns) > 1.2) {
    const owl = winner(ns)
    slides.push({
      id: 'owl',
      label: 'Night owl',
      tone: owl,
      predict: { prompt: 'Who’s the night owl?', options: [...names], answer: ix(owl) },
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">After midnight</p>
          <h2 className="display sl-big sl-in" style={{ '--i': 1 } as React.CSSProperties}>
            🦉 {N(owl)} is the <em>night owl.</em>
          </h2>
          <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
            {fmtPct(ns[ix(owl)])} of {nm(owl)}’s messages are sent between midnight and 5 am. {nm(other(owl))}: {fmtPct(ns[ix(other(owl))])}.
          </p>
          {Math.max(...s.activity.morningShare) > 0.03 && (
            <p className="muted sl-small sl-in" style={{ '--i': 3 } as React.CSSProperties}>
              And before 9 am, {N(winner(s.activity.morningShare))} is up first, with {fmtPct(Math.max(...s.activity.morningShare))} of their messages.
            </p>
          )}
        </div>
      ),
    })
  }

  // 8 — Reply speed
  const mr = s.rhythm.medianReply
  if (mr[0] > 0 && mr[1] > 0 && ratio(mr) > 1.15) {
    const fast = winner(mr, true)
    slides.push({
      id: 'reply',
      label: 'Reply speed',
      tone: fast,
      predict: { prompt: 'Who replies faster?', options: [...names], answer: ix(fast) },
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">Typical reply time</p>
          <div className="sl-duel sl-in" style={{ '--i': 1 } as React.CSSProperties}>
            {(['a', 'b'] as const).map((p) => (
              <div key={p} className={`sl-duel__side ${p === fast ? 'is-win' : ''}`}>
                <span className={`display sl-duel__n ${p}`}>{fmtDuration(mr[ix(p)])}</span>
                <span className="muted">{nm(p)}</span>
              </div>
            ))}
          </div>
          <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
            ⚡ {N(fast)} is the speed replier.
            {s.rhythm.replyUnderMinute[ix(fast)] > 0.05 && <> {fmtPct(s.rhythm.replyUnderMinute[ix(fast)])} of their replies land within a minute.</>}
          </p>
          <p className="faint sl-small sl-in" style={{ '--i': 3 } as React.CSSProperties}>
            Median time to answer within a conversation. Gaps over 12 hours count as new conversations, not slow replies.
          </p>
        </div>
      ),
    })
  }

  // 9 — Who starts
  const ini = s.rhythm.initiations
  if (ratio(ini) > 1.1) {
    const st = winner(ini)
    slides.push({
      id: 'starter',
      label: 'Who texts first',
      tone: st,
      predict: { prompt: 'After a quiet spell, who usually texts first?', options: [...names], answer: ix(st) },
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">Breaking the silence</p>
          <h2 className="display sl-big sl-in" style={{ '--i': 1 } as React.CSSProperties}>
            {N(st)} starts <em>{fmtPct(ini[ix(st)] / (ini[0] + ini[1]))}</em> of your conversations.
          </h2>
          <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
            {fmtNum(s.rhythm.conversations)} conversations in all. {N(winner(s.rhythm.lastWord))} usually has the last word.
          </p>
          <p className="faint sl-small sl-in" style={{ '--i': 3 } as React.CSSProperties}>
            A conversation starts after six or more hours of quiet.
          </p>
        </div>
      ),
    })
  }

  // 10 — Busiest day
  const bd = s.activity.busiestDay
  const firstH = bd.hourly.findIndex((v) => v > 0)
  const lastH = 23 - [...bd.hourly].reverse().findIndex((v) => v > 0)
  slides.push({
    id: 'busiest',
    label: 'Your busiest day',
    tone: 'blend',
    body: (
      <div className="sl">
        <p className="eyebrow sl-in">Your busiest day</p>
        <h2 className="display sl-huge sl-in" style={{ '--i': 1 } as React.CSSProperties}>
          {fmtDate(bd.day * DAY)}
        </h2>
        <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
          <strong className="tnum">{fmtNum(bd.count)}</strong> messages in one day, from {fmtHour(firstH)} until past {fmtHour(lastH)}.
        </p>
        <HourBars values={bd.hourly} />
        <p className="faint sl-small sl-in" style={{ '--i': 4 } as React.CSSProperties}>
          Hour by hour. What happened that day is yours to remember.
        </p>
      </div>
    ),
  })

  // 11 — Streak & gap
  const ls = s.activity.longestStreak
  if (ls.days >= 3) {
    slides.push({
      id: 'streak',
      label: 'Longest streak',
      tone: 'a',
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">Every single day</p>
          <h2 className="display sl-giant sl-in" style={{ '--i': 1 } as React.CSSProperties}>
            <CountUp value={ls.days} />
          </h2>
          <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
            days in a row, from {fmtShortDate(ls.start)} to {fmtShortDate(ls.end)}, without one silent day.
          </p>
          {s.activity.longestGap && s.activity.longestGap.days >= 2 && (
            <p className="muted sl-small sl-in" style={{ '--i': 3 } as React.CSSProperties}>
              Your longest quiet stretch in these exports: {fmtNum(s.activity.longestGap.days)} days, until {fmtShortDate(s.activity.longestGap.end)}. Maybe you
              were together, or talking somewhere else.
            </p>
          )}
        </div>
      ),
    })
  }

  // 12 — First love you
  if (s.firsts.love) {
    const fl = s.firsts.love
    const daysIn = Math.round((fl.t - s.firsts.message.t) / DAY)
    const total = s.lexicon.love[0] + s.lexicon.love[1]
    slides.push({
      id: 'love',
      label: 'The first love you',
      tone: fl.p,
      predict: { prompt: 'Who wrote “love you” first?', options: [...names], answer: ix(fl.p) },
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">The first “love you”</p>
          <h2 className="display sl-huge sl-in" style={{ '--i': 1 } as React.CSSProperties}>
            {fmtDate(fl.t)}
          </h2>
          <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
            {N(fl.p)} wrote it first, {daysIn === 0 ? 'on the very first day' : `${fmtNum(daysIn)} days after the first message`}.
          </p>
          {total > 1 && (
            <p className="muted sl-small sl-in" style={{ '--i': 3 } as React.CSSProperties}>
              It’s appeared {fmtNum(total)} times since: {fmtNum(s.lexicon.love[0])} from {names[0]}, {fmtNum(s.lexicon.love[1])} from {names[1]}.
            </p>
          )}
        </div>
      ),
    })
  }

  // 13 — The little words
  const lex = s.lexicon
  const phrases: { k: string; label: string; v: Pair }[] = [
    { k: 'love', label: 'love you', v: lex.love },
    { k: 'miss', label: 'miss you', v: lex.miss },
    { k: 'goodnight', label: 'goodnight', v: lex.goodnight },
    { k: 'goodmorning', label: 'good morning', v: lex.goodmorning },
    { k: 'thanks', label: 'thank you', v: lex.thanks },
    { k: 'sorry', label: 'sorry', v: lex.sorry },
  ].filter((x) => x.v[0] + x.v[1] > 0)
  if (phrases.reduce((t, x) => t + x.v[0] + x.v[1], 0) >= 10) {
    const max = Math.max(...phrases.map((x) => x.v[0] + x.v[1]))
    slides.push({
      id: 'lexicon',
      label: 'The little words',
      tone: 'night',
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">The little words, counted</p>
          <ul className="sl-lex">
            {phrases.map((x, i) => (
              <li key={x.k} className="sl-in" style={{ '--i': i + 1 } as React.CSSProperties}>
                <span className="display sl-lex__phrase" style={{ fontSize: `${1.3 + ((x.v[0] + x.v[1]) / max) * 1.5}em` }}>
                  {x.label}
                </span>
                <span className="sl-lex__n tnum">
                  ×{fmtNum(x.v[0] + x.v[1])}
                  <span className="sl-lex__split">
                    <span className="a">{fmtNum(x.v[0])}</span> · <span className="b">{fmtNum(x.v[1])}</span>
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ),
    })
  }

  // 14 — Emoji
  if (s.emoji.top.length >= 3) {
    const top = s.emoji.top.slice(0, 5)
    const sig = s.emoji.signature
    slides.push({
      id: 'emoji',
      label: 'Your emoji',
      tone: 'blend',
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">Your emoji vocabulary</p>
          <ol className="sl-emoji">
            {top.map((e, i) => (
              <li key={e.w} className="sl-in" style={{ '--i': i + 1 } as React.CSSProperties}>
                <span className="sl-emoji__e" aria-hidden="true">
                  {e.w}
                </span>
                <span className="tnum">{fmtNum(e.a + e.b)}</span>
              </li>
            ))}
          </ol>
          {(sig[0] || sig[1]) && (
            <p className="sl-lede sl-in" style={{ '--i': 6 } as React.CSSProperties}>
              Signature emoji, the ones that are most <em>them</em>:{' '}
              {sig[0] && (
                <>
                  <span className="a">{names[0]}</span> {sig[0]}
                </>
              )}
              {sig[0] && sig[1] && ', '}
              {sig[1] && (
                <>
                  <span className="b">{names[1]}</span> {sig[1]}
                </>
              )}
              .
            </p>
          )}
        </div>
      ),
    })
  }

  // 15 — Convergence
  const conv = s.convergence
  if (conv.length >= 4) {
    const head = conv.slice(0, 2)
    const tail = conv.slice(-2)
    const avg = (xs: typeof conv, k: 'emoji' | 'words') => xs.reduce((t, x) => t + x[k], 0) / xs.length
    const pick: 'emoji' | 'words' = avg(tail, 'emoji') - avg(head, 'emoji') >= avg(tail, 'words') - avg(head, 'words') ? 'emoji' : 'words'
    const from = avg(head, pick)
    const to = avg(tail, pick)
    if (to - from >= 0.12) {
      slides.push({
        id: 'converge',
        label: 'Speaking the same language',
        tone: 'blend',
        body: (
          <div className="sl">
            <p className="eyebrow sl-in">Over time</p>
            <h2 className="display sl-big sl-in" style={{ '--i': 1 } as React.CSSProperties}>
              You started <em>speaking the same language.</em>
            </h2>
            <Converge data={conv.map((c) => c[pick])} />
            <p className="sl-lede sl-in" style={{ '--i': 3 } as React.CSSProperties}>
              Your {pick === 'emoji' ? 'emoji habits' : 'vocabularies'} went from <strong>{fmtPct(from)}</strong> alike to <strong>{fmtPct(to)}</strong> alike, between{' '}
              {fmtMonth(monthStart(conv[0].m))} and {fmtMonth(monthStart(conv[conv.length - 1].m))}.
            </p>
            <p className="faint sl-small sl-in" style={{ '--i': 4 } as React.CSSProperties}>
              Similarity of the {pick === 'emoji' ? 'emoji' : 'words'} you each use, measured season by season.
            </p>
          </div>
        ),
      })
    }
  }

  // 16 — Chapters
  if (s.chapters.length >= 2) {
    slides.push({
      id: 'chapters',
      label: 'Your chapters',
      tone: 'night',
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">Your story, in chapters</p>
          <ol className="sl-chapters">
            {s.chapters.slice(0, 6).map((c, i) => (
              <li key={c.label} className="sl-in" style={{ '--i': i + 1 } as React.CSSProperties}>
                <span className="sl-chapters__label tnum">{c.label}</span>
                <span className="display sl-chapters__theme">{c.theme}</span>
                <span className="faint sl-chapters__n tnum">
                  {fmtNum(c.messages)} {c.topEmoji ?? ''}
                </span>
              </li>
            ))}
          </ol>
        </div>
      ),
    })
  }

  // 17 — Awards
  if (s.awards.length) {
    slides.push({
      id: 'awards',
      label: 'The awards',
      tone: 'blend',
      body: (
        <div className="sl">
          <p className="eyebrow sl-in">And the awards go to…</p>
          <ul className="sl-awards">
            {s.awards.slice(0, 6).map((a, i) => (
              <li key={a.id} className={`sl-award sl-award--${a.p} sl-flip`} style={{ '--i': i + 1 } as React.CSSProperties}>
                <span className="sl-award__emoji" aria-hidden="true">
                  {a.emoji}
                </span>
                <span className="sl-award__title">{a.title}</span>
                <span className={`sl-award__who ${a.p}`}>{nm(a.p)}</span>
                <span className="faint sl-award__stat tnum">{a.stat}</span>
              </li>
            ))}
          </ul>
        </div>
      ),
    })
  }

  return slides
}

// -------------------------------------------------------- mini charts ---

function Clock({ values, peak }: { values: number[]; peak: number }) {
  const max = Math.max(...values, 1)
  const size = 300
  const c = size / 2
  const r0 = 70
  const r1 = 140
  return (
    <svg viewBox={`0 0 ${size} ${size}`} className="sl-clock" role="img" aria-label={`Messages by hour, peaking at ${fmtHour(peak)}`}>
      <defs>
        <linearGradient id="clockg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff7a59" />
          <stop offset="1" stopColor="#8c9bff" />
        </linearGradient>
      </defs>
      {values.map((v, h) => {
        const a = (h / 24) * Math.PI * 2 - Math.PI / 2
        const len = r0 + (r1 - r0) * (v / max)
        return (
          <line
            key={h}
            x1={c + Math.cos(a) * r0}
            y1={c + Math.sin(a) * r0}
            x2={c + Math.cos(a) * len}
            y2={c + Math.sin(a) * len}
            stroke={h === peak ? '#f2c46d' : 'url(#clockg)'}
            strokeWidth={h === peak ? 9 : 7}
            strokeLinecap="round"
            opacity={h === peak ? 1 : 0.45 + 0.55 * (v / max)}
            className="sl-clock__bar"
            style={{ '--i': h } as React.CSSProperties}
          />
        )
      })}
      {[0, 6, 12, 18].map((h) => {
        const a = (h / 24) * Math.PI * 2 - Math.PI / 2
        return (
          <text key={h} x={c + Math.cos(a) * (r0 - 18)} y={c + Math.sin(a) * (r0 - 18) + 4} textAnchor="middle" className="sl-clock__tick">
            {h === 0 ? '12a' : h === 12 ? '12p' : h < 12 ? `${h}a` : `${h - 12}p`}
          </text>
        )
      })}
    </svg>
  )
}

function HourBars({ values }: { values: number[] }) {
  const max = Math.max(...values, 1)
  return (
    <div className="sl-hours sl-in" style={{ '--i': 3 } as React.CSSProperties} role="img" aria-label="Messages per hour on your busiest day">
      {values.map((v, h) => (
        <span key={h} style={{ height: `${Math.max(3, (v / max) * 100)}%`, '--i': h } as React.CSSProperties} className={v ? '' : 'is-zero'} />
      ))}
    </div>
  )
}

function Converge({ data }: { data: number[] }) {
  const w = 320
  const h = 120
  const pts = data.map((v, i) => [(i / Math.max(1, data.length - 1)) * w, h - v * h] as const)
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)},${y.toFixed(1)}`).join(' ')
  return (
    <svg viewBox={`-6 -6 ${w + 12} ${h + 12}`} className="sl-converge sl-in" style={{ '--i': 2 } as React.CSSProperties} role="img" aria-label="Similarity rising over time">
      <defs>
        <linearGradient id="convg" x1="0" x2="1">
          <stop offset="0" stopColor="#ff7a59" />
          <stop offset="1" stopColor="#8c9bff" />
        </linearGradient>
      </defs>
      <line x1="0" x2={w} y1={h} y2={h} stroke="rgb(244 235 221 / .15)" />
      <path d={`${d} L${w},${h} L0,${h} Z`} fill="url(#convg)" opacity="0.15" />
      <path d={d} fill="none" stroke="url(#convg)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" className="sl-converge__line" pathLength={1} />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="6" fill="#8c9bff" />
    </svg>
  )
}
