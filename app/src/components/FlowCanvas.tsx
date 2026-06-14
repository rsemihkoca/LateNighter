import { useCallback, useEffect, useMemo, useRef, type MouseEvent } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  PanOnScrollMode,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  useReactFlow,
  type Connection,
  type Edge,
  type Node,
  type NodeTypes,
  type OnEdgesChange,
  type OnNodesChange,
  type OnSelectionChangeFunc,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Code2, Monitor } from 'lucide-react'
import { useTheme } from '../theme/ThemeContext'
import { useDoc } from '../doc/DocContextCore'
import { docToEdges, docToNodes } from '../doc/derive'
import { computeLayout, GRID_DOT_SIZE, GRID_GAP } from '../doc/layout'
import { ScreenNode, type ScreenNodeData } from './ScreenNode'
import { LaneGuides } from './LaneGuides'

const nodeTypes: NodeTypes = { screen: ScreenNode }

// Floating tool rail button (was .flow-tool-rail__btn). The enter keyframe lives
// in app.css (residual); motion-reduce disables the hover transition.
const FLOW_RAIL_BTN =
  'relative grid place-items-center w-8 h-8 p-0 border border-transparent rounded-sm bg-transparent text-fg-muted cursor-pointer transition-[transform,background-color,border-color,color] duration-[140ms] hover:bg-subtle hover:border-border hover:text-fg-strong hover:translate-x-0.5 active:translate-x-0.5 active:scale-[0.96] motion-reduce:transition-none'

function useInitialFitView() {
  const { fitView } = useReactFlow()
  const initialFitDone = useRef(false)

  const scheduleInitialFit = useCallback(() => {
    if (initialFitDone.current) return undefined
    const raf = requestAnimationFrame(() => {
      if (initialFitDone.current) return
      const panel = document.querySelector('.flow-panel')
      if (!panel?.clientWidth || !panel?.clientHeight) return
      fitView({ padding: 0.25 })
      initialFitDone.current = true
    })
    return () => cancelAnimationFrame(raf)
  }, [fitView])

  useEffect(() => {
    const panel = document.querySelector('.flow-panel')
    if (!panel) return
    const observer = new ResizeObserver(() => scheduleInitialFit())
    observer.observe(panel)
    const cancelInitialFit = scheduleInitialFit()
    return () => {
      observer.disconnect()
      cancelInitialFit?.()
    }
  }, [scheduleInitialFit])

  return scheduleInitialFit
}

function FlowInner() {
  const { theme } = useTheme()
  const {
    doc,
    syncKey,
    selectedScreenId,
    selectScreen,
    connectScreens,
    removeEdges,
    removeScreens,
    renameScreen,
    addScreen,
  } = useDoc()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ScreenNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])
  const scheduleInitialFit = useInitialFitView()

  // Lane center-lines for the background guides, derived from the same
  // layout engine (device-aware) that positions the nodes.
  const laneYs = useMemo(() => computeLayout(doc).laneYs, [doc])

  // Reseed transient React Flow state from the doc on mount and whenever the
  // structure changes externally (file edit) or via the tree (syncKey bump).
  // Positions are graph-derived (nodes aren't draggable), but viewport/camera
  // is intentionally preserved across those structural edits.
  useEffect(() => {
    setNodes(docToNodes(doc))
    setEdges(docToEdges(doc))
    const cancelInitialFit = scheduleInitialFit()
    return () => cancelInitialFit?.()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey])

  useEffect(() => {
    setNodes((current) =>
      current.map((node) => {
        const selected = node.id === selectedScreenId
        return node.selected === selected ? node : { ...node, selected }
      }),
    )
  }, [selectedScreenId, setNodes, syncKey])

  const handleNodesChange = useCallback<OnNodesChange<Node<ScreenNodeData>>>(
    (changes) => {
      onNodesChange(changes)
      // Nodes are not draggable; the only structural change here is removal.
      const removed = changes.filter((change) => change.type === 'remove').map((change) => change.id)
      if (removed.length > 0) removeScreens(removed)
    },
    [onNodesChange, removeScreens],
  )

  const handleEdgesChange = useCallback<OnEdgesChange<Edge>>(
    (changes) => {
      onEdgesChange(changes)
      const removed = changes.filter((change) => change.type === 'remove').map((change) => change.id)
      if (removed.length > 0) removeEdges(removed)
    },
    [onEdgesChange, removeEdges],
  )

  const handleConnect = useCallback(
    (connection: Connection) => {
      if (!connection.source || !connection.target) return
      connectScreens(connection.source, connection.target)
    },
    [connectScreens],
  )

  const handleSelectionChange = useCallback<OnSelectionChangeFunc<Node<ScreenNodeData>, Edge>>(
    ({ nodes: selectedNodes }) => {
      selectScreen(selectedNodes[0]?.id ?? null)
    },
    [selectScreen],
  )

  const handleNodeDoubleClick = useCallback(
    (_event: MouseEvent, node: Node<ScreenNodeData>) => {
      const next = window.prompt('Screen name', node.data.name)
      if (next && next.trim() && next !== node.data.name) {
        renameScreen(node.id, next.trim())
      }
    },
    [renameScreen],
  )

  const addPreviewScreen = useCallback(() => {
    addScreen(undefined, { surface: 'preview' })
  }, [addScreen])

  const addLiveScreen = useCallback(() => {
    addScreen(undefined, { surface: 'live' })
  }, [addScreen])

  return (
    <>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={handleNodesChange}
        onEdgesChange={handleEdgesChange}
        onConnect={handleConnect}
        onSelectionChange={handleSelectionChange}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        colorMode={theme}
        nodesDraggable={false}
        deleteKeyCode={null}
        // Trackpad: two-finger swipe → pan, two-finger pinch → zoom.
        panOnScroll
        panOnScrollMode={PanOnScrollMode.Free}
        panOnScrollSpeed={1.2}
        zoomOnScroll={false}
        zoomOnPinch
        zoomOnDoubleClick={false}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={GRID_GAP} size={GRID_DOT_SIZE} />
        <LaneGuides laneYs={laneYs} />
        <Controls />
      </ReactFlow>
      <FlowToolRail onAddPreview={addPreviewScreen} onAddLive={addLiveScreen} />
    </>
  )
}

function FlowToolRail({
  onAddPreview,
  onAddLive,
}: {
  onAddPreview: () => void
  onAddLive: () => void
}) {
  return (
    <aside
      className="absolute left-[18px] top-1/2 z-[8] flex flex-col gap-1.5 p-[7px] border border-[color-mix(in_srgb,var(--border)_86%,transparent)] rounded-base bg-[color-mix(in_srgb,var(--bg-panel)_88%,transparent)] shadow-[var(--shadow-md)] backdrop-blur-[16px] -translate-y-1/2 [animation:flow-tool-rail-enter_220ms_var(--ease-out)_both] will-change-[transform,opacity] motion-reduce:animate-none"
      aria-label="Flow tools"
    >
      <button
        className={FLOW_RAIL_BTN}
        type="button"
        title="Preview screen"
        onClick={onAddPreview}
      >
        <Monitor size={17} strokeWidth={1.8} />
      </button>
      <button
        className={FLOW_RAIL_BTN}
        type="button"
        title="Live HTML screen"
        onClick={onAddLive}
      >
        <Code2 size={17} strokeWidth={1.8} />
      </button>
    </aside>
  )
}

export function FlowCanvas() {
  return (
    <div className="flow-panel">
      <ReactFlowProvider>
        <FlowInner />
      </ReactFlowProvider>
    </div>
  )
}
