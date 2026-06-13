import { Handle, Position, type NodeProps } from '@xyflow/react'
import { STATUS_LABEL, type ScreenStatus } from '../doc/types'

export interface ScreenNodeData {
  name: string
  meta: string
  status: ScreenStatus
  stateCount?: number
  [key: string]: unknown
}

export function ScreenNode({ data, selected }: NodeProps) {
  const { name, meta, status, stateCount } = data as ScreenNodeData
  return (
    <div className={`screen-node status-${status}${selected ? ' is-selected' : ''}`}>
      <Handle type="target" position={Position.Left} className="screen-node__handle" />
      <span className="screen-node__rail" aria-hidden />
      <div className="screen-node__body">
        <div className="screen-node__top">
          <span className="screen-item__dot" aria-hidden />
          <span className="screen-node__name">{name}</span>
        </div>
        <span className="screen-node__meta">
          {meta}
          {stateCount ? ` · ${stateCount} state` : ''}
        </span>
      </div>
      <span className="screen-node__badge screen-item__badge">{STATUS_LABEL[status]}</span>
      <Handle type="source" position={Position.Right} className="screen-node__handle" />
    </div>
  )
}
