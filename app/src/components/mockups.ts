// ============================================================
// Mockup registry — the photoreal phone frames under app/assets/mockup,
// imported as static (Vite-fingerprinted) URLs so they bundle cleanly.
//
// Each spec carries the screen-glass insets (% of the frame box) measured
// from the rendered SVG, so DeviceMockup can overlay the status bar, home
// indicator and a screen-content slot exactly over the glass at any size.
// ============================================================

import { GRID_GAP } from '../doc/layout-constants'
import iphone14 from '../../assets/mockup/iphone14.svg'
import iphone14Pro from '../../assets/mockup/iphone14Pro.svg'
import iphone15Pro from '../../assets/mockup/iphone15Pro.svg'

/** Screen-glass insets, each a percentage of the frame box. */
export interface MockupInset {
  top: number
  right: number
  bottom: number
  left: number
}

export interface MockupSpec {
  id: string
  name: string
  /** Bundled static URL of the frame SVG. */
  src: string
  /** Frame aspect ratio, width / height. */
  aspect: number
  /** Screen-glass insets (% of frame box). */
  screen: MockupInset
  /** Screen corner radius, % of frame width. */
  screenRadius: number
  /** Status-bar band height, % of frame height. */
  statusBarHeight: number
  /** Dynamic Island / notch phone → clock sits left, status icons right of the cutout. */
  island: boolean
}

// Insets below were measured from the rasterized mockups (white screen-glass
// bounding box vs. the bezel), see the screen-area probe in git history.
// The "none" entry is the default: no phone frame, just a plain screen card.
export const MOCKUPS: MockupSpec[] = [
  {
    id: 'none',
    name: 'Mockup yok',
    src: '',
    aspect: 360 / 730,
    screen: { top: 0, right: 0, bottom: 0, left: 0 },
    screenRadius: 8,
    statusBarHeight: 0,
    island: false,
  },
  {
    id: 'iphone-15-pro',
    name: 'iPhone 15 Pro',
    src: iphone15Pro,
    aspect: 356 / 730,
    screen: { top: 2.0, right: 4.7, bottom: 2.1, left: 4.5 },
    screenRadius: 13,
    statusBarHeight: 5.4,
    island: true,
  },
  {
    id: 'iphone-14-pro',
    name: 'iPhone 14 Pro',
    src: iphone14Pro,
    aspect: 360 / 730,
    screen: { top: 2.3, right: 5.6, bottom: 2.4, left: 5.4 },
    screenRadius: 12,
    statusBarHeight: 5.4,
    island: true,
  },
  {
    id: 'iphone-14',
    name: 'iPhone 14',
    src: iphone14,
    aspect: 363 / 730,
    screen: { top: 2.4, right: 5.9, bottom: 2.5, left: 5.8 },
    screenRadius: 12,
    statusBarHeight: 5.4,
    island: true,
  },
]

/** Default selection — no phone frame. */
export const DEFAULT_MOCKUP_ID = MOCKUPS[0].id

const BY_ID = new Map(MOCKUPS.map((m) => [m.id, m]))

/** Resolve a mockup by id, falling back to the default ("Mockup yok"). */
export function getMockup(id: string | undefined): MockupSpec {
  return (id && BY_ID.get(id)) || MOCKUPS[0]
}

// ============================================================
// Card geometry — the ScreenCard wrapper that turns a mockup into the node.
//
// The card is the unit edges connect to: a titled frame holding the phone
// mockup. Its on-canvas size is derived purely from the mockup aspect plus
// fixed chrome (header + body padding), then handed to the SAME grid-snapping
// the layout uses (ceilCell / ceilHalfCell against GRID_GAP) so lane rows keep
// landing on the background dot grid. The rendered card is fixed to
// nodeW × nodeH (border-box), so the lane guides hug each card's center.
// ============================================================

/** Phone render width inside the card, px. ~matches the prior 14 Pro frame. */
export const MOCKUP_W = 144
/** Compact header band above the mockup. */
export const CARD_HEADER_H = 24

export interface CardMetrics {
  /** Phone mockup render size inside the card, px. */
  mockupW: number
  mockupH: number
  /** Card (node) size on the canvas, px. */
  nodeW: number
  nodeH: number
  /** Grid-aligned layout pitches, px. */
  colPitch: number
  lanePitch: number
  laneTop: number
}

// Smallest whole-cell size ≥ v — keeps the card close to the mockup while
// avoiding sub-pixel layout churn in the canvas.
const ceilCell = (v: number) => Math.ceil(v / GRID_GAP) * GRID_GAP
// Nearest half-cell (n + 0.5)·GRID_GAP ≥ v — keeps lane centers on the
// background dot rows (see layout.ts / deviceMetrics).
const ceilHalfCell = (v: number) => (Math.ceil(v / GRID_GAP - 0.5) + 0.5) * GRID_GAP

/** Derive card + layout geometry from a mockup spec. Pure. */
export function cardMetrics(spec: MockupSpec): CardMetrics {
  const mockupW = MOCKUP_W
  const mockupH = mockupW / spec.aspect
  // The card HUGS the mockup, snapped to the nearest grid — no wasted cells.
  const nodeW = ceilCell(mockupW)
  const nodeH = ceilCell(CARD_HEADER_H + mockupH)
  return {
    mockupW,
    mockupH,
    nodeW,
    nodeH,
    // Horizontal gap ~100px for edge routing; vertical gap ~60px between cards.
    colPitch: ceilCell(nodeW + 100),
    lanePitch: ceilCell(nodeH + 60),
    laneTop: ceilHalfCell(nodeH / 2 + 10),
  }
}
