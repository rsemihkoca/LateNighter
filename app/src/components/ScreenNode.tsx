import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useDoc } from '../doc/DocContext'
import {
  STATUS_LABEL,
  SURFACE_LABEL,
  type ScreenStatus,
  type ScreenSurface,
} from '../doc/types'
import { CARD_HEADER_H, cardMetrics, getMockup } from './mockups'
import { DeviceMockup } from './DeviceMockup'

export interface ScreenNodeData {
  name: string
  meta?: string
  status: ScreenStatus
  surface?: ScreenSurface
  liveHtml?: string
  stateCount?: number
  /** Which mockup to frame this screen in (see mockups.ts). */
  deviceId?: string
  [key: string]: unknown
}

// The screen card — the node every edge connects to. A titled frame wraps the
// phone mockup: the title bar carries the screen's info (name + status), and
// the mockup is the body. The card is fixed to the grid-snapped node size from
// cardMetrics() so the lane guides hug its center.
export function ScreenNode({ id, data, selected }: NodeProps) {
  const { setScreenSurface, setScreenLiveHtml } = useDoc()
  const { name, status, surface = 'preview', liveHtml, deviceId } = data as ScreenNodeData
  const spec = getMockup(deviceId)
  const m = cardMetrics(spec)
  const stopCanvasGesture = (event: React.SyntheticEvent) => event.stopPropagation()
  const chooseSurface = (next: ScreenSurface) => setScreenSurface(id, next)
  const addLiveHtml = () => {
    const next = window.prompt('Live HTML', liveHtml ?? '')
    if (next !== null) setScreenLiveHtml(id, next)
  }

  return (
    <div
      className={`screen-card status-${status} surface-${surface}${selected ? ' is-selected' : ''}`}
      style={{ width: m.nodeW, height: m.nodeH }}
    >
      <Handle type="target" position={Position.Left} className="screen-node__handle" />

      <header className="screen-card__head" style={{ height: CARD_HEADER_H }}>
        <div className="screen-card__titlerow">
          <span className="screen-card__title">
            <span className="screen-item__dot" title={STATUS_LABEL[status]} aria-hidden />
            <span className="screen-card__name">{name}</span>
          </span>
          <div
            className="surface-switch nodrag nopan"
            role="group"
            aria-label={`${name} yüzey modu`}
            onPointerDown={stopCanvasGesture}
            onDoubleClick={stopCanvasGesture}
          >
            {(['preview', 'live'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={`surface-switch__btn${surface === option ? ' is-active' : ''}`}
                aria-pressed={surface === option}
                onClick={(event) => {
                  event.stopPropagation()
                  chooseSurface(option)
                }}
              >
                {SURFACE_LABEL[option]}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className="screen-card__body">
        <DeviceMockup mockup={spec} width={m.mockupW}>
          {surface === 'live' ? (
            <LiveSurface html={liveHtml} screenName={name} onAddHtml={addLiveHtml} />
          ) : null}
        </DeviceMockup>
      </div>

      <Handle type="source" position={Position.Right} className="screen-node__handle" />
    </div>
  )
}

function LiveSurface({
  html,
  screenName,
  onAddHtml,
}: {
  html?: string
  screenName: string
  onAddHtml: () => void
}) {
  const hasHtml = Boolean(html?.trim())
  if (!hasHtml) {
    return (
      <button
        type="button"
        className="live-placeholder nodrag nopan"
        onPointerDown={(event) => event.stopPropagation()}
        onDoubleClick={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation()
          onAddHtml()
        }}
      >
        <span className="live-placeholder__label">Ekle</span>
      </button>
    )
  }

  return (
    <iframe
      className="live-frame"
      title={`${screenName} live`}
      srcDoc={html}
      sandbox="allow-scripts"
    />
  )
}
