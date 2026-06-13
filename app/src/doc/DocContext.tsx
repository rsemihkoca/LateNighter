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
import type { ProjectDoc, Screen, ScreenStatus, XY } from './types'

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
  moveScreen: (id: string, position: XY) => void
  addScreen: () => void
  renameScreen: (id: string, name: string) => void
  setScreenStatus: (id: string, status: ScreenStatus) => void
  removeScreen: (id: string) => void
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

  const docRef = useRef(doc)
  useEffect(() => {
    docRef.current = doc
  }, [doc])

  const lastSavedJson = useRef(serialize(session.doc))
  const lastRev = useRef(0)
  const dirty = useRef(false)
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    storage.getRevision(ref).then((r) => {
      lastRev.current = r
    })
  }, [storage, ref])

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
        dirty.current = false
        setSaveState('saved')
      } catch (e) {
        console.error('NightWorker: save failed', e)
        setSaveState('error')
      }
    }, SAVE_DEBOUNCE)
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

  const renameScreen = useCallback(
    (id: string, name: string) => {
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.map((s) => (s.id === id ? { ...s, name } : s)),
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
      mutate(
        (d) => ({
          ...d,
          screens: d.screens.filter((s) => s.id !== id),
          edges: d.edges.filter((e) => e.source !== id && e.target !== id),
          flows: d.flows.map((f) => ({
            ...f,
            screenIds: f.screenIds.filter((sid) => sid !== id),
          })),
        }),
        true,
      )
    },
    [mutate],
  )

  const addScreen = useCallback(() => {
    mutate((d) => {
      const n = d.screens.length
      const id = `screen-${Date.now().toString(36)}`
      const newScreen: Screen = {
        id,
        name: `Yeni Ekran ${n + 1}`,
        meta: 'Taslak',
        status: 'new',
        position: { x: (n % 5) * 260, y: 540 },
        states: [],
      }
      const main = d.flows.find((f) => f.kind === 'main')
      const flows = main
        ? d.flows.map((f) =>
            f.id === main.id ? { ...f, screenIds: [...f.screenIds, id] } : f,
          )
        : d.flows
      return { ...d, screens: [...d.screens, newScreen], flows }
    }, true)
  }, [mutate])

  // Poll for external edits to the file (JSON → views), with an echo guard so
  // our own writes don't trigger a reload. Skipped while edits are pending.
  useEffect(() => {
    const timer = setInterval(async () => {
      if (dirty.current) return
      let rev: number
      try {
        rev = await storage.getRevision(ref)
      } catch {
        return
      }
      if (rev === lastRev.current) return
      lastRev.current = rev
      try {
        const fresh = await storage.loadProject(ref)
        const json = serialize(fresh)
        if (json === lastSavedJson.current) return // our own write echoing back
        lastSavedJson.current = json
        setDoc(fresh)
        setSyncKey((k) => k + 1)
      } catch (e) {
        console.error('NightWorker: external reload failed', e)
      }
    }, POLL_INTERVAL)
    return () => clearInterval(timer)
  }, [storage, ref])

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

  const value = useMemo<DocContextValue>(
    () => ({
      doc,
      projectRef: ref,
      storageLabel: storage.label,
      saveState,
      syncKey,
      moveScreen,
      addScreen,
      renameScreen,
      setScreenStatus,
      removeScreen,
      closeProject,
    }),
    [
      doc,
      ref,
      storage.label,
      saveState,
      syncKey,
      moveScreen,
      addScreen,
      renameScreen,
      setScreenStatus,
      removeScreen,
      closeProject,
    ],
  )

  return <DocContext.Provider value={value}>{children}</DocContext.Provider>
}
