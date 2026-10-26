import type { Story } from '../../analysis/story'
import { PLATFORM_LABEL } from '../../core/types'
import { monthStart } from '../../core/time'
import { fmtDate, fmtMonth, fmtNum, fmtShortDate } from '../../analysis/format'
import { PlatformMark, SplitBar } from '../shared'
import { Barcode, MonthlyChart } from './charts'
import { Reveal, SectionHead, blendColor, nameOf } from './kit'

export function Timeline({ story, hiddenWords }: { story: Story; hiddenWords: string[] }) {
  const hidden = new Set(hiddenWords.map((w) => w.toLowerCase()))
  return (
    <section id="timeline" aria-labelledby="timeline-title" className="ex-section">
      <SectionHead
        id="timeline"
        eyebrow="II · Timeline"
        title={
          <>
            Month by month, <em>day by day</em>
          </>
        }
        lede="Every bar is real volume from your exports. Hover, tap or use the arrow keys to read a month."
      />

      <Reveal className="ex-panel ex-panel--bleed">
        <h3 className="display ex-h3">Messages per month</h3>
        <MonthlyChart story={story} />
      </Reveal>

      <Reveal className="ex-panel ex-panel--bleed">
        <h3 className="display ex-h3">Every single day</h3>
        <p className="ex-prose faint">
          {fmtNum(story.activity.dailyA.length)} thin lines, one per day. Gaps are days with nothing in these exports.
        </p>
        <Barcode story={story} />
      </Reveal>

      {story.chapters.length > 0 && (
        <>
          <Reveal as="h3" className="display ex-h3 ex-subhead">
            Chapters
          </Reveal>
          <ol className="ex-chapters">
            {story.chapters.map((c, i) => {
              const share = c.byPerson[0] + c.byPerson[1] ? c.byPerson[0] / (c.byPerson[0] + c.byPerson[1]) : 0.5
              return (
                <Reveal as="li" key={c.label + c.start} delay={i} className="ex-chapter" style={{ ['--tint' as string]: blendColor(share, 0.18) }}>
                  <div className="ex-chapter__num display" aria-hidden="true">
                    {String(i + 1).padStart(2, '0')}
                  </div>
                  <p className="eyebrow">{c.label}</p>
                  <h4 className="display ex-chapter__theme">{c.theme}</h4>
                  <p className="ex-chapter__detail">{c.themeDetail}</p>
                  <div className="ex-chapter__foot">
                    <span className="tnum">
                      <strong>{fmtNum(c.messages)}</strong> messages
                    </span>
                    {c.topEmoji && !hidden.has(c.topEmoji.toLowerCase()) && (
                      <span className="ex-chapter__emoji" title="Most used emoji">
                        <span aria-hidden="true">{c.topEmoji}</span>
                        <span className="sr-only">Most used emoji: {c.topEmoji}</span>
                      </span>
                    )}
                    {c.platform && (
                      <span className="row" style={{ ['--gap' as string]: '6px' }}>
                        <PlatformMark platform={c.platform} size={18} />
                        <span className="faint">{PLATFORM_LABEL[c.platform]}</span>
                      </span>
                    )}
                    {c.peakMonth != null && <span className="faint">Peak: {fmtMonth(monthStart(c.peakMonth))}</span>}
                  </div>
                  <SplitBar
                    values={c.byPerson}
                    height={6}
                    labels={[
                      <span key="a" className="a">
                        {nameOf(story, 'a')} {fmtNum(c.byPerson[0])}
                      </span>,
                      <span key="b" className="b">
                        {fmtNum(c.byPerson[1])} {nameOf(story, 'b')}
                      </span>,
                    ]}
                  />
                </Reveal>
              )
            })}
          </ol>
        </>
      )}

      {story.milestones.length > 0 && (
        <>
          <Reveal as="h3" className="display ex-h3 ex-subhead">
            Milestones
          </Reveal>
          <ol className="ex-milestones">
            {story.milestones.map((m, i) => (
              <Reveal as="li" key={`${m.kind}-${m.t}-${i}`} delay={i % 4} className={`ex-milestone ${m.p ? `ex-milestone--${m.p}` : ''}`}>
                <time dateTime={new Date(m.t).toISOString().slice(0, 10)} className="ex-milestone__date tnum" title={fmtDate(m.t)}>
                  {fmtShortDate(m.t)}
                </time>
                <div className="ex-milestone__body">
                  <h4 className="ex-milestone__title">
                    {m.title}
                    {m.platform && (
                      <span className="ex-milestone__platform">
                        <PlatformMark platform={m.platform} size={16} />
                        <span className="sr-only">{PLATFORM_LABEL[m.platform]}</span>
                      </span>
                    )}
                  </h4>
                  <p className="faint">{m.detail}</p>
                </div>
              </Reveal>
            ))}
          </ol>
        </>
      )}
    </section>
  )
}
