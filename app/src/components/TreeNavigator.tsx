import { useState } from 'react'
import { useDoc } from '../doc/DocContext'
import { docToTree, type TreeNode } from '../doc/derive'
import { STATUS_LABEL, type ScreenStatus } from '../doc/types'

const KIND_ICON: Record<TreeNode['kind'], string> = {
  flow: '⊞',
  screen: '▢',
  state: '•',
  group: '◇',
}

const LEGEND: { status: ScreenStatus; label: string }[] = [
  { status: 'locked', label: 'Locked' },
  { status: 'new', label: 'Yeni' },
  { status: 'changed', label: 'Değişti' },
  { status: 'deleted', label: 'Silindi' },
]

function TreeRow({
  node,
  depth,
  defaultOpen,
  onRenameScreen,
}: {
  node: TreeNode
  depth: number
  defaultOpen?: boolean
  onRenameScreen: (id: string, name: string) => void
}) {
  const [open, setOpen] = useState(defaultOpen ?? depth < 2)
  const hasChildren = node.children.length > 0
  const statusClass = node.status ? ` status-${node.status}` : ''

  const handleRename = () => {
    if (node.kind !== 'screen') return
    const next = window.prompt('Ekran adı', node.label)
    if (next && next.trim() && next !== node.label) onRenameScreen(node.id, next.trim())
  }

  return (
    <div className="tree-row-wrap">
      <div
        className={`tree-row kind-${node.kind}${statusClass}`}
        style={{ paddingLeft: 6 + depth * 14 }}
        onClick={() => hasChildren && setOpen((o) => !o)}
        onDoubleClick={handleRename}
        role="button"
        tabIndex={0}
      >
        <span className={`tree-row__caret${hasChildren ? '' : ' is-leaf'}${open ? ' is-open' : ''}`}>
          {hasChildren ? '▸' : ''}
        </span>
        {node.status ? (
          <span className="tree-row__dot screen-item__dot" aria-hidden />
        ) : (
          <span className="tree-row__icon" aria-hidden>
            {KIND_ICON[node.kind]}
          </span>
        )}
        <span className="tree-row__label">{node.label}</span>
        {node.kind === 'screen' && node.status && (
          <span className="tree-row__badge screen-item__badge">
            {STATUS_LABEL[node.status]}
          </span>
        )}
      </div>
      {hasChildren && open && (
        <div className="tree-row__children">
          {node.children.map((child) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              onRenameScreen={onRenameScreen}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export function TreeNavigator() {
  const { doc, renameScreen } = useDoc()
  const tree = docToTree(doc)
  return (
    <div className="tree">
      <div className="tree__header">
        <h2 className="tree__heading">Tree</h2>
        <span className="tree__count">{doc.screens.length} ekran</span>
      </div>
      <div className="tree__body">
        <TreeRow node={tree} depth={0} defaultOpen onRenameScreen={renameScreen} />
      </div>
      <div className="screens__legend">
        {LEGEND.map((entry) => (
          <span key={entry.status} className={`legend-item status-${entry.status}`}>
            <span className="legend-item__dot screen-item__dot" aria-hidden />
            {entry.label}
          </span>
        ))}
      </div>
    </div>
  )
}
