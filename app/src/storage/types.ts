import type { ProjectDoc } from '../doc/types'
import type { TreeEntry } from '../doc/treeSync'

export type StorageKind = 'fs' | 'local'

export interface ProjectRef {
  /** Stable id — file name without extension (fs) or storage key (local). */
  id: string
  name: string
  backend: StorageKind
}

/**
 * Storage abstraction. Views and the doc-store never touch files directly —
 * they go through this interface, so the FS-Access backend and the
 * localStorage fallback are interchangeable.
 */
export interface ProjectStorage {
  readonly kind: StorageKind
  /** Human label for the location (folder name, or "Tarayıcı deposu"). */
  readonly label: string
  listProjects(): Promise<ProjectRef[]>
  createProject(name: string, doc: ProjectDoc): Promise<ProjectRef>
  loadProject(ref: ProjectRef): Promise<ProjectDoc>
  saveProject(ref: ProjectRef, doc: ProjectDoc): Promise<void>
  /** Monotonic revision token (lastModified) for external-change polling. */
  getRevision(ref: ProjectRef): Promise<number>

  // ---- Folder-tree mirror (Tauri only; other backends omit these) -------
  /** Max mtime across the on-disk mirror folder — folder-side change token. */
  getTreeRevision?(ref: ProjectRef): Promise<number>
  /** Read the mirror folder back into a flat list of node entries. */
  readTree?(ref: ProjectRef): Promise<TreeEntry[]>
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '') // strip combining diacritics
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'project'
  )
}
