import { useEffect, useRef, useState } from 'react'
import { Handle, Position, type NodeProps } from '@xyflow/react'
import { useDoc } from '../doc/DocContextCore'
import { SURFACE_LABEL, type ScreenSurface, type SurfaceContent } from '../doc/types'
import { CARD_HEADER_H, cardMetrics, getMockup } from './mockups'
import { DeviceMockup } from './DeviceMockup'
import { pickFolderBundle, pickHtmlFileBundle, pickPreviewImageBundle } from '../storage/surfaceImport'

// Screen card shadow stack (was .screen-card / :hover / .is-selected). Selected
// swaps to the accent ring; otherwise base + hover lift.
const CARD_BASE =
  'box-border relative flex flex-col bg-panel rounded-lg text-fg font-sans overflow-hidden transition-[box-shadow] duration-[120ms] ease-out'
const CARD_SHADOW =
  'shadow-[var(--shadow-md),inset_0_0_0_1px_var(--border)] hover:shadow-[var(--shadow-lg),inset_0_0_0_1px_var(--border-strong)]'
const CARD_SHADOW_SELECTED =
  'shadow-[0_0_0_2px_var(--accent-soft),var(--shadow-md),inset_0_0_0_1.5px_var(--accent)]'

// Surface toggle button (was .surface-switch__btn + .is-active, and the
// .surface-live .is-active accent override pushed into JSX state).
const SURFACE_BTN_BASE =
  'min-w-0 px-px border-0 rounded-xs bg-transparent font-[inherit] text-[6px] font-bold leading-none cursor-pointer transition-[background-color,color,transform] duration-[140ms] active:scale-[0.96] motion-reduce:transition-none'
function surfaceBtnClass(active: boolean, isLive: boolean): string {
  if (active && isLive) return `${SURFACE_BTN_BASE} bg-accent text-white shadow-[var(--shadow-xs)]`
  if (active) return `${SURFACE_BTN_BASE} bg-panel text-fg-strong shadow-[var(--shadow-xs)]`
  return `${SURFACE_BTN_BASE} text-fg-muted hover:text-fg-strong`
}

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
  const {
    setScreenSurface,
    setScreenLiveContent,
    setScreenPreviewImage,
    getRenderHtml,
    getRenderImage,
    renameScreen,
  } = useDoc()
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
    const bundle = await pickPreviewImageBundle()
    if (bundle) setScreenPreviewImage(id, bundle)
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
  const renderPreviewImage = previewImage ?? getRenderImage(id, 'preview')

  return (
    <div
      className={`${CARD_BASE} ${selected ? CARD_SHADOW_SELECTED : CARD_SHADOW}`}
      style={{ width: m.nodeW, height: m.nodeH }}
    >
      <Handle type="target" position={Position.Left} className="screen-node__handle" />

      <header
        className="flex-none box-border flex flex-col justify-center gap-px pl-2 pr-[3px]"
        style={{ height: CARD_HEADER_H }}
      >
        <div className="flex items-center justify-between gap-1">
          <span className="inline-flex items-center gap-1.5 flex-[1_1_auto] min-w-0">
            {editing ? (
              <input
                ref={inputRef}
                className="nodrag nopan flex-[1_1_auto] min-w-0 m-0 px-1 py-px border border-accent rounded-sm bg-panel text-fg-strong font-[inherit] text-xs font-semibold outline-none"
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
                className="text-xs font-semibold text-fg-strong overflow-hidden text-ellipsis whitespace-nowrap cursor-text"
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
            className="nodrag nopan flex-none inline-grid grid-cols-[34px_26px] gap-px h-[11px] p-px border border-border rounded-sm bg-muted"
            role="group"
            aria-label={`${name} surface mode`}
            onPointerDown={stopCanvasGesture}
            onDoubleClick={stopCanvasGesture}
          >
            {(['preview', 'live'] as const).map((option) => (
              <button
                key={option}
                type="button"
                className={surfaceBtnClass(surface === option, option === 'live')}
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

      <div className="flex-[1_1_auto] flex items-start justify-center min-h-0">
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
            <PreviewSurface
              image={renderPreviewImage}
              screenName={name}
              onAddImage={addPreviewImage}
            />
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
    <div className="flex w-full h-full min-h-full flex-col items-center justify-center gap-[5px] bg-[#e5e7eb] text-[#6b7280] font-sans">
      {actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="nodrag nopan px-2.5 py-1 border border-[#d8dde7] rounded-pill bg-white/[0.86] shadow-[0_4px_14px_rgba(17,24,39,0.08)] text-inherit font-[inherit] text-[10.5px] font-bold tracking-normal cursor-pointer transition-[background-color,border-color] duration-[120ms] hover:bg-white hover:border-accent hover:text-accent"
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
      className="block w-full h-full border-0 bg-white"
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
      className="nodrag nopan block w-full h-full object-contain object-center bg-white cursor-pointer"
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
