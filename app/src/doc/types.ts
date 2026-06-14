// ============================================================
// ProjectDoc — the single source of truth.
// React Flow (canvas) and the Tree navigator are both pure
// projections of this document. Every UI edit mutates the doc;
// the doc is what gets serialized to JSON on disk.
// ============================================================

export const DOC_VERSION = 1

export type ScreenStatus = 'locked' | 'new' | 'deleted' | 'changed'
export type ScreenSurface = 'preview' | 'live'

export const STATUS_LABEL: Record<ScreenStatus, string> = {
  locked: 'Locked',
  new: 'Yeni',
  deleted: 'Silindi',
  changed: 'Değişti',
}

export const SURFACE_LABEL: Record<ScreenSurface, string> = {
  preview: 'Preview',
  live: 'Live',
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
  /** Preview = blank/mock screen; Live = authored HTML surface. */
  surface?: ScreenSurface
  liveHtml?: string
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

/**
 * A committed snapshot of the design diff. The doc carries GitHub-diff
 * semantics (screens are new/changed/deleted vs. a locked baseline); a commit
 * records the message + counts at the moment the diff was baselined to locked.
 */
export interface Commit {
  id: string
  message: string
  /** Unix epoch ms when committed. */
  at: number
  /** How many screens were added / changed / removed in this commit. */
  summary: { added: number; changed: number; removed: number }
}

export interface ProjectDoc {
  version: number
  name: string
  /**
   * The device every screen is framed in (see doc/devices.ts). Optional for
   * backward compatibility — legacy docs without it fall back to the default
   * device (iPhone 14 Pro) via getDevice().
   */
  deviceId?: string
  flows: Flow[]
  screens: Screen[]
  edges: FlowEdge[]
  /** Commit history (newest first). Optional for legacy docs. */
  commits?: Commit[]
}
