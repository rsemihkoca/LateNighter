import {
  base64ToBytes,
  imageUrlOf,
  inlineHtmlFolder,
  mimeOf,
  normalizePath,
  type Asset,
  type SurfaceBundle,
} from './surfaceImport'
import type { ScreenSurface } from '../doc/types'

// ============================================================
// Surface asset store — a module-level singleton holding the actual bytes of
// HTML/folder screen surfaces, keyed by `${screenId}:${surface}`.
//
// Why a singleton (not React state / not the doc): the bytes must NOT live in
// the project JSON (kept light), yet they have to be reachable from the storage
// layer (treeSync.screenAssets, called inside saveProject — outside React) to
// materialize real files on disk, AND from React to render. A module singleton
// bridges both. It is hydrated from the on-disk mirror on load (keyed by screen
// id → survives renames) and re-materialized to disk on every save.
// ============================================================

export interface SurfaceEntry {
  /** Original files (relpath → file) — written to disk as the real folder. */
  bundle: SurfaceBundle
  /** Self-contained inlined HTML for the sandboxed render iframe (html surfaces). */
  html: string
  /** Data URL of the image (image surfaces — e.g. a preview.png), else undefined. */
  image?: string
}

const store = new Map<string, SurfaceEntry>()
let revision = 0
const listeners = new Set<() => void>()

const keyOf = (screenId: string, surface: ScreenSurface) => `${screenId}:${surface}`

function bump() {
  revision += 1
  listeners.forEach((fn) => fn())
}

function makeEntry(bundle: SurfaceBundle): SurfaceEntry {
  return { bundle, html: inlineHtmlFolder(bundle) ?? '', image: imageUrlOf(bundle) }
}

/** Set/replace a screen surface's content. */
export function setSurface(screenId: string, surface: ScreenSurface, bundle: SurfaceBundle): void {
  store.set(keyOf(screenId, surface), makeEntry(bundle))
  bump()
}

/** Remove a screen surface's content (e.g. switching back to an image). */
export function clearSurface(screenId: string, surface: ScreenSurface): void {
  if (store.delete(keyOf(screenId, surface))) bump()
}

export function getSurface(screenId: string, surface: ScreenSurface): SurfaceEntry | undefined {
  return store.get(keyOf(screenId, surface))
}

export function getSurfaceHtml(screenId: string, surface: ScreenSurface): string | undefined {
  return store.get(keyOf(screenId, surface))?.html
}

export function getSurfaceImageUrl(screenId: string, surface: ScreenSurface): string | undefined {
  return store.get(keyOf(screenId, surface))?.image
}

/** Replace the whole store from disk-read files (called on project load). Each
    entry's files are `{ path, base64 }` (relative to the surface folder). */
export function hydrateSurfaces(
  entries: { screenId: string; surface: ScreenSurface; files: { path: string; base64: string }[] }[],
): void {
  store.clear()
  for (const e of entries) {
    const bundle: SurfaceBundle = new Map()
    for (const f of e.files) {
      const key = normalizePath(f.path)
      bundle.set(key, { mime: mimeOf(key), bytes: base64ToBytes(f.base64), b64: f.base64 })
    }
    if (bundle.size) store.set(keyOf(e.screenId, e.surface), makeEntry(bundle))
  }
  bump()
}

// React integration (useSyncExternalStore).
export function subscribe(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
export function getRevision(): number {
  return revision
}

export type { Asset, SurfaceBundle }
