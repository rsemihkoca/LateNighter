import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react'
import { treeSpecToDocPatch } from './treeSync'
import {
  getRevision as getSurfaceRevision,
  getSurface,
  getSurfaceHtml,
  getSurfaceImageUrl,
  hydrateSurfaces,
  setSurface,
  subscribe as subscribeSurfaces,
  type SurfaceBundle,
} from '../storage/surfaceStore'
import { imageDataUrlToBundle, imageUrlOf } from '../storage/surfaceImport'
import type { ProjectDoc, ScreenSurface, XY } from './types'
import { DocContext, type DocContextValue, type DocSession, type SaveState } from './DocContextCore'
import {
  addFlowToDoc,
  addScreenToDoc,
  addStateToDoc,
  connectScreensInDoc,
  moveFlowInDoc,
  moveScreenPosition,
  moveStateInDoc,
  removeEdgesFromDoc,
  removeFlowFromDoc,
  removeScreensFromDoc,
  removeStateFromDoc,
  renameFlowInDoc,
  renameScreenInDoc,
  renameStateInDoc,
  reorderScreenInDoc,
  setDeviceInDoc,
  setScreenLiveContentInDoc,
  setScreenPreviewImageInDoc,
  setScreenSurfaceInDoc,
} from './mutations'

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
      // Legacy migration (disk backends only): older docs stored the preview
      // image as a base64 data URL in JSON. Move it into the surface store —
      // which lands it on disk under preview/ and strips it from the JSON on the
      // next save. Runs AFTER hydrateSurfaces so its store.clear() can't wipe the
      // seed; the !getSurface guard keeps it idempotent across reopens.
      if (!active) return
      let migrated = false
      for (const screen of docRef.current.screens) {
        const legacy = screen.previewImage
        if (!legacy || getSurface(screen.id, 'preview')) continue
        const bundle = imageDataUrlToBundle(legacy)
        if (bundle) {
          setSurface(screen.id, 'preview', bundle)
          migrated = true
        }
      }
      if (migrated) {
        setDoc((d) => ({
          ...d,
          screens: d.screens.map((s) => ({ ...s, previewImage: undefined })),
        }))
        scheduleSave()
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
      mutate((d) => moveScreenPosition(d, id, position))
    },
    [mutate],
  )

  const connectScreens = useCallback(
    (source: string, target: string) => {
      mutate((d) => connectScreensInDoc(d, source, target), true)
    },
    [mutate],
  )

  const removeEdges = useCallback(
    (ids: string[]) => {
      mutate((d) => removeEdgesFromDoc(d, ids), true)
    },
    [mutate],
  )

  const removeScreens = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids)
      if (idSet.size === 0) return
      setSelectedScreenId((current) => (current && idSet.has(current) ? null : current))
      mutate((d) => removeScreensFromDoc(d, ids), true)
    },
    [mutate],
  )

  const renameScreen = useCallback(
    (id: string, name: string) => {
      mutate((d) => renameScreenInDoc(d, id, name), true)
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
      mutate((d) => reorderScreenInDoc(d, screenId, toFlowId, refScreenId, position), true)
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
      mutate((d) => moveStateInDoc(d, stateId, toScreenId, refStateId, position), true)
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
      mutate((d) => moveFlowInDoc(d, flowId, parent, refFlowId, position), true)
    },
    [mutate],
  )

  const setDevice = useCallback(
    (deviceId: string) => {
      // Structural: the device drives node size + layout pitches.
      mutate((d) => setDeviceInDoc(d, deviceId), true)
    },
    [mutate],
  )

  const addScreen = useCallback(
    (parent?: { flowId: string }, options?: { surface?: ScreenSurface }) => {
      mutate((d) => addScreenToDoc(d, parent, options), true)
    },
    [mutate],
  )

  const setScreenSurface = useCallback(
    (id: string, surface: ScreenSurface) => {
      mutate((d) => setScreenSurfaceInDoc(d, id, surface), true)
    },
    [mutate],
  )

  // Live surface = a single .html file or a folder with index.html. Store the
  // bytes (singleton, keyed by id) + mark the doc; materialized to disk on save.
  const setScreenLiveContent = useCallback(
    (id: string, bundle: SurfaceBundle, kind: 'htmlFile' | 'htmlFolder') => {
      setSurface(id, 'live', bundle)
      mutate((d) => setScreenLiveContentInDoc(d, id, kind), true)
    },
    [mutate],
  )

  // Preview surface = an image. The bytes live in the surfaceStore (→ disk under
  // preview/, keeping JSON light). Backends without a file tree (web localStorage)
  // have no disk to hydrate from, so we also keep the data URL in the JSON there.
  const setScreenPreviewImage = useCallback(
    (id: string, bundle: SurfaceBundle) => {
      setSurface(id, 'preview', bundle)
      const fallback = storage.readSurfaceAssets ? undefined : imageUrlOf(bundle)
      mutate((d) => setScreenPreviewImageInDoc(d, id, fallback), true)
    },
    [mutate, storage],
  )

  const getRenderHtml = useCallback(
    (id: string, surface: ScreenSurface) => getSurfaceHtml(id, surface),
    [],
  )

  const getRenderImage = useCallback(
    (id: string, surface: ScreenSurface) => getSurfaceImageUrl(id, surface),
    [],
  )

  const addFlow = useCallback(
    (parent?: { flowId: string } | { screenId: string }) => {
      mutate((d) => addFlowToDoc(d, parent), true)
    },
    [mutate],
  )

  const renameFlow = useCallback(
    (id: string, name: string) => {
      mutate((d) => renameFlowInDoc(d, id, name), true)
    },
    [mutate],
  )

  // Delete a flow and everything that lived under it on disk (sub-flows it
  // launches/nests, and screens referenced by no surviving flow), mirroring a
  // recursive folder delete.
  const removeFlow = useCallback(
    (id: string) => {
      mutate((d) => removeFlowFromDoc(d, id), true)
    },
    [mutate],
  )

  const addState = useCallback(
    (screenId: string) => {
      mutate((d) => addStateToDoc(d, screenId), true)
    },
    [mutate],
  )

  const renameState = useCallback(
    (id: string, name: string) => {
      mutate((d) => renameStateInDoc(d, id, name), true)
    },
    [mutate],
  )

  const removeState = useCallback(
    (id: string) => {
      mutate((d) => removeStateFromDoc(d, id), true)
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
      getRenderImage,
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
      getRenderImage,
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
