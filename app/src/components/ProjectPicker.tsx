import { useCallback, useEffect, useState } from 'react'
import { createInitialDoc } from '../doc/initialDoc'
import type { DocSession } from '../doc/DocContextCore'
import {
  createFsStorage,
  ensurePermission,
  isFileSystemAccessSupported,
  pickDirectory,
  restoreDirectory,
} from '../storage/fileSystem'
import { localStorageBackend } from '../storage/localStorage'
import {
  createTauriStorage,
  isTauriRuntime,
  pickTauriDirectory,
  restoreTauriDir,
} from '../storage/tauri'
import { slugify, type ProjectRef, type ProjectStorage } from '../storage/types'

// Repeated picker controls (were .picker__choice / --ghost / .picker__project).
const CHOICE_BASE =
  'flex flex-col gap-[3px] px-4 py-3.5 text-left border border-border rounded-md text-fg cursor-pointer font-[inherit] transition-[border-color,background-color] duration-[120ms] ease-out hover:border-accent hover:bg-accent-tint'
const CHOICE = `${CHOICE_BASE} bg-bg`
const CHOICE_GHOST = `${CHOICE_BASE} bg-transparent`
const CHOICE_TITLE = 'text-sm font-[620] text-fg-strong'
const CHOICE_DESC = 'text-xs text-fg-muted leading-[1.45]'
const PROJECT_BTN =
  'flex flex-col gap-0.5 px-3 py-2.5 text-left border border-border rounded-base bg-bg text-fg cursor-pointer font-[inherit] transition-[border-color,background-color] duration-[120ms] ease-out hover:border-accent hover:bg-accent-tint'
const NOTE = 'm-0 text-[12.5px] text-fg-muted leading-normal'

function findFolderProject(storage: ProjectStorage, projects: ProjectRef[]) {
  const folderId = slugify(storage.label)
  const folderName = storage.label.toLocaleLowerCase()

  return (
    projects.find(
      (project) =>
        project.id === folderId || project.name.toLocaleLowerCase() === folderName,
    ) ?? (projects.length === 1 ? projects[0] : null)
  )
}

export function ProjectPicker({ onOpen }: { onOpen: (session: DocSession) => void }) {
  const tauri = isTauriRuntime()
  const fsSupported = isFileSystemAccessSupported()
  const [storage, setStorage] = useState<ProjectStorage | null>(null)
  const [projects, setProjects] = useState<ProjectRef[]>([])
  const [lastDir, setLastDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [lastTauriDir, setLastTauriDir] = useState<string | null>(() =>
    isTauriRuntime() ? restoreTauriDir() : null,
  )
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tauri || !fsSupported) return

    let active = true
    restoreDirectory()
      .then((dir) => {
        if (active) setLastDir(dir)
      })
      .catch(() => {})
    return () => {
      active = false
    }
  }, [tauri, fsSupported])

  const openProject = useCallback(
    async (s: ProjectStorage, ref: ProjectRef) => {
      const doc = await s.loadProject(ref)
      onOpen({ storage: s, ref, doc })
    },
    [onOpen],
  )

  const createProject = useCallback(
    async (s: ProjectStorage, name: string) => {
      const doc = createInitialDoc(name)
      const ref = await s.createProject(name, doc)
      onOpen({ storage: s, ref, doc })
    },
    [onOpen],
  )

  const activateStorage = useCallback(async (
    s: ProjectStorage,
    options: { openOrCreateFolderProject?: boolean } = {},
  ) => {
    setBusy(true)
    setError(null)
    let opened = false
    try {
      const refs = await s.listProjects()

      if (options.openOrCreateFolderProject) {
        const folderProject = findFolderProject(s, refs)
        if (folderProject) {
          await openProject(s, folderProject)
          opened = true
          return
        }

        if (refs.length === 0) {
          await createProject(s, s.label)
          opened = true
          return
        }
      }

      setProjects(refs)
      setStorage(s)
    } catch (e) {
      setError(String(e))
    } finally {
      if (!opened) setBusy(false)
    }
  }, [createProject, openProject])

  const chooseFolder = useCallback(async () => {
    try {
      if (tauri) {
        const dir = await pickTauriDirectory()
        if (dir) {
          setLastTauriDir(dir)
          await activateStorage(createTauriStorage(dir), {
            openOrCreateFolderProject: true,
          })
        }
        return
      }
      const dir = await pickDirectory()
      await activateStorage(createFsStorage(dir), { openOrCreateFolderProject: true })
    } catch (e) {
      setError(String(e))
    }
  }, [activateStorage, tauri])

  const reconnectTauri = useCallback(async () => {
    if (lastTauriDir) {
      await activateStorage(createTauriStorage(lastTauriDir), {
        openOrCreateFolderProject: true,
      })
    }
  }, [activateStorage, lastTauriDir])

  const reconnectLast = useCallback(async () => {
    if (!lastDir) return
    try {
      if (await ensurePermission(lastDir)) {
        await activateStorage(createFsStorage(lastDir), {
          openOrCreateFolderProject: true,
        })
      } else {
        setError('Folder permission denied.')
      }
    } catch (e) {
      setError(String(e))
    }
  }, [activateStorage, lastDir])

  const openExisting = useCallback(
    async (ref: ProjectRef) => {
      if (!storage) return
      setBusy(true)
      setError(null)
      try {
        await openProject(storage, ref)
      } catch (e) {
        setError(String(e))
        setBusy(false)
      }
    },
    [openProject, storage],
  )

  const createNew = useCallback(async () => {
    if (!storage) return
    const name = newName.trim() || storage.label
    setBusy(true)
    setError(null)
    try {
      await createProject(storage, name)
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }, [createProject, storage, newName])

  return (
    <div className="min-h-full flex items-center justify-center p-8">
      <div className="w-full max-w-[540px] p-7 bg-panel border border-border rounded-lg shadow-[var(--shadow-lg)]">
        <div className="flex gap-3.5 items-start mb-[22px]">
          <span
            className="inline-flex items-center justify-center w-[38px] h-[38px] flex-none rounded-md bg-[linear-gradient(135deg,var(--accent-tint)_0%,var(--accent-soft)_100%)] text-accent text-lg"
            aria-hidden
          >
            ◆
          </span>
          <div>
            <h1 className="m-0 text-[19px] font-[680] tracking-[-0.01em] text-fg-strong">LateNighter</h1>
            <p className="mt-1 text-[13px] leading-normal text-fg-muted">
              Pick a project — JSON is the single source; React Flow and the tree are its views.
            </p>
          </div>
        </div>

        {!storage ? (
          <div className="flex flex-col gap-2.5">
            {tauri ? (
              <>
                <button className={CHOICE} type="button" onClick={chooseFolder}>
                  <span className={CHOICE_TITLE}>📂 Choose Folder</span>
                  <span className={CHOICE_DESC}>
                    Opens the project named after the folder, or creates an empty one.
                  </span>
                </button>
                {lastTauriDir && (
                  <button className={CHOICE} type="button" onClick={reconnectTauri}>
                    <span className={CHOICE_TITLE}>↩ Back to last folder</span>
                    <span className={CHOICE_DESC}>{lastTauriDir}</span>
                  </button>
                )}
              </>
            ) : fsSupported ? (
              <>
                <button className={CHOICE} type="button" onClick={chooseFolder}>
                  <span className={CHOICE_TITLE}>📁 Choose Folder</span>
                  <span className={CHOICE_DESC}>
                    Opens the project named after the folder, or creates an empty one.
                  </span>
                </button>
                {lastDir && (
                  <button className={CHOICE} type="button" onClick={reconnectLast}>
                    <span className={CHOICE_TITLE}>↩ Back to last folder</span>
                    <span className={CHOICE_DESC}>{lastDir.name}</span>
                  </button>
                )}
              </>
            ) : (
              <p className={NOTE}>
                Your browser doesn't support folder access (try Chrome/Arc/Brave). You can
                continue with scratch.
              </p>
            )}
            <button
              className={CHOICE_GHOST}
              type="button"
              onClick={() => activateStorage(localStorageBackend)}
            >
              <span className={CHOICE_TITLE}>⚡ Start without files (scratch)</span>
              <span className={CHOICE_DESC}>
                In browser storage — quick experiments, without a real .json file.
              </span>
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3.5">
            <div className="flex items-center justify-between gap-2.5">
              <span className="text-xs font-semibold text-fg-muted overflow-hidden text-ellipsis whitespace-nowrap">
                {storage.label}
              </span>
              <button
                className="border-0 bg-transparent text-accent text-xs cursor-pointer font-[inherit]"
                type="button"
                onClick={() => {
                  setStorage(null)
                  setProjects([])
                }}
              >
                change
              </button>
            </div>

            <div className="flex flex-col gap-1.5 max-h-[280px] overflow-y-auto">
              {projects.length === 0 && (
                <p className={NOTE}>
                  No projects here — create one with a name.
                </p>
              )}
              {projects.map((ref) => (
                <button
                  key={ref.id}
                  className={PROJECT_BTN}
                  type="button"
                  disabled={busy}
                  onClick={() => openExisting(ref)}
                >
                  <span className="text-[13px] font-semibold text-fg-strong">{ref.name}</span>
                  <span className="text-[11px] text-fg-faint font-mono">{ref.id}.json</span>
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <input
                className="flex-[1_1_auto] h-9 px-3 border border-border rounded-base bg-bg text-fg text-[13px] font-[inherit] focus:outline-none focus:border-accent focus:shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_18%,transparent)]"
                placeholder="Project name (optional)…"
                value={newName}
                disabled={busy}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createNew()}
              />
              <button
                className="h-9 px-4 border border-accent rounded-base bg-accent text-white text-[13px] font-[560] font-[inherit] cursor-pointer whitespace-nowrap hover:bg-accent-hover disabled:opacity-50 disabled:cursor-default"
                type="button"
                disabled={busy}
                onClick={createNew}
              >
                + New project
              </button>
            </div>
          </div>
        )}

        {error && (
          <p className="mt-3.5 px-3 py-2 text-xs text-red bg-red-bg border border-red-border rounded-base">
            {error}
          </p>
        )}
      </div>
    </div>
  )
}
