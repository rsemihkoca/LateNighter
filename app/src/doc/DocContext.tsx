import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { ProjectRef, ProjectStorage } from '../storage/types'
import { slugifyName } from './slug'
import { treeSpecToDocPatch } from './treeSync'
import type {
  Commit,
  Flow,
  ProjectDoc,
  Screen,
  ScreenState,
  ScreenStatus,
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
  setScreenStatus: (id: string, status: ScreenStatus) => void
  /** Baseline the design diff: new/changed → locked, deleted screens removed,
      and record a commit. No-op when there are no pending changes. */
  commitChanges: (message: string) => void
  setScreenSurface: (id: string, surface: ScreenSurface) => void
  setScreenLiveHtml: (id: string, liveHtml: string) => void
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

  const docRef = useRef(doc)
  useEffect(() => {
    docRef.current = doc
  }, [doc])

  const lastSavedJson = useRef(serialize(session.doc))
  const lastRev = useRef(0)
  const lastTreeRev = useRef(0)
  const dirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const scheduleSave = useCallback(() => {
    dirty.current = true
    setSaveState('dirty')
    clearTimeout(saveTimer.current)
    saveTimer.current = setTimeout(async () => {
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
    }, SAVE_DEBOUNCE)
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

  const setScreenStatus = useCallback(
    (id: string, status: ScreenStatus) => {
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.map((s) => (s.id === id ? { ...s, status } : s)),
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

  const commitChanges = useCallback(
    (message: string) => {
      mutate((d) => {
        const pending = d.screens.filter((s) => s.status !== 'locked')
        if (pending.length === 0) return d

        const summary = {
          added: pending.filter((s) => s.status === 'new').length,
          changed: pending.filter((s) => s.status === 'changed').length,
          removed: pending.filter((s) => s.status === 'deleted').length,
        }
        const dropped = new Set(
          pending.filter((s) => s.status === 'deleted').map((s) => s.id),
        )

        // Surviving screens baseline to locked; their deleted states drop and
        // the rest baseline too.
        const screens = d.screens
          .filter((s) => !dropped.has(s.id))
          .map((s) => {
            const states = s.states
              .filter((st) => st.status !== 'deleted')
              .map((st) => (st.status === 'locked' ? st : { ...st, status: 'locked' as const }))
            return s.status === 'locked' && states === s.states
              ? s
              : { ...s, status: 'locked' as const, states }
          })

        const commit: Commit = {
          id: `commit-${Date.now().toString(36)}`,
          message: message.trim(),
          at: Date.now(),
          summary,
        }

        return {
          ...d,
          screens,
          flows: d.flows.map((f) => ({
            ...f,
            screenIds: f.screenIds.filter((sid) => !dropped.has(sid)),
          })),
          edges: d.edges.filter((e) => !dropped.has(e.source) && !dropped.has(e.target)),
          commits: [commit, ...(d.commits ?? [])],
        }
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
          name: `yeniEkran${n + 1}`,
          meta: 'Taslak',
          status: 'new',
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

  const setScreenLiveHtml = useCallback(
    (id: string, liveHtml: string) => {
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.map((s) => (s.id === id ? { ...s, liveHtml } : s)),
        }),
        true,
      )
    },
    [mutate],
  )

  const addFlow = useCallback(
    (parent?: { flowId: string } | { screenId: string }) => {
      mutate((d) => {
        const id = `flow-${Date.now().toString(36)}`
        const flow: Flow = { id, name: 'yeniAkis', kind: 'sub', screenIds: [] }
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
        const state: ScreenState = { id, name: 'yeniDurum', status: 'new' }
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
      setScreenStatus,
      commitChanges,
      setScreenSurface,
      setScreenLiveHtml,
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
    [
      doc,
      ref,
      storage.label,
      saveState,
      syncKey,
      visibleSelectedScreenId,
      moveScreen,
      connectScreens,
      removeEdges,
      removeScreens,
      addScreen,
      renameScreen,
      setScreenStatus,
      commitChanges,
      setScreenSurface,
      setScreenLiveHtml,
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
