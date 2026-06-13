import type { ProjectDoc } from '../doc/types'
import { slugify, type ProjectRef, type ProjectStorage } from './types'

// Fallback backend: keeps projects in localStorage. Used for browsers without
// File System Access (Firefox/Safari) and for a no-folder "scratch" start.
// There is no real .json file on disk — export/import covers that.

const INDEX_KEY = 'nightworker:projects'
const docKey = (id: string) => `nightworker:project:${id}`
const revKey = (id: string) => `nightworker:rev:${id}`

interface IndexEntry {
  id: string
  name: string
}

function readIndex(): IndexEntry[] {
  try {
    return JSON.parse(localStorage.getItem(INDEX_KEY) ?? '[]') as IndexEntry[]
  } catch {
    return []
  }
}

function writeIndex(entries: IndexEntry[]) {
  localStorage.setItem(INDEX_KEY, JSON.stringify(entries))
}

export const localStorageBackend: ProjectStorage = {
  kind: 'local',
  label: 'Tarayıcı deposu',

  async listProjects(): Promise<ProjectRef[]> {
    return readIndex().map((e) => ({ ...e, backend: 'local' }))
  },

  async createProject(name: string, doc: ProjectDoc): Promise<ProjectRef> {
    const index = readIndex()
    const base = slugify(name)
    let id = base
    let i = 2
    while (index.some((e) => e.id === id)) id = `${base}-${i++}`
    const ref: ProjectRef = { id, name, backend: 'local' }
    writeIndex([...index, { id, name }])
    await this.saveProject(ref, doc)
    return ref
  },

  async loadProject(ref: ProjectRef): Promise<ProjectDoc> {
    const raw = localStorage.getItem(docKey(ref.id))
    if (!raw) throw new Error(`Project not found: ${ref.id}`)
    return JSON.parse(raw) as ProjectDoc
  },

  async saveProject(ref: ProjectRef, doc: ProjectDoc): Promise<void> {
    localStorage.setItem(docKey(ref.id), JSON.stringify(doc, null, 2))
    localStorage.setItem(revKey(ref.id), String(Date.now()))
    const index = readIndex()
    if (!index.some((e) => e.id === ref.id)) {
      writeIndex([...index, { id: ref.id, name: ref.name }])
    }
  },

  async getRevision(ref: ProjectRef): Promise<number> {
    return Number(localStorage.getItem(revKey(ref.id)) ?? 0)
  },
}
