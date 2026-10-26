import { useEffect, useId, useMemo, useRef, useState } from 'react'
import type { Story } from '../../analysis/story'
import { exportStoryFile, redactStory } from '../../storage/sharefile'
import { Icon } from '../shared'
import { drawFingerprint, ensureKeepsakeFonts, fingerprintAlt } from './fingerprint'
import { CARDS, type CardDef } from './cards'
import '../../styles/keepsakes.css'

type Format = 'poster' | 'story'

interface KeepsakeDef {
  id: string
  title: string
  blurb: string
  formats: Format[]
  size: (f: Format) => [number, number]
  draw: (ctx: CanvasRenderingContext2D, story: Story, w: number, h: number, f: Format) => void
  alt: (story: Story) => string
}

const STORY_SIZE: [number, number] = [1080, 1920]
const POSTER_SIZE: [number, number] = [2400, 3200]

const KEEPSAKES: KeepsakeDef[] = [
  {
    id: 'fingerprint',
    title: 'Our Fingerprint',
    blurb: 'Every day since your first message, one mark on a spiral. One ring per year.',
    formats: ['poster', 'story'],
    size: (f) => (f === 'poster' ? POSTER_SIZE : STORY_SIZE),
    draw: (ctx, s, width, height, variant) => drawFingerprint(ctx, s, { width, height, variant }),
    alt: fingerprintAlt,
  },
  ...CARDS.map(
    (c: CardDef): KeepsakeDef => ({
      id: c.id,
      title: c.title,
      blurb: c.blurb,
      formats: ['story'],
      size: () => STORY_SIZE,
      draw: (ctx, s, width, height) => c.draw(ctx, s, { width, height }),
      alt: c.alt,
    }),
  ),
]

const slug = (story: Story) =>
  story.people
    .map((p) =>
      p.name
        .normalize('NFKD')
        .replace(/[^\w\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .toLowerCase(),
    )
    .filter(Boolean)
    .join('-and-') || 'our-story'

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

async function renderPng(def: KeepsakeDef, story: Story, format: Format): Promise<Blob> {
  await ensureKeepsakeFonts()
  const [w, h] = def.size(format)
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser could not create the image.')
  def.draw(ctx, story, w, h, format)
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not create the image.'))), 'image/png'))
}

/** Live preview: draws at the displayed size × devicePixelRatio, same renderer as the download. */
function Preview({ def, story, format }: { def: KeepsakeDef; story: Story; format: Format }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const [ready, setReady] = useState(false)
  useEffect(() => {
    const canvas = ref.current
    if (!canvas) return
    let cancelled = false
    let raf = 0
    const [fw, fh] = def.size(format)
    const paint = async () => {
      await ensureKeepsakeFonts()
      if (cancelled) return
      const cssW = canvas.clientWidth || 320
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const w = Math.min(fw, Math.round(cssW * dpr))
      const h = Math.round((w * fh) / fw)
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      def.draw(ctx, story, w, h, format)
      setReady(true)
    }
    void paint()
    let lastW = canvas.clientWidth
    const ro = new ResizeObserver(() => {
      const cw = canvas.clientWidth
      if (Math.abs(cw - lastW) < 24) return
      lastW = cw
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => void paint())
    })
    ro.observe(canvas)
    return () => {
      cancelled = true
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [def, story, format])
  const [fw, fh] = def.size(format)
  return (
    <div className="keepsake__frame" style={{ aspectRatio: `${fw} / ${fh}` }} data-ready={ready}>
      <canvas ref={ref} className="keepsake__canvas" role="img" aria-label={def.alt(story)} />
    </div>
  )
}

function KeepsakeCard({ def, story }: { def: KeepsakeDef; story: Story }) {
  const [format, setFormat] = useState<Format>(def.formats[0])
  const [busy, setBusy] = useState<'download' | 'share' | null>(null)
  const [status, setStatus] = useState('')
  const headingId = useId()
  const [w, h] = def.size(format)
  const filename = `duet-${slug(story)}-${def.id}${def.formats.length > 1 ? `-${format}` : ''}.png`

  const canShareFiles = useMemo(() => {
    try {
      const probe = new File([new Uint8Array(1)], 'probe.png', { type: 'image/png' })
      return typeof navigator !== 'undefined' && !!navigator.canShare?.({ files: [probe] })
    } catch {
      return false
    }
  }, [])

  const download = async () => {
    setBusy('download')
    setStatus('')
    try {
      downloadBlob(await renderPng(def, story, format), filename)
      setStatus('Saved to your downloads.')
    } catch (e) {
      setStatus(e instanceof Error ? e.message : 'Could not create the image.')
    } finally {
      setBusy(null)
    }
  }

  const share = async () => {
    setBusy('share')
    setStatus('')
    try {
      const blob = await renderPng(def, story, format)
      const file = new File([blob], filename, { type: 'image/png' })
      if (!navigator.canShare?.({ files: [file] })) throw new Error('Sharing images is not supported here. Use Download instead.')
      await navigator.share({ files: [file], title: def.title })
    } catch (e) {
      if (!(e instanceof DOMException && e.name === 'AbortError')) setStatus(e instanceof Error ? e.message : 'Could not share.')
    } finally {
      setBusy(null)
    }
  }

  return (
    <article className="keepsake card" aria-labelledby={headingId}>
      <Preview def={def} story={story} format={format} />
      <div className="keepsake__body stack">
        <div className="keepsake__head">
          <h3 id={headingId} className="display keepsake__title">
            {def.title}
          </h3>
          <p className="faint keepsake__blurb">{def.blurb}</p>
        </div>
        {def.formats.length > 1 && (
          <div className="seg" role="group" aria-label={`${def.title} format`}>
            {def.formats.map((f) => (
              <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)}>
                {f === 'poster' ? 'Poster 3:4' : 'Story 9:16'}
              </button>
            ))}
          </div>
        )}
        <p className="faint keepsake__meta tnum">
          PNG · {w} × {h}
        </p>
        <div className="row keepsake__actions">
          <button type="button" className="btn btn--small" onClick={download} disabled={busy !== null} aria-label={`Download ${def.title} as PNG`}>
            <Icon.download />
            {busy === 'download' ? 'Preparing…' : 'Download PNG'}
          </button>
          {canShareFiles && (
            <button type="button" className="btn btn--ghost btn--small" onClick={share} disabled={busy !== null} aria-label={`Share ${def.title}`}>
              <Icon.share />
              {busy === 'share' ? 'Preparing…' : 'Share'}
            </button>
          )}
        </div>
        <p className="keepsake__status" role="status" aria-live="polite">
          {status}
        </p>
      </div>
    </article>
  )
}

function StoryFilePanel({ story, hiddenWords }: { story: Story; hiddenWords: string[] }) {
  const [includeWords, setIncludeWords] = useState(false)
  const [includeEmoji, setIncludeEmoji] = useState(true)
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState(false)
  const [status, setStatus] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null)
  const ids = { words: useId(), emoji: useId(), pass: useId(), passHint: useId(), heading: useId() }

  const exportFile = async () => {
    setBusy(true)
    setStatus(null)
    try {
      const blob = await exportStoryFile(story, { includeWords, includeEmoji, hiddenWords, passphrase: passphrase || undefined })
      downloadBlob(blob, `${slug(story)}.duet`)
      setStatus({
        kind: 'ok',
        text: passphrase ? 'Story file saved. Tell your partner the passphrase in person or another way, not alongside the file.' : 'Story file saved.',
      })
    } catch (e) {
      setStatus({ kind: 'error', text: e instanceof Error ? e.message : 'Could not create the file.' })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="storyfile card" aria-labelledby={ids.heading}>
      <div className="storyfile__intro stack">
        <span className="eyebrow">For your partner</span>
        <h3 id={ids.heading} className="display storyfile__title">
          Story file
        </h3>
        <p className="muted">Send this file to your partner; they can open it in Duet. It contains only statistics, never messages.</p>
      </div>
      <div className="storyfile__form stack">
        <label className="check" htmlFor={ids.words}>
          <input id={ids.words} type="checkbox" checked={includeWords} onChange={(e) => setIncludeWords(e.target.checked)} />
          <span>
            <strong>Include word stats</strong>
            <span className="faint">Your most-used and shared words. Off by default.</span>
          </span>
        </label>
        <label className="check" htmlFor={ids.emoji}>
          <input id={ids.emoji} type="checkbox" checked={includeEmoji} onChange={(e) => setIncludeEmoji(e.target.checked)} />
          <span>
            <strong>Include emoji</strong>
            <span className="faint">Favourite and signature emoji.</span>
          </span>
        </label>
        <div className="stack storyfile__pass">
          <label htmlFor={ids.pass}>
            <strong>Passphrase</strong> <span className="faint">(optional)</span>
          </label>
          <input
            id={ids.pass}
            type="password"
            autoComplete="new-password"
            spellCheck={false}
            value={passphrase}
            maxLength={1024}
            onChange={(e) => setPassphrase(e.target.value)}
            aria-describedby={ids.passHint}
          />
          <p id={ids.passHint} className="faint storyfile__hint">
            Encrypts the file on this device (AES-256). Without it, anyone who gets the file can read the statistics.
          </p>
        </div>
        {hiddenWords.length > 0 && (
          <p className="faint storyfile__hint">
            {hiddenWords.length === 1 ? '1 word you hid is' : `${hiddenWords.length} words you hid are`} left out.
          </p>
        )}
        <div>
          <button type="button" className="btn btn--blend" onClick={exportFile} disabled={busy}>
            <Icon.file />
            {busy ? (passphrase ? 'Encrypting…' : 'Preparing…') : 'Download .duet file'}
          </button>
        </div>
        <p className={`storyfile__status ${status?.kind === 'error' ? 'is-error' : ''}`} role="status" aria-live="polite">
          {status?.text}
        </p>
      </div>
    </section>
  )
}

export function Keepsakes(props: { story: Story; hiddenWords: string[] }) {
  const { hiddenWords } = props
  // Hidden words never reach a keepsake.
  const story = useMemo(() => redactStory(props.story, { includeWords: true, includeEmoji: true, hiddenWords }), [props.story, hiddenWords])

  return (
    <div className="keepsakes wrap stack">
      <header className="keepsakes__header stack">
        <span className="eyebrow">Keepsakes</span>
        <h2 className="display keepsakes__heading">
          Made to <em>keep</em>.
        </h2>
        <p className="muted keepsakes__lede">Images drawn on this device from your statistics. Download them, print the poster, share a card.</p>
        <p className="note">
          <Icon.shield />
          <span>Cards never contain message text: only counts, dates, names and a few emoji. Nothing is uploaded; images are made in your browser.</span>
        </p>
        {story.demo && (
          <p className="faint">
            This is the demo story, so every keepsake is watermarked <strong>DEMO · fictional couple</strong>.
          </p>
        )}
      </header>

      <div className="keepsakes__grid">
        {KEEPSAKES.map((def) => (
          <KeepsakeCard key={def.id} def={def} story={story} />
        ))}
      </div>

      <StoryFilePanel story={props.story} hiddenWords={hiddenWords} />
    </div>
  )
}
