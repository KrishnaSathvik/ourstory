import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { Story } from '../analysis/story'
import { Icon } from './shared'
import { Wordmark } from './Wordmark'
import { Quiz } from './play/Quiz'
import { PrivacyPanel } from './PrivacyPanel'

const loadExplore = () => import('./explore/Explore')
const loadKeepsakes = () => import('./keepsakes/Keepsakes')
const Explore = lazy(() => loadExplore().then((m) => ({ default: m.Explore })))
const Keepsakes = lazy(() => loadKeepsakes().then((m) => ({ default: m.Keepsakes })))

let preloaded = false
/** Start downloading the lazy views (idempotent). */
export function preloadViews() {
  if (preloaded) return
  preloaded = true
  void loadExplore().catch(() => (preloaded = false))
  void loadKeepsakes().catch(() => (preloaded = false))
}

/** Catches a failed lazy-chunk load (e.g. went offline before it downloaded). */
class ViewBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="wrap note" role="alert">
        <Icon.alert />
        <span>This part of Duet hadn’t finished downloading before you went offline. Reconnect for a moment and try again. Your story is still here.</span>
      </div>
    )
  }
}

export type HomeTab = 'almanac' | 'play' | 'keepsakes' | 'privacy'

const TABS: { id: HomeTab; label: string }[] = [
  { id: 'almanac', label: 'Almanac' },
  { id: 'play', label: 'Play' },
  { id: 'keepsakes', label: 'Keepsakes' },
  { id: 'privacy', label: 'Privacy' },
]

interface Props {
  story: Story
  tab: HomeTab
  onTab: (t: HomeTab) => void
  onReplay: () => void
  hiddenWords: string[]
  onHideWord: (w: string) => void
  onUnhideWord: (w: string) => void
  onForget: () => void
}

export function Home({ story, tab, onTab, onReplay, hiddenWords, onHideWord, onUnhideWord, onForget }: Props) {
  return (
    <div className="home" style={{ '--ex-nav-top': '64px' } as React.CSSProperties}>
      <header className="home__bar">
        <div className="wrap home__barinner">
          <Wordmark size={24} />
          <nav className="home__tabs" aria-label="Your story">
            {TABS.map((t) => (
              <button key={t.id} className="home__tab" aria-current={tab === t.id ? 'page' : undefined} onClick={() => onTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <button className="btn btn--small btn--ghost home__replay" onClick={onReplay}>
            <Icon.play /> <span>Replay story</span>
          </button>
        </div>
      </header>
      {story.demo && tab !== 'almanac' && <div className="demo-ribbon">Demo · Maya &amp; Theo are fictional</div>}
      <main className="home__main">
        <ViewBoundary key={tab}>
        <Suspense fallback={<div className="loading-screen" aria-label="Loading" />}>
          {tab === 'almanac' && <Explore story={story} hiddenWords={hiddenWords} onHideWord={onHideWord} />}
          {tab === 'play' && <Quiz story={story} />}
          {tab === 'keepsakes' && <Keepsakes story={story} hiddenWords={hiddenWords} />}
          {tab === 'privacy' && <PrivacyPanel story={story} hiddenWords={hiddenWords} onUnhideWord={onUnhideWord} onForget={onForget} />}
        </Suspense>
        </ViewBoundary>
      </main>
    </div>
  )
}
