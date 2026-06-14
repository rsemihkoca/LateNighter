import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import type { ProjectRef, ProjectStorage } from '../storage/types'
import { slugifyName } from './slug'
import { treeSpecToDocPatch } from './treeSync'
import {
  getRevision as getSurfaceRevision,
  getSurfaceHtml,
  hydrateSurfaces,
  setSurface,
  subscribe as subscribeSurfaces,
  type SurfaceBundle,
} from '../storage/surfaceStore'
import type {
  Flow,
  ProjectDoc,
  Screen,
  ScreenState,
  ScreenSurface,
  XY,
} from './types'

export interface DocSession {
  storage: ProjectStorage
  ref: ProjectRef
  doc: ProjectDoc
}

export type SaveState = 'saved' | 'saving' | 'dirty' | 'error'

interface DocContextValue {
  doc: ProjectDoc
  projectRef: ProjectRef
  storageLabel: string
  saveState: SaveState
  /** Bumps on structural edits + external reloads — views reseed transient state on change. */
  syncKey: number
  selectedScreenId: string | null
  selectScreen: (id: string | null) => void
  moveScreen: (id: string, position: XY) => void
  connectScreens: (source: string, target: string) => void
  removeEdges: (ids: string[]) => void
  removeScreens: (ids: string[]) => void
  addScreen: (parent?: { flowId: string }, options?: { surface?: ScreenSurface }) => void
  renameScreen: (id: string, name: string) => void
  /** Drag-and-drop reorders (Explorer). `ref`+position insert against the
      target container AFTER the dragged node is removed, so same-container
      reorder is off-by-one-safe. */
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
  setScreenPreviewImage: (id: string, previewImage: string) => void
  /** Inlined HTML for a screen surface (from the surfaceStore), for the iframe. */
  getRenderHtml: (id: string, surface: ScreenSurface) => string | undefined
  removeScreen: (id: string) => void
  /** Explorer flow ops. parent: under a screen (launch) or a flow (nest), or top-level. */
  addFlow: (parent?: { flowId: string } | { screenId: string }) => void
  renameFlow: (id: string, name: string) => void
  removeFlow: (id: string) => void
  /** Explorer state ops (a vertical state of a screen). */
  addState: (screenId: string) => void
  renameState: (id: string, name: string) => void
  removeState: (id: string) => void
  /** Switch the device every screen is framed in (re-derives the layout). */
  setDevice: (deviceId: string) => void
  closeProject: () => void
}

const DocContext = createContext<DocContextValue | null>(null)

export function useDoc(): DocContextValue {
  const ctx = useContext(DocContext)
  if (!ctx) throw new Error('useDoc must be used within <DocProvider>')
  return ctx
}

const SAVE_DEBOUNCE = 400
const POLL_INTERVAL = 1500

const serialize = (doc: ProjectDoc) => JSON.stringify(doc, null, 2)

/** True if `ancestorId` is `flowId` itself or one of its ancestors (walking up
 *  parentFlowId / startsFromScreenId). Used to reject cyclic flow nesting. */
function flowIsAncestor(doc: ProjectDoc, ancestorId: string, flowId: string): boolean {
  const byId = new Map(doc.flows.map((f) => [f.id, f]))
  let cur = byId.get(flowId)
  const seen = new Set<string>()
  while (cur && !seen.has(cur.id)) {
    if (cur.id === ancestorId) return true
    seen.add(cur.id)
    if (cur.parentFlowId) cur = byId.get(cur.parentFlowId)
    else if (cur.startsFromScreenId) {
      const owner = doc.flows.find((f) => f.screenIds.includes(cur!.startsFromScreenId!))
      cur = owner
    } else cur = undefined
  }
  return false
}

function uniqueEdgeId(doc: ProjectDoc, source: string, target: string) {
  const taken = new Set(doc.edges.map((e) => e.id))
  const base = `e-${source}-${target}`
  if (!taken.has(base)) return base

  let i = 2
  while (taken.has(`${base}-${i}`)) i += 1
  return `${base}-${i}`
}

export function DocProvider({
  session,
  onClose,
  children,
}: {
  session: DocSession
  onClose: () => void
  children: React.ReactNode
}) {
  const { storage, ref } = session
  const [doc, setDoc] = useState<ProjectDoc>(session.doc)
  const [saveState, setSaveState] = useState<SaveState>('saved')
  const [syncKey, setSyncKey] = useState(0)
  const [selectedScreenId, setSelectedScreenId] = useState<string | null>(null)
  // Re-render when on-disk surface bytes load/change (they live outside the doc).
  const surfaceRevision = useSyncExternalStore(subscribeSurfaces, getSurfaceRevision)

  const docRef = useRef(doc)
  useEffect(() => {
    docRef.current = doc
  }, [doc])

  const lastSavedJson = useRef(serialize(session.doc))
  const lastRev = useRef(0)
  const lastTreeRev = useRef(0)
  const dirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  // Block saves until the surface store is hydrated from disk: saving earlier
  // would re-materialize from an empty store and a path-changing edit (e.g.
  // rename-on-open) would prune the old folder before its bytes loaded → data
  // loss. No hydration backend (web) → already hydrated.
  const hydrated = useRef(!storage.readSurfaceAssets)

  const scheduleSave = useCallback(() => {
    dirty.current = true
    setSaveState('dirty')
    clearTimeout(saveTimer.current)
    const run = async () => {
      if (!hydrated.current) {
        // Surface bytes not loaded yet — defer rather than materialize blind.
        saveTimer.current = setTimeout(run, SAVE_DEBOUNCE)
        return
      }
      const current = docRef.current
      const json = serialize(current)
      setSaveState('saving')
      try {
        await storage.saveProject(ref, current)
        lastSavedJson.current = json
        lastRev.current = await storage.getRevision(ref)
        // saveProject also re-materialized the folder mirror — rebaseline its
        // revision so the poll doesn't read our own write back as an edit.
        if (storage.getTreeRevision) lastTreeRev.current = await storage.getTreeRevision(ref)
        dirty.current = false
        setSaveState('saved')
      } catch (e) {
        console.error('LateNighter: save failed', e)
        setSaveState('error')
      }
    }
    saveTimer.current = setTimeout(run, SAVE_DEBOUNCE)
  }, [storage, ref])

  // Baseline the revision tokens on open. If the mirror folder doesn't exist
  // yet (revision 0), materialize it once so the Explorer reflects on disk
  // from the start; if it already exists, leave it — it catches up to the
  // canonical JSON on the next save without rewriting files on every open.
  useEffect(() => {
    let active = true
    ;(async () => {
      lastRev.current = await storage.getRevision(ref)
      if (storage.getTreeRevision && storage.readTree) {
        const r = await storage.getTreeRevision(ref)
        if (!active) return
        lastTreeRev.current = r
        if (r === 0) scheduleSave()
      }
    })()
    return () => {
      active = false
    }
  }, [storage, ref, scheduleSave])

  // Hydrate the surface store from disk on open: html/folder bytes aren't in the
  // doc JSON, so load them back (keyed by screen id → rename-safe) for rendering
  // and faithful re-materialization on the next save.
  useEffect(() => {
    if (!storage.readSurfaceAssets) return
    let active = true
    hydrated.current = false
    ;(async () => {
      try {
        const entries = await storage.readSurfaceAssets!(ref)
        if (active) hydrateSurfaces(entries)
      } catch (e) {
        console.error('LateNighter: readSurfaceAssets failed', e)
      } finally {
        // Mark hydrated even on failure: better to save (possibly pruning a
        // genuinely-absent folder) than to wedge saving forever.
        if (active) hydrated.current = true
      }
    })()
    return () => {
      active = false
    }
  }, [storage, ref])

  const mutate = useCallback(
    (fn: (d: ProjectDoc) => ProjectDoc, structural = false) => {
      setDoc((prev) => fn(prev))
      if (structural) setSyncKey((k) => k + 1)
      scheduleSave()
    },
    [scheduleSave],
  )

  const moveScreen = useCallback(
    (id: string, position: XY) => {
      // Position-only: do NOT bump syncKey (React Flow already reflects the drag).
      mutate((d) => ({
        ...d,
        screens: d.screens.map((s) => (s.id === id ? { ...s, position } : s)),
      }))
    },
    [mutate],
  )

  const connectScreens = useCallback(
    (source: string, target: string) => {
      if (source === target) return
      mutate(
        (d) => {
          const hasScreens =
            d.screens.some((s) => s.id === source) && d.screens.some((s) => s.id === target)
          if (!hasScreens || d.edges.some((e) => e.source === source && e.target === target)) {
            return d
          }

          return {
            ...d,
            edges: [...d.edges, { id: uniqueEdgeId(d, source, target), source, target }],
          }
        },
        true,
      )
    },
    [mutate],
  )

  const removeEdges = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids)
      if (idSet.size === 0) return
      mutate((d) => ({ ...d, edges: d.edges.filter((e) => !idSet.has(e.id)) }), true)
    },
    [mutate],
  )

  const removeScreens = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids)
      if (idSet.size === 0) return
      setSelectedScreenId((current) => (current && idSet.has(current) ? null : current))
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.filter((s) => !idSet.has(s.id)),
          edges: d.edges.filter((e) => !idSet.has(e.source) && !idSet.has(e.target)),
          flows: d.flows.map((f) => ({
            ...f,
            screenIds: f.screenIds.filter((sid) => !idSet.has(sid)),
          })),
        }),
        true,
      )
    },
    [mutate],
  )

  const renameScreen = useCallback(
    (id: string, name: string) => {
      const next = slugifyName(name)
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.map((s) => (s.id === id ? { ...s, name: next } : s)),
        }),
        true,
      )
    },
    [mutate],
  )

  const removeScreen = useCallback(
    (id: string) => {
      removeScreens([id])
    },
    [removeScreens],
  )

  const reorderScreen = useCallback(
    (
      screenId: string,
      toFlowId: string | null,
      refScreenId: string | null,
      position: 'before' | 'after',
    ) => {
      mutate((d) => {
        if (!d.screens.some((s) => s.id === screenId)) return d
        // Remove from every flow (single-flow membership), then re-insert.
        let flows = d.flows.map((f) =>
          f.screenIds.includes(screenId)
            ? { ...f, screenIds: f.screenIds.filter((id) => id !== screenId) }
            : f,
        )
        if (toFlowId) {
          flows = flows.map((f) => {
            if (f.id !== toFlowId) return f
            const ids = [...f.screenIds]
            const i = refScreenId ? ids.indexOf(refScreenId) : -1
            if (i < 0) ids.push(screenId)
            else ids.splice(position === 'after' ? i + 1 : i, 0, screenId)
            return { ...f, screenIds: ids }
          })
        }
        return { ...d, flows }
      }, true)
    },
    [mutate],
  )

  const moveState = useCallback(
    (
      stateId: string,
      toScreenId: string,
      refStateId: string | null,
      position: 'before' | 'after',
    ) => {
      mutate((d) => {
        let moved: ScreenState | undefined
        const removed = d.screens.map((s) => {
          if (!s.states.some((st) => st.id === stateId)) return s
          moved = s.states.find((st) => st.id === stateId)
          return { ...s, states: s.states.filter((st) => st.id !== stateId) }
        })
        if (!moved) return d
        const screens = removed.map((s) => {
          if (s.id !== toScreenId) return s
          const states = [...s.states]
          const i = refStateId ? states.findIndex((st) => st.id === refStateId) : -1
          if (i < 0) states.push(moved!)
          else states.splice(position === 'after' ? i + 1 : i, 0, moved!)
          return { ...s, states }
        })
        return { ...d, screens }
      }, true)
    },
    [mutate],
  )

  const moveFlow = useCallback(
    (
      flowId: string,
      parent: { flowId: string } | { screenId: string } | null,
      refFlowId: string | null,
      position: 'before' | 'after',
    ) => {
      mutate((d) => {
        const flow = d.flows.find((f) => f.id === flowId)
        if (!flow) return d
        // Reject cyclic nesting (a flow under itself or a descendant).
        if (parent && 'flowId' in parent) {
          if (parent.flowId === flowId || flowIsAncestor(d, flowId, parent.flowId)) return d
        }
        const updated: Flow = {
          ...flow,
          parentFlowId: parent && 'flowId' in parent ? parent.flowId : undefined,
          startsFromScreenId: parent && 'screenId' in parent ? parent.screenId : undefined,
        }
        // Reorder within the flat flows array (sibling order = array order).
        const without = d.flows.filter((f) => f.id !== flowId)
        let at = without.length
        if (refFlowId && refFlowId !== flowId) {
          const i = without.findIndex((f) => f.id === refFlowId)
          if (i >= 0) at = position === 'after' ? i + 1 : i
        }
        const flows = [...without.slice(0, at), updated, ...without.slice(at)]
        return { ...d, flows }
      }, true)
    },
    [mutate],
  )

  const setDevice = useCallback(
    (deviceId: string) => {
      // Structural: the device drives node size + layout pitches, so the
      // canvas must re-derive and re-fit (syncKey bump).
      mutate((d) => (d.deviceId === deviceId ? d : { ...d, deviceId }), true)
    },
    [mutate],
  )

  const addScreen = useCallback(
    (parent?: { flowId: string }, options?: { surface?: ScreenSurface }) => {
      mutate((d) => {
        const n = d.screens.length
        const id = `screen-${Date.now().toString(36)}`
        const newScreen: Screen = {
          id,
          name: `newScreen${n + 1}`,
          meta: 'Draft',
          surface: options?.surface ?? 'preview',
          position: { x: (n % 5) * 260, y: 540 },
          states: [],
        }
        // Target flow: the one given (Explorer), else the main happy path.
        const targetId = parent?.flowId ?? d.flows.find((f) => f.kind === 'main')?.id
        const flows = targetId
          ? d.flows.map((f) =>
              f.id === targetId ? { ...f, screenIds: [...f.screenIds, id] } : f,
            )
          : d.flows
        return { ...d, screens: [...d.screens, newScreen], flows }
      }, true)
    },
    [mutate],
  )

  const setScreenSurface = useCallback(
    (id: string, surface: ScreenSurface) => {
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.map((s) => (s.id === id ? { ...s, surface } : s)),
        }),
        true,
      )
    },
    [mutate],
  )

  // Live surface = a single .html file or a folder with index.html. Store the
  // bytes (singleton, keyed by id) + mark the doc; materialized to disk on save.
  const setScreenLiveContent = useCallback(
    (id: string, bundle: SurfaceBundle, kind: 'htmlFile' | 'htmlFolder') => {
      setSurface(id, 'live', bundle)
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.map((s) => (s.id === id ? { ...s, liveContent: kind } : s)),
        }),
        true,
      )
    },
    [mutate],
  )

  // Preview surface = an image only (data URL in the doc).
  const setScreenPreviewImage = useCallback(
    (id: string, previewImage: string) => {
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.map((s) =>
            s.id === id ? { ...s, previewImage, previewContent: 'image' } : s,
          ),
        }),
        true,
      )
    },
    [mutate],
  )

  const getRenderHtml = useCallback(
    (id: string, surface: ScreenSurface) => getSurfaceHtml(id, surface),
    [],
  )

  const addFlow = useCallback(
    (parent?: { flowId: string } | { screenId: string }) => {
      mutate((d) => {
        const id = `flow-${Date.now().toString(36)}`
        const flow: Flow = { id, name: 'newFlow', kind: 'sub', screenIds: [] }
        if (parent && 'screenId' in parent) flow.startsFromScreenId = parent.screenId
        else if (parent && 'flowId' in parent) flow.parentFlowId = parent.flowId
        return { ...d, flows: [...d.flows, flow] }
      }, true)
    },
    [mutate],
  )

  const renameFlow = useCallback(
    (id: string, name: string) => {
      const next = slugifyName(name)
      mutate(
        (d) => ({ ...d, flows: d.flows.map((f) => (f.id === id ? { ...f, name: next } : f)) }),
        true,
      )
    },
    [mutate],
  )

  // Delete a flow and everything that lived under it on disk (sub-flows it
  // launches/nests, and screens referenced by no surviving flow), mirroring a
  // recursive folder delete.
  const removeFlow = useCallback(
    (id: string) => {
      mutate((d) => {
        const remove = new Set<string>()
        const collect = (fid: string) => {
          if (remove.has(fid)) return
          remove.add(fid)
          const f = d.flows.find((x) => x.id === fid)
          if (!f) return
          f.screenIds.forEach((sid) =>
            d.flows.filter((x) => x.startsFromScreenId === sid).forEach((x) => collect(x.id)),
          )
          d.flows
            .filter((x) => x.parentFlowId === fid && !x.startsFromScreenId)
            .forEach((x) => collect(x.id))
        }
        collect(id)

        const flows = d.flows.filter((f) => !remove.has(f.id))
        const candidates = new Set(
          d.flows.filter((f) => remove.has(f.id)).flatMap((f) => f.screenIds),
        )
        const stillReferenced = new Set(flows.flatMap((f) => f.screenIds))
        const dropScreens = new Set(
          [...candidates].filter((sid) => !stillReferenced.has(sid)),
        )
        return {
          ...d,
          flows,
          screens: d.screens.filter((s) => !dropScreens.has(s.id)),
          edges: d.edges.filter(
            (e) => !dropScreens.has(e.source) && !dropScreens.has(e.target),
          ),
        }
      }, true)
    },
    [mutate],
  )

  const addState = useCallback(
    (screenId: string) => {
      mutate((d) => {
        const id = `state-${Date.now().toString(36)}`
        const state: ScreenState = { id, name: 'newState' }
        return {
          ...d,
          screens: d.screens.map((s) =>
            s.id === screenId ? { ...s, states: [...s.states, state] } : s,
          ),
        }
      }, true)
    },
    [mutate],
  )

  const renameState = useCallback(
    (id: string, name: string) => {
      const next = slugifyName(name)
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.map((s) => ({
            ...s,
            states: s.states.map((st) => (st.id === id ? { ...st, name: next } : st)),
          })),
        }),
        true,
      )
    },
    [mutate],
  )

  const removeState = useCallback(
    (id: string) => {
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.map((s) => ({
            ...s,
            states: s.states.filter((st) => st.id !== id),
          })),
        }),
        true,
      )
    },
    [mutate],
  )

  // Poll for external edits, with echo guards so our own writes don't reload.
  // Order encodes the conflict rule: the canonical JSON wins, so it's checked
  // first; the folder mirror is imported only when the JSON is unchanged.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (dirty.current) return

      // 1) Canonical JSON changed externally → it wins; reflect into views and
      //    re-materialize the folder mirror to match (via scheduleSave).
      let rev: number
      try {
        rev = await storage.getRevision(ref)
      } catch {
        return
      }
      if (rev !== lastRev.current) {
        lastRev.current = rev
        try {
          const fresh = await storage.loadProject(ref)
          const json = serialize(fresh)
          if (json === lastSavedJson.current) return // our own write echoing back
          lastSavedJson.current = json
          setDoc(fresh)
          setSyncKey((k) => k + 1)
          if (storage.readTree) scheduleSave() // propagate JSON edit → folders
        } catch (e) {
          console.error('LateNighter: external reload failed', e)
        }
        return
      }

      // 2) JSON unchanged — check the folder mirror for structural edits.
      if (!storage.getTreeRevision || !storage.readTree) return
      let trev: number
      try {
        trev = await storage.getTreeRevision(ref)
      } catch {
        return
      }
      if (trev === lastTreeRev.current) return
      lastTreeRev.current = trev
      try {
        const entries = await storage.readTree(ref)
        if (entries.length === 0) return // uninitialized / empty — don't wipe
        const patched = treeSpecToDocPatch(entries, docRef.current)
        const json = serialize(patched)
        if (json === lastSavedJson.current) return // folder matches doc already
        setDoc(patched)
        setSyncKey((k) => k + 1)
        scheduleSave() // write imported structure back to canonical JSON
      } catch (e) {
        console.error('LateNighter: folder import failed', e)
      }
    }, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [storage, ref, scheduleSave])

  const closeProject = useCallback(async () => {
    clearTimeout(saveTimer.current)
    if (dirty.current) {
      try {
        await storage.saveProject(ref, docRef.current)
      } catch {
        /* best effort on close */
      }
    }
    onClose()
  }, [storage, ref, onClose])

  const visibleSelectedScreenId = useMemo(
    () =>
      selectedScreenId && doc.screens.some((screen) => screen.id === selectedScreenId)
        ? selectedScreenId
        : null,
    [doc.screens, selectedScreenId],
  )

  const value = useMemo<DocContextValue>(
    () => ({
      doc,
      projectRef: ref,
      storageLabel: storage.label,
      saveState,
      syncKey,
      selectedScreenId: visibleSelectedScreenId,
      selectScreen: setSelectedScreenId,
      moveScreen,
      connectScreens,
      removeEdges,
      removeScreens,
      addScreen,
      renameScreen,
      reorderScreen,
      moveState,
      moveFlow,
      setScreenSurface,
      setScreenLiveContent,
      setScreenPreviewImage,
      getRenderHtml,
      removeScreen,
      addFlow,
      renameFlow,
      removeFlow,
      addState,
      renameState,
      removeState,
      setDevice,
      closeProject,
    }),
    // surfaceRevision is intentionally a dep: it forces the context value to
    // recompute when on-disk surface bytes load/change so getRenderHtml
    // consumers re-render (the bytes live in the singleton store, not the doc).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      doc,
      ref,
      storage.label,
      saveState,
      syncKey,
      surfaceRevision,
      visibleSelectedScreenId,
      moveScreen,
      connectScreens,
      removeEdges,
      removeScreens,
      addScreen,
      renameScreen,
      reorderScreen,
      moveState,
      moveFlow,
      setScreenSurface,
      setScreenLiveContent,
      setScreenPreviewImage,
      getRenderHtml,
      removeScreen,
      addFlow,
      renameFlow,
      removeFlow,
      addState,
      renameState,
      removeState,
      setDevice,
      closeProject,
    ],
  )

  return <DocContext.Provider value={value}>{children}</DocContext.Provider>
}
