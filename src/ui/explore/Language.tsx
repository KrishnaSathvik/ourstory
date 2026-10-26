import { useEffect, useMemo, useRef, useState } from 'react'
import type { Pair, Story, WordStat } from '../../analysis/story'
import type { PersonId } from '../../core/types'
import { fmtNum, plural } from '../../analysis/format'
import { Icon } from '../shared'
import { ConvergenceChart } from './charts'
import { MiniSplit, PairFigures, Reveal, SectionHead, blendColor, leader, nameOf, pick } from './kit'

const PHRASES: { key: keyof Story['lexicon']; label: string }[] = [
  { key: 'love', label: 'love you' },
  { key: 'miss', label: 'miss you' },
  { key: 'goodnight', label: 'goodnight' },
  { key: 'goodmorning', label: 'good morning' },
  { key: 'sorry', label: 'sorry' },
  { key: 'thanks', label: 'thank you' },
]

const STYLE_ROWS: { key: keyof Story['style']; label: string; decimals?: boolean }[] = [
  { key: 'avgWords', label: 'Words per message, on average', decimals: true },
  { key: 'questions', label: 'Messages with a question mark' },
  { key: 'exclamations', label: 'Messages with an exclamation mark' },
  { key: 'capsMessages', label: 'Messages in ALL CAPS' },
  { key: 'laughs', label: 'Laughs (haha, lol, 😂 …)' },
]

export function Language({ story, hiddenWords, onHideWord }: { story: Story; hiddenWords: string[]; onHideWord: (w: string) => void }) {
  const nameA = nameOf(story, 'a')
  const nameB = nameOf(story, 'b')
  const hidden = useMemo(() => new Set(hiddenWords.map((w) => w.toLowerCase())), [hiddenWords])
  const visible = (w: string) => !hidden.has(w.toLowerCase())
  const emojiTop = story.emoji.top.filter((e) => visible(e.w)).slice(0, 12)
  const conv = story.convergence
  const lastConv = conv.length ? conv[conv.length - 1] : null

  return (
    <section id="language" aria-labelledby="language-title" className="ex-section">
      <SectionHead
        id="language"
        eyebrow="IV · Language"
        title={
          <>
            How you <em>sound</em>
          </>
        }
        lede="Counts of a few fixed phrases, a little punctuation, and your emoji. Nothing here quotes a message."
      />

      <Reveal as="h3" className="display ex-h3 ex-subhead">
        The little phrases
      </Reveal>
      <ul className="ex-phrases">
        {PHRASES.map(({ key, label }, i) => {
          const v = story.lexicon[key]
          const total = v[0] + v[1]
          return (
            <Reveal as="li" key={key} delay={i} className="ex-phrase">
              <p className="display ex-phrase__label">“{label}”</p>
              <p className="ex-phrase__total tnum">{plural(total, 'time')}</p>
              <MiniSplit values={v} label={`${nameA} ${fmtNum(v[0])}, ${nameB} ${fmtNum(v[1])}`} />
              <PairFigures story={story} values={v} />
            </Reveal>
          )
        })}
      </ul>

      <Reveal className="ex-panel">
        <h3 className="display ex-h3">Style</h3>
        <table className="ex-style">
          <caption className="sr-only">Writing style, per person</caption>
          <thead>
            <tr>
              <th scope="col">
                <span className="sr-only">Measure</span>
              </th>
              <th scope="col" className="a">
                {nameA}
              </th>
              <th scope="col" aria-hidden="true" />
              <th scope="col" className="b">
                {nameB}
              </th>
            </tr>
          </thead>
          <tbody>
            {STYLE_ROWS.map(({ key, label, decimals }) => {
              const v: Pair = story.style[key]
              const f = (n: number) => (decimals ? n.toFixed(1) : fmtNum(n))
              const max = Math.max(v[0], v[1]) || 1
              return (
                <tr key={key}>
                  <th scope="row">{label}</th>
                  <td className="tnum ex-style__a">{f(v[0])}</td>
                  <td className="ex-style__bars" aria-hidden="true">
                    <span className="ex-style__bar ex-style__bar--a" style={{ width: `${(v[0] / max) * 50}%` }} />
                    <span className="ex-style__bar ex-style__bar--b" style={{ width: `${(v[1] / max) * 50}%` }} />
                  </td>
                  <td className="tnum ex-style__b">{f(v[1])}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </Reveal>

      <Reveal as="h3" className="display ex-h3 ex-subhead">
        Emoji
      </Reveal>
      <div className="ex-split2">
        <Reveal className="ex-panel">
          <p className="eyebrow">Most used</p>
          {emojiTop.length ? (
            <ul className="ex-emoji">
              {emojiTop.map((e, i) => (
                <EmojiTile key={e.w} e={e} story={story} delay={i} />
              ))}
            </ul>
          ) : (
            <p className="faint">No emoji in these exports.</p>
          )}
        </Reveal>
        <div className="stack">
          <Reveal className="ex-panel" delay={1}>
            <p className="eyebrow">Signature emoji</p>
            <p className="ex-small faint">The emoji each of you uses noticeably more than the other does.</p>
            <div className="ex-sig">
              {(['a', 'b'] as const).map((p) => {
                const e = pick(story.emoji.signature, p)
                return (
                  <div key={p} className={`ex-sig__item ex-sig__item--${p}`}>
                    <span className="ex-sig__emoji" aria-hidden="true">
                      {e && visible(e) ? e : '—'}
                    </span>
                    <span className={p}>{nameOf(story, p)}</span>
                    <span className="sr-only">{e && visible(e) ? `: ${e}` : ': none'}</span>
                    <span className="faint ex-small tnum">{plural(pick(story.emoji.distinct, p), 'different emoji', 'different emoji')}</span>
                  </div>
                )
              })}
            </div>
          </Reveal>
          {story.emoji.reactions.length > 0 && (
            <Reveal className="ex-panel" delay={2}>
              <p className="eyebrow">Reactions</p>
              <ul className="ex-reactions">
                {story.emoji.reactions
                  .filter((r) => visible(r.e))
                  .slice(0, 8)
                  .map((r) => (
                    <li key={r.e}>
                      <span aria-hidden="true">{r.e}</span>
                      <span className="sr-only">{r.e}</span>
                      <span className="tnum faint">×{fmtNum(r.n)}</span>
                    </li>
                  ))}
              </ul>
              <p className="ex-small faint">
                Reactions given: <PairFigures story={story} values={story.totals.reactionsGiven} />
              </p>
            </Reveal>
          )}
        </div>
      </div>

      <Reveal className="ex-panel ex-panel--bleed">
        <p className="eyebrow">Speaking the same language</p>
        <h3 className="display ex-h3">
          {lastConv ? (
            <>
              Latest quarter: your word choice is <em>{Math.round(lastConv.words * 100)}</em> / 100 alike
            </>
          ) : (
            'How alike your vocabularies are'
          )}
        </h3>
        <p className="ex-prose ex-small faint">
          For each quarter where you both sent at least 30 messages, we compare how often each of you uses each word (and each emoji) and score the overlap
          from 0 (no words in common) to 100 (identical mix) — a cosine similarity. It measures shared vocabulary, not agreement or feeling.
        </p>
        <ConvergenceChart story={story} />
      </Reveal>

      <Words story={story} visible={visible} onHideWord={onHideWord} />
    </section>
  )
}

function EmojiTile({ e, story, delay }: { e: WordStat; story: Story; delay: number }) {
  const total = e.a + e.b
  const l = leader([e.a, e.b])
  return (
    <Reveal as="li" delay={delay} className="ex-emoji__tile">
      <span className="ex-emoji__glyph" aria-hidden="true">
        {e.w}
      </span>
      <span className="sr-only">
        {e.w}: {nameOf(story, 'a')} {fmtNum(e.a)}, {nameOf(story, 'b')} {fmtNum(e.b)}
      </span>
      <span className="ex-emoji__n tnum" aria-hidden="true">
        {fmtNum(total)}
      </span>
      <span className="ex-emoji__bar" aria-hidden="true" style={{ background: `linear-gradient(90deg, var(--a) ${(e.a / (total || 1)) * 100}%, var(--b) 0)` }} />
      {l && (
        <span className={`ex-emoji__who ${l}`} aria-hidden="true">
          {Math.round((pick([e.a, e.b], l) / (total || 1)) * 100)}% {nameOf(story, l)}
        </span>
      )}
    </Reveal>
  )
}

/* ------------------------------------------------------------- words --- */

function HideButton({ w, onHide }: { w: string; onHide: (w: string) => void }) {
  return (
    <button type="button" className="ex-hide" onClick={() => onHide(w)} aria-label={`Hide the word “${w}” everywhere`} title="Hide this word">
      <Icon.eyeOff />
    </button>
  )
}

function Words({ story, visible, onHideWord }: { story: Story; visible: (w: string) => boolean; onHideWord: (w: string) => void }) {
  const [open, setOpen] = useState(false)
  const bodyRef = useRef<HTMLDivElement>(null)
  const revealBtn = useRef<HTMLButtonElement>(null)
  const touched = useRef(false)
  useEffect(() => {
    if (!touched.current) return
    if (open) bodyRef.current?.focus()
    else revealBtn.current?.focus()
  }, [open])
  const toggle = (next: boolean) => {
    touched.current = true
    setOpen(next)
  }
  const shared = story.words.shared.filter((x) => visible(x.w))
  const max = Math.max(1, ...shared.map((x) => x.a + x.b))
  const min = Math.min(max, ...shared.map((x) => x.a + x.b))

  return (
    <div className="ex-words" id="words">
      <Reveal className="ex-panel ex-gate-wrap">
        <div className="ex-panel__head">
          <div>
            <p className="eyebrow">Your words</p>
            <h3 className="display ex-h3">The vocabulary you share</h3>
          </div>
          {open && (
            <button type="button" className="btn btn--ghost btn--small" onClick={() => toggle(false)}>
              <Icon.lock /> Cover again
            </button>
          )}
        </div>

        {!open ? (
          <div className="ex-gate">
            <span className="ex-gate__icon" aria-hidden="true">
              <Icon.lock />
            </span>
            <p>Word stats come straight from your vocabulary. Reveal when you’re somewhere private.</p>
            <button ref={revealBtn} type="button" className="btn btn--blend" onClick={() => toggle(true)}>
              Reveal words
            </button>
            <p className="ex-small faint">Only single words used often, on many days. Hide any word and it disappears everywhere.</p>
          </div>
        ) : (
          <div id="ex-words-body" className="ex-words__body" ref={bodyRef} tabIndex={-1} aria-label="Word statistics">
            <p className="ex-prose ex-small faint">
              Size = how often you both use it. Colour = who uses it more (<span className="a">{nameOf(story, 'a')}</span> →{' '}
              <span className="b">{nameOf(story, 'b')}</span>). Each of you used about {fmtNum(story.words.vocabulary[0])} and{' '}
              {fmtNum(story.words.vocabulary[1])} different words.
            </p>
            {shared.length ? (
              <ul className="ex-cloud" aria-label="Shared words">
                {shared.map((x) => {
                  const total = x.a + x.b
                  const t = max === min ? 0.5 : Math.sqrt((total - min) / (max - min))
                  return (
                    <li key={x.w} className="ex-cloud__word" style={{ fontSize: `${(1 + t * 2.1).toFixed(2)}em`, color: blendColor(x.a / total) }}>
                      <span className="ex-cloud__text">{x.w}</span>
                      <span className="ex-cloud__counts tnum">
                        <span className="sr-only">: </span>
                        <span className="a">{fmtNum(x.a)}</span>
                        <span aria-hidden="true">·</span>
                        <span className="sr-only"> and </span>
                        <span className="b">{fmtNum(x.b)}</span>
                      </span>
                      <HideButton w={x.w} onHide={onHideWord} />
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="faint">No shared words to show.</p>
            )}

            <div className="ex-distinct">
              {(['a', 'b'] as const).map((p) => (
                <Distinct key={p} story={story} p={p} visible={visible} onHideWord={onHideWord} />
              ))}
            </div>
          </div>
        )}
      </Reveal>
    </div>
  )
}

function Distinct({ story, p, visible, onHideWord }: { story: Story; p: PersonId; visible: (w: string) => boolean; onHideWord: (w: string) => void }) {
  const list = pick(story.words.distinctive, p).filter((x) => visible(x.w))
  const max = Math.max(1, ...list.map((x) => x.n))
  return (
    <div className={`ex-distinct__col ex-distinct__col--${p}`}>
      <h4 className="ex-distinct__title">
        More <span className={p}>{nameOf(story, p)}</span> than {nameOf(story, p === 'a' ? 'b' : 'a')}
      </h4>
      {list.length ? (
        <ol>
          {list.map((x) => (
            <li key={x.w}>
              <span className="ex-distinct__w">{x.w}</span>
              <span className="ex-distinct__bar" aria-hidden="true">
                <span style={{ width: `${(x.n / max) * 100}%` }} />
              </span>
              <span className="tnum faint">{fmtNum(x.n)}</span>
              <HideButton w={x.w} onHide={onHideWord} />
            </li>
          ))}
        </ol>
      ) : (
        <p className="faint">Nothing stands out.</p>
      )}
    </div>
  )
}
