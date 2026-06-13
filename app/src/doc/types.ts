// ============================================================
// ProjectDoc — the single source of truth.
// React Flow (canvas) and the Tree navigator are both pure
// projections of this document. Every UI edit mutates the doc;
// the doc is what gets serialized to JSON on disk.
// ============================================================

export const DOC_VERSION = 1

export type ScreenStatus = 'locked' | 'new' | 'deleted' | 'changed'

export const STATUS_LABEL: Record<ScreenStatus, string> = {
  locked: 'Locked',
  new: 'Yeni',
  deleted: 'Silindi',
  changed: 'Değişti',
}

export interface XY {
  x: number
  y: number
}

/** A vertical state of a screen (Main, Loading, Empty, Error, …). */
export interface ScreenState {
  id: string
  name: string
  status: ScreenStatus
}

/** A screen = a card on the canvas, a node in the tree. */
export interface Screen {
  id: string
  name: string
  meta: string
  status: ScreenStatus
  position: XY
  states: ScreenState[]
}

/**
 * A flow groups screens into an ordered path. The `main` flow is the
 * happy path (laid out left→right). Flows can nest: a flow with
 * `startsFromScreenId` is launched by that screen (shown under it in
 * the tree); a flow with only `parentFlowId` nests under that flow.
 */
export interface Flow {
  id: string
  name: string
  kind: 'main' | 'sub'
  screenIds: string[]
  parentFlowId?: string
  startsFromScreenId?: string
}

/** A directed connection between two screens on the canvas. */
export interface FlowEdge {
  id: string
  source: string
  target: string
}

export interface ProjectDoc {
  version: number
  name: string
  flows: Flow[]
  screens: Screen[]
  edges: FlowEdge[]
}
