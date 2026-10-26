import { useState } from 'react'
import type { Story } from '../analysis/story'
import { forgetSaved, hasSavedStory, saveStory } from '../storage/vault'
import { redactStory } from '../storage/sharefile'
import { Icon } from './shared'
import '../styles/privacy.css'

interface Props {
  story: Story
  hiddenWords: string[]
  onUnhideWord: (w: string) => void
  onForget: () => void
}

export function PrivacyPanel({ story, hiddenWords, onUnhideWord, onForget }: Props) {
  const [saved, setSaved] = useState(() => hasSavedStory())
  const [pass, setPass] = useState('')
  const [pass2, setPass2] = useState('')
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState(false)

  const save = async () => {
    setBusy(true)
    setStatus(null)
    try {
      // Hidden words never reach storage.
      await saveStory(redactStory(story, { includeWords: true, includeEmoji: true, hiddenWords }), pass)
      setSaved(true)
      setPass('')
      setPass2('')
      setStatus('Saved and encrypted on this device.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not save')
    } finally {
      setBusy(false)
    }
  }

  const strongEnough = pass.length >= 8
  return (
    <div className="wrap privacy">
      <p className="eyebrow">Privacy</p>
      <h1 className="display privacy__title">
        What Duet <em>knows,</em> and where.
      </h1>

      <div className="privacy__grid">
        <section className="card privacy__card">
          <h2>
            <Icon.shield /> Right now
          </h2>
          <ul className="privacy__facts">
            <li>
              <Icon.check />
              <span>Your messages are gone. The worker that read them was shut down when your story was ready.</span>
            </li>
            <li>
              <Icon.check />
              <span>Your story (numbers, dates, emoji and a few frequent words) is held in this tab’s memory only.</span>
            </li>
            <li>
              <Icon.check />
              <span>{saved ? 'An encrypted copy of your story is saved on this device.' : 'Nothing is saved on this device. Close the tab and it’s gone.'}</span>
            </li>
            <li>
              <Icon.check />
              <span>This page can’t make network connections (Content-Security-Policy <code>connect-src 'none'</code>). There’s no Duet server.</span>
            </li>
          </ul>
        </section>

        <section className="card privacy__card">
          <h2>
            <Icon.lock /> Keep it on this device
          </h2>
          {saved ? (
            <>
              <p className="muted">
                Saved with AES-256 encryption, under a passphrase only you know. We can’t recover it if you forget it, because there is no “we”.
              </p>
              <button
                className="btn btn--ghost btn--small"
                onClick={() => {
                  forgetSaved()
                  setSaved(false)
                  setStatus('Saved copy deleted.')
                }}
              >
                <Icon.trash /> Delete saved copy
              </button>
            </>
          ) : (
            <form
              className="stack"
              onSubmit={(e) => {
                e.preventDefault()
                if (strongEnough && pass === pass2) void save()
              }}
            >
              <p className="muted">Save the story (never the messages) so you can reopen it later. It’s encrypted with your passphrase before it touches storage.</p>
              <label className="sr-only" htmlFor="p1">
                Passphrase
              </label>
              <input id="p1" type="password" autoComplete="new-password" placeholder="Passphrase (8+ characters)" value={pass} onChange={(e) => setPass(e.target.value)} />
              <label className="sr-only" htmlFor="p2">
                Repeat passphrase
              </label>
              <input id="p2" type="password" autoComplete="new-password" placeholder="Repeat passphrase" value={pass2} onChange={(e) => setPass2(e.target.value)} />
              <button className="btn btn--small" disabled={busy || !strongEnough || pass !== pass2}>
                {busy ? 'Encrypting…' : 'Save encrypted'}
              </button>
              {pass2 && pass !== pass2 && <p className="faint">The passphrases don’t match yet.</p>}
            </form>
          )}
          {status && (
            <p className="privacy__status" role="status">
              {status}
            </p>
          )}
        </section>

        <section className="card privacy__card">
          <h2>
            <Icon.eyeOff /> Hidden words
          </h2>
          {hiddenWords.length ? (
            <>
              <p className="muted">These are hidden everywhere, including keepsakes and story files.</p>
              <ul className="privacy__words">
                {hiddenWords.map((w) => (
                  <li key={w}>
                    <button className="pill" onClick={() => onUnhideWord(w)} aria-label={`Unhide ${w}`}>
                      {w} <Icon.close />
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p className="muted">None yet. In the almanac, any word can be hidden with one tap.</p>
          )}
        </section>

        <section className="card privacy__card privacy__card--danger">
          <h2>
            <Icon.trash /> Forget everything
          </h2>
          <p className="muted">Clears this story from memory and deletes any saved copy on this device. There’s nothing anywhere else to delete.</p>
          {confirm ? (
            <div className="row">
              <button
                className="btn btn--danger btn--small"
                onClick={() => {
                  forgetSaved()
                  onForget()
                }}
              >
                Yes, forget it all
              </button>
              <button className="linkish" onClick={() => setConfirm(false)}>
                Cancel
              </button>
            </div>
          ) : (
            <button className="btn btn--danger btn--small" onClick={() => setConfirm(true)}>
              Forget everything
            </button>
          )}
        </section>
      </div>

      <section className="privacy__quality">
        <h2 className="display">About this data</h2>
        <ul className="muted">
          <li>
            Built from {story.quality.chats} conversation{story.quality.chats === 1 ? '' : 's'}; times shown in {story.timeZone === 'UTC' ? 'the time zone the files were written in' : story.timeZone}.
          </li>
          {story.quality.notes.map((n) => (
            <li key={n}>{n}</li>
          ))}
          {story.quality.excludedMessages > 0 && <li>{story.quality.excludedMessages} messages from other people were left out.</li>}
          <li>Everything here describes the exports you imported. Conversations that happened elsewhere, or in person, aren’t counted.</li>
        </ul>
      </section>
    </div>
  )
}
