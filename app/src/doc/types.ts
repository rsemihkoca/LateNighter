// ============================================================
// ProjectDoc — the single source of truth.
// React Flow (canvas) and the Tree navigator are both pure
// projections of this document. Every UI edit mutates the doc;
// the doc is what gets serialized to JSON on disk.
// ============================================================

export const DOC_VERSION = 1

export type ScreenSurface = 'preview' | 'live'

export const SURFACE_LABEL: Record<ScreenSurface, string> = {
  preview: 'Preview',
  live: 'Live',
}

/** What a screen surface holds. Image bytes live in `previewImage` (data URL);
    htmlFile/htmlFolder bytes live on disk + in the surfaceStore, not in JSON. */
export type SurfaceContent = 'image' | 'htmlFile' | 'htmlFolder'

export interface XY {
  x: number
  y: number
}

/** A vertical state of a screen (Main, Loading, Empty, Error, …). */
export interface ScreenState {
  id: string
  name: string
}

/** A screen = a card on the canvas, a node in the tree. */
export interface Screen {
  id: string
  name: string
  meta: string
  /** Preview = blank/mock screen; Live = authored HTML surface. */
  surface?: ScreenSurface
  /** Preview surface image, stored as a data URL (only when previewContent='image'). */
  previewImage?: string
  /** What the preview surface holds. HTML/folder bytes live on disk + in the
      surfaceStore (keyed by screen id), NOT in this JSON. */
  previewContent?: SurfaceContent
  /** What the live surface holds (always an HTML folder). */
  liveContent?: SurfaceContent
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
  /**
   * The device every screen is framed in (see doc/devices.ts). Optional for
   * backward compatibility — legacy docs without it fall back to the default
   * device (iPhone 14 Pro) via getDevice().
   */
  deviceId?: string
  flows: Flow[]
  screens: Screen[]
  edges: FlowEdge[]
}
