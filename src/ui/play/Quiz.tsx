import { useState } from 'react'
import type { QuizQuestion, Story } from '../../analysis/story'
import { Icon } from '../shared'
import '../../styles/play.css'

type Mode = 'solo' | 'duo'

const correctIndex = (q: QuizQuestion) => (q.answer.kind === 'person' ? (q.answer.p === 'a' ? 0 : 1) : q.answer.index)

/**
 * "How well do you know your chat?"
 * Solo: answer and see. Pass the phone: each player answers in secret,
 * then both answers are revealed together.
 */
export function Quiz({ story }: { story: Story }) {
  const [mode, setMode] = useState<Mode | null>(null)
  const qs = story.quiz
  if (!qs.length)
    return (
      <div className="wrap play">
        <p className="muted">There isn’t enough history yet for a quiz. Try adding more exports.</p>
      </div>
    )
  if (!mode) return <QuizIntro story={story} count={qs.length} onPick={setMode} />
  return <QuizRun key={mode} story={story} mode={mode} onDone={() => setMode(null)} />
}

function QuizIntro({ story, count, onPick }: { story: Story; count: number; onPick: (m: Mode) => void }) {
  const [a, b] = story.people.map((p) => p.name)
  return (
    <div className="wrap play play--intro">
      <p className="eyebrow">Play</p>
      <h1 className="display play__title">
        How well do you know <em>your chat?</em>
      </h1>
      <p className="muted play__lead">
        {count} questions, every answer measured from your messages. Settle who really texts first.
      </p>
      <div className="play__modes">
        <button className="mode card" onClick={() => onPick('duo')}>
          <span className="mode__art" aria-hidden="true">
            <span className="dot dot--a" />
            <span className="dot dot--b" />
          </span>
          <span className="display mode__title">Pass the phone</span>
          <span className="muted">
            <span className="a">{a}</span> and <span className="b">{b}</span> answer each question in secret, then reveal together. Scores at the end.
          </span>
          <span className="mode__go">
            Play together <Icon.arrowRight />
          </span>
        </button>
        <button className="mode card" onClick={() => onPick('solo')}>
          <span className="mode__art" aria-hidden="true">
            <span className="dot dot--a" />
          </span>
          <span className="display mode__title">On my own</span>
          <span className="muted">One player, instant answers. A good warm-up before the rematch.</span>
          <span className="mode__go">
            Start <Icon.arrowRight />
          </span>
        </button>
      </div>
    </div>
  )
}

function QuizRun({ story, mode, onDone }: { story: Story; mode: Mode; onDone: () => void }) {
  const qs = story.quiz
  const names = story.people.map((p) => p.name)
  const players = mode === 'duo' ? names : ['You']
  const [qi, setQi] = useState(0)
  const [turn, setTurn] = useState(0) // which player is answering
  const [handoff, setHandoff] = useState(mode === 'duo') // privacy screen between players
  const [answers, setAnswers] = useState<number[][]>(() => qs.map(() => []))
  const [revealed, setRevealed] = useState(false)

  const q = qs[qi]
  const right = correctIndex(q)
  const finished = qi >= qs.length

  if (finished) {
    const scores = players.map((_, p) => answers.filter((a, k) => a[p] === correctIndex(qs[k])).length)
    const best = Math.max(...scores)
    return (
      <div className="wrap play play--end">
        <p className="eyebrow">Final score</p>
        {mode === 'duo' ? (
          <>
            <h1 className="display play__title">
              {scores[0] === scores[1] ? (
                <>
                  A perfect <em>tie.</em>
                </>
              ) : (
                <>
                  <span className={scores[0] > scores[1] ? 'a' : 'b'}>{names[scores[0] > scores[1] ? 0 : 1]}</span> <em>wins.</em>
                </>
              )}
            </h1>
            <div className="scores">
              {players.map((p, k) => (
                <div key={p} className={`score score--${k ? 'b' : 'a'} ${scores[k] === best ? 'is-best' : ''}`}>
                  <span className="display score__n tnum">{scores[k]}</span>
                  <span className="muted">
                    {p} · of {qs.length}
                  </span>
                </div>
              ))}
            </div>
          </>
        ) : (
          <h1 className="display play__title">
            {scores[0]} <em>of {qs.length}.</em>
          </h1>
        )}
        <div className="row">
          <button className="btn btn--blend" onClick={onDone}>
            Play again
          </button>
        </div>
      </div>
    )
  }

  const choose = (k: number) => {
    setAnswers((all) => all.map((a, i) => (i === qi ? Object.assign([...a], { [turn]: k }) : a)))
    if (turn + 1 < players.length) {
      setTurn(turn + 1)
      setHandoff(true)
    } else setRevealed(true)
  }

  const advance = () => {
    setQi(qi + 1)
    setTurn(0)
    setRevealed(false)
    setHandoff(mode === 'duo')
  }

  if (handoff && !revealed) {
    const who = turn
    return (
      <div className="wrap play">
        <div className={`handoff handoff--${who ? 'b' : 'a'}`}>
          <p className="eyebrow">
            Question {qi + 1} of {qs.length}
          </p>
          <h2 className="display play__title">
            Pass to <span className={who ? 'b' : 'a'}>{names[who]}</span>
          </h2>
          <p className="muted">{who === 0 ? 'No peeking at the screen for the other one.' : `${names[0]} has answered in secret.`}</p>
          <button className="btn btn--blend" onClick={() => setHandoff(false)} autoFocus>
            I’m {names[who]}, show me
          </button>
        </div>
      </div>
    )
  }

  const mine = answers[qi]
  return (
    <div className="wrap play">
      <div className="qhead">
        <span className="eyebrow">
          Question {qi + 1} of {qs.length}
        </span>
        {mode === 'duo' && !revealed && (
          <span className={`pill qhead__who qhead__who--${turn ? 'b' : 'a'}`}>
            <span className={`dot dot--${turn ? 'b' : 'a'}`} /> {names[turn]} is answering
          </span>
        )}
      </div>
      <h2 className="display play__q">{q.prompt}</h2>
      <div className={`qopts ${q.options.length === 2 ? 'qopts--two' : ''}`} role="group" aria-label="Answers">
        {q.options.map((o, k) => {
          const pickedBy = revealed ? players.filter((_, p) => mine[p] === k) : []
          const cls = revealed ? (k === right ? 'is-right' : pickedBy.length ? 'is-wrong' : 'is-dim') : ''
          return (
            <button
              key={o + k}
              className={`qopt ${cls} ${q.options.length === 2 ? (k ? 'qopt--b' : 'qopt--a') : ''}`}
              disabled={revealed}
              onClick={() => choose(k)}
            >
              <span className="qopt__label">{o}</span>
              {revealed && pickedBy.length > 0 && (
                <span className="qopt__by">
                  {pickedBy.map((p) => (
                    <span key={p} className={`pill qopt__tag ${mode === 'duo' ? (p === names[0] ? 'qopt__tag--a' : 'qopt__tag--b') : ''}`}>
                      {p}
                    </span>
                  ))}
                </span>
              )}
              {revealed && k === right && <Icon.check />}
            </button>
          )
        })}
      </div>
      {revealed && (
        <div className="qreveal" role="status">
          <p className="qreveal__text">{q.reveal}</p>
          <button className="btn btn--blend" onClick={advance} autoFocus>
            {qi + 1 < qs.length ? 'Next question' : 'See the scores'} <Icon.arrowRight />
          </button>
        </div>
      )}
    </div>
  )
}
