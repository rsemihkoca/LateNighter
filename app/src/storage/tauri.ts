import { invoke, isTauri } from '@tauri-apps/api/core'
import { open } from '@tauri-apps/plugin-dialog'
import type { ProjectDoc } from '../doc/types'
import { docToTreeSpec, type FolderSpec, type TreeEntry } from '../doc/treeSync'
import { slugify, type ProjectRef, type ProjectStorage } from './types'

const LAST_DIR_KEY = 'latenighter:tauri-dir'

/** True when running inside the Tauri desktop shell (not a plain browser). */
export function isTauriRuntime(): boolean {
  return isTauri()
}

export function restoreTauriDir(): string | null {
  return localStorage.getItem(LAST_DIR_KEY)
}

/** Native folder picker (works in every OS / no browser support gaps). */
export async function pickTauriDirectory(): Promise<string | null> {
  const picked = await open({ directory: true, multiple: false })
  const dir = typeof picked === 'string' ? picked : null
  if (dir) localStorage.setItem(LAST_DIR_KEY, dir)
  return dir
}

const folderName = (dir: string) => dir.split(/[\\/]/).filter(Boolean).pop() ?? dir

const serialize = (doc: ProjectDoc) => JSON.stringify(doc, null, 2)

/** ProjectStorage backed by custom Rust fs commands over a chosen folder. */
export function createTauriStorage(dir: string): ProjectStorage {
  return {
    kind: 'fs',
    label: folderName(dir),

    async listProjects(): Promise<ProjectRef[]> {
      const ids = await invoke<string[]>('list_projects', { dir })
      const refs = await Promise.all(
        ids.map(async (id) => {
          let name = id
          try {
            const raw = await invoke<string>('read_project', { dir, id })
            const parsed = JSON.parse(raw) as Partial<ProjectDoc>
            if (typeof parsed.name === 'string') name = parsed.name
          } catch {
            /* keep filename as fallback */
          }
          return { id, name, backend: 'fs' as const }
        }),
      )
      return refs.sort((a, b) => a.name.localeCompare(b.name))
    },

    async createProject(name: string, doc: ProjectDoc): Promise<ProjectRef> {
      const existing = new Set(await invoke<string[]>('list_projects', { dir }))
      const base = slugify(name)
      let id = base
      let i = 2
      while (existing.has(id)) id = `${base}-${i++}`
      const ref: ProjectRef = { id, name, backend: 'fs' }
      await this.saveProject(ref, doc)
      return ref
    },

    async loadProject(ref: ProjectRef): Promise<ProjectDoc> {
      const raw = await invoke<string>('read_project', { dir, id: ref.id })
      return JSON.parse(raw) as ProjectDoc
    },

    async saveProject(ref: ProjectRef, doc: ProjectDoc): Promise<void> {
      await invoke('write_project', { dir, id: ref.id, contents: serialize(doc) })
      // Mirror the doc to a real nested folder tree alongside the JSON.
      const folders: FolderSpec[] = docToTreeSpec(doc)
      try {
        await invoke('materialize_tree', { dir, id: ref.id, folders })
      } catch (e) {
        console.error('LateNighter: materialize_tree failed', e)
      }
    },

    async getRevision(ref: ProjectRef): Promise<number> {
      return invoke<number>('project_revision', { dir, id: ref.id })
    },

    async getTreeRevision(ref: ProjectRef): Promise<number> {
      return invoke<number>('tree_revision', { dir, id: ref.id })
    },

    async readTree(ref: ProjectRef): Promise<TreeEntry[]> {
      return invoke<TreeEntry[]>('read_tree', { dir, id: ref.id })
    },
  }
}
