import type { Story } from '../../analysis/story'
import { fmtDate, fmtNum, fmtShortDate, plural } from '../../analysis/format'
import { PLATFORM_LABEL } from '../../core/types'
import { Reveal, SectionHead, nameOf } from './kit'

export function Awards({ story }: { story: Story }) {
  if (!story.awards.length) return null
  return (
    <section id="awards" aria-labelledby="awards-title" className="ex-section">
      <SectionHead
        id="awards"
        eyebrow="V · Awards"
        title={
          <>
            The <em>superlatives</em>
          </>
        }
        lede="Each one is decided by a count in your data — no judges, no opinions."
      />
      <ul className="ex-awards">
        {story.awards.map((a, i) => (
          <Reveal as="li" key={a.id} delay={i} className={`ex-award ex-award--${a.p}`}>
            <span className="ex-award__emoji" aria-hidden="true">
              {a.emoji}
            </span>
            <p className="eyebrow">
              Awarded to <span className={a.p}>{nameOf(story, a.p)}</span>
            </p>
            <h3 className="display ex-award__title">{a.title}</h3>
            <p className={`display ex-award__stat tnum ${a.p}`}>{a.stat}</p>
            <p className="ex-award__detail faint">{a.detail}</p>
          </Reveal>
        ))}
      </ul>
    </section>
  )
}

export function About({ story }: { story: Story }) {
  const q = story.quality
  return (
    <section id="about" aria-labelledby="about-title" className="ex-section ex-about">
      <SectionHead id="about" eyebrow="VI · About this data" title={<>Fine print</>} />
      <div className="ex-split2">
        <Reveal className="ex-panel">
          <dl className="ex-dl">
            <div>
              <dt>Covers</dt>
              <dd>
                {fmtDate(story.range.first)} – {fmtDate(story.range.last)}
              </dd>
            </div>
            <div>
              <dt>Conversations imported</dt>
              <dd className="tnum">{fmtNum(q.chats)}</dd>
            </div>
            <div>
              <dt>Apps</dt>
              <dd>{story.sources.map((s) => `${PLATFORM_LABEL[s.platform]} (${fmtShortDate(s.first)} – ${fmtShortDate(s.last)})`).join(', ')}</dd>
            </div>
            <div>
              <dt>Duplicates removed</dt>
              <dd className="tnum">{fmtNum(q.duplicatesRemoved)}</dd>
            </div>
            <div>
              <dt>Excluded messages</dt>
              <dd className="tnum">{fmtNum(q.excludedMessages)}</dd>
            </div>
            <div>
              <dt>Time zone</dt>
              <dd>{story.timeZone}</dd>
            </div>
            <div>
              <dt>Built</dt>
              <dd>{fmtDate(story.generatedAt)}</dd>
            </div>
          </dl>
        </Reveal>
        <Reveal className="ex-panel" delay={1}>
          <h3 className="display ex-h3">What these numbers can and can’t say</h3>
          <div className="stack ex-small">
            <p className="muted">
              These stats only cover the {plural(q.chats, 'export')} you imported. Quiet stretches may just mean the conversation happened somewhere else —
              another app, a phone call, the same room.
            </p>
            <p className="muted">
              Everything is counted in your browser. This page never shows message text — only totals, times, emoji and a few single words used often
              enough to pass a threshold.
            </p>
            {q.notes.length > 0 && (
              <ul className="ex-notes">
                {q.notes.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  )
}
