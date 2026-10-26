import { useState, type ReactNode } from 'react'
import type { Pair, Story } from '../../analysis/story'
import { DAY } from '../../core/time'
import { WEEKDAYS, fmtDate, fmtDuration, fmtHour, fmtNum, fmtShortDate, plural } from '../../analysis/format'
import { Heatmap, HourBars, RadialClock, type Who } from './charts'
import { MiniSplit, P, PairFigures, Reveal, SectionHead, leader, nameOf, other, pct, pick, shareOf } from './kit'

function Fact({ eyebrow, children, values, story, delay }: { eyebrow: string; children: ReactNode; values?: Pair; story: Story; delay: number }) {
  return (
    <Reveal className="ex-fact" delay={delay}>
      <p className="eyebrow">{eyebrow}</p>
      <p className="ex-fact__text">{children}</p>
      {values && (
        <div className="ex-fact__foot">
          <MiniSplit values={values} label={`${nameOf(story, 'a')} ${fmtNum(values[0])}, ${nameOf(story, 'b')} ${fmtNum(values[1])}`} />
          <PairFigures story={story} values={values} />
        </div>
      )}
    </Reveal>
  )
}

/** "<lead> started 60% of 1,472 conversations" style sentence for a count pair. */
function shareSentence(story: Story, values: Pair, verb: ReactNode, of: ReactNode) {
  const lead = leader(values)
  if (!lead) return <>You split it evenly: {fmtNum(values[0])} each.</>
  return (
    <>
      <P story={story} p={lead} /> {verb} {pct(shareOf(values, lead))} {of}.
    </>
  )
}

export function Rhythms({ story }: { story: Story }) {
  const [who, setWho] = useState<Who>('both')
  const { activity: act, rhythm } = story
  const nameA = nameOf(story, 'a')
  const nameB = nameOf(story, 'b')

  const [ra, rb] = rhythm.medianReply
  const replyKnown = ra >= 0 && rb >= 0
  const faster = replyKnown ? (ra === rb ? null : ra < rb ? 'a' : 'b') : null

  const busiestT = act.busiestDay.day * DAY
  const gap = act.longestGap

  return (
    <section id="rhythms" aria-labelledby="rhythms-title" className="ex-section">
      <SectionHead
        id="rhythms"
        eyebrow="III · Rhythms"
        title={
          <>
            When you <em>talk</em>
          </>
        }
        lede={
          <>
            Busiest hour: <strong>{fmtHour(act.peakHour)}</strong>. Busiest day of the week: <strong>{WEEKDAYS[act.peakWeekday]}</strong>.
          </>
        }
      />

      <div className="ex-split2">
        <Reveal className="ex-panel">
          <div className="ex-panel__head">
            <h3 className="display ex-h3">The week, hour by hour</h3>
            <div className="seg" role="group" aria-label="Whose messages to show">
              {(
                [
                  ['both', 'Both', null],
                  ['a', nameA, 'dot--a'],
                  ['b', nameB, 'dot--b'],
                ] as const
              ).map(([k, label, dot]) => (
                <button key={k} type="button" aria-pressed={who === k} onClick={() => setWho(k)}>
                  {dot && <span className={`dot ${dot}`} aria-hidden="true" />}
                  {label}
                </button>
              ))}
            </div>
          </div>
          <Heatmap story={story} who={who} />
        </Reveal>

        <Reveal className="ex-panel ex-panel--center" delay={1}>
          <h3 className="display ex-h3">Around the clock</h3>
          <RadialClock story={story} />
          <p className="ex-prose ex-small">
            <span className="a">{pct(act.nightShare[0])}</span> of {nameA}’s messages and <span className="b">{pct(act.nightShare[1])}</span> of{' '}
            {nameB}’s are sent between midnight and 5 am; <span className="a">{pct(act.morningShare[0])}</span> and{' '}
            <span className="b">{pct(act.morningShare[1])}</span> between 5 and 9 am.
          </p>
        </Reveal>
      </div>

      <Reveal className="ex-pullquote display">
        {replyKnown ? (
          faster ? (
            <>
              <span className={faster}>{nameOf(story, faster)}</span> replies in a typical <em>{fmtDuration(pick(rhythm.medianReply, faster))}</em>;{' '}
              <span className={other(faster)}>{nameOf(story, other(faster))}</span> takes <em>{fmtDuration(pick(rhythm.medianReply, other(faster)))}</em>.
            </>
          ) : (
            <>
              You both reply in a typical <em>{fmtDuration(ra)}</em>.
            </>
          )
        ) : (
          <>Reply times couldn’t be measured from these exports.</>
        )}
        {replyKnown && (
          <span className="ex-pullquote__note">
            Median time to answer within a conversation. Within a minute: {nameA} {pct(rhythm.replyUnderMinute[0])}, {nameB}{' '}
            {pct(rhythm.replyUnderMinute[1])} of replies.
          </span>
        )}
      </Reveal>

      <div className="ex-facts">
        <Fact story={story} delay={0} eyebrow="Conversation starters" values={rhythm.initiations}>
          {shareSentence(story, rhythm.initiations, 'started', <>of {fmtNum(rhythm.conversations)} conversations</>)}
        </Fact>
        <Fact story={story} delay={1} eyebrow="The last word" values={rhythm.lastWord}>
          {shareSentence(story, rhythm.lastWord, 'had the last word in', 'of them')}
        </Fact>
        <Fact story={story} delay={2} eyebrow="Double texts" values={rhythm.doubleTexts}>
          {(() => {
            const l = leader(rhythm.doubleTexts)
            return l ? (
              <>
                <P story={story} p={l} /> double-texted {plural(pick(rhythm.doubleTexts, l), 'time')}; {nameOf(story, other(l))},{' '}
                {fmtNum(pick(rhythm.doubleTexts, other(l)))}.
              </>
            ) : (
              <>{plural(rhythm.doubleTexts[0], 'double text')} each.</>
            )
          })()}
        </Fact>
        <Fact story={story} delay={3} eyebrow="First message of the day" values={rhythm.firstOfDay}>
          {shareSentence(story, rhythm.firstOfDay, 'opened', 'of active days')}
        </Fact>
        <Fact story={story} delay={4} eyebrow="Last message of the day" values={rhythm.lastOfDay}>
          {shareSentence(story, rhythm.lastOfDay, 'closed', 'of active days')}
        </Fact>
        <Fact story={story} delay={5} eyebrow="Longest monologue">
          {rhythm.longestMonologue.count > 1 ? (
            <>
              <P story={story} p={rhythm.longestMonologue.p} /> once sent <strong>{fmtNum(rhythm.longestMonologue.count)}</strong> messages in a row, on{' '}
              {fmtDate(rhythm.longestMonologue.t)}.
            </>
          ) : (
            <>No long monologues — you take turns.</>
          )}
        </Fact>
        <Fact story={story} delay={6} eyebrow="Jinx">
          {rhythm.jinx > 0 ? (
            <>
              <strong>{plural(rhythm.jinx, 'time')}</strong>, you both sent the exact same short message within a minute of each other.
            </>
          ) : (
            <>No jinxes yet — never the same message within the same minute.</>
          )}
        </Fact>
      </div>

      <div className="ex-split2">
        <Reveal className="ex-panel">
          <p className="eyebrow">Busiest day</p>
          <h3 className="display ex-h3">{fmtDate(busiestT)}</h3>
          <p className="ex-prose">
            <strong className="tnum">{fmtNum(act.busiestDay.count)}</strong> messages in one day — {nameA} {fmtNum(act.busiestDay.byPerson[0])}, {nameB}{' '}
            {fmtNum(act.busiestDay.byPerson[1])}.
          </p>
          <HourBars hourly={act.busiestDay.hourly} label={`Messages per hour on ${fmtDate(busiestT)}`} />
        </Reveal>
        <Reveal className="ex-panel" delay={1}>
          <p className="eyebrow">Streaks &amp; silences</p>
          <div className="ex-streak">
            <div>
              <div className="display ex-big tnum">{fmtNum(act.longestStreak.days)}</div>
              <p>
                days in a row with at least one message
                {act.longestStreak.days > 0 && (
                  <span className="faint">
                    {' '}
                    · {fmtShortDate(act.longestStreak.start)} – {fmtShortDate(act.longestStreak.end)}
                  </span>
                )}
              </p>
            </div>
            <div>
              <div className="display ex-big tnum">{gap ? fmtNum(gap.days) : '0'}</div>
              <p>
                {gap ? (
                  <>
                    quiet days in a row, the longest gap
                    <span className="faint">
                      {' '}
                      · after {fmtShortDate(gap.start)}, until {fmtShortDate(gap.end)}
                    </span>
                  </>
                ) : (
                  'days of silence — never a full day without a message'
                )}
              </p>
            </div>
          </div>
          <p className="ex-small faint">Quiet stretches only mean nothing appears in these exports; you may have talked elsewhere, or in person.</p>
        </Reveal>
      </div>
    </section>
  )
}
