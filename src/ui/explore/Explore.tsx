import { useEffect, useState, type MouseEvent } from 'react'
import '../../styles/explore.css'
import type { Story } from '../../analysis/story'
import { fmtShortDate } from '../../analysis/format'
import { Overview } from './Overview'
import { Timeline } from './Timeline'
import { Rhythms } from './Rhythms'
import { Language } from './Language'
import { About, Awards } from './Awards'
import { nameOf } from './kit'

const SECTIONS = [
  { id: 'overview', label: 'Overview' },
  { id: 'timeline', label: 'Timeline' },
  { id: 'rhythms', label: 'Rhythms' },
  { id: 'language', label: 'Language' },
  { id: 'awards', label: 'Awards' },
  { id: 'about', label: 'About' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

/** Highlights the section currently under the sticky nav. */
function useScrollSpy(ids: readonly string[]): string {
  const [current, setCurrent] = useState<string>(ids[0])
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Map<string, number>()
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) visible.set(e.target.id, e.isIntersecting ? e.boundingClientRect.top : Infinity)
        let best: string | null = null
        let bestTop = Infinity
        for (const id of ids) {
          const top = visible.get(id) ?? Infinity
          if (top !== Infinity && (best === null || Math.abs(top) < Math.abs(bestTop))) {
            best = id
            bestTop = top
          }
        }
        if (best) setCurrent(best)
      },
      { rootMargin: '-30% 0px -60% 0px' },
    )
    for (const id of ids) {
      const el = document.getElementById(id)
      if (el) io.observe(el)
    }
    return () => io.disconnect()
  }, [ids])
  return current
}

export function Explore(props: { story: Story; hiddenWords: string[]; onHideWord: (w: string) => void }) {
  const { story, hiddenWords, onHideWord } = props
  const ids = SECTIONS.filter((s) => s.id !== 'awards' || story.awards.length).map((s) => s.id)
  const [stableIds] = useState(() => ids)
  const current = useScrollSpy(stableIds)

  const jump = (e: MouseEvent<HTMLAnchorElement>, id: SectionId) => {
    const el = document.getElementById(id)
    if (!el) return
    e.preventDefault()
    el.scrollIntoView({ block: 'start' })
    const heading = document.getElementById(`${id}-title`)
    if (heading) {
      heading.setAttribute('tabindex', '-1')
      heading.focus({ preventScroll: true })
    }
    if (typeof history !== 'undefined') history.replaceState(null, '', `#${id}`)
  }

  return (
    <div className="ex">
      {story.demo && (
        <p className="ex-demo" role="note">
          <span className="ex-demo__tag">Demo</span> Maya &amp; Theo are fictional; generated data run through the real pipeline.
        </p>
      )}

      <header className="ex-masthead wrap">
        <p className="eyebrow">The Almanac · {fmtShortDate(story.range.first)} – {fmtShortDate(story.range.last)}</p>
        <h1 className="display ex-h1">
          <span className="a">{nameOf(story, 'a')}</span> <em className="ex-amp">&amp;</em> <span className="b">{nameOf(story, 'b')}</span>
        </h1>
        <p className="ex-masthead__sub">Everything in your story, laid out to explore at your own pace.</p>
      </header>

      <nav className="ex-nav" aria-label="Almanac sections">
        <ul className="ex-nav__list wrap">
          {SECTIONS.filter((s) => ids.includes(s.id)).map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} aria-current={current === s.id ? 'location' : undefined} onClick={(e) => jump(e, s.id)}>
                <span className="ex-nav__num" aria-hidden="true">
                  {['I', 'II', 'III', 'IV', 'V', 'VI'][i]}
                </span>
                {s.label}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <main className="ex-main wrap">
        <Overview story={story} />
        <Timeline story={story} hiddenWords={hiddenWords} />
        <Rhythms story={story} />
        <Language story={story} hiddenWords={hiddenWords} onHideWord={onHideWord} />
        <Awards story={story} />
        <About story={story} />
      </main>
    </div>
  )
}
