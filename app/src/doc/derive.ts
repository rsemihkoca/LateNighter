import { MarkerType, type Edge, type Node } from '@xyflow/react'
import type { ScreenNodeData } from '../components/ScreenNode'
import { computeLayout } from './layout'
import type { Flow, ProjectDoc, Screen } from './types'

// -------- Canvas projection (doc → React Flow) ----------------------

export function docToNodes(doc: ProjectDoc): Node<ScreenNodeData>[] {
  // Positions are derived from the graph (git-graph lanes), not from the
  // stored screen.position — nodes are not draggable.
  const layout = computeLayout(doc)
  return doc.screens.map((screen) => ({
    id: screen.id,
    type: 'screen',
    position: layout.byId.get(screen.id) ?? screen.position,
    draggable: false,
    data: {
      name: screen.name,
      meta: screen.meta,
      surface: screen.surface ?? 'preview',
      previewImage: screen.previewImage,
      previewContent: screen.previewContent,
      liveContent: screen.liveContent,
      stateCount: screen.states.length,
      deviceId: doc.deviceId,
    },
  }))
}

export function docToEdges(doc: ProjectDoc): Edge[] {
  // Every edge looks identical: solid line, same color/width, same arrowhead —
  // no animated/dashed edges and no per-status coloring.
  return doc.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    type: 'smoothstep',
    // Generous corner radius → the rounded S-jog look on branches.
    pathOptions: { borderRadius: 28 },
    animated: false,
    className: 'flow-edge',
    markerEnd: { type: MarkerType.ArrowClosed, width: 11, height: 11 },
  }))
}

// -------- Tree projection (doc → hierarchical tree) -----------------

export type TreeKind = 'flow' | 'screen' | 'state' | 'group' | 'link'

export interface TreeNode {
  id: string
  label: string
  kind: TreeKind
  screenId?: string
  meta?: string
  children: TreeNode[]
}

function buildScreenNode(doc: ProjectDoc, screen: Screen): TreeNode {
  const states: TreeNode[] = screen.states.map((st) => ({
    id: st.id,
    label: st.name,
    kind: 'state',
    screenId: screen.id,
    children: [],
  }))
  const byId = new Map(doc.screens.map((s) => [s.id, s]))
  const links: TreeNode[] = doc.edges
    .filter((edge) => edge.source === screen.id)
    .map((edge) => {
      const target = byId.get(edge.target)
      return {
        id: `link:${edge.id}`,
        label: target ? target.name : edge.target,
        kind: 'link' as const,
        screenId: edge.target,
        children: [],
      }
    })
  // Sub-flows launched by this screen nest directly beneath it.
  const subFlows = doc.flows
    .filter((f) => f.startsFromScreenId === screen.id)
    .map((f) => buildFlowNode(doc, f))
  return {
    id: screen.id,
    label: screen.name,
    kind: 'screen',
    screenId: screen.id,
    meta: screen.meta,
    children: [...states, ...links, ...subFlows],
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
  // A flow is top-level only if it nests under neither a parent flow nor a
  // launching screen. (A screen-launched flow shows under that screen — see
  // buildScreenNode — so it must not also surface at the root.)
  const topFlows = doc.flows.filter((f) => !f.parentFlowId && !f.startsFromScreenId)

  // Screens not referenced by any flow (e.g. removed/detached) get an
  // "Unassigned" group so they stay visible and editable.
  const referenced = new Set(doc.flows.flatMap((f) => f.screenIds))
  const orphans = doc.screens.filter((s) => !referenced.has(s.id))

  const children: TreeNode[] = topFlows.map((f) => buildFlowNode(doc, f))
  if (orphans.length > 0) {
    children.push({
      id: '__unassigned__',
      label: 'Unassigned',
      kind: 'group',
      children: orphans.map((s) => buildScreenNode(doc, s)),
    })
  }

  return { id: 'root', label: doc.name, kind: 'flow', children }
}
