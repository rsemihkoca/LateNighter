import { useCallback, useEffect } from 'react'
import {
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeTypes,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useTheme } from '../theme/ThemeContext'
import { useDoc } from '../doc/DocContext'
import { docToEdges, docToNodes } from '../doc/derive'
import { ScreenNode, type ScreenNodeData } from './ScreenNode'

const nodeTypes: NodeTypes = { screen: ScreenNode }
const GRID = 16

function FlowInner() {
  const { theme } = useTheme()
  const { doc, syncKey, moveScreen } = useDoc()
  const [nodes, setNodes, onNodesChange] = useNodesState<Node<ScreenNodeData>>([])
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([])

  // Reseed transient React Flow state from the doc on mount and whenever the
  // structure changes externally (file edit) or via the tree (syncKey bump).
  // Node drags do NOT bump syncKey, so live dragging is never interrupted.
  useEffect(() => {
    setNodes(docToNodes(doc))
    setEdges(docToEdges(doc))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [syncKey])

  const minimapNodeColor = useCallback((node: Node) => {
    const status = (node.data as ScreenNodeData | undefined)?.status
    if (status === 'new') return 'var(--green)'
    if (status === 'deleted') return 'var(--red)'
    if (status === 'changed') return 'var(--amber)'
    return 'var(--text-soft)'
  }, [])

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      onNodesChange={onNodesChange}
      onEdgesChange={onEdgesChange}
      onNodeDragStop={(_, node) => moveScreen(node.id, node.position)}
      nodeTypes={nodeTypes}
      colorMode={theme}
      snapToGrid
      snapGrid={[GRID, GRID]}
      fitView
      fitViewOptions={{ padding: 0.25 }}
      proOptions={{ hideAttribution: true }}
    >
      <Background variant={BackgroundVariant.Dots} gap={GRID} size={1} />
      <MiniMap nodeColor={minimapNodeColor} pannable zoomable />
      <Controls />
    </ReactFlow>
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
