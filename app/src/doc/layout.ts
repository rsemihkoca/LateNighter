// ============================================================
// Auto-layout — git-graph style.
//
// Positions are COMPUTED from the flow + edge graph, not read from
// stored screen.position. Screens sit on fixed horizontal lanes with a
// constant vertical pitch; branches drop to a new lane (like a commit
// graph). This is a pure function of the doc so docToNodes can re-derive
// it on every structural change.
//
//   x (column) = longest-path layer over the edge DAG (each node sits one
//                column right of its furthest-left parent).
//   y (lane)   = first-child-keeps-the-lane DFS; extra children branch to
//                a freshly allocated lane below.
//
// All node/pitch geometry is now device-derived (a 14 Pro frame is far
// taller than the old card), so the column/lane pitches come from
// `deviceMetrics()` keyed off `doc.deviceId` rather than fixed constants.
// React Flow centers its background dots in each grid cell, so a lane row
// coincides with a dot row only when its center sits on a half-cell
// (n + 0.5) * GRID_GAP — `deviceMetrics` keeps `laneTop` on a half-cell
// and the pitches on whole cells so the LaneGuides dots stay aligned.
// ============================================================

import { cardMetrics, getMockup } from '../components/mockups'
import type { ProjectDoc } from './types'

// Re-exported for the canvas/lane-guides; defined in their own module so
// `devices.ts` (layout metrics) can import them without a circular dependency.
export { GRID_GAP, GRID_DOT_SIZE } from './layout-constants'

export interface ScreenPlacement {
  col: number
  lane: number
  x: number
  y: number
}

export interface LayoutResult {
  /** Placement per screen id. */
  byId: Map<string, ScreenPlacement>
  /** Occupied lane indices, ascending. */
  lanes: number[]
  /** Center-line y of each occupied lane (for the LaneGuides), ascending. */
  laneYs: number[]
  /** Node size used to place + render the phones, in px. */
  nodeW: number
  nodeH: number
  /** x-extent of the placed cards (left edges → right edges). */
  minX: number
  maxX: number
}

export function computeLayout(doc: ProjectDoc): LayoutResult {
  const metrics = cardMetrics(getMockup(doc.deviceId))
  const NODE_W = metrics.nodeW
  const NODE_H = metrics.nodeH
  const COL_PITCH = metrics.colPitch
  // y of a lane's center line (where a node's vertical middle sits).
  const laneCenterY = (lane: number) => metrics.laneTop + lane * metrics.lanePitch

  const ids = doc.screens.map((s) => s.id)
  const idSet = new Set(ids)

  // Edges restricted to existing screens.
  const edges = doc.edges.filter((e) => idSet.has(e.source) && idSet.has(e.target))
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  for (const id of ids) {
    incoming.set(id, [])
    outgoing.set(id, [])
  }
  for (const e of edges) {
    outgoing.get(e.source)!.push(e.target)
    incoming.get(e.target)!.push(e.source)
  }

  // Trunk priority: a screen's order across flows (main flows first). Lower
  // wins, so the main happy-path child keeps its parent's lane and siblings
  // branch off. Screens absent from every flow sort last.
  const priority = new Map<string, number>()
  let p = 0
  const orderedFlows = [...doc.flows].sort((a, b) =>
    a.kind === b.kind ? 0 : a.kind === 'main' ? -1 : 1,
  )
  for (const f of orderedFlows) {
    for (const id of f.screenIds) {
      if (idSet.has(id) && !priority.has(id)) priority.set(id, p++)
    }
  }
  const prio = (id: string) => priority.get(id) ?? Number.POSITIVE_INFINITY

  // --- Columns: longest path from a root (cycle-safe via recursion stack).
  const colMemo = new Map<string, number>()
  const colOf = (id: string, stack: Set<string>): number => {
    const cached = colMemo.get(id)
    if (cached !== undefined) return cached
    if (stack.has(id)) return 0 // back edge → break the cycle
    stack.add(id)
    const parents = incoming.get(id)!
    const c = parents.length ? Math.max(...parents.map((pp) => colOf(pp, stack) + 1)) : 0
    stack.delete(id)
    colMemo.set(id, c)
    return c
  }

  // --- Lanes: DFS, first child keeps the lane, others get a new one.
  // Lanes grow monotonically (no recycling) — fine for trunk+branch data;
  // a freeing allocator would be real complexity for no current benefit.
  const laneOf = new Map<string, number>()
  let highestLane = -1
  const childrenOf = (id: string) =>
    [...outgoing.get(id)!].sort((a, b) => prio(a) - prio(b))

  const assign = (id: string, lane: number) => {
    if (laneOf.has(id)) return // first parent to reach a merge wins
    laneOf.set(id, lane)
    childrenOf(id).forEach((child, i) => {
      assign(child, i === 0 ? lane : ++highestLane)
    })
  }

  // Roots = no incoming edge, walked in trunk-priority order so the main
  // flow takes lane 0. Any node never reached (e.g. inside a pure cycle)
  // is seeded afterwards on its own lane.
  const roots = ids
    .filter((id) => incoming.get(id)!.length === 0)
    .sort((a, b) => prio(a) - prio(b))
  for (const root of roots) {
    if (!laneOf.has(root)) assign(root, ++highestLane)
  }
  for (const id of ids) {
    if (!laneOf.has(id)) assign(id, ++highestLane)
  }

  const byId = new Map<string, ScreenPlacement>()
  const usedLanes = new Set<number>()
  let minX = Number.POSITIVE_INFINITY
  let maxX = Number.NEGATIVE_INFINITY
  for (const id of ids) {
    const col = colOf(id, new Set())
    const lane = laneOf.get(id)!
    usedLanes.add(lane)
    const x = col * COL_PITCH
    const y = laneCenterY(lane) - NODE_H / 2
    byId.set(id, { col, lane, x, y })
    minX = Math.min(minX, x)
    maxX = Math.max(maxX, x + NODE_W)
  }

  if (!Number.isFinite(minX)) {
    minX = 0
    maxX = NODE_W
  }

  const lanes = [...usedLanes].sort((a, b) => a - b)
  return {
    byId,
    lanes,
    laneYs: lanes.map(laneCenterY),
    nodeW: NODE_W,
    nodeH: NODE_H,
    minX,
    maxX,
  }
}
