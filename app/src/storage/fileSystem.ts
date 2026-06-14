/// <reference types="wicg-file-system-access" />
import type { ProjectDoc } from '../doc/types'
import { idbGet, idbSet } from './idb'
import { slugify, type ProjectRef, type ProjectStorage } from './types'

const HANDLE_KEY = 'projects-dir'

export function isFileSystemAccessSupported(): boolean {
  return typeof window !== 'undefined' && 'showDirectoryPicker' in window
}

/** Prompt the user to pick a folder; persist the handle for next session. */
export async function pickDirectory(): Promise<FileSystemDirectoryHandle> {
  const dir = await window.showDirectoryPicker({
    id: 'latenighter-projects',
    mode: 'readwrite',
  })
  await idbSet(HANDLE_KEY, dir)
  return dir
}

/** Restore the previously chosen folder handle, if any (permission re-checked separately). */
export async function restoreDirectory(): Promise<FileSystemDirectoryHandle | null> {
  const dir = await idbGet<FileSystemDirectoryHandle>(HANDLE_KEY)
  return dir ?? null
}

export async function ensurePermission(
  dir: FileSystemDirectoryHandle,
): Promise<boolean> {
  const opts = { mode: 'readwrite' as const }
  if ((await dir.queryPermission(opts)) === 'granted') return true
  return (await dir.requestPermission(opts)) === 'granted'
}

const fileName = (id: string) => `${id}.json`

export function createFsStorage(dir: FileSystemDirectoryHandle): ProjectStorage {
  async function getFileHandle(id: string, create = false) {
    return dir.getFileHandle(fileName(id), { create })
  }

  return {
    kind: 'fs',
    label: dir.name,

    async listProjects(): Promise<ProjectRef[]> {
      const refs: ProjectRef[] = []
      for await (const [name, handle] of dir.entries()) {
        if (handle.kind !== 'file' || !name.endsWith('.json')) continue
        const id = name.replace(/\.json$/, '')
        let displayName = id
        try {
          const file = await (handle as FileSystemFileHandle).getFile()
          const parsed = JSON.parse(await file.text()) as Partial<ProjectDoc>
          if (typeof parsed.name === 'string') displayName = parsed.name
        } catch {
          /* unreadable / not our schema — fall back to filename */
        }
        refs.push({ id, name: displayName, backend: 'fs' })
      }
      return refs.sort((a, b) => a.name.localeCompare(b.name))
    },

    async createProject(name: string, doc: ProjectDoc): Promise<ProjectRef> {
      let id = slugify(name)
      // Avoid clobbering an existing file.
      const existing = new Set<string>()
      for await (const [entry] of dir.entries()) existing.add(entry)
      let n = id
      let i = 2
      while (existing.has(fileName(n))) n = `${id}-${i++}`
      id = n
      const ref: ProjectRef = { id, name, backend: 'fs' }
      await this.saveProject(ref, doc)
      return ref
    },

    async loadProject(ref: ProjectRef): Promise<ProjectDoc> {
      const handle = await getFileHandle(ref.id)
      const file = await handle.getFile()
      return JSON.parse(await file.text()) as ProjectDoc
    },

    async saveProject(ref: ProjectRef, doc: ProjectDoc): Promise<void> {
      const handle = await getFileHandle(ref.id, true)
      const writable = await handle.createWritable()
      await writable.write(JSON.stringify(doc, null, 2))
      await writable.close()
    },

    async getRevision(ref: ProjectRef): Promise<number> {
      try {
        const handle = await getFileHandle(ref.id)
        const file = await handle.getFile()
        return file.lastModified
      } catch {
        return 0
      }
    },
  }
}
