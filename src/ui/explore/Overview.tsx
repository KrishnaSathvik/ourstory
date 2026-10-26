import type { Story } from '../../analysis/story'
import { PLATFORM_LABEL } from '../../core/types'
import { fmtCompact, fmtDuration, fmtNum, fmtShortDate, plural } from '../../analysis/format'
import { CountUp, PlatformMark, SplitBar, platformColor } from '../shared'
import { P, PairFigures, Reveal, SectionHead, Stat, leader, nameOf, pct, shareOf } from './kit'

export function Overview({ story }: { story: Story }) {
  const { totals, range, activity, fun } = story
  const words = totals.words[0] + totals.words[1]
  const top = leader(totals.byPerson)
  const extras = (
    [
      ['Photos, videos & files', totals.media],
      ['Voice notes', totals.voice],
      ['Stickers', totals.stickers],
      ['GIFs', totals.gifs],
      ['Links', totals.links],
      ['Calls logged', totals.calls],
      ['Reactions', totals.reactionsGiven],
    ] as const
  ).filter(([, v]) => v[0] + v[1] > 0)
  const maxSource = Math.max(1, ...story.sources.map((s) => s.messages))

  return (
    <section id="overview" aria-labelledby="overview-title" className="ex-section">
      <SectionHead
        id="overview"
        eyebrow="I · Overview"
        title={
          <>
            The <em>whole</em> of it
          </>
        }
        lede={
          <>
            From {fmtShortDate(range.first)} to {fmtShortDate(range.last)}, {plural(range.days, 'day')} of messages — and you wrote on{' '}
            {fmtNum(activity.activeDays)} of them.
          </>
        }
      />

      <div className="ex-stats">
        <Stat delay={0} value={<CountUp value={totals.messages} format={fmtCompact} />} label="messages" note={fmtNum(totals.messages)} />
        <Stat delay={1} value={<CountUp value={range.days} />} label="days, first to last" />
        <Stat
          delay={2}
          value={<CountUp value={activity.activeDays} />}
          label="days with at least one message"
          note={`${pct(range.days ? activity.activeDays / range.days : 0)} of all days`}
        />
        <Stat delay={3} value={<CountUp value={words} format={fmtCompact} />} label="words" note={<PairFigures story={story} values={totals.words} format={fmtCompact} />} />
        <Stat
          delay={4}
          value={<CountUp value={fun.novels} format={(n) => n.toFixed(1)} />}
          label="novels’ worth of words"
          note="At about 120,000 words per novel."
        />
        <Stat
          delay={5}
          value={
            <>
              ~<CountUp value={fun.typingHours} />
              <span className="ex-unit">h</span>
            </>
          }
          label="spent typing (estimate)"
          note="Assumes about 38 words per minute; real speeds vary."
        />
      </div>

      <Reveal className="ex-panel ex-who">
        <h3 className="display ex-h3">Who sent what</h3>
        <p className="ex-prose">
          {top ? (
            <>
              <P story={story} p={top} /> sent {pct(shareOf(totals.byPerson, top))} of the messages —{' '}
              {fmtNum(totals.byPerson[top === 'a' ? 0 : 1])} to {nameOf(story, top === 'a' ? 'b' : 'a')}’s{' '}
              {fmtNum(totals.byPerson[top === 'a' ? 1 : 0])}.
            </>
          ) : (
            <>An exact tie: {fmtNum(totals.byPerson[0])} messages each.</>
          )}
        </p>
        <SplitBar
          values={totals.byPerson}
          height={18}
          labels={[
            <span key="a">
              <span className="a">{nameOf(story, 'a')}</span> · {fmtNum(totals.byPerson[0])}
            </span>,
            <span key="b">
              {fmtNum(totals.byPerson[1])} · <span className="b">{nameOf(story, 'b')}</span>
            </span>,
          ]}
        />
        {extras.length > 0 && (
          <dl className="ex-extras">
            {extras.map(([label, v]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>
                  <PairFigures story={story} values={v} />
                </dd>
              </div>
            ))}
            {totals.callSeconds > 0 && (
              <div>
                <dt>Time on calls</dt>
                <dd className="tnum">{fmtDuration(totals.callSeconds * 1000)}</dd>
              </div>
            )}
          </dl>
        )}
      </Reveal>

      <Reveal className="ex-panel">
        <h3 className="display ex-h3">Where the messages came from</h3>
        <ul className="ex-sources">
          {story.sources.map((s, i) => (
            <Reveal as="li" key={s.platform} delay={i} className="ex-source">
              <PlatformMark platform={s.platform} size={30} />
              <div className="ex-source__body">
                <div className="ex-source__top">
                  <strong>{PLATFORM_LABEL[s.platform]}</strong>
                  <span className="tnum">{plural(s.messages, 'message')}</span>
                </div>
                <div className="ex-source__bar" aria-hidden="true">
                  <span style={{ width: `${(s.messages / maxSource) * 100}%`, background: platformColor(s.platform) }} />
                </div>
                <div className="ex-source__meta faint">
                  {fmtShortDate(s.first)} – {fmtShortDate(s.last)} · <PairFigures story={story} values={s.byPerson} />
                </div>
              </div>
            </Reveal>
          ))}
        </ul>
      </Reveal>
    </section>
  )
}
