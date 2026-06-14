import { useCallback, useEffect, useMemo, type MouseEvent } from 'react'
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
import { useDoc } from '../doc/DocContext'
import { docToEdges, docToNodes } from '../doc/derive'
import { computeLayout, GRID_DOT_SIZE, GRID_GAP } from '../doc/layout'
import { ScreenNode, type ScreenNodeData } from './ScreenNode'
import { LaneGuides } from './LaneGuides'

const nodeTypes: NodeTypes = { screen: ScreenNode }

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
  const { fitView } = useReactFlow()

  // Lane center-lines for the background guides, derived from the same
  // layout engine (device-aware) that positions the nodes.
  const laneYs = useMemo(() => computeLayout(doc).laneYs, [doc])

  // Keep the graph framed. The Dockview panel reports a 0-size on first mount
  // and only settles a frame later, so the initial `fitView` lands on the wrong
  // box and the schema sticks to the top. Re-fit whenever the panel resizes
  // (the observer also fires once on observe → correct initial framing).
  useEffect(() => {
    const panel = document.querySelector('.flow-panel')
    if (!panel) return
    const refit = () => fitView({ padding: 0.25 })
    const observer = new ResizeObserver(refit)
    observer.observe(panel)
    return () => observer.disconnect()
  }, [fitView])

  // Reseed transient React Flow state from the doc on mount and whenever the
  // structure changes externally (file edit) or via the tree (syncKey bump).
  // Positions are graph-derived (nodes aren't draggable), so this also
  // re-runs the auto-layout after every structural edit.
  useEffect(() => {
    setNodes(docToNodes(doc))
    setEdges(docToEdges(doc))
    // Frame the freshly-seeded nodes once they've rendered (next frame), so
    // the schema is centered rather than stuck at the top.
    const raf = requestAnimationFrame(() => fitView({ padding: 0.25 }))
    return () => cancelAnimationFrame(raf)
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
      const next = window.prompt('Ekran adı', node.data.name)
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
        fitView
        fitViewOptions={{ padding: 0.25 }}
        // Trackpad: iki parmakla kaydır → pan, iki parmakla sıkıştır → zoom.
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
    <aside className="flow-tool-rail" aria-label="Flow araçları">
      <button
        className="flow-tool-rail__btn"
        type="button"
        title="Preview ekranı"
        onClick={onAddPreview}
      >
        <Monitor size={17} strokeWidth={1.8} />
      </button>
      <button
        className="flow-tool-rail__btn"
        type="button"
        title="Live HTML ekranı"
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
