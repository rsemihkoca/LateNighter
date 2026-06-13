import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { ScreenNodeData } from '../components/ScreenNode'
import type { Flow, ProjectDoc, Screen, ScreenStatus } from './types'

// -------- Canvas projection (doc → React Flow) ----------------------

export function docToNodes(doc: ProjectDoc): Node<ScreenNodeData>[] {
  return doc.screens.map((screen) => ({
    id: screen.id,
    type: 'screen',
    position: screen.position,
    data: {
      name: screen.name,
      meta: screen.meta,
      status: screen.status,
      stateCount: screen.states.length,
    },
  }))
}

export function docToEdges(doc: ProjectDoc): Edge[] {
  const byId = new Map(doc.screens.map((s) => [s.id, s]))
  return doc.edges.map((edge) => {
    const a = byId.get(edge.source)
    const b = byId.get(edge.target)
    const isNew = a?.status === 'new' || b?.status === 'new'
    const status: ScreenStatus = isNew ? 'new' : 'locked'
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: 'smoothstep',
      animated: isNew,
      className: `flow-edge status-${status}`,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16 },
    }
  })
}

// -------- Tree projection (doc → hierarchical tree) -----------------

export type TreeKind = 'flow' | 'screen' | 'state' | 'group'

export interface TreeNode {
  id: string
  label: string
  kind: TreeKind
  status?: ScreenStatus
  meta?: string
  children: TreeNode[]
}

function buildScreenNode(doc: ProjectDoc, screen: Screen): TreeNode {
  const states: TreeNode[] = screen.states.map((st) => ({
    id: st.id,
    label: st.name,
    kind: 'state',
    status: st.status,
    children: [],
  }))
  // Sub-flows launched by this screen nest directly beneath it.
  const subFlows = doc.flows
    .filter((f) => f.startsFromScreenId === screen.id)
    .map((f) => buildFlowNode(doc, f))
  return {
    id: screen.id,
    label: screen.name,
    kind: 'screen',
    status: screen.status,
    meta: screen.meta,
    children: [...states, ...subFlows],
  }
}

function buildFlowNode(doc: ProjectDoc, flowOrId: Flow | string): TreeNode {
  const flow =
    typeof flowOrId === 'string'
      ? doc.flows.find((f) => f.id === flowOrId)!
      : flowOrId
  const byId = new Map(doc.screens.map((s) => [s.id, s]))
  const screenNodes = flow.screenIds
    .map((id) => byId.get(id))
    .filter((s): s is Screen => Boolean(s))
    .map((s) => buildScreenNode(doc, s))
  // Sub-flows attached to this flow (not to a specific screen).
  const directSubs = doc.flows
    .filter((f) => f.parentFlowId === flow.id && !f.startsFromScreenId)
    .map((f) => buildFlowNode(doc, f))
  return {
    id: flow.id,
    label: flow.name,
    kind: 'flow',
    children: [...screenNodes, ...directSubs],
  }
}

export function docToTree(doc: ProjectDoc): TreeNode {
  const topFlows = doc.flows.filter((f) => !f.parentFlowId)

  // Screens not referenced by any flow (e.g. removed/detached) get an
  // "Unassigned" group so they stay visible and editable.
  const referenced = new Set(doc.flows.flatMap((f) => f.screenIds))
  const orphans = doc.screens.filter((s) => !referenced.has(s.id))

  const children: TreeNode[] = topFlows.map((f) => buildFlowNode(doc, f))
  if (orphans.length > 0) {
    children.push({
      id: '__unassigned__',
      label: 'Bağlı değil',
      kind: 'group',
      children: orphans.map((s) => buildScreenNode(doc, s)),
    })
  }

  return { id: 'root', label: doc.name, kind: 'flow', children }
}
