import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type DragEvent,
  type KeyboardEvent,
  type MouseEvent,
} from 'react'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Monitor,
  Circle,
  CornerUpRight,
  GitBranchPlus,
  PanelTopOpen,
  CirclePlus,
  Unlink,
  type LucideIcon,
} from 'lucide-react'
import { useDoc } from '../doc/DocContextCore'
import { docToTree, type TreeKind, type TreeNode } from '../doc/derive'

/* ─────────────────────────────────────────────────────────────
   Data layer. In the reference this was a mock filesystem + async
   readDir(); here the tree is derived synchronously from the doc
   (docToTree), so there is no disk read and no loading state. The
   node's "extension" is its kind (login.screen, main.flow, …).
   ───────────────────────────────────────────────────────────── */

interface NodeMeta {
  name: string
  kind: TreeKind
  isDir: boolean
  /** Screen this row navigates to when clicked (screen rows + link/state rows). */
  screenId?: string
}

function buildMaps(root: TreeNode) {
  const meta = new Map<string, NodeMeta>()
  const kids = new Map<string, string[]>()

  const visit = (node: TreeNode) => {
    meta.set(node.id, {
      name: node.label,
      kind: node.kind,
      isDir: node.children.length > 0,
      screenId: node.kind === 'screen' ? node.id : node.screenId,
    })
    kids.set(node.id, node.children.map((c) => c.id))
    node.children.forEach(visit)
  }

  visit(root)
  return { meta, kids }
}

/* ─────────────────────────────────────────────────────────────
   Theme tokens — sourced from the app's CSS variables so the
   explorer follows the light/dark theme instead of hardcoding
   VS Code's "Dark Modern" hex values.
   ───────────────────────────────────────────────────────────── */
const T = {
  sidebarBg: 'var(--bg-panel)',
  activityBg: 'color-mix(in srgb, var(--bg-panel) 92%, var(--bg-subtle))',
  panelBorder: 'var(--border)',
  fg: 'var(--text)',
  fgMuted: 'var(--text-muted)',
  headerFg: 'var(--text-strong)',
  rowHover: 'color-mix(in srgb, var(--text-strong) 8%, transparent)',
  selActive: 'color-mix(in srgb, var(--selected) 55%, var(--bg-panel))',
  guide: 'color-mix(in srgb, var(--text-muted) 22%, transparent)',
  guideActive: 'color-mix(in srgb, var(--accent) 70%, var(--text-muted))',
}
const BASE = 8 // left padding before the first twistie
const STEP = 14 // indentation added per nesting level
const ROW_H = 22

const RENAMABLE: TreeKind[] = ['flow', 'screen', 'state']

/** Explorer label = "<name>.<kind>" for real nodes, raw label otherwise. */
function displayLabel(kind: TreeKind, name: string): string {
  return kind === 'flow' || kind === 'screen' || kind === 'state' ? `${name}.${kind}` : name
}

/** Domain icon per kind (folders open/close; leaves keep their type glyph). */
function KindGlyph({ kind, isOpen }: { kind: TreeKind; isOpen: boolean }) {
  const sz = 16
  const sw = 1.5
  switch (kind) {
    case 'flow':
      return isOpen ? (
        <FolderOpen size={sz} strokeWidth={sw} style={{ color: 'var(--accent)' }} />
      ) : (
        <Folder size={sz} strokeWidth={sw} style={{ color: 'var(--accent)' }} />
      )
    case 'group':
      return isOpen ? (
        <FolderOpen size={sz} strokeWidth={sw} style={{ color: 'var(--amber)' }} />
      ) : (
        <Folder size={sz} strokeWidth={sw} style={{ color: 'var(--amber)' }} />
      )
    case 'screen':
      return <Monitor size={sz} strokeWidth={sw} style={{ color: 'var(--blue)' }} />
    case 'state':
      return <Circle size={9} strokeWidth={0} fill="currentColor" style={{ color: 'var(--text-soft)' }} />
    case 'link':
      return <CornerUpRight size={sz} strokeWidth={sw} style={{ color: 'var(--purple)' }} />
  }
}

interface VisibleRow {
  id: string
  level: number
  parents: string[]
}

interface TreeAction {
  icon: LucideIcon
  title: string
  tone: 'flow' | 'screen' | 'state' | 'link'
  action: () => void
}

/** A link tree-node id is `link:<edgeId>` (see derive.ts). */
const edgeIdOf = (linkNodeId: string) =>
  linkNodeId.startsWith('link:') ? linkNodeId.slice('link:'.length) : null

export function TreeNavigator() {
  const {
    doc,
    selectScreen,
    selectedScreenId,
    addFlow,
    renameFlow,
    removeFlow,
    addScreen,
    renameScreen,
    removeScreen,
    addState,
    renameState,
    removeState,
    reorderScreen,
    moveState,
    moveFlow,
    connectScreens,
    removeEdges,
  } = useDoc()

  const treeModel = useMemo(() => docToTree(doc), [doc])
  const { meta, kids } = useMemo(() => buildMaps(treeModel), [treeModel])
  const ROOT = treeModel.id

  const initialExpanded = useMemo(
    () => new Set([ROOT, ...(kids.get(ROOT) ?? []).filter((id) => (kids.get(id)?.length ?? 0) > 0)]),
    [ROOT, kids],
  )
  const [expanded, setExpanded] = useState<Set<string>>(() => initialExpanded)
  const [focused, setFocused] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rowEls = useRef<Record<string, HTMLDivElement | null>>({})

  const nameOf = useCallback((id: string) => meta.get(id)?.name ?? '', [meta])

  const toggle = useCallback((id: string) => {
    setExpanded((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }, [])

  /* Flatten the visible tree into rows; parents[] powers the indent guides. */
  const visible = useMemo(() => {
    const out: VisibleRow[] = []
    const walk = (id: string, level: number, parents: string[]) => {
      out.push({ id, level, parents })
      const childIds = kids.get(id)
      if (childIds && childIds.length > 0 && expanded.has(id)) {
        for (const c of childIds) walk(c, level + 1, [...parents, id])
      }
    }
    for (const c of kids.get(ROOT) ?? []) walk(c, 0, [])
    return out
  }, [expanded, kids, ROOT])

  // Keep the keyboard cursor in sync with the externally selected screen
  // (e.g. clicking a node on the canvas) and default it to the first row.
  useEffect(() => {
    if (selectedScreenId) {
      const match =
        visible.find((v) => v.id === selectedScreenId) ??
        visible.find((v) => meta.get(v.id)?.screenId === selectedScreenId)
      if (!match) return
      queueMicrotask(() => {
        setFocused((current) => {
          const currentMeta = current ? meta.get(current) : undefined
          const alreadyOnScreen =
            current === selectedScreenId || currentMeta?.screenId === selectedScreenId
          return alreadyOnScreen ? current : match.id
        })
      })
    } else if (focused === null && visible.length) {
      const firstId = visible[0].id
      queueMicrotask(() => {
        setFocused((current) => current ?? firstId)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedScreenId, visible])

  // Scroll the focused row into view.
  useEffect(() => {
    if (focused) rowEls.current[focused]?.scrollIntoView({ block: 'nearest' })
  }, [focused])

  /* Active indent guide = the column directly left of the focused node. */
  const fEntry = visible.find((v) => v.id === focused)
  const fLevel = fEntry ? fEntry.level : -1
  const fAncestor = fEntry && fLevel > 0 ? fEntry.parents[fLevel - 1] : null

  const activateRow = useCallback(
    (id: string) => {
      setFocused(id)
      const m = meta.get(id)
      if (m?.screenId) selectScreen(m.screenId)
      if (m?.isDir) toggle(id)
    },
    [meta, selectScreen, toggle],
  )

  const commitRename = useCallback(
    (id: string, value: string) => {
      const v = value.trim()
      const m = meta.get(id)
      if (v && m && v !== m.name) {
        if (m.kind === 'screen') renameScreen(id, v)
        else if (m.kind === 'flow') renameFlow(id, v)
        else if (m.kind === 'state') renameState(id, v)
      }
      setRenaming(null)
    },
    [meta, renameScreen, renameFlow, renameState],
  )

  // Delete a single relationship (edge) — the tree shows it as a `link` node.
  const removeLink = useCallback(
    (linkNodeId: string) => {
      const edgeId = edgeIdOf(linkNodeId)
      if (edgeId) removeEdges([edgeId])
    },
    [removeEdges],
  )

  const removeNode = useCallback(
    (id: string) => {
      const m = meta.get(id)
      if (!m) return
      if (m.kind === 'screen') removeScreen(id)
      else if (m.kind === 'flow') removeFlow(id)
      else if (m.kind === 'state') removeState(id)
      else if (m.kind === 'link') removeLink(id)
    },
    [meta, removeScreen, removeFlow, removeState, removeLink],
  )

  const startRename = (id: string, event: MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0 || event.detail !== 2) return
    if (RENAMABLE.includes(meta.get(id)?.kind as TreeKind)) setRenaming(id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return
    const idx = visible.findIndex((v) => v.id === focused)
    const cur = visible[idx]
    const isDir = (id: string) => (kids.get(id)?.length ?? 0) > 0
    const consume = () => {
      e.preventDefault()
      e.stopPropagation()
    }

    if (e.key === 'ArrowDown') {
      consume()
      const n = visible[Math.min(idx + 1, visible.length - 1)]
      if (n) setFocused(n.id)
    } else if (e.key === 'ArrowUp') {
      consume()
      const n = visible[Math.max(idx - 1, 0)]
      if (n) setFocused(n.id)
    } else if (e.key === 'ArrowRight') {
      consume()
      if (!cur) return
      if (isDir(cur.id)) {
        if (!expanded.has(cur.id)) toggle(cur.id)
        else {
          const n = visible[idx + 1]
          if (n && n.level > cur.level) setFocused(n.id)
        }
      }
    } else if (e.key === 'ArrowLeft') {
      consume()
      if (!cur) return
      if (isDir(cur.id) && expanded.has(cur.id)) toggle(cur.id)
      else if (cur.level > 0) setFocused(cur.parents[cur.level - 1])
    } else if (e.key === 'Enter') {
      consume()
      if (cur) {
        activateRow(cur.id)
        scrollRef.current?.focus()
      }
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      consume()
      if (focused) removeNode(focused)
    }
  }

  const expandNode = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(id)
      return next
    })
  }, [])

  const addProjectFlow = useCallback(() => {
    expandNode(ROOT)
    addFlow()
  }, [addFlow, expandNode, ROOT])

  const addScreenToFlow = useCallback(
    (flowId: string) => {
      expandNode(flowId)
      addScreen({ flowId })
    },
    [addScreen, expandNode],
  )

  const addFlowToScreen = useCallback(
    (screenId: string) => {
      expandNode(screenId)
      selectScreen(screenId)
      addFlow({ screenId })
    },
    [addFlow, expandNode, selectScreen],
  )

  const addStateToScreen = useCallback(
    (screenId: string) => {
      expandNode(screenId)
      selectScreen(screenId)
      addState(screenId)
    },
    [addState, expandNode, selectScreen],
  )

  const actionsForRow = useCallback(
    (id: string, kind: TreeKind): TreeAction[] => {
      if (kind === 'flow') {
        return [
          {
            icon: PanelTopOpen,
            title: 'Add screen to this flow',
            tone: 'screen',
            action: () => addScreenToFlow(id),
          },
        ]
      }
      if (kind === 'screen') {
        return [
          {
            icon: GitBranchPlus,
            title: 'Add flow from this screen',
            tone: 'flow',
            action: () => addFlowToScreen(id),
          },
          {
            icon: CirclePlus,
            title: 'Add state to this screen',
            tone: 'state',
            action: () => addStateToScreen(id),
          },
        ]
      }
      if (kind === 'link') {
        return [
          {
            icon: Unlink,
            title: 'Remove connection',
            tone: 'link',
            action: () => removeLink(id),
          },
        ]
      }
      return []
    },
    [addFlowToScreen, addScreenToFlow, addStateToScreen, removeLink],
  )

  const projectActions: TreeAction[] = [
    { icon: GitBranchPlus, title: 'Add flow', tone: 'flow', action: addProjectFlow },
  ]

  // -------- Drag & drop ----------------------------------------------------
  // Reorder/move screens, states and flows by dragging rows. Order lives in the
  // doc (flow.screenIds / screen.states / doc.flows), so a drop maps to a
  // move* mutation; the folder mirror preserves the new order on round-trip.
  type DropZone = 'before' | 'after' | 'inside'
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropAt, setDropAt] = useState<{ id: string; zone: DropZone } | null>(null)

  // id → immediate parent id (from the flattened tree). A node id is unique in
  // the visible list, so this is well-defined.
  const parentOf = useMemo(() => {
    const map = new Map<string, string | null>()
    for (const v of visible) map.set(v.id, v.level > 0 ? v.parents[v.level - 1] : null)
    return map
  }, [visible])

  const DRAGGABLE: TreeKind[] = ['flow', 'screen', 'state']
  const kindOf = (id: string) => meta.get(id)?.kind
  // True if `node` sits inside `ancestor`'s subtree (walks the parent chain).
  const isUnder = (node: string, ancestor: string) => {
    let cur = parentOf.get(node) ?? null
    const seen = new Set<string>()
    while (cur && !seen.has(cur)) {
      if (cur === ancestor) return true
      seen.add(cur)
      cur = parentOf.get(cur) ?? null
    }
    return false
  }
  const acceptsInside = (dk?: TreeKind, tk?: TreeKind) =>
    (dk === 'screen' && (tk === 'flow' || tk === 'screen')) || // into a flow, or connect to a screen
    (dk === 'state' && tk === 'screen') ||
    (dk === 'flow' && (tk === 'flow' || tk === 'screen'))
  const acceptsSibling = (dk?: TreeKind, tk?: TreeKind) => dk === tk // screen↔screen, state↔state, flow↔flow

  // Where a hover lands on the target row, or null if the drop is invalid.
  const zoneFor = (e: DragEvent<HTMLDivElement>, targetId: string): DropZone | null => {
    if (!dragId || dragId === targetId) return null
    if (isUnder(targetId, dragId)) return null // can't drop into own subtree
    const dk = kindOf(dragId)
    const tk = kindOf(targetId)
    const inside = acceptsInside(dk, tk)
    const sibling = acceptsSibling(dk, tk)
    if (!inside && !sibling) return null
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    const h = rect.height || ROW_H
    if (inside && sibling) return y < h * 0.27 ? 'before' : y > h * 0.73 ? 'after' : 'inside'
    if (inside) return 'inside'
    return y < h * 0.5 ? 'before' : 'after'
  }

  const performDrop = (target: string, zone: DropZone) => {
    if (!dragId) return
    const dk = kindOf(dragId)
    const tk = kindOf(target)
    // Dropping "inside" a container should reveal where the node landed.
    if (zone === 'inside') expandNode(target)
    if (dk === 'screen') {
      if (tk === 'screen' && zone === 'inside') {
        // Drop a screen onto a screen → connect them (edge target → dragged),
        // which shows as a link under the target screen.
        connectScreens(target, dragId)
      } else if (tk === 'screen' && zone !== 'inside') {
        const pid = parentOf.get(target)
        const toFlow = pid && kindOf(pid) === 'flow' ? pid : null
        reorderScreen(dragId, toFlow, target, zone)
      } else if (tk === 'flow' && zone === 'inside') {
        reorderScreen(dragId, target, null, 'after')
      }
    } else if (dk === 'state') {
      if (tk === 'state' && zone !== 'inside') {
        const pid = parentOf.get(target)
        if (pid && kindOf(pid) === 'screen') moveState(dragId, pid, target, zone)
      } else if (tk === 'screen' && zone === 'inside') {
        moveState(dragId, target, null, 'after')
      }
    } else if (dk === 'flow') {
      if (tk === 'flow' && zone !== 'inside') {
        const pid = parentOf.get(target)
        const pk = pid ? kindOf(pid) : null
        const parent =
          pk === 'flow' ? { flowId: pid! } : pk === 'screen' ? { screenId: pid! } : null
        moveFlow(dragId, parent, target, zone)
      } else if (tk === 'flow' && zone === 'inside') {
        moveFlow(dragId, { flowId: target }, null, 'after')
      } else if (tk === 'screen' && zone === 'inside') {
        moveFlow(dragId, { screenId: target }, null, 'after')
      }
    }
  }

  const onRowDragStart = (e: DragEvent<HTMLDivElement>, id: string) => {
    setDragId(id)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', id)
  }
  const onRowDragOver = (e: DragEvent<HTMLDivElement>, id: string) => {
    const zone = zoneFor(e, id)
    if (!zone) {
      if (dropAt) setDropAt(null)
      return
    }
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropAt?.id !== id || dropAt.zone !== zone) setDropAt({ id, zone })
  }
  const onRowDrop = (e: DragEvent<HTMLDivElement>, id: string) => {
    e.preventDefault()
    const zone = dropAt?.id === id ? dropAt.zone : zoneFor(e, id)
    if (zone) performDrop(id, zone)
    setDragId(null)
    setDropAt(null)
  }
  const endDrag = () => {
    setDragId(null)
    setDropAt(null)
  }

  return (
    <div
      style={{
        fontFamily: 'var(--sans)',
        display: 'flex',
        height: '100%',
        width: '100%',
        minWidth: 0,
        background: T.sidebarBg,
        color: T.fg,
      }}
    >
      <style>{`
        .ce-scroll::-webkit-scrollbar { width: 10px; }
        .ce-scroll::-webkit-scrollbar-thumb { background: color-mix(in srgb, var(--text-muted) 28%, transparent); border-radius: 5px; }
        .ce-scroll::-webkit-scrollbar-thumb:hover { background: color-mix(in srgb, var(--text-muted) 46%, transparent); }
        .ce-scroll:focus { outline: none; }
        .ce-row:hover { background: ${T.rowHover}; }
        .ce-header:hover .ce-tools,
        .ce-header:focus-within .ce-tools,
        .ce-row:hover .ce-row-tools,
        .ce-row:focus-within .ce-row-tools,
        .ce-row.is-selected .ce-row-tools { opacity: 1; }
        .ce-tools { opacity: .74; transition: opacity .12s ease; }
        .ce-row-tools {
          display: inline-flex;
          align-items: center;
          gap: 1px;
          margin-left: 6px;
          opacity: 0;
          transition: opacity .12s ease;
        }
        .ce-tool,
        .ce-row-tool {
          position: relative;
          width: 22px;
          height: 22px;
          padding: 0;
          border: 0;
          border-radius: 4px;
          color: ${T.fg};
          background: transparent;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
        }
        .ce-row-tool {
          width: 20px;
          height: 20px;
          color: var(--text-muted);
        }
        .ce-tool:hover,
        .ce-row-tool:hover {
          background: color-mix(in srgb, var(--text-strong) 12%, transparent);
          color: var(--text-strong);
        }
        .ce-tool--flow,
        .ce-row-tool--flow {
          color: var(--accent);
        }
        .ce-row-tool--screen {
          color: var(--blue);
        }
        .ce-row-tool--state {
          color: var(--green);
        }
        .ce-row-tool--link {
          color: var(--purple);
        }
        .ce-row-tool--link:hover {
          color: var(--red);
          background: color-mix(in srgb, var(--red) 14%, transparent);
        }
      `}</style>

      {/* Explorer panel */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* Project section header + toolbar */}
        <div
          className="ce-header"
          style={{ display: 'flex', alignItems: 'center', height: 24, marginTop: 6, paddingRight: 6, cursor: 'pointer', userSelect: 'none' }}
          onClick={() => toggle(ROOT)}
        >
          <ChevronRight
            size={16}
            style={{
              color: T.fgMuted,
              marginLeft: 4,
              transform: expanded.has(ROOT) ? 'rotate(90deg)' : 'none',
              transition: 'transform .1s',
            }}
          />
          <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: '.06em', color: T.headerFg, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {nameOf(ROOT).toUpperCase()}
          </span>
          <div className="ce-tools" style={{ display: 'flex', gap: 2 }}>
            {projectActions.map(({ icon: Icon, title, action, tone }) => (
              <button
                key={title}
                type="button"
                title={title}
                aria-label={title}
                className={`ce-tool ce-tool--${tone}`}
                onClick={(e) => {
                  e.stopPropagation()
                  action()
                }}
              >
                <Icon size={16} strokeWidth={1.65} />
              </button>
            ))}
          </div>
        </div>

        {/* Tree */}
        <div
          ref={scrollRef}
          className="ce-scroll"
          tabIndex={0}
          onKeyDown={onKeyDown}
          style={{ flex: 1, overflowY: 'auto', color: T.fg, paddingBottom: 8 }}
        >
          {expanded.has(ROOT) &&
            visible.map(({ id, level, parents }) => {
              const m = meta.get(id)!
              const isDir = (kids.get(id)?.length ?? 0) > 0
              const isOpen = expanded.has(id)
              const isSel = focused === id
              const labelColor = isSel ? '#fff' : T.fg
              const rowActions = actionsForRow(id, m.kind)
              const insideHere = dropAt?.id === id && dropAt.zone === 'inside'
              const lineHere =
                dropAt?.id === id && dropAt.zone !== 'inside' ? dropAt.zone : null
              const isDragging = dragId === id
              return (
                <div
                  key={id}
                  ref={(el) => {
                    rowEls.current[id] = el
                  }}
                  className={`ce-row${isSel ? ' is-selected' : ''}${rowActions.length ? ' has-actions' : ''}`}
                  draggable={DRAGGABLE.includes(m.kind) && renaming !== id}
                  onDragStart={(e) => onRowDragStart(e, id)}
                  onDragOver={(e) => onRowDragOver(e, id)}
                  onDrop={(e) => onRowDrop(e, id)}
                  onDragEnd={endDrag}
                  style={{
                    position: 'relative',
                    height: ROW_H,
                    display: 'flex',
                    alignItems: 'center',
                    paddingLeft: BASE + level * STEP,
                    paddingRight: 8,
                    cursor: 'pointer',
                    userSelect: 'none',
                    fontSize: 13,
                    whiteSpace: 'nowrap',
                    color: labelColor,
                    opacity: isDragging ? 0.5 : undefined,
                    boxShadow: insideHere ? 'inset 0 0 0 1px var(--accent)' : undefined,
                    background: insideHere
                      ? 'color-mix(in srgb, var(--accent) 16%, transparent)'
                      : isSel
                        ? T.selActive
                        : undefined,
                  }}
                  onClick={() => {
                    activateRow(id)
                    scrollRef.current?.focus()
                  }}
                  onDoubleClick={(event) => startRename(id, event)}
                >
                  {lineHere && (
                    <span
                      style={{
                        position: 'absolute',
                        left: BASE + level * STEP,
                        right: 6,
                        height: 2,
                        borderRadius: 2,
                        background: 'var(--accent)',
                        pointerEvents: 'none',
                        top: lineHere === 'before' ? -1 : undefined,
                        bottom: lineHere === 'after' ? -1 : undefined,
                      }}
                    />
                  )}
                  {/* indent guides */}
                  {Array.from({ length: level }).map((_, c) => {
                    const active = c === fLevel - 1 && fAncestor && parents[c] === fAncestor
                    return (
                      <span
                        key={c}
                        style={{
                          position: 'absolute',
                          top: 0,
                          bottom: 0,
                          width: 1,
                          left: BASE + c * STEP + 8,
                          background: active ? T.guideActive : T.guide,
                        }}
                      />
                    )
                  })}

                  {/* twistie */}
                  <span style={{ width: 16, flexShrink: 0, display: 'flex', justifyContent: 'center' }}>
                    {isDir && (
                      <ChevronRight
                        size={16}
                        style={{
                          color: T.fgMuted,
                          transform: isOpen ? 'rotate(90deg)' : 'none',
                          transition: 'transform .1s',
                        }}
                      />
                    )}
                  </span>

                  {/* type icon */}
                  <span style={{ width: 16, flexShrink: 0, display: 'flex', justifyContent: 'center', marginRight: 5 }}>
                    <KindGlyph kind={m.kind} isOpen={isDir && isOpen} />
                  </span>

                  {/* label / rename input */}
                  {renaming === id ? (
                    <input
                      autoFocus
                      defaultValue={m.name}
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        e.stopPropagation()
                        if (e.key === 'Enter') {
                          commitRename(id, e.currentTarget.value)
                          scrollRef.current?.focus()
                        } else if (e.key === 'Escape') {
                          setRenaming(null)
                          scrollRef.current?.focus()
                        }
                      }}
                      onBlur={(e) => {
                        commitRename(id, e.currentTarget.value)
                        scrollRef.current?.focus()
                      }}
                      style={{
                        flex: 1,
                        minWidth: 0,
                        fontSize: 13,
                        fontFamily: 'inherit',
                        color: 'var(--text-strong)',
                        background: 'var(--bg-input, var(--bg-subtle))',
                        border: '1px solid var(--accent)',
                        outline: 'none',
                        padding: '0 2px',
                        height: 18,
                      }}
                    />
                  ) : (
                    <span
                      style={{
                        minWidth: 0,
                        flex: '1 1 auto',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {displayLabel(m.kind, m.name)}
                    </span>
                  )}

                  {rowActions.length > 0 && (
                    <div className="ce-row-tools">
                      {rowActions.map(({ icon: Icon, title, action, tone }) => (
                        <button
                          key={title}
                          type="button"
                          title={title}
                          aria-label={title}
                          className={`ce-row-tool ce-row-tool--${tone}`}
                          onClick={(event) => {
                            event.stopPropagation()
                            action()
                          }}
                          onDoubleClick={(event) => event.stopPropagation()}
                        >
                          <Icon size={15} strokeWidth={1.7} />
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
