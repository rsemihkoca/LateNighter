import { TreeNavigator } from './TreeNavigator'

// ============================================================
// Sidebar — the Explorer tree. (The activity bar with view switching and the
// Source Control / diff view were removed; the tree is the whole sidebar now.)
// ============================================================

export function Sidebar() {
  return (
    <div className="flex flex-col h-full w-full min-w-0 bg-panel">
      <div className="flex-[1_1_auto] min-h-0 flex">
        <TreeNavigator />
      </div>
    </div>
  )
}
