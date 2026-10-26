import { useEffect, useState } from 'react'
import { fmtNum } from '../../analysis/format'
import { Orbs } from '../shared'

const WEAVING = [
  'Lining up every timestamp',
  'Matching you across apps',
  'Counting goodnights',
  'Finding your firsts',
  'Mapping your hours',
  'Handing out awards',
  'Letting go of the messages. Only the story stays.',
]

export function Building({ mode, progress, messages }: { mode: 'reading' | 'weaving'; progress?: { done: number; total: number; current?: string } | null; messages?: number }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    if (mode !== 'weaving') return
    const id = setInterval(() => setStep((s) => Math.min(WEAVING.length - 1, s + 1)), 380)
    return () => clearInterval(id)
  }, [mode])

  return (
    <div className="building" role="status" aria-live="polite">
      <Orbs intensity={1.3} />
      <div className="building__text">
        {mode === 'reading' ? (
          <>
            <p className="display building__title">
              Reading <em>on this device</em>
            </p>
            <p className="muted tnum">
              {progress && progress.total > 0 ? `File ${Math.min(progress.done + 1, progress.total)} of ${progress.total}` : 'Opening your files'}
              {progress?.current ? ` · ${progress.current}` : ''}
            </p>
          </>
        ) : (
          <>
            <p className="display building__title">
              Weaving {messages ? <span className="tnum">{fmtNum(messages)}</span> : 'your'} <em>messages</em>
            </p>
            <ul className="building__steps">
              {WEAVING.slice(0, step + 1).map((s, i) => (
                <li key={s} className={i === step ? 'is-current' : ''}>
                  {s}
                </li>
              ))}
            </ul>
          </>
        )}
        <p className="faint building__fine">Nothing is being uploaded.</p>
      </div>
    </div>
  )
}
