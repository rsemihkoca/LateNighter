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
import type { ProjectRef, ProjectStorage } from '../storage/types'

export function ProjectPicker({ onOpen }: { onOpen: (session: DocSession) => void }) {
  const tauri = isTauriRuntime()
  const fsSupported = isFileSystemAccessSupported()
  const [storage, setStorage] = useState<ProjectStorage | null>(null)
  const [projects, setProjects] = useState<ProjectRef[]>([])
  const [lastDir, setLastDir] = useState<FileSystemDirectoryHandle | null>(null)
  const [lastTauriDir, setLastTauriDir] = useState<string | null>(null)
  const [newName, setNewName] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (tauri) setLastTauriDir(restoreTauriDir())
    else if (fsSupported) restoreDirectory().then(setLastDir).catch(() => {})
  }, [tauri, fsSupported])

  const useStorage = useCallback(async (s: ProjectStorage) => {
    setBusy(true)
    setError(null)
    try {
      setProjects(await s.listProjects())
      setStorage(s)
    } catch (e) {
      setError(String(e))
    } finally {
      setBusy(false)
    }
  }, [])

  const chooseFolder = useCallback(async () => {
    try {
      if (tauri) {
        const dir = await pickTauriDirectory()
        if (dir) {
          setLastTauriDir(dir)
          await useStorage(createTauriStorage(dir))
        }
        return
      }
      const dir = await pickDirectory()
      await useStorage(createFsStorage(dir))
    } catch (e) {
      setError(String(e))
    }
  }, [tauri, useStorage])

  const reconnectTauri = useCallback(async () => {
    if (lastTauriDir) await useStorage(createTauriStorage(lastTauriDir))
  }, [lastTauriDir, useStorage])

  const reconnectLast = useCallback(async () => {
    if (!lastDir) return
    try {
      if (await ensurePermission(lastDir)) await useStorage(createFsStorage(lastDir))
      else setError('Klasör izni verilmedi.')
    } catch (e) {
      setError(String(e))
    }
  }, [lastDir, useStorage])

  const openExisting = useCallback(
    async (ref: ProjectRef) => {
      if (!storage) return
      setBusy(true)
      setError(null)
      try {
        const doc = await storage.loadProject(ref)
        onOpen({ storage, ref, doc })
      } catch (e) {
        setError(String(e))
        setBusy(false)
      }
    },
    [storage, onOpen],
  )

  const createNew = useCallback(async () => {
    if (!storage) return
    const name = newName.trim() || 'Yeni Proje'
    setBusy(true)
    setError(null)
    try {
      const doc = createInitialDoc(name)
      const ref = await storage.createProject(name, doc)
      onOpen({ storage, ref, doc })
    } catch (e) {
      setError(String(e))
      setBusy(false)
    }
  }, [storage, newName, onOpen])

  return (
    <div className="picker">
      <div className="picker__card">
        <div className="picker__head">
          <span className="picker__logo" aria-hidden>
            ◆
          </span>
          <div>
            <h1 className="picker__title">NightWorker</h1>
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
                    JSON dosyaları seçtiğin klasörde durur — native, tam disk erişimi.
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
                    JSON dosyaları seçtiğin klasörde durur — diskte görür, düzenlersin.
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
              onClick={() => useStorage(localStorageBackend)}
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
                <p className="picker__note">Bu konumda proje yok — yenisini oluştur.</p>
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
                placeholder="Yeni proje adı…"
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
