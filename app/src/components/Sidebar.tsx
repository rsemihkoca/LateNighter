import { TreeNavigator } from './TreeNavigator'

// ============================================================
// Sidebar — the Explorer tree. (The activity bar with view switching and the
// Source Control / diff view were removed; the tree is the whole sidebar now.)
// ============================================================

export function Sidebar() {
  return (
    <div className="sidebar">
      <div className="sidebar__view">
        <TreeNavigator />
      </div>
    </div>
  )
}
