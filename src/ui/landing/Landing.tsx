import { useRef, useState } from 'react'
import type { Story } from '../../analysis/story'
import { Icon, Orbs, PlatformMark } from '../shared'
import { Wordmark } from '../Wordmark'
import { hasSavedStory, loadStory } from '../../storage/vault'
import { readStoryFile } from '../../storage/sharefile'
import { EXAMPLES } from './examples'
import '../../styles/landing.css'

interface Props {
  onStart: () => void
  onDemo: () => void
  onOpenStory: (s: Story) => void
}

const PLATFORMS: { id: string; name: string; note: string }[] = [
  { id: 'whatsapp', name: 'WhatsApp', note: 'iOS & Android, any language' },
  { id: 'instagram', name: 'Instagram', note: 'DMs from “Download your information”' },
  { id: 'telegram', name: 'Telegram', note: 'Desktop export (JSON)' },
  { id: 'messenger', name: 'Messenger', note: 'Facebook data download' },
  { id: 'imessage', name: 'iMessage', note: 'via imessage-exporter on a Mac' },
  { id: 'discord', name: 'Discord', note: 'DiscordChatExporter JSON' },
  { id: 'sms', name: 'SMS', note: 'Android “SMS Backup & Restore”' },
]

export function Landing({ onStart, onDemo, onOpenStory }: Props) {
  return (
    <div className="landing">
      <header className="topbar wrap">
        <Wordmark />
        <nav className="topbar__nav" aria-label="Sections">
          <a href="#how">How it works</a>
          <a href="#privacy">Privacy</a>
          <button className="btn btn--small btn--ghost" onClick={onDemo}>
            Try the demo
          </button>
        </nav>
      </header>

      <section className="hero" aria-labelledby="hero-title">
        <Orbs />
        <div className="hero__inner wrap">
          <p className="eyebrow hero__eyebrow">For two people and everything they’ve said</p>
          <h1 id="hero-title" className="display hero__title">
            Every message you’ve sent each other, <em className="blend-text">played back.</em>
          </h1>
          <p className="hero__sub muted">
            Duet turns your WhatsApp, Instagram, Telegram and iMessage history into a story you can relive together: your rhythms, your
            firsts, your words, your awards. It all happens on this device. No message is ever shown, uploaded or read by an AI.
          </p>
          <div className="row hero__cta">
            <button className="btn btn--blend" onClick={onStart}>
              Begin with your chats <Icon.arrowRight />
            </button>
            <button className="btn btn--ghost" onClick={onDemo}>
              <Icon.play /> Watch the demo couple
            </button>
          </div>
          <ReturnVisitor onOpenStory={onOpenStory} />
        </div>
        <div className="hero__scroll faint" aria-hidden="true">
          scroll
        </div>
      </section>

      <section className="promise wrap" id="privacy" aria-labelledby="promise-title">
        <h2 id="promise-title" className="sr-only">
          Privacy promises
        </h2>
        <Promise icon={<Icon.lock />} title="Nothing leaves your device">
          Your files are read by your own browser. This page is technically blocked from sending data anywhere: there’s no server to send it to.
        </Promise>
        <Promise icon={<Icon.eyeOff />} title="Never a single message">
          You’ll see patterns, numbers, firsts and favourites. Never a transcript, a quote or a screenshot.
        </Promise>
        <Promise icon={<Icon.wifiOff />} title="Works in airplane mode">
          Don’t take our word for it. Open the import screen, switch off your Wi-Fi, and carry on.
        </Promise>
        <Promise icon={<Icon.trash />} title="Forgotten by default">
          Messages are released from memory the moment your story is ready. Saving the story is opt-in and encrypted.
        </Promise>
      </section>

      <section className="how wrap" id="how" aria-labelledby="how-title">
        <p className="eyebrow">How it works</p>
        <h2 id="how-title" className="display section-title">
          Three steps, <em>zero uploads.</em>
        </h2>
        <ol className="how__steps">
          <li>
            <span className="how__n display">1</span>
            <h3>Export your chat</h3>
            <p className="muted">Every app can hand you a copy of a conversation. We’ll show you exactly where the button is.</p>
          </li>
          <li>
            <span className="how__n display">2</span>
            <h3>Drop it in</h3>
            <p className="muted">Add one app or several. Duet stitches Instagram, WhatsApp and the rest into one continuous history.</p>
          </li>
          <li>
            <span className="how__n display">3</span>
            <h3>Play it back, together</h3>
            <p className="muted">A story to tap through side by side, with guesses along the way, then an almanac, a quiz and keepsakes.</p>
          </li>
        </ol>
      </section>

      <section className="peek wrap" aria-labelledby="peek-title">
        <p className="eyebrow">What you’ll find</p>
        <h2 id="peek-title" className="display section-title">
          Not a dashboard. <em>A story about the two of you.</em>
        </h2>
        <div className="peek__grid">
          {EXAMPLES.map((e) => (
            <PeekCard key={e.kicker} {...e} />
          ))}
        </div>
        <p className="faint peek__caption">Examples from Maya &amp; Theo, our fictional demo couple.</p>
      </section>

      <section className="together wrap" aria-labelledby="together-title">
        <div className="together__text">
          <p className="eyebrow">Made for two</p>
          <h2 id="together-title" className="display section-title">
            Best opened <em>side by side.</em>
          </h2>
          <ul className="together__list">
            <li>
              <strong>Guess, then reveal.</strong> The story asks before it tells: who texts first, who says “love you” more.
            </li>
            <li>
              <strong>Pass-the-phone quiz.</strong> Answer in secret, reveal together, settle it for good.
            </li>
            <li>
              <strong>Keepsakes.</strong> A one-of-a-kind print made from every day you talked, and cards to share or keep.
            </li>
          </ul>
        </div>
        <div className="together__art" aria-hidden="true">
          <div className="phone phone--a">
            <span className="eyebrow">Who texts first?</span>
            <span className="phone__opt">Maya</span>
            <span className="phone__opt phone__opt--on">Theo</span>
          </div>
          <div className="phone phone--b">
            <span className="eyebrow">Who texts first?</span>
            <span className="phone__opt phone__opt--on">Maya</span>
            <span className="phone__opt">Theo</span>
          </div>
        </div>
      </section>

      <section className="works wrap" aria-labelledby="works-title">
        <p className="eyebrow">Works with</p>
        <h2 id="works-title" className="display section-title">
          Wherever you’ve <em>been talking.</em>
        </h2>
        <ul className="works__list">
          {PLATFORMS.map((p) => (
            <li key={p.id}>
              <PlatformMark platform={p.id} size={30} />
              <span>
                <strong>{p.name}</strong>
                <span className="faint">{p.note}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="fineprint wrap" aria-labelledby="fine-title">
        <h2 id="fine-title" className="display section-title">
          The fine print, <em>in plain words.</em>
        </h2>
        <div className="fineprint__grid">
          <div>
            <h3>What we do with your files</h3>
            <p className="muted">
              They’re opened in an isolated background worker in your browser, counted, and released. The worker is shut down the moment
              your story is ready, so the messages go with it.
            </p>
          </div>
          <div>
            <h3>What we never do</h3>
            <p className="muted">
              No accounts, no analytics, no cookies, no AI services, no servers. The page’s security policy blocks every outgoing connection
              (<code>connect-src 'none'</code>), so even our own code couldn’t upload your chats.
            </p>
          </div>
          <div>
            <h3>What counts as “grounded”</h3>
            <p className="muted">
              Every line in your story is a measurement: a count, a time, a date. Duet never guesses at feelings or tells you what your
              relationship means. That part is yours.
            </p>
          </div>
          <div>
            <h3>Their messages too</h3>
            <p className="muted">
              A conversation belongs to everyone in it. Duet is designed to be explored together, and we’ll ask you to confirm the other
              person is on board.
            </p>
          </div>
        </div>
      </section>

      <footer className="footer wrap">
        <Wordmark />
        <p className="faint">Made with care, and without your data.</p>
      </footer>
    </div>
  )
}

function Promise({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="promise__item">
      <span className="promise__icon">{icon}</span>
      <h3>{title}</h3>
      <p className="muted">{children}</p>
    </div>
  )
}

function PeekCard({ tone, kicker, big, small }: { tone: 'a' | 'b' | 'blend'; kicker: string; big: string; small: string }) {
  return (
    <figure className={`peek-card peek-card--${tone}`}>
      <span className="eyebrow">{kicker}</span>
      <span className="display peek-card__big">{big}</span>
      <figcaption className="muted">{small}</figcaption>
    </figure>
  )
}

/** Unlock a saved story or open a .duet file shared by a partner. */
function ReturnVisitor({ onOpenStory }: { onOpenStory: (s: Story) => void }) {
  const [saved] = useState(() => hasSavedStory())
  const [mode, setMode] = useState<'idle' | 'unlock' | 'file-pass'>('idle')
  const [pass, setPass] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const pending = useRef<File | null>(null)

  const unlock = async () => {
    setBusy(true)
    setError(null)
    try {
      onOpenStory(await loadStory(pass))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not unlock')
    } finally {
      setBusy(false)
    }
  }

  const openFile = async (file: File, passphrase?: string) => {
    setBusy(true)
    setError(null)
    try {
      onOpenStory(await readStoryFile(file, passphrase))
    } catch (e) {
      const msg = e instanceof Error ? e.message : 'Could not open file'
      if (msg === 'needs-passphrase') {
        pending.current = file
        setMode('file-pass')
      } else setError(msg)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="return">
      <div className="row return__links">
        {saved && mode === 'idle' && (
          <button className="linkish" onClick={() => setMode('unlock')}>
            <Icon.lock /> Unlock your saved story
          </button>
        )}
        <button className="linkish" onClick={() => fileRef.current?.click()}>
          <Icon.file /> Open a .duet file
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".duet,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0]
            if (f) void openFile(f)
            e.target.value = ''
          }}
        />
      </div>
      {mode !== 'idle' && (
        <form
          className="row return__form"
          onSubmit={(e) => {
            e.preventDefault()
            if (mode === 'unlock') void unlock()
            else if (pending.current) void openFile(pending.current, pass)
          }}
        >
          <label className="sr-only" htmlFor="pass">
            Passphrase
          </label>
          <input id="pass" type="password" autoComplete="current-password" placeholder="Passphrase" value={pass} onChange={(e) => setPass(e.target.value)} autoFocus />
          <button className="btn btn--small" disabled={!pass || busy}>
            {busy ? 'Unlocking…' : 'Unlock'}
          </button>
        </form>
      )}
      {error && (
        <p className="return__error" role="alert">
          {error}
        </p>
      )}
    </div>
  )
}
