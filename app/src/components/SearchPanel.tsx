import { useMemo, useRef, useState } from 'react'
import { CornerUpRight, Folder, Monitor, Circle, Search, X } from 'lucide-react'
import { useDoc } from '../doc/DocContext'
import { STATUS_LABEL, type ScreenStatus } from '../doc/types'

// ============================================================
// SearchPanel — Cursor-style search over the design doc. Matches flow, screen
// and state names; each result navigates to its screen on the canvas (and the
// tree, via the shared selection). Pure projection of the doc — no index.
// ============================================================

type Kind = 'flow' | 'screen' | 'state'

interface Item {
  id: string
  kind: Kind
  label: string
  /** Screen to select on click (a state/flow resolves to a screen). */
  screenId?: string
  status?: ScreenStatus
  /** Parent context shown faintly on the right (flow / owning screen). */
  context?: string
}

function KindIcon({ kind }: { kind: Kind }) {
  if (kind === 'flow') return <Folder size={14} strokeWidth={1.6} style={{ color: 'var(--accent)' }} />
  if (kind === 'state')
    return <Circle size={8} strokeWidth={0} fill="currentColor" style={{ color: 'var(--text-soft)' }} />
  return <Monitor size={14} strokeWidth={1.6} style={{ color: 'var(--blue)' }} />
}

/** Split `label` around the first case-insensitive match of `q` for highlighting. */
function highlight(label: string, q: string) {
  if (!q) return label
  const i = label.toLowerCase().indexOf(q.toLowerCase())
  if (i < 0) return label
  return (
    <>
      {label.slice(0, i)}
      <mark className="search-result__hit">{label.slice(i, i + q.length)}</mark>
      {label.slice(i + q.length)}
    </>
  )
}

export function SearchPanel() {
  const { doc, selectScreen, selectedScreenId } = useDoc()
  const [query, setQuery] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo<Item[]>(() => {
    const flowOf = new Map<string, string>()
    for (const f of doc.flows) for (const sid of f.screenIds) if (!flowOf.has(sid)) flowOf.set(sid, f.name)

    const out: Item[] = []
    for (const f of doc.flows) {
      out.push({
        id: f.id,
        kind: 'flow',
        label: f.name,
        screenId: f.screenIds[0],
        context: f.kind === 'main' ? 'ana akış' : 'akış',
      })
    }
    for (const s of doc.screens) {
      out.push({ id: s.id, kind: 'screen', label: s.name, screenId: s.id, status: s.status, context: flowOf.get(s.id) })
      for (const st of s.states) {
        out.push({ id: st.id, kind: 'state', label: st.name, screenId: s.id, status: st.status, context: s.name })
      }
    }
    return out
  }, [doc])

  const q = query.trim()
  const results = useMemo(() => {
    if (!q) return []
    const needle = q.toLowerCase()
    return items.filter((it) => it.label.toLowerCase().includes(needle)).slice(0, 100)
  }, [items, q])

  return (
    <div className="side-panel">
      <div className="side-panel__head">ARA</div>
      <div className="search-box">
        <Search size={14} strokeWidth={1.6} className="search-box__icon" aria-hidden />
        <input
          ref={inputRef}
          className="search-box__input"
          placeholder="Ekran, akış, durum ara…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          spellCheck={false}
          autoFocus
        />
        {query && (
          <button
            type="button"
            className="search-box__clear"
            title="Temizle"
            onClick={() => {
              setQuery('')
              inputRef.current?.focus()
            }}
          >
            <X size={13} strokeWidth={2} />
          </button>
        )}
      </div>

      <div className="search-results">
        {!q ? (
          <p className="search-empty">İsme göre ara — sonuçlar tıklayınca tuvalde açılır.</p>
        ) : results.length === 0 ? (
          <p className="search-empty">“{q}” için sonuç yok.</p>
        ) : (
          <>
            <div className="search-results__count">{results.length} sonuç</div>
            {results.map((it) => (
              <button
                key={`${it.kind}:${it.id}`}
                type="button"
                className={`search-result status-${it.status ?? 'locked'}${
                  it.screenId && it.screenId === selectedScreenId ? ' is-active' : ''
                }`}
                onClick={() => it.screenId && selectScreen(it.screenId)}
                disabled={!it.screenId}
                title={it.status ? STATUS_LABEL[it.status] : it.label}
              >
                <span className="search-result__icon">
                  <KindIcon kind={it.kind} />
                </span>
                <span className="search-result__label">{highlight(it.label, q)}</span>
                {it.kind === 'state' && <CornerUpRight size={11} className="search-result__rel" aria-hidden />}
                {it.context && <span className="search-result__context">{it.context}</span>}
                {it.status && it.status !== 'locked' && (
                  <span className="search-result__dot screen-item__dot" aria-hidden />
                )}
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
