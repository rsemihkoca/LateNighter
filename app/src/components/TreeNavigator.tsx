import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from 'react'
import {
  ChevronRight,
  Folder,
  FolderOpen,
  Monitor,
  Circle,
  CornerUpRight,
  FilePlus,
  FolderPlus,
  RefreshCw,
  ChevronsDownUp,
} from 'lucide-react'
import { useDoc } from '../doc/DocContext'
import { docToTree, type TreeKind, type TreeNode } from '../doc/derive'
import type { ScreenStatus } from '../doc/types'

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
  status?: ScreenStatus
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
      status: node.status,
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

const STATUS_COLOR: Record<ScreenStatus, string | undefined> = {
  locked: 'var(--text-faint)',
  new: 'var(--green)',
  changed: 'var(--amber)',
  deleted: 'var(--red)',
}

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
    syncKey,
  } = useDoc()

  const treeModel = useMemo(() => docToTree(doc), [doc])
  const { meta, kids } = useMemo(() => buildMaps(treeModel), [treeModel])
  const ROOT = treeModel.id

  const initialExpanded = useMemo(
    () => new Set([ROOT, ...(kids.get(ROOT) ?? []).filter((id) => (kids.get(id)?.length ?? 0) > 0)]),
    [ROOT, kids],
  )
  const [expanded, setExpanded] = useState<Set<string>>(initialExpanded)
  const [focused, setFocused] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const rowEls = useRef<Record<string, HTMLDivElement | null>>({})

  const nameOf = useCallback((id: string) => meta.get(id)?.name ?? '', [meta])

  // Re-seed expansion when the doc is structurally rebuilt externally so newly
  // added folders default to a sensible open state.
  useEffect(() => {
    setExpanded((prev) => {
      const next = new Set(prev)
      next.add(ROOT)
      return next
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey])

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
      // Prefer the screen's own node over link/state rows that share its
      // screenId (a link row usually renders before its target screen).
      const match =
        visible.find((v) => v.id === selectedScreenId) ??
        visible.find((v) => meta.get(v.id)?.screenId === selectedScreenId)
      if (match && match.id !== focused) setFocused(match.id)
    } else if (focused === null && visible.length) {
      setFocused(visible[0].id)
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

  const activate = useCallback(
    (id: string) => {
      setFocused(id)
      scrollRef.current?.focus()
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
      scrollRef.current?.focus()
    },
    [meta, renameScreen, renameFlow, renameState],
  )

  const removeNode = useCallback(
    (id: string) => {
      const m = meta.get(id)
      if (!m) return
      if (m.kind === 'screen') removeScreen(id)
      else if (m.kind === 'flow') removeFlow(id)
      else if (m.kind === 'state') removeState(id)
    },
    [meta, removeScreen, removeFlow, removeState],
  )

  const startRename = (id: string) => {
    if (RENAMABLE.includes(meta.get(id)?.kind as TreeKind)) setRenaming(id)
  }

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (renaming) return
    const idx = visible.findIndex((v) => v.id === focused)
    const cur = visible[idx]
    const isDir = (id: string) => (kids.get(id)?.length ?? 0) > 0

    if (e.key === 'ArrowDown') {
      e.preventDefault()
      const n = visible[Math.min(idx + 1, visible.length - 1)]
      if (n) setFocused(n.id)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      const n = visible[Math.max(idx - 1, 0)]
      if (n) setFocused(n.id)
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      if (!cur) return
      if (isDir(cur.id)) {
        if (!expanded.has(cur.id)) toggle(cur.id)
        else {
          const n = visible[idx + 1]
          if (n && n.level > cur.level) setFocused(n.id)
        }
      }
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      if (!cur) return
      if (isDir(cur.id) && expanded.has(cur.id)) toggle(cur.id)
      else if (cur.level > 0) setFocused(cur.parents[cur.level - 1])
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (cur) activate(cur.id)
    } else if (e.key === 'F2') {
      e.preventDefault()
      if (focused) startRename(focused)
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault()
      if (focused) removeNode(focused)
    }
  }

  // VS Code-style "new" buttons: create inside the focused container.
  const addItem = () => {
    const m = focused ? meta.get(focused) : undefined
    if (m?.kind === 'flow') addScreen({ flowId: focused! })
    else if (m?.kind === 'screen') addState(focused!)
    else if (m?.kind === 'state' && m.screenId) addState(m.screenId)
    else addScreen()
  }
  const addContainer = () => {
    const m = focused ? meta.get(focused) : undefined
    if (m?.kind === 'screen') addFlow({ screenId: focused! })
    else if (m?.kind === 'flow') addFlow({ flowId: focused! })
    else addFlow()
  }

  const refresh = () => setExpanded(new Set(initialExpanded))
  const collapseAll = () => setExpanded(new Set([ROOT]))

  const toolStyle: CSSProperties = {
    padding: 4,
    borderRadius: 4,
    color: T.fg,
    display: 'flex',
    cursor: 'pointer',
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
        .ce-header:hover .ce-tools { opacity: 1; }
        .ce-tool:hover { background: color-mix(in srgb, var(--text-strong) 12%, transparent); }
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
          <div className="ce-tools" style={{ display: 'flex', gap: 2, opacity: 0, transition: 'opacity .12s' }}>
            {[
              { icon: FilePlus, t: 'Yeni öğe', a: addItem },
              { icon: FolderPlus, t: 'Yeni akış', a: addContainer },
              { icon: RefreshCw, t: 'Yenile', a: refresh },
              { icon: ChevronsDownUp, t: 'Tümünü kapat', a: collapseAll },
            ].map(({ icon: Icon, t, a }) => (
              <div
                key={t}
                title={t}
                className="ce-tool"
                style={toolStyle}
                onClick={(e) => {
                  e.stopPropagation()
                  a()
                }}
              >
                <Icon size={15} strokeWidth={1.5} />
              </div>
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
              const statusColor = m.status ? STATUS_COLOR[m.status] : undefined
              const labelColor = isSel ? '#fff' : statusColor ?? T.fg
              return (
                <div
                  key={id}
                  ref={(el) => {
                    rowEls.current[id] = el
                  }}
                  className="ce-row"
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
                    background: isSel ? T.selActive : undefined,
                  }}
                  onClick={() => activate(id)}
                  onDoubleClick={() => startRename(id)}
                >
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
                        if (e.key === 'Enter') commitRename(id, e.currentTarget.value)
                        else if (e.key === 'Escape') {
                          setRenaming(null)
                          scrollRef.current?.focus()
                        }
                      }}
                      onBlur={(e) => commitRename(id, e.currentTarget.value)}
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
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        textDecoration: m.status === 'deleted' ? 'line-through' : undefined,
                      }}
                    >
                      {displayLabel(m.kind, m.name)}
                    </span>
                  )}

                  {/* status dot — pinned to the row's far right (auto margin) */}
                  {statusColor && !isSel && (
                    <span
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: '50%',
                        marginLeft: 'auto',
                        flexShrink: 0,
                        background: statusColor,
                      }}
                    />
                  )}
                </div>
              )
            })}
        </div>
      </div>
    </div>
  )
}
