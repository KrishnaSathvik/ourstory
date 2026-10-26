import { useMemo, useState } from 'react'
import type { IdentityMap, PersonId } from '../../core/types'
import { PLATFORM_LABEL } from '../../core/types'
import type { Imported } from '../../worker/client'
import { fmtNum, fmtShortDate } from '../../analysis/format'
import { Icon, PlatformMark } from '../shared'
import { Wordmark } from '../Wordmark'

interface Props {
  imported: Imported
  timeZone: string
  onTimeZone: (tz: string) => void
  onBack: () => void
  onBuild: (identity: IdentityMap, include: string[]) => void
}

const zones = (() => {
  try {
    return (Intl as unknown as { supportedValuesOf(k: string): string[] }).supportedValuesOf('timeZone')
  } catch {
    return ['UTC']
  }
})()

export function ReviewScreen({ imported, timeZone, onTimeZone, onBack, onBuild }: Props) {
  const [names, setNames] = useState<[string, string]>([imported.suggestion.people[0].name, imported.suggestion.people[1].name])
  const [assign, setAssign] = useState(imported.suggestion.assign)
  const [include, setInclude] = useState<string[]>(() => imported.chats.map((c) => c.id))
  const [showSkipped, setShowSkipped] = useState(false)

  const totals = useMemo(() => {
    const t = { a: 0, b: 0 }
    for (const c of imported.chats) {
      if (!include.includes(c.id)) continue
      for (const p of c.participants) {
        const who = assign[c.id]?.[p.key]
        if (who) t[who] += p.count
      }
    }
    return t
  }, [imported.chats, include, assign])

  const set = (chat: string, key: string, who: PersonId | null) =>
    setAssign((prev) => {
      const next = { ...prev, [chat]: { ...prev[chat] } }
      // One sender per person per chat: assigning someone else to A frees the old A.
      if (who) for (const k of Object.keys(next[chat])) if (next[chat][k] === who && k !== key) next[chat][k] = null
      next[chat][key] = who
      return next
    })

  const swap = (chat: string) =>
    setAssign((prev) => {
      const m = { ...prev[chat] }
      for (const k of Object.keys(m)) m[k] = m[k] === 'a' ? 'b' : m[k] === 'b' ? 'a' : null
      return { ...prev, [chat]: m }
    })

  const ready = include.length > 0 && totals.a > 0 && totals.b > 0 && names.every((n) => n.trim())
  const grouped = imported.chats.some((c) => c.participants.length > 2)

  return (
    <div className="import review wrap">
      <header className="topbar">
        <button className="icon-btn" onClick={onBack} aria-label="Back to files">
          <Icon.arrowLeft />
        </button>
        <Wordmark size={24} />
        <span />
      </header>

      <p className="eyebrow">Step 2 of 2</p>
      <h1 className="display import__title">
        Who’s <em>who?</em>
      </h1>
      <p className="muted import__lead">
        We found {imported.chats.length === 1 ? 'one conversation' : `${imported.chats.length} conversations`}. Check who’s who so we can weave them into one
        story. We’ve made a guess; fix anything that’s wrong.
      </p>

      <section className="names card" aria-label="Your names">
        {([0, 1] as const).map((i) => (
          <label key={i} className="names__field">
            <span className={`dot dot--${i ? 'b' : 'a'}`} />
            <span className="sr-only">{i ? 'Second person' : 'First person'}’s name</span>
            <input
              type="text"
              value={names[i]}
              maxLength={24}
              onChange={(e) => setNames((n) => (i ? [n[0], e.target.value] : [e.target.value, n[1]]))}
            />
            <span className="faint tnum names__count">{fmtNum(i ? totals.b : totals.a)} messages</span>
          </label>
        ))}
        <p className="faint names__hint">These are the names your story will use. Nicknames welcome.</p>
      </section>

      {grouped && (
        <div className="note">
          <Icon.alert />
          <span>
            Duet is made for two people for now. In group chats, pick the two of you; everyone else is left out of the story.
          </span>
        </div>
      )}

      <ul className="chats">
        {imported.chats.map((c) => {
          const on = include.includes(c.id)
          return (
            <li key={c.id} className={`chat card ${on ? '' : 'chat--off'}`}>
              <div className="chat__head">
                <PlatformMark platform={c.platform} size={34} />
                <div className="chat__meta">
                  <strong>
                    {PLATFORM_LABEL[c.platform]}
                    {c.title ? ` · ${c.title}` : ''}
                  </strong>
                  <span className="faint tnum">
                    {fmtNum(c.messageCount)} messages
                    {c.first !== null && c.last !== null && ` · ${fmtShortDate(c.first)} – ${fmtShortDate(c.last)}`}
                  </span>
                  <span className="faint chat__source" title={c.source}>
                    {c.source}
                  </span>
                </div>
                <label className="switch">
                  <input type="checkbox" checked={on} onChange={(e) => setInclude((x) => (e.target.checked ? [...x, c.id] : x.filter((y) => y !== c.id)))} />
                  <span className="switch__ui" aria-hidden="true" />
                  <span className="sr-only">Include this conversation</span>
                </label>
              </div>

              {on && (
                <>
                  <table className="senders">
                    <caption className="sr-only">Who is who in this conversation</caption>
                    <tbody>
                      {c.participants.slice(0, 12).map((p) => {
                        const who = assign[c.id]?.[p.key] ?? null
                        return (
                          <tr key={p.key}>
                            <th scope="row">
                              <span className="senders__key">{p.key}</span>
                              <span className="faint tnum">{fmtNum(p.count)}</span>
                            </th>
                            <td>
                              <div className="seg" role="group" aria-label={`Who is ${p.key}?`}>
                                <button aria-pressed={who === 'a'} onClick={() => set(c.id, p.key, 'a')}>
                                  <span className="dot dot--a" /> {names[0] || 'Person 1'}
                                </button>
                                <button aria-pressed={who === 'b'} onClick={() => set(c.id, p.key, 'b')}>
                                  <span className="dot dot--b" /> {names[1] || 'Person 2'}
                                </button>
                                <button aria-pressed={who === null} onClick={() => set(c.id, p.key, null)}>
                                  Leave out
                                </button>
                              </div>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {c.participants.length > 12 && <p className="faint">+{c.participants.length - 12} more people, left out.</p>}
                  <div className="row chat__foot">
                    <button className="linkish" onClick={() => swap(c.id)}>
                      Swap the two
                    </button>
                    {c.warnings
                      .filter((w) => w.code !== 'group-chat')
                      .map((w) => (
                        <span key={w.code} className="pill chat__warn">
                          <Icon.alert /> {w.message}
                        </span>
                      ))}
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>

      {imported.skipped.length > 0 && (
        <div className="skipped">
          <button className="linkish" aria-expanded={showSkipped} onClick={() => setShowSkipped((s) => !s)}>
            {imported.skipped.length} file{imported.skipped.length === 1 ? '' : 's'} skipped
          </button>
          {showSkipped && (
            <ul className="faint">
              {imported.skipped.slice(0, 50).map((s) => (
                <li key={s.path}>
                  <span className="skipped__path">{s.path}</span>: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <section className="tz card">
        <label htmlFor="tz">
          <strong>Your time zone</strong>
          <span className="faint">
            Instagram, Telegram and Messenger store universal time; we convert it to this zone. WhatsApp and iMessage times stay exactly as the phone wrote them.
          </span>
        </label>
        <select id="tz" value={timeZone} onChange={(e) => onTimeZone(e.target.value)}>
          {zones.map((z) => (
            <option key={z}>{z}</option>
          ))}
        </select>
      </section>

      <div className="review__cta">
        <button
          className="btn btn--blend"
          disabled={!ready}
          onClick={() =>
            onBuild(
              {
                people: [
                  { id: 'a', name: names[0].trim() },
                  { id: 'b', name: names[1].trim() },
                ],
                assign,
              },
              include,
            )
          }
        >
          Weave our story <Icon.sparkle />
        </button>
        {!ready && <p className="faint">Each of you needs at least one message, and a name.</p>}
      </div>
    </div>
  )
}
