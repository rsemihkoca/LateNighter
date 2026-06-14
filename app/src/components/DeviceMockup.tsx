import type { CSSProperties, ReactNode } from 'react'
import { getMockup, type MockupSpec } from './mockups'

// ============================================================
// DeviceMockup — renders a phone frame straight from the static SVG in
// assets/mockup (imported as a bundled URL). No status bar / home bar: the
// SVG is used as-is. The "none" mockup renders a plain blank screen instead
// of a phone frame. Optional `children` overlay the screen glass.
// ============================================================

interface DeviceMockupProps {
  /** Mockup id (see mockups.ts) or a spec. Defaults to "Mockup yok". */
  mockup?: string | MockupSpec
  /** Rendered frame width in px; height is derived from the aspect ratio. */
  width?: number
  /** Optional screen content, clipped to the rounded glass. */
  children?: ReactNode
}

export function DeviceMockup({ mockup, width = 280, children }: DeviceMockupProps) {
  const spec = typeof mockup === 'object' ? mockup : getMockup(mockup)
  const { screen } = spec
  const height = width / spec.aspect
  const rootStyle: CSSProperties = { width, height }

  // No frame SVG → plain blank screen card.
  if (!spec.src) {
    return (
      <div className="device-mockup device-mockup--none" style={rootStyle}>
        <div
          className="device-mockup__blank"
          style={{ borderRadius: (spec.screenRadius / 100) * width }}
        >
          {children}
        </div>
      </div>
    )
  }

  return (
    <div className="device-mockup" style={rootStyle}>
      <img className="device-mockup__frame" src={spec.src} alt={spec.name} draggable={false} />
      {children && (
        <div
          className="device-mockup__screen"
          style={{
            top: `${screen.top}%`,
            left: `${screen.left}%`,
            right: `${screen.right}%`,
            bottom: `${screen.bottom}%`,
            borderRadius: (spec.screenRadius / 100) * width,
          }}
        >
          {children}
        </div>
      )}
    </div>
  )
}
