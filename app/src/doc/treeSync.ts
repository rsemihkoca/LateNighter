// ============================================================
// treeSync — the bridge between the ProjectDoc (canonical JSON) and the
// on-disk mirror folder. Two pure functions:
//
//   docToTreeSpec(doc)            → folder specs to materialize on disk
//   treeSpecToDocPatch(entries,d) → import a folder tree back into a doc
//
// The folder tree is LOSSY: it captures hierarchy + names but not ids,
// edges, positions, status or deviceId. Those live in each node's `.md`
// frontmatter (id/status/meta/position) and in the canonical JSON
// (edges/deviceId/order). The importer therefore reads frontmatter and
// falls back to `prevDoc` so nothing is destroyed on round-trip.
// ============================================================

import { docToTree, type TreeNode } from './derive'
import { slugifyName, uniqueSlug } from './slug'
import type {
  Flow,
  ProjectDoc,
  Screen,
  ScreenState,
  ScreenStatus,
  ScreenSurface,
} from './types'

// ---- Shared shapes (mirror the Rust commands) ----------------------------

/** A desired node folder: relative "/"-joined path + YAML frontmatter body. */
export interface FolderSpec {
  path: string
  frontmatter: string
}

/** A node folder read back from disk. */
export interface TreeEntry {
  path: string
  kind: string
  frontmatter: Record<string, string>
}

const STATUSES: ScreenStatus[] = ['locked', 'new', 'deleted', 'changed']
const asStatus = (v: string | undefined): ScreenStatus =>
  STATUSES.includes(v as ScreenStatus) ? (v as ScreenStatus) : 'new'
const SURFACES: ScreenSurface[] = ['preview', 'live']
const asSurface = (v: string | undefined): ScreenSurface =>
  SURFACES.includes(v as ScreenSurface) ? (v as ScreenSurface) : 'preview'

/** Build a frontmatter body from key/value pairs, skipping empty values. */
function frontmatter(pairs: [string, string | undefined][]): string {
  return pairs
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n')
}

// ---- doc → folder specs --------------------------------------------------

/**
 * Walk the derived tree (which already computes the correct nesting:
 * states under screens, sub-flows under their launching screen or parent flow,
 * screens under flows) into a flat list of "<slug>.<kind>" folder paths with
 * frontmatter. `link` nodes (cross-references) are skipped; orphan screens in
 * the "group" node are materialized at the mirror root.
 */
export function docToTreeSpec(doc: ProjectDoc): FolderSpec[] {
  const tree = docToTree(doc)
  const flowsById = new Map(doc.flows.map((f) => [f.id, f]))
  const screensById = new Map(doc.screens.map((s) => [s.id, s]))
  const statesById = new Map<string, ScreenState>()
  doc.screens.forEach((s) => s.states.forEach((st) => statesById.set(st.id, st)))

  const out: FolderSpec[] = []
  // A screen can be referenced by several flows; it can only live in one
  // folder. First reference (canonical parent) wins; later ones are skipped.
  const emittedScreens = new Set<string>()

  const visit = (node: TreeNode, parentPath: string, taken: Set<string>) => {
    if (node.kind === 'link') return
    if (node.kind === 'group') {
      // Orphan screens materialize at the same level as their group's parent.
      node.children.forEach((child) => visit(child, parentPath, taken))
      return
    }
    if (node.kind === 'screen' && emittedScreens.has(node.id)) return

    const kind = node.kind // 'flow' | 'screen' | 'state'
    const slug = uniqueSlug(slugifyName(node.label), taken)
    taken.add(slug)
    const path = parentPath ? `${parentPath}/${slug}.${kind}` : `${slug}.${kind}`

    let fm: string
    if (kind === 'flow') {
      const f = flowsById.get(node.id)
      fm = frontmatter([
        ['id', node.id],
        ['kind', f?.kind],
      ])
    } else if (kind === 'screen') {
      emittedScreens.add(node.id)
      const s = screensById.get(node.id)
      fm = frontmatter([
        ['id', node.id],
        ['status', s?.status],
        ['surface', s?.surface ?? 'preview'],
        ['meta', s?.meta],
        ['x', s ? String(s.position.x) : undefined],
        ['y', s ? String(s.position.y) : undefined],
      ])
    } else {
      const st = statesById.get(node.id)
      fm = frontmatter([
        ['id', node.id],
        ['status', st?.status],
      ])
    }
    out.push({ path, frontmatter: fm })

    const childTaken = new Set<string>()
    node.children.forEach((child) => visit(child, path, childTaken))
  }

  const rootTaken = new Set<string>()
  tree.children.forEach((child) => visit(child, '', rootTaken))
  return out
}

// ---- folder tree → doc ---------------------------------------------------

const slugOf = (segment: string) => segment.replace(/\.(flow|screen|state)$/, '')

/** Mint an id from `base` that doesn't collide with `taken`. */
function freshId(base: string, taken: Set<string>): string {
  let id = base || 'node'
  let i = 2
  while (taken.has(id)) id = `${base}-${i++}`
  taken.add(id)
  return id
}

interface Parsed {
  id: string
  kind: string
  parentPath: string | null
}

/**
 * Import a folder tree (as read from disk) back into a ProjectDoc, preserving
 * everything the tree can't represent by falling back to `prevDoc`:
 *   - parent folder kind → the right reference field
 *     (screen→flow: flow.screenIds; state→screen: screen.states;
 *      flow→screen: startsFromScreenId; flow→flow: parentFlowId)
 *   - frontmatter `id` is honored so a Finder rename reads as "same node, new
 *     name" (edges survive); a folder without one mints a fresh id.
 *   - edges/deviceId from prevDoc; screen order preserved from prevDoc.
 */
export function treeSpecToDocPatch(entries: TreeEntry[], prevDoc: ProjectDoc): ProjectDoc {
  const sorted = [...entries].sort((a, b) => a.path.localeCompare(b.path))
  const takenIds = new Set<string>()
  const prevScreens = new Map(prevDoc.screens.map((s) => [s.id, s]))

  // First pass: assign each path a stable id (honoring frontmatter), so a
  // child can resolve its parent's id by path.
  const byPath = new Map<string, Parsed>()
  for (const entry of sorted) {
    const segments = entry.path.split('/')
    const parentPath = segments.length > 1 ? segments.slice(0, -1).join('/') : null
    const fmId = entry.frontmatter.id?.trim()
    const slug = slugOf(segments[segments.length - 1])
    const id = fmId && !takenIds.has(fmId) ? (takenIds.add(fmId), fmId) : freshId(slug, takenIds)
    byPath.set(entry.path, { id, kind: entry.kind, parentPath })
  }

  const flows: Flow[] = []
  const screens: Screen[] = []
  const flowById = new Map<string, Flow>()
  const screenById = new Map<string, Screen>()

  for (const entry of sorted) {
    const self = byPath.get(entry.path)!
    const parent = self.parentPath ? byPath.get(self.parentPath) ?? null : null
    const slug = slugOf(entry.path.split('/').pop()!)
    const fm = entry.frontmatter

    if (self.kind === 'flow') {
      const kind: Flow['kind'] = fm.kind === 'main' ? 'main' : 'sub'
      const flow: Flow = { id: self.id, name: slug, kind, screenIds: [] }
      if (parent?.kind === 'screen') flow.startsFromScreenId = parent.id
      else if (parent?.kind === 'flow') flow.parentFlowId = parent.id
      flows.push(flow)
      flowById.set(flow.id, flow)
    } else if (self.kind === 'screen') {
      const prev = prevScreens.get(self.id)
      const x = fm.x !== undefined ? Number(fm.x) : prev?.position.x ?? 0
      const y = fm.y !== undefined ? Number(fm.y) : prev?.position.y ?? 0
      const screen: Screen = {
        id: self.id,
        name: slug,
        meta: fm.meta ?? prev?.meta ?? '',
        status: asStatus(fm.status ?? prev?.status),
        surface: asSurface(fm.surface ?? prev?.surface),
        liveHtml: prev?.liveHtml,
        position: { x, y },
        states: [],
      }
      screens.push(screen)
      screenById.set(screen.id, screen)
      if (parent?.kind === 'flow') flowById.get(parent.id)?.screenIds.push(screen.id)
    } else if (self.kind === 'state') {
      if (parent?.kind === 'screen') {
        const state: ScreenState = {
          id: self.id,
          name: slug,
          status: asStatus(fm.status),
        }
        screenById.get(parent.id)?.states.push(state)
      }
    }
  }

  // Preserve authored order (prevDoc order first, newly-discovered entries
  // appended in path order) for both a flow's screens and a screen's states —
  // the filesystem has no inherent ordering, so without this a folder edit
  // would shuffle siblings alphabetically.
  const reorder = <T extends { id: string }>(items: T[], prevIds: string[]) => {
    const rank = new Map(prevIds.map((id, i) => [id, i]))
    items.sort(
      (a, b) =>
        (rank.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b.id) ?? Number.MAX_SAFE_INTEGER),
    )
  }
  for (const flow of flows) {
    const prevOrder = prevDoc.flows.find((f) => f.id === flow.id)?.screenIds ?? []
    const rank = new Map(prevOrder.map((id, i) => [id, i]))
    flow.screenIds.sort(
      (a, b) => (rank.get(a) ?? Number.MAX_SAFE_INTEGER) - (rank.get(b) ?? Number.MAX_SAFE_INTEGER),
    )
  }
  const prevStateOrder = new Map(
    prevDoc.screens.map((s) => [s.id, s.states.map((st) => st.id)]),
  )
  for (const screen of screens) {
    reorder(screen.states, prevStateOrder.get(screen.id) ?? [])
  }

  // Edges are cross-references, not tree structure — keep the ones from
  // prevDoc whose endpoints still exist.
  const liveScreens = new Set(screens.map((s) => s.id))
  const edges = prevDoc.edges.filter((e) => liveScreens.has(e.source) && liveScreens.has(e.target))

  return {
    version: prevDoc.version,
    name: prevDoc.name,
    deviceId: prevDoc.deviceId,
    flows,
    screens,
    edges,
  }
}
