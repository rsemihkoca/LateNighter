import { useCallback, useEffect, useState } from 'react'
import { createInitialDoc } from '../doc/initialDoc'
import type { DocSession } from '../doc/DocContext'
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
        setError('Klasör izni verilmedi.')
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
    <div className="picker">
      <div className="picker__card">
        <div className="picker__head">
          <span className="picker__logo" aria-hidden>
            ◆
          </span>
          <div>
            <h1 className="picker__title">LateNighter</h1>
            <p className="picker__subtitle">
              Bir proje seç — JSON tek kaynak, React Flow ve tree onun görünümü.
            </p>
          </div>
        </div>

        {!storage ? (
          <div className="picker__choices">
            {tauri ? (
              <>
                <button className="picker__choice" type="button" onClick={chooseFolder}>
                  <span className="picker__choice-title">📂 Klasör Seç</span>
                  <span className="picker__choice-desc">
                    Klasör adıyla projeyi açar; yoksa boş bir proje oluşturur.
                  </span>
                </button>
                {lastTauriDir && (
                  <button className="picker__choice" type="button" onClick={reconnectTauri}>
                    <span className="picker__choice-title">↩ Son klasöre dön</span>
                    <span className="picker__choice-desc">{lastTauriDir}</span>
                  </button>
                )}
              </>
            ) : fsSupported ? (
              <>
                <button className="picker__choice" type="button" onClick={chooseFolder}>
                  <span className="picker__choice-title">📁 Klasör Seç</span>
                  <span className="picker__choice-desc">
                    Klasör adıyla projeyi açar; yoksa boş bir proje oluşturur.
                  </span>
                </button>
                {lastDir && (
                  <button className="picker__choice" type="button" onClick={reconnectLast}>
                    <span className="picker__choice-title">↩ Son klasöre dön</span>
                    <span className="picker__choice-desc">{lastDir.name}</span>
                  </button>
                )}
              </>
            ) : (
              <p className="picker__note">
                Tarayıcın klasör erişimini desteklemiyor (Chrome/Arc/Brave öner). Scratch
                ile devam edebilirsin.
              </p>
            )}
            <button
              className="picker__choice picker__choice--ghost"
              type="button"
              onClick={() => activateStorage(localStorageBackend)}
            >
              <span className="picker__choice-title">⚡ Dosyasız başla (scratch)</span>
              <span className="picker__choice-desc">
                Tarayıcı deposunda — hızlı deneme, gerçek .json dosyası olmadan.
              </span>
            </button>
          </div>
        ) : (
          <div className="picker__browse">
            <div className="picker__browse-head">
              <span className="picker__location">{storage.label}</span>
              <button
                className="picker__link"
                type="button"
                onClick={() => {
                  setStorage(null)
                  setProjects([])
                }}
              >
                değiştir
              </button>
            </div>

            <div className="picker__list">
              {projects.length === 0 && (
                <p className="picker__note">
                  Bu konumda proje yok — klasör adıyla oluşturabilirsin.
                </p>
              )}
              {projects.map((ref) => (
                <button
                  key={ref.id}
                  className="picker__project"
                  type="button"
                  disabled={busy}
                  onClick={() => openExisting(ref)}
                >
                  <span className="picker__project-name">{ref.name}</span>
                  <span className="picker__project-id">{ref.id}.json</span>
                </button>
              ))}
            </div>

            <div className="picker__create">
              <input
                className="picker__input"
                placeholder="Proje adı (opsiyonel)…"
                value={newName}
                disabled={busy}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createNew()}
              />
              <button
                className="picker__btn picker__btn--accent"
                type="button"
                disabled={busy}
                onClick={createNew}
              >
                + Yeni proje
              </button>
            </div>
          </div>
        )}

        {error && <p className="picker__error">{error}</p>}
      </div>
    </div>
  )
}
