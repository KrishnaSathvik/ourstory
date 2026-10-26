import { useEffect, useRef, useState } from 'react'
import type { InputFile } from '../../importers'
import { Icon, PlatformMark } from '../shared'
import { Wordmark } from '../Wordmark'
import { GUIDES } from './guides'
import '../../styles/import.css'

interface Props {
  error?: string
  onBack: () => void
  onFiles: (files: InputFile[]) => void
  onDemo: () => void
}

export function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const on = () => setOnline(navigator.onLine)
    window.addEventListener('online', on)
    window.addEventListener('offline', on)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', on)
    }
  }, [])
  return online
}

/** Recursively collect files from a dropped folder (Chrome/Safari/Firefox). */
async function collectEntry(entry: FileSystemEntry, prefix: string, out: InputFile[]): Promise<void> {
  if (entry.isFile) {
    const file = await new Promise<File>((res, rej) => (entry as FileSystemFileEntry).file(res, rej))
    out.push({ blob: file, path: prefix + file.name })
  } else if (entry.isDirectory) {
    const reader = (entry as FileSystemDirectoryEntry).createReader()
    let batch: FileSystemEntry[]
    do {
      batch = await new Promise<FileSystemEntry[]>((res, rej) => reader.readEntries(res, rej))
      for (const child of batch) await collectEntry(child, `${prefix}${entry.name}/`, out)
    } while (batch.length)
  }
}

export function ImportScreen({ error, onBack, onFiles, onDemo }: Props) {
  const [files, setFiles] = useState<InputFile[]>([])
  const [consent, setConsent] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [guide, setGuide] = useState(GUIDES[0].id)
  const online = useOnline()
  const input = useRef<HTMLInputElement>(null)
  const folder = useRef<HTMLInputElement>(null)

  const add = (more: InputFile[]) =>
    setFiles((prev) => {
      const seen = new Set(prev.map((f) => f.path + f.blob.size))
      return [...prev, ...more.filter((f) => !seen.has(f.path + f.blob.size))]
    })

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    setDragging(false)
    const out: InputFile[] = []
    const items = [...e.dataTransfer.items]
    const entries = items.map((i) => i.webkitGetAsEntry?.()).filter((x): x is FileSystemEntry => !!x)
    if (entries.length) for (const entry of entries) await collectEntry(entry, '', out)
    else for (const f of e.dataTransfer.files) out.push({ blob: f, path: f.name })
    add(out)
  }

  const fromInput = (list: FileList | null) => {
    if (!list) return
    add([...list].map((f) => ({ blob: f, path: f.webkitRelativePath || f.name })))
  }

  const totalSize = files.reduce((s, f) => s + f.blob.size, 0)
  const g = GUIDES.find((x) => x.id === guide)!

  return (
    <div className="import wrap">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back to start">
          <Icon.arrowLeft />
        </button>
        <Wordmark size={24} />
        <span className={`netstate ${online ? '' : 'netstate--off'}`} role="status">
          <span className="netstate__dot" aria-hidden="true" />
          {online ? 'Online · nothing will be uploaded' : 'Offline · and Duet still works'}
        </span>
      </header>

      <div className="import__grid">
        <section aria-labelledby="import-title">
          <p className="eyebrow">Step 1 of 2</p>
          <h1 id="import-title" className="display import__title">
            Bring your <em>conversations.</em>
          </h1>
          <p className="muted import__lead">
            Add exports from one app or several, in any order. Zips are fine. Duet reads only the chat files inside and never opens your photos.
          </p>

          {error && (
            <div className="note note--error" role="alert">
              <Icon.alert />
              <span>{error}</span>
            </div>
          )}

          <div
            className={`drop ${dragging ? 'drop--over' : ''} ${files.length ? 'drop--filled' : ''}`}
            onDragOver={(e) => {
              e.preventDefault()
              setDragging(true)
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={onDrop}
          >
            <span className="drop__icon">
              <Icon.upload />
            </span>
            <p className="drop__title">Drop export files or folders here</p>
            <p className="faint drop__hint">.zip · .txt · .json · .xml</p>
            <div className="row drop__buttons">
              <button className="btn btn--small" onClick={() => input.current?.click()}>
                Choose files
              </button>
              <button className="btn btn--small btn--ghost" onClick={() => folder.current?.click()}>
                Choose a folder
              </button>
            </div>
            <input ref={input} type="file" multiple hidden accept=".zip,.txt,.json,.xml,application/zip,text/plain,application/json,text/xml" onChange={(e) => fromInput(e.target.files)} />
            <input
              ref={folder}
              type="file"
              hidden
              // @ts-expect-error non-standard but universally supported
              webkitdirectory=""
              onChange={(e) => fromInput(e.target.files)}
            />
          </div>

          {files.length > 0 && (
            <ul className="filelist" aria-label="Files to read">
              {files.slice(0, 8).map((f) => (
                <li key={f.path + f.blob.size}>
                  <Icon.file />
                  <span className="filelist__name">{f.path}</span>
                  <span className="faint tnum">{formatBytes(f.blob.size)}</span>
                  <button className="icon-btn icon-btn--tiny" aria-label={`Remove ${f.path}`} onClick={() => setFiles((x) => x.filter((y) => y !== f))}>
                    <Icon.close />
                  </button>
                </li>
              ))}
              {files.length > 8 && <li className="faint">and {files.length - 8} more files ({formatBytes(totalSize)} total)</li>}
            </ul>
          )}

          <label className="consent">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
            <span>
              <strong>A conversation belongs to both of you.</strong>{' '}
              <span className="muted">I’m doing this with the other person, or I’m confident they’d be happy for me to.</span>
            </span>
          </label>

          <div className="row import__actions">
            <button className="btn btn--blend" disabled={!files.length || !consent} onClick={() => onFiles(files)}>
              Read my files <Icon.arrowRight />
            </button>
            <button className="linkish" onClick={onDemo}>
              or try the fictional demo couple
            </button>
          </div>
          <p className="faint import__fine">
            Files are opened by your browser in an isolated worker, analysed in memory and released. Nothing is uploaded, stored, or shown as text.
          </p>
        </section>

        <aside className="guide card" aria-labelledby="guide-title">
          <h2 id="guide-title" className="guide__title">
            How to export
          </h2>
          <div className="guide__tabs" role="tablist" aria-label="Platforms">
            {GUIDES.map((x) => (
              <button key={x.id} role="tab" aria-selected={guide === x.id} className="guide__tab" onClick={() => setGuide(x.id)}>
                <PlatformMark platform={x.platform} size={18} />
                {x.name}
              </button>
            ))}
          </div>
          <div role="tabpanel" className="guide__panel" aria-label={g.name}>
            <ol className="guide__steps">
              {g.steps.map((s) => (
                <li key={s}>{s}</li>
              ))}
            </ol>
            <p className="guide__result">
              <Icon.check /> {g.result}
            </p>
            {g.tip && <p className="faint guide__tip">{g.tip}</p>}
          </div>
        </aside>
      </div>
    </div>
  )
}

function formatBytes(n: number) {
  if (n < 1024) return `${n} B`
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(0)} KB`
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`
  return `${(n / 1024 ** 3).toFixed(2)} GB`
}
