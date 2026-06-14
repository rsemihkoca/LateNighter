import { useState, type ComponentType } from 'react'
import { Files, Search, GitBranch } from 'lucide-react'
import { useDoc } from '../doc/DocContext'
import { TreeNavigator } from './TreeNavigator'
import { SearchPanel } from './SearchPanel'
import { SourceControlPanel } from './SourceControlPanel'

// ============================================================
// Sidebar — VS Code / Cursor style. A slim activity bar on the far left
// switches the panel between three views: Files (the explorer tree), Search,
// and Source Control (the design diff). One view is mounted at a time.
// ============================================================

type View = 'files' | 'search' | 'git'

interface Tab {
  id: View
  icon: ComponentType<{ size?: number; strokeWidth?: number }>
  title: string
}

const TABS: Tab[] = [
  { id: 'files', icon: Files, title: 'Gezgin' },
  { id: 'search', icon: Search, title: 'Ara' },
  { id: 'git', icon: GitBranch, title: 'Kaynak denetimi' },
]

export function Sidebar() {
  const [view, setView] = useState<View>('files')
  // Pending-change count drives a small badge on the Source Control icon.
  const { doc } = useDoc()
  const pending = doc.screens.filter((s) => s.status !== 'locked').length

  return (
    <div className="sidebar">
      <nav className="activity-bar" aria-label="Görünümler">
        {TABS.map(({ id, icon: Icon, title }) => (
          <button
            key={id}
            type="button"
            className={`activity-bar__btn${view === id ? ' is-active' : ''}`}
            title={title}
            aria-label={title}
            aria-pressed={view === id}
            onClick={() => setView(id)}
          >
            <Icon size={20} strokeWidth={1.6} />
            {id === 'git' && pending > 0 && (
              <span className="activity-bar__badge">{pending > 99 ? '99+' : pending}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="sidebar__view">
        {view === 'files' && <TreeNavigator />}
        {view === 'search' && <SearchPanel />}
        {view === 'git' && <SourceControlPanel />}
      </div>
    </div>
  )
}
