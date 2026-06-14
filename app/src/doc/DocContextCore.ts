import { createContext, useContext } from 'react'
import type { SurfaceBundle } from '../storage/surfaceStore'
import type { ProjectRef, ProjectStorage } from '../storage/types'
import type { ProjectDoc, ScreenSurface, XY } from './types'

export interface DocSession {
  storage: ProjectStorage
  ref: ProjectRef
  doc: ProjectDoc
}

export type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

export interface DocContextValue {
  doc: ProjectDoc
  projectRef: ProjectRef
  storageLabel: string
  saveState: SaveState
  /** Bumps on structural edits + external reloads; views reseed transient state on change. */
  syncKey: number
  selectedScreenId: string | null
  selectScreen: (id: string | null) => void
  moveScreen: (id: string, position: XY) => void
  connectScreens: (source: string, target: string) => void
  removeEdges: (ids: string[]) => void
  removeScreens: (ids: string[]) => void
  addScreen: (parent?: { flowId: string }, options?: { surface?: ScreenSurface }) => void
  renameScreen: (id: string, name: string) => void
  reorderScreen: (
    screenId: string,
    toFlowId: string | null,
    refScreenId: string | null,
    position: 'before' | 'after',
  ) => void
  moveState: (
    stateId: string,
    toScreenId: string,
    refStateId: string | null,
    position: 'before' | 'after',
  ) => void
  moveFlow: (
    flowId: string,
    parent: { flowId: string } | { screenId: string } | null,
    refFlowId: string | null,
    position: 'before' | 'after',
  ) => void
  setScreenSurface: (id: string, surface: ScreenSurface) => void
  setScreenLiveContent: (id: string, bundle: SurfaceBundle, kind: 'htmlFile' | 'htmlFolder') => void
  setScreenPreviewImage: (id: string, bundle: SurfaceBundle) => void
  getRenderHtml: (id: string, surface: ScreenSurface) => string | undefined
  getRenderImage: (id: string, surface: ScreenSurface) => string | undefined
  removeScreen: (id: string) => void
  addFlow: (parent?: { flowId: string } | { screenId: string }) => void
  renameFlow: (id: string, name: string) => void
  removeFlow: (id: string) => void
  addState: (screenId: string) => void
  renameState: (id: string, name: string) => void
  removeState: (id: string) => void
  setDevice: (deviceId: string) => void
  closeProject: () => void
}

export const DocContext = createContext<DocContextValue | null>(null)

export function useDoc(): DocContextValue {
  const ctx = useContext(DocContext)
  if (!ctx) throw new Error('useDoc must be used within <DocProvider>')
  return ctx
}
