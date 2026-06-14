import { ViewportPortal } from '@xyflow/react'
import { GRID_GAP } from '../doc/layout'

// Drawn in flow coordinates inside the viewport, so React Flow's single CSS
// transform scales/pans them smoothly with the nodes — no per-frame redraw and
// therefore no shimmer during zoom (the bug with the old screen-space version).
// A very wide strip per lane covers panning; the dot spacing is fixed in flow
// units (GRID_GAP) and the strip starts on a grid multiple, so the dots land on
// the background grid's dot columns. Lane centers are half-cell values (see
// LANE_TOP) so each row coincides with a grid dot row.
const STRIP_LEFT = -100000 // flow units, multiple of GRID_GAP
const STRIP_WIDTH = 200000
const ROW_H = 6 // flow px (scaled by zoom)
const DOT_R = 2 // flow px dot radius — prominent vs the faint grid dots

/**
 * Rows of round dots at each lane center — the lines screens sit on. The
 * viewport-portal mounts last in the viewport, so these would paint over the
 * node cards; z-index -1 drops them behind the nodes (z 0) while staying inside
 * the viewport layer, hence still above the background dot grid.
 */
export function LaneGuides({ laneYs }: { laneYs: number[] }) {
  return (
    <ViewportPortal>
      {laneYs.map((centerY) => (
        <div
          key={centerY}
          className="lane-guides__line"
          style={{
            position: 'absolute',
            left: STRIP_LEFT,
            top: centerY - ROW_H / 2,
            width: STRIP_WIDTH,
            height: ROW_H,
            zIndex: -1,
            pointerEvents: 'none',
            backgroundImage: `radial-gradient(circle, currentColor ${DOT_R}px, transparent ${DOT_R + 0.6}px)`,
            backgroundSize: `${GRID_GAP}px ${ROW_H}px`,
            backgroundRepeat: 'repeat-x',
          }}
        />
      ))}
    </ViewportPortal>
  )
}
