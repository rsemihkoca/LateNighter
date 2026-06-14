import { useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useDoc } from '../doc/DocContext'
import { SURFACE_LABEL, type ScreenSurface, type SurfaceContent } from '../doc/types'
import { CARD_HEADER_H, cardMetrics, getMockup } from './mockups'
import { DeviceMockup } from './DeviceMockup'
import { pickFolderBundle, pickHtmlFileBundle, pickPreviewImage } from '../storage/surfaceImport'

export interface ScreenNodeData {
  name: string
  meta?: string
  surface?: ScreenSurface
  previewImage?: string
  previewContent?: SurfaceContent
  liveContent?: SurfaceContent
  stateCount?: number
  /** Which mockup to frame this screen in (see mockups.ts). */
  deviceId?: string
  [key: string]: unknown
}

// The screen card — the node every edge connects to. A titled frame wraps the
// phone mockup: the title bar carries the screen's name, and the mockup is the
// body. The card is fixed to the grid-snapped node size from cardMetrics() so
// the lane guides hug its center.
export function ScreenNode({ id, data, selected }: NodeProps) {
  const { setScreenSurface, setScreenLiveContent, setScreenPreviewImage, getRenderHtml, renameScreen } =
    useDoc()
  const { name, surface = 'preview', previewImage, deviceId } = data as ScreenNodeData
  const spec = getMockup(deviceId)
  const m = cardMetrics(spec)
  // Pixel size of the screen-glass slot inside this mockup — live pages render
  // at the device's logical width then scale down to exactly fill it.
  const { width: glassW, height: glassH } = spec.glassSize(m.mockupW)
  const stopCanvasGesture = (event: React.SyntheticEvent) => event.stopPropagation()

  // Inline title rename: double-click the name to edit it in place.
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(name)
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editing) {
      inputRef.current?.focus()
      inputRef.current?.select()
    }
  }, [editing])
  const startEdit = () => {
    setDraft(name)
    setEditing(true)
  }
  const commitEdit = () => {
    const next = draft.trim()
    if (next && next !== name) renameScreen(id, next)
    setEditing(false)
  }
  const chooseSurface = (next: ScreenSurface) => setScreenSurface(id, next)
  const addPreviewImage = async () => {
    const dataUrl = await pickPreviewImage()
    if (dataUrl) setScreenPreviewImage(id, dataUrl)
  }
  const addLiveHtmlFile = async () => {
    const bundle = await pickHtmlFileBundle()
    if (bundle) setScreenLiveContent(id, bundle, 'htmlFile')
  }
  const addLiveFolder = async () => {
    const bundle = await pickFolderBundle()
    if (bundle) setScreenLiveContent(id, bundle, 'htmlFolder')
  }
  const liveHtml = getRenderHtml(id, 'live')

  return (
    <div
      className={`screen-card surface-${surface}${selected ? ' is-selected' : ''}`}
      style={{ width: m.nodeW, height: m.nodeH }}
    >
      <Handle type="target" position={Position.Left} className="screen-node__handle" />

      <header className="screen-card__head" style={{ height: CARD_HEADER_H }}>
        <div className="screen-card__titlerow">
          <span className="screen-card__title">
            {editing ? (
              <input
                ref={inputRef}
                className="screen-card__name-input nodrag nopan"
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onPointerDown={stopCanvasGesture}
                onDoubleClick={stopCanvasGesture}
                onBlur={commitEdit}
                onKeyDown={(event) => {
                  event.stopPropagation()
                  if (event.key === 'Enter') commitEdit()
                  else if (event.key === 'Escape') setEditing(false)
                }}
              />
            ) : (
              <span
                className="screen-card__name"
                title="Double-click to rename"
                onDoubleClick={(event) => {
                  event.stopPropagation()
                  startEdit()
                }}
              >
                {name}
              </span>
            )}
          </span>
          <div
            className="surface-switch nodrag nopan"
            role="group"
            aria-label={`${name} surface mode`}
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
            <LiveSurface
              html={liveHtml}
              screenName={name}
              onAddHtmlFile={addLiveHtmlFile}
              onAddFolder={addLiveFolder}
              glassWidth={glassW}
              glassHeight={glassH}
              logicalWidth={spec.logicalWidth}
            />
          ) : (
            <PreviewSurface image={previewImage} screenName={name} onAddImage={addPreviewImage} />
          )}
        </DeviceMockup>
      </div>

      <Handle type="source" position={Position.Right} className="screen-node__handle" />
    </div>
  )
}

interface AddAction {
  label: string
  onClick: () => void
}

function SurfaceAddPlaceholder({ actions }: { actions: AddAction[] }) {
  return (
    <div className="surface-add-placeholder">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="surface-add-placeholder__btn nodrag nopan"
          onPointerDown={(event) => event.stopPropagation()}
          onDoubleClick={(event) => event.stopPropagation()}
          onClick={(event) => {
            event.stopPropagation()
            action.onClick()
          }}
        >
          {action.label}
        </button>
      ))}
    </div>
  )
}

/**
 * A live/preview HTML page, laid out at the device's logical phone width
 * (e.g. 393pt for 14 Pro) then scaled down to exactly fill the mockup glass —
 * so mobile pages render as on a real phone, not squished into ~130px.
 */
function ScaledFrame({
  html,
  title,
  glassWidth,
  glassHeight,
  logicalWidth,
}: {
  html: string
  title: string
  glassWidth: number
  glassHeight: number
  logicalWidth: number
}) {
  const scale = glassWidth / logicalWidth
  const logicalHeight = glassHeight / scale
  return (
    <iframe
      className="live-frame"
      title={title}
      srcDoc={html}
      sandbox="allow-scripts"
      style={{
        width: logicalWidth,
        height: logicalHeight,
        transform: `scale(${scale})`,
        transformOrigin: 'top left',
      }}
    />
  )
}

// Preview surface = image only.
function PreviewSurface({
  image,
  screenName,
  onAddImage,
}: {
  image?: string
  screenName: string
  onAddImage: () => void
}) {
  if (!image) {
    return <SurfaceAddPlaceholder actions={[{ label: 'Add image', onClick: onAddImage }]} />
  }
  return (
    <img
      className="preview-image nodrag nopan"
      src={image}
      alt={`${screenName} preview`}
      draggable={false}
      title="Double-click to replace"
      onPointerDown={(event) => event.stopPropagation()}
      onDoubleClick={(event) => {
        event.stopPropagation()
        onAddImage()
      }}
    />
  )
}

// Live surface = a single .html file or a folder with index.html.
function LiveSurface({
  html,
  screenName,
  onAddHtmlFile,
  onAddFolder,
  glassWidth,
  glassHeight,
  logicalWidth,
}: {
  html?: string
  screenName: string
  onAddHtmlFile: () => void
  onAddFolder: () => void
  glassWidth: number
  glassHeight: number
  logicalWidth: number
}) {
  if (!html) {
    return (
      <SurfaceAddPlaceholder
        actions={[
          { label: 'HTML', onClick: onAddHtmlFile },
          { label: 'Folder', onClick: onAddFolder },
        ]}
      />
    )
  }
  return (
    <ScaledFrame
      html={html}
      title={`${screenName} live`}
      glassWidth={glassWidth}
      glassHeight={glassHeight}
      logicalWidth={logicalWidth}
    />
  )
}
