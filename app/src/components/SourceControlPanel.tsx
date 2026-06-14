import { useMemo, useState } from 'react'
import { Check, GitCommitHorizontal, History } from 'lucide-react'
import { useDoc } from '../doc/DocContext'
import type { ScreenStatus } from '../doc/types'

// ============================================================
// SourceControlPanel — the design's "source control". The doc already carries
// GitHub-diff semantics (screens are new/changed/deleted vs. a locked
// baseline), so this lists the pending diff like Cursor's Changes view: a
// commit message + a Commit button that baselines the diff to locked and
// records the commit.
// ============================================================

// Git-style single-letter status, mapped from the screen status.
const CHANGE_TAG: Record<Exclude<ScreenStatus, 'locked'>, string> = {
  new: 'A',
  changed: 'M',
  deleted: 'D',
}

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000))
  if (s < 60) return 'az önce'
  const m = Math.round(s / 60)
  if (m < 60) return `${m} dk önce`
  const h = Math.round(m / 60)
  if (h < 24) return `${h} sa önce`
  const d = Math.round(h / 24)
  return `${d} gün önce`
}

export function SourceControlPanel() {
  const { doc, selectScreen, selectedScreenId, commitChanges } = useDoc()
  const [message, setMessage] = useState('')

  const changes = useMemo(
    () => doc.screens.filter((s) => s.status !== 'locked'),
    [doc.screens],
  )
  const commits = doc.commits ?? []
  const canCommit = changes.length > 0 && message.trim().length > 0

  const commit = () => {
    if (!canCommit) return
    commitChanges(message)
    setMessage('')
  }

  return (
    <div className="side-panel">
      <div className="side-panel__head">KAYNAK DENETİMİ</div>

      <div className="commit-box">
        <textarea
          className="commit-box__msg"
          placeholder="Commit mesajı (örn. login akışı güncellendi)"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={2}
          onKeyDown={(e) => {
            // Cmd/Ctrl+Enter commits, like Cursor.
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault()
              commit()
            }
          }}
        />
        <button type="button" className="commit-box__btn" disabled={!canCommit} onClick={commit}>
          <Check size={14} strokeWidth={2.2} />
          Commit{changes.length ? ` (${changes.length})` : ''}
        </button>
      </div>

      <div className="sc-body">
        <div className="changes">
        <div className="changes__group">Değişiklikler{changes.length ? ` — ${changes.length}` : ''}</div>
        {changes.length === 0 ? (
          <p className="changes__empty">Bekleyen değişiklik yok — her şey commit'lendi.</p>
        ) : (
          changes.map((s) => {
            const tag = CHANGE_TAG[s.status as Exclude<ScreenStatus, 'locked'>]
            return (
              <button
                key={s.id}
                type="button"
                className={`change-row status-${s.status}${
                  s.id === selectedScreenId ? ' is-active' : ''
                }`}
                onClick={() => selectScreen(s.id)}
              >
                <span className="change-row__name">{s.name}</span>
                {s.meta && <span className="change-row__meta">{s.meta}</span>}
                <span className="change-row__tag" aria-hidden>
                  {tag}
                </span>
              </button>
            )
          })
        )}
        </div>

        {commits.length > 0 && (
          <div className="commit-log">
            <div className="changes__group changes__group--log">
              <History size={12} strokeWidth={1.8} />
              Geçmiş
            </div>
            {commits.slice(0, 20).map((c) => (
              <div key={c.id} className="commit-log__row" title={new Date(c.at).toLocaleString()}>
                <GitCommitHorizontal size={14} strokeWidth={1.6} className="commit-log__icon" aria-hidden />
                <span className="commit-log__msg">{c.message || '(mesajsız)'}</span>
                <span className="commit-log__time">{timeAgo(c.at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
