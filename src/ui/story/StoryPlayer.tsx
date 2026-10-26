import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Story } from '../../analysis/story'
import type { HomeTab } from '../Home'
import { Icon, Orbs } from '../shared'
import { buildSlides, type SlideDef } from './slides'
import '../../styles/story.css'

interface Props {
  story: Story
  onExit: (tab?: HomeTab) => void
}

/**
 * Full-screen, tap-through story. Some beats ask the couple to predict
 * before revealing: the story is something you play, not just watch.
 * Controls: tap right / left, ←/→/Space, Esc to leave.
 */
export function StoryPlayer({ story, onExit }: Props) {
  const slides = useMemo(() => buildSlides(story), [story])
  const [i, setI] = useState(0)
  const [guesses, setGuesses] = useState<Record<string, number>>({})
  const stage = useRef<HTMLDivElement>(null)
  const total = slides.length + 1 // + outro
  const atOutro = i === slides.length
  const slide: SlideDef | undefined = slides[i]
  const awaiting = !!slide?.predict && guesses[slide.id] === undefined

  const next = useCallback(() => {
    if (!awaiting) setI((x) => Math.min(total - 1, x + 1))
  }, [total, awaiting])
  const prev = useCallback(() => setI((x) => Math.max(0, x - 1)), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.key === 'ArrowRight' || (e.key === ' ' && !(e.target instanceof HTMLButtonElement))) {
        e.preventDefault()
        next()
      } else if (e.key === 'ArrowLeft') prev()
      else if (e.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [next, prev, onExit])

  useEffect(() => {
    stage.current?.focus({ preventScroll: true })
  }, [i])

  const onStageClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest('button, a, input, label')) return
    const rect = e.currentTarget.getBoundingClientRect()
    if (e.clientX - rect.left < rect.width * 0.3) prev()
    else next()
  }

  const predictions = slides.filter((s) => s.predict && guesses[s.id] !== undefined)
  const correct = predictions.filter((s) => guesses[s.id] === s.predict!.answer).length
  const tone = atOutro ? 'blend' : (slide?.tone ?? 'blend')

  return (
    <div className={`player player--${tone}`} role="region" aria-roledescription="story" aria-label={`${story.people[0].name} and ${story.people[1].name}: your story`}>
      <Orbs intensity={tone === 'night' ? 0.6 : 1} />
      <div className="player__progress" aria-hidden="true">
        {Array.from({ length: total }, (_, k) => (
          <span key={k} className={k < i ? 'is-done' : k === i ? 'is-now' : ''} />
        ))}
      </div>
      <div className="player__top">
        {story.demo && <span className="pill player__demo">Demo · fictional couple</span>}
        <button className="icon-btn" onClick={() => onExit()} aria-label="Close story">
          <Icon.close />
        </button>
      </div>

      <div ref={stage} className="player__stage" tabIndex={-1} onClick={onStageClick}>
        <div className="player__slide" key={i} aria-live="polite">
          {atOutro ? (
            <Outro story={story} correct={correct} asked={predictions.length} onExit={onExit} onReplay={() => setI(0)} />
          ) : awaiting ? (
            <Predict
              prompt={slide!.predict!.prompt}
              options={slide!.predict!.options}
              onPick={(k) => setGuesses((g) => ({ ...g, [slide!.id]: k }))}
              onSkip={() => setGuesses((g) => ({ ...g, [slide!.id]: -1 }))}
            />
          ) : (
            <>
              {slide!.predict && guesses[slide!.id] !== undefined && guesses[slide!.id] >= 0 && (
                <Verdict right={guesses[slide!.id] === slide!.predict.answer} answer={slide!.predict.options[slide!.predict.answer]} />
              )}
              {slide!.body}
            </>
          )}
        </div>
      </div>

      <div className="player__nav">
        <button className="icon-btn" onClick={prev} disabled={i === 0} aria-label="Previous">
          <Icon.arrowLeft />
        </button>
        <span className="faint tnum player__count" aria-live="polite">
          {i + 1} / {total}
        </span>
        <button className="icon-btn" onClick={next} disabled={atOutro || awaiting} aria-label="Next">
          <Icon.arrowRight />
        </button>
      </div>
    </div>
  )
}

function Predict({ prompt, options, onPick, onSkip }: { prompt: string; options: string[]; onPick: (k: number) => void; onSkip: () => void }) {
  const two = options.length === 2
  return (
    <div className="sl sl--center predict">
      <p className="eyebrow sl-in">Call it first</p>
      <h2 className="display sl-big sl-in" style={{ '--i': 1 } as React.CSSProperties}>
        {prompt}
      </h2>
      <div className={`predict__options ${two ? 'predict__options--two' : ''}`}>
        {options.map((o, k) => (
          <button
            key={o + k}
            className={`predict__opt sl-in ${two ? (k === 0 ? 'predict__opt--a' : 'predict__opt--b') : ''}`}
            style={{ '--i': k + 2 } as React.CSSProperties}
            onClick={() => onPick(k)}
          >
            {o}
          </button>
        ))}
      </div>
      <button className="linkish sl-in" style={{ '--i': 5 } as React.CSSProperties} onClick={onSkip}>
        Skip the guess
      </button>
    </div>
  )
}

function Verdict({ right, answer }: { right: boolean; answer: string }) {
  return (
    <p className={`verdict ${right ? 'verdict--right' : 'verdict--wrong'}`} role="status">
      {right ? (
        <>
          <Icon.check /> You called it
        </>
      ) : (
        <>Not quite. It’s {answer}.</>
      )}
    </p>
  )
}

function Outro({ story, correct, asked, onExit, onReplay }: { story: Story; correct: number; asked: number; onExit: (t?: HomeTab) => void; onReplay: () => void }) {
  const [a, b] = story.people.map((p) => p.name)
  return (
    <div className="sl sl--center outro">
      <p className="eyebrow sl-in">That’s your duet</p>
      <h2 className="display sl-names sl-in" style={{ '--i': 1 } as React.CSSProperties}>
        <span className="a">{a}</span> <em className="sl-amp">&amp;</em> <span className="b">{b}</span>
      </h2>
      {asked > 0 && (
        <p className="sl-lede sl-in" style={{ '--i': 2 } as React.CSSProperties}>
          You called <strong className="tnum">{correct}</strong> of {asked} guesses
          {correct === asked ? '. Flawless.' : correct / asked >= 0.6 ? '. You know your chat.' : '. Plenty left to discover.'}
        </p>
      )}
      <div className="outro__actions sl-in" style={{ '--i': 3 } as React.CSSProperties}>
        <button className="btn btn--blend" onClick={() => onExit('almanac')}>
          Explore the almanac <Icon.arrowRight />
        </button>
        <button className="btn btn--ghost" onClick={() => onExit('play')}>
          Play the quiz together
        </button>
        <button className="btn btn--ghost" onClick={() => onExit('keepsakes')}>
          Make a keepsake
        </button>
        <button className="linkish" onClick={onReplay}>
          Replay the story
        </button>
      </div>
    </div>
  )
}
