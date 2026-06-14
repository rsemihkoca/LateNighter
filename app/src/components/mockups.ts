// ============================================================
// Device factory — a single source of truth for the phone mockups, drawn
// purely in CSS from REAL device proportions (no SVG asset, no eyeballed
// insets). Each device is a `DeviceSpec` instance carrying its physical body
// size, logical point resolution, display corner radius, uniform bezel and
// Dynamic Island geometry; all render geometry (frame height, glass content
// box, radii) is *derived* from those numbers so the same spec renders an
// identical 14 Pro frame at any width, everywhere.
//
// Geometric guarantee: the body is drawn at its physical aspect (bodyW/bodyH)
// and a UNIFORM bezel is inset on all four sides, so the inner glass lands at
// the display logical aspect (logicalW/logicalH) automatically. Live HTML laid
// out at `logicalWidth` and preview images then fill the glass with no
// distortion — that is the content area renders target.
// ============================================================

import { GRID_GAP } from '../doc/layout-constants'

/** Screen-glass insets, each a percentage of the frame box. */
export interface MockupInset {
  top: number
  right: number
  bottom: number
  left: number
}

/** Dynamic Island geometry, in display logical points. */
export interface IslandSpec {
  wPt: number
  hPt: number
  topPt: number
}

interface DeviceInit {
  id: string
  name: string
  /** Physical body, mm. */
  bodyW: number
  bodyH: number
  /** Display logical resolution, points (CSS px). */
  logicalW: number
  logicalH: number
  /** Display corner radius, points. */
  displayRadiusPt: number
  /** Uniform body-edge → glass inset, mm. 0 = frameless (plain screen card). */
  bezelMm: number
  /** Dynamic Island, omitted for notch/frameless devices. */
  island?: IslandSpec
  /** Bezel / body fill color. */
  frameColor?: string
}

// Real device numbers in, derived render geometry out. Holding the spec in a
// class keeps device facts in one place and the math co-located with them.
export class DeviceSpec {
  private readonly init: DeviceInit

  constructor(init: DeviceInit) {
    this.init = init
  }

  get id() {
    return this.init.id
  }
  get name() {
    return this.init.name
  }
  /** Display logical width, points — the width a live page is laid out at. */
  get logicalWidth() {
    return this.init.logicalW
  }
  get logicalHeight() {
    return this.init.logicalH
  }
  /** Frame body aspect, width / height — drives the on-canvas card footprint. */
  get aspect() {
    return this.init.bodyW / this.init.bodyH
  }
  /** Display/glass aspect, width / height. */
  get glassAspect() {
    return this.init.logicalW / this.init.logicalH
  }
  get frameColor() {
    return this.init.frameColor ?? '#0b0b0d'
  }
  /** No frame → render a plain rounded screen card. */
  get frameless() {
    return this.init.bezelMm === 0
  }
  get island(): IslandSpec | undefined {
    return this.init.island
  }
  /** Uniform bezel as a fraction of frame width. */
  get bezelFraction() {
    return this.init.bezelMm / this.init.bodyW
  }
  /** Display corner radius as a fraction of glass width (≈0.14 for 14 Pro). */
  get glassRadiusFraction() {
    return this.init.displayRadiusPt / this.init.logicalW
  }
  /** Back-compat: screen-glass insets as % of the frame box. */
  get screen(): MockupInset {
    const bx = this.bezelFraction * 100
    const by = (this.init.bezelMm / this.init.bodyH) * 100
    return { top: by, right: bx, bottom: by, left: bx }
  }
  /** Back-compat: screen corner radius as % of frame width. */
  get screenRadius() {
    return this.glassRadiusFraction * (1 - 2 * this.bezelFraction) * 100
  }
  /** Frame outer height, px, for a given render width. */
  frameHeight(width: number) {
    return width / this.aspect
  }
  /**
   * The content area: the glass pixel box for a rendered frame width. The
   * uniform bezel makes the result land at the display aspect, so preview
   * images and the live iframe fill it with no distortion.
   */
  glassSize(width: number) {
    const bezelPx = this.bezelFraction * width
    return {
      bezelPx,
      width: width - 2 * bezelPx,
      height: this.frameHeight(width) - 2 * bezelPx,
    }
  }
}

// iPhone 14 Pro — the primary/default device. Numbers are the real specs:
// body 71.5×147.5 mm, logical 393×852 pt, 55 pt display corner radius, ~3.2 mm
// uniform bezel (chosen so the glass lands at the 393:852 display aspect), and
// an approximate Dynamic Island (Apple never published exact figures).
const IPHONE_14_PRO = new DeviceSpec({
  id: 'iphone-14-pro',
  name: 'iPhone 14 Pro',
  bodyW: 71.5,
  bodyH: 147.5,
  logicalW: 393,
  logicalH: 852,
  displayRadiusPt: 55,
  bezelMm: 3.2,
  island: { wPt: 125, hPt: 37, topPt: 11 },
  frameColor: '#0b0b0d',
})

// Frameless fallback — a plain rounded screen card, no phone chrome.
const NONE = new DeviceSpec({
  id: 'none',
  name: 'No mockup',
  bodyW: 360,
  bodyH: 730,
  logicalW: 360,
  logicalH: 730,
  displayRadiusPt: 16,
  bezelMm: 0,
})

/** The device registry — add new devices here as DeviceSpec instances. */
export const DEVICES: DeviceSpec[] = [IPHONE_14_PRO, NONE]

/** Default selection — the iPhone 14 Pro frame. */
export const DEFAULT_DEVICE_ID = 'iphone-14-pro'

const BY_ID = new Map(DEVICES.map((d) => [d.id, d]))

/** Resolve a device by id, falling back to the first (14 Pro). */
export function getDevice(id: string | undefined): DeviceSpec {
  return (id && BY_ID.get(id)) || DEVICES[0]
}

// ---- Back-compat aliases so existing consumers compile unchanged ----
export type MockupSpec = DeviceSpec
export const MOCKUPS = DEVICES
export const getMockup = getDevice
export const DEFAULT_MOCKUP_ID = DEFAULT_DEVICE_ID

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
