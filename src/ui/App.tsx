import { useCallback, useEffect, useRef, useState } from 'react'
import type { IdentityMap } from '../core/types'
import type { Story } from '../analysis/story'
import type { InputFile } from '../importers'
import { AnalysisSession, type Imported } from '../worker/client'
import { defaultTimeZone } from '../core/time'
import { Landing } from './landing/Landing'
import { ImportScreen } from './import/ImportScreen'
import { ReviewScreen } from './import/ReviewScreen'
import { Building } from './import/Building'
import { StoryPlayer } from './story/StoryPlayer'
import { Home, preloadViews, type HomeTab } from './Home'

type Screen =
  | { name: 'landing' }
  | { name: 'import'; error?: string }
  | { name: 'reading' }
  | { name: 'review'; imported: Imported }
  | { name: 'building'; messages: number }
  | { name: 'story' }
  | { name: 'home'; tab: HomeTab }

export function App() {
  const [screen, setScreen] = useState<Screen>({ name: 'landing' })
  const [story, setStory] = useState<Story | null>(null)
  const [hiddenWords, setHiddenWords] = useState<string[]>([])
  const [progress, setProgress] = useState<{ done: number; total: number; current?: string } | null>(null)
  const [timeZone, setTimeZone] = useState(defaultTimeZone)
  const session = useRef<AnalysisSession | null>(null)
  const files = useRef<InputFile[]>([])

  const go = useCallback((s: Screen) => {
    setScreen(s)
    window.scrollTo({ top: 0 })
  }, [])

  const newSession = () => {
    session.current?.dispose()
    const s = new AnalysisSession()
    s.onProgress = (p) => setProgress({ done: p.done, total: p.total, current: p.current })
    session.current = s
    return s
  }

  // Fetch the lazy views while still online, so "airplane mode" works end to end.
  useEffect(() => {
    if (screen.name !== 'landing') preloadViews()
  }, [screen.name])

  // Dispose the worker (and any raw messages in it) on unload.
  useEffect(() => () => session.current?.dispose(), [])

  const startImport = async (inputs: InputFile[], tz = timeZone) => {
    files.current = inputs
    setProgress(null)
    go({ name: 'reading' })
    try {
      const s = session.current ?? newSession()
      const imported = await s.import(inputs, tz)
      if (!imported.chats.length) {
        session.current?.dispose()
        const reasons = imported.skipped.map((s) => `${s.path.split('/').pop()}: ${s.reason}`).slice(0, 4)
        go({ name: 'import', error: `We couldn't find a conversation in those files. ${reasons.join(' · ')}` })
        return
      }
      go({ name: 'review', imported })
    } catch (err) {
      go({ name: 'import', error: err instanceof Error ? err.message : String(err) })
    }
  }

  const startDemo = async () => {
    setProgress(null)
    go({ name: 'reading' })
    try {
      const imported = await newSession().demo()
      // The demo skips the review step: the identity guess is known-good.
      await build(imported.suggestion, imported.chats.map((c) => c.id), imported.chats.reduce((s, c) => s + c.messageCount, 0))
    } catch (err) {
      go({ name: 'import', error: err instanceof Error ? err.message : String(err) })
    }
  }

  const build = async (identity: IdentityMap, include: string[], messages: number) => {
    go({ name: 'building', messages })
    const started = performance.now()
    try {
      const s = await session.current!.analyze(identity, include)
      // Let the "weaving" moment breathe a little; analysis itself is fast.
      const wait = Math.max(0, 2600 - (performance.now() - started))
      await new Promise((r) => setTimeout(r, wait))
      files.current = []
      setStory(s)
      setHiddenWords([])
      go({ name: 'story' })
    } catch (err) {
      go({ name: 'import', error: err instanceof Error ? err.message : String(err) })
    }
  }

  const forgetEverything = () => {
    session.current?.dispose()
    session.current = null
    files.current = []
    setStory(null)
    setHiddenWords([])
    go({ name: 'landing' })
  }

  const openStory = (s: Story) => {
    setStory(s)
    setHiddenWords([])
    go({ name: 'story' })
  }

  switch (screen.name) {
    case 'landing':
      return <Landing onStart={() => { newSession().warm(); go({ name: 'import' }) }} onDemo={startDemo} onOpenStory={openStory} />
    case 'import':
      return <ImportScreen error={screen.error} onBack={() => go({ name: 'landing' })} onFiles={(f) => startImport(f)} onDemo={startDemo} />
    case 'reading':
      return <Building mode="reading" progress={progress} />
    case 'review':
      return (
        <ReviewScreen
          imported={screen.imported}
          timeZone={timeZone}
          onTimeZone={(tz) => {
            setTimeZone(tz)
            if (files.current.length) void startImport(files.current, tz)
          }}
          onBack={() => {
            session.current?.dispose()
            go({ name: 'import' })
          }}
          onBuild={(identity, include) => {
            const n = screen.imported.chats.filter((c) => include.includes(c.id)).reduce((s, c) => s + c.messageCount, 0)
            void build(identity, include, n)
          }}
        />
      )
    case 'building':
      return <Building mode="weaving" messages={screen.messages} />
    case 'story':
      return story ? <StoryPlayer story={story} onExit={(tab) => go({ name: 'home', tab: tab ?? 'almanac' })} /> : null
    case 'home':
      return story ? (
        <Home
            story={story}
            tab={screen.tab}
            onTab={(tab) => go({ name: 'home', tab })}
            onReplay={() => go({ name: 'story' })}
            hiddenWords={hiddenWords}
            onHideWord={(w) => setHiddenWords((h) => (h.includes(w) ? h : [...h, w]))}
            onUnhideWord={(w) => setHiddenWords((h) => h.filter((x) => x !== w))}
          onForget={forgetEverything}
        />
      ) : null
  }
}
