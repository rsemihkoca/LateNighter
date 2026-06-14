import type { ReactNode } from 'react'
import { getMockup, type MockupSpec } from './mockups'

// ============================================================
// DeviceMockup — a CSS-drawn phone frame, sized from a DeviceSpec (see
// mockups.ts). No SVG asset: the bezel is the body's uniform padding, the
// rounded glass is an inner slot that clips `children` to the display corner
// radius, and the Dynamic Island is a pill sitting on top of the content. A
// frameless spec ("none") renders a plain rounded screen card.
//
// All geometry is derived from the spec at the given `width`, so the same
// device renders identically anywhere it is mounted.
// ============================================================

// The glass slot: fills the bezel, clips content to the display radius
// (set inline). bg differs framed (#fff) vs frameless (subtle + inset ring).
const GLASS = 'relative w-full h-full overflow-hidden box-border leading-normal'

interface DeviceMockupProps {
  /** Device id (see mockups.ts) or a spec. Defaults to the registry's first. */
  mockup?: string | MockupSpec
  /** Rendered frame width in px; height is derived from the body aspect. */
  width?: number
  /** Optional screen content, clipped to the rounded glass. */
  children?: ReactNode
}

export function DeviceMockup({ mockup, width = 280, children }: DeviceMockupProps) {
  const spec = typeof mockup === 'object' ? mockup : getMockup(mockup)
  const { bezelPx, width: glassW } = spec.glassSize(width)
  const height = spec.frameHeight(width)
  const glassRadius = glassW * spec.glassRadiusFraction

  // Frameless → plain rounded screen card.
  if (spec.frameless) {
    return (
      <div className="relative block select-none box-border bg-transparent" style={{ width, height }}>
        <div
          className={`${GLASS} bg-subtle shadow-[inset_0_0_0_1px_var(--border-strong)]`}
          style={{ borderRadius: glassRadius }}
        >
          {children}
        </div>
      </div>
    )
  }

  const { island } = spec

  return (
    <div
      className="relative block select-none box-border"
      style={{
        width,
        height,
        padding: bezelPx,
        background: spec.frameColor,
        // Concentric outer corner: glass radius grown by the bezel.
        borderRadius: glassRadius + bezelPx,
      }}
    >
      <div className={`${GLASS} bg-white`} style={{ borderRadius: glassRadius }}>
        {children}
      </div>
      {island && (
        <div
          className="absolute left-1/2 -translate-x-1/2 bg-[#050506] z-[2] pointer-events-none"
          style={{
            // Island geometry is in display points → scaled to the glass px.
            width: glassW * (island.wPt / spec.logicalWidth),
            height: glassW * (island.hPt / spec.logicalWidth),
            top: bezelPx + glassW * (island.topPt / spec.logicalWidth),
            borderRadius: 999,
          }}
        />
      )}
    </div>
  )
}
