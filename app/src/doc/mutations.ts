import { slugifyName } from './slug'
import type { Flow, ProjectDoc, Screen, ScreenState, ScreenSurface, XY } from './types'

export type InsertPosition = 'before' | 'after'
export type FlowParent = { flowId: string } | { screenId: string } | null

const makeId = (prefix: string) => `${prefix}-${Date.now().toString(36)}`

function insertRelative<T>(
  items: T[],
  item: T,
  refId: string | null,
  position: InsertPosition,
  getId: (item: T) => string,
): T[] {
  const next = [...items]
  const refIndex = refId ? next.findIndex((candidate) => getId(candidate) === refId) : -1
  if (refIndex < 0) return [...next, item]
  next.splice(position === 'after' ? refIndex + 1 : refIndex, 0, item)
  return next
}

function uniqueEdgeId(doc: ProjectDoc, source: string, target: string) {
  const taken = new Set(doc.edges.map((edge) => edge.id))
  const base = `e-${source}-${target}`
  if (!taken.has(base)) return base

  let index = 2
  while (taken.has(`${base}-${index}`)) index += 1
  return `${base}-${index}`
}

function collectFlowClosure(doc: ProjectDoc, rootFlowIds: Iterable<string>): Set<string> {
  const remove = new Set<string>()

  const collect = (flowId: string) => {
    if (remove.has(flowId)) return
    remove.add(flowId)
    const flow = doc.flows.find((candidate) => candidate.id === flowId)
    if (!flow) return

    for (const screenId of flow.screenIds) {
      doc.flows
        .filter((candidate) => candidate.startsFromScreenId === screenId)
        .forEach((candidate) => collect(candidate.id))
    }
    doc.flows
      .filter((candidate) => candidate.parentFlowId === flowId && !candidate.startsFromScreenId)
      .forEach((candidate) => collect(candidate.id))
  }

  for (const flowId of rootFlowIds) collect(flowId)
  return remove
}

function flowsStartedByScreens(doc: ProjectDoc, screenIds: Set<string>): Set<string> {
  return collectFlowClosure(
    doc,
    doc.flows
      .filter((flow) => flow.startsFromScreenId && screenIds.has(flow.startsFromScreenId))
      .map((flow) => flow.id),
  )
}

/** True if `ancestorId` is `flowId` itself or one of its ancestors. */
function flowIsAncestor(doc: ProjectDoc, ancestorId: string, flowId: string): boolean {
  const byId = new Map(doc.flows.map((flow) => [flow.id, flow]))
  let current = byId.get(flowId)
  const seen = new Set<string>()

  while (current && !seen.has(current.id)) {
    if (current.id === ancestorId) return true
    seen.add(current.id)
    if (current.parentFlowId) current = byId.get(current.parentFlowId)
    else if (current.startsFromScreenId) {
      current = doc.flows.find((flow) => flow.screenIds.includes(current!.startsFromScreenId!))
    } else {
      current = undefined
    }
  }

  return false
}

export function moveScreenPosition(doc: ProjectDoc, id: string, position: XY): ProjectDoc {
  return {
    ...doc,
    screens: doc.screens.map((screen) => (screen.id === id ? { ...screen, position } : screen)),
  }
}

export function connectScreensInDoc(doc: ProjectDoc, source: string, target: string): ProjectDoc {
  if (source === target) return doc
  const hasScreens =
    doc.screens.some((screen) => screen.id === source) &&
    doc.screens.some((screen) => screen.id === target)
  const hasEdge = doc.edges.some((edge) => edge.source === source && edge.target === target)
  if (!hasScreens || hasEdge) return doc

  return {
    ...doc,
    edges: [...doc.edges, { id: uniqueEdgeId(doc, source, target), source, target }],
  }
}

export function removeEdgesFromDoc(doc: ProjectDoc, ids: string[]): ProjectDoc {
  const idSet = new Set(ids)
  if (idSet.size === 0) return doc
  return { ...doc, edges: doc.edges.filter((edge) => !idSet.has(edge.id)) }
}

export function removeScreensFromDoc(doc: ProjectDoc, ids: string[]): ProjectDoc {
  const dropScreens = new Set(ids)
  if (dropScreens.size === 0) return doc

  const dropFlows = flowsStartedByScreens(doc, dropScreens)
  const keptFlows = doc.flows
    .filter((flow) => !dropFlows.has(flow.id))
    .map((flow) => ({
      ...flow,
      screenIds: flow.screenIds.filter((screenId) => !dropScreens.has(screenId)),
    }))

  const removedFlowScreens = new Set(
    doc.flows.filter((flow) => dropFlows.has(flow.id)).flatMap((flow) => flow.screenIds),
  )
  const stillReferenced = new Set(keptFlows.flatMap((flow) => flow.screenIds))
  for (const screenId of removedFlowScreens) {
    if (!stillReferenced.has(screenId)) dropScreens.add(screenId)
  }

  return {
    ...doc,
    flows: keptFlows,
    screens: doc.screens.filter((screen) => !dropScreens.has(screen.id)),
    edges: doc.edges.filter(
      (edge) => !dropScreens.has(edge.source) && !dropScreens.has(edge.target),
    ),
  }
}

export function renameScreenInDoc(doc: ProjectDoc, id: string, name: string): ProjectDoc {
  const nextName = slugifyName(name)
  return {
    ...doc,
    screens: doc.screens.map((screen) =>
      screen.id === id ? { ...screen, name: nextName } : screen,
    ),
  }
}

export function reorderScreenInDoc(
  doc: ProjectDoc,
  screenId: string,
  toFlowId: string | null,
  refScreenId: string | null,
  position: InsertPosition,
): ProjectDoc {
  if (!doc.screens.some((screen) => screen.id === screenId)) return doc

  let flows = doc.flows.map((flow) =>
    flow.screenIds.includes(screenId)
      ? { ...flow, screenIds: flow.screenIds.filter((id) => id !== screenId) }
      : flow,
  )

  if (toFlowId) {
    flows = flows.map((flow) =>
      flow.id === toFlowId
        ? {
            ...flow,
            screenIds: insertRelative(flow.screenIds, screenId, refScreenId, position, String),
          }
        : flow,
    )
  }

  return { ...doc, flows }
}

export function moveStateInDoc(
  doc: ProjectDoc,
  stateId: string,
  toScreenId: string,
  refStateId: string | null,
  position: InsertPosition,
): ProjectDoc {
  let moved: ScreenState | undefined
  const removed = doc.screens.map((screen) => {
    if (!screen.states.some((state) => state.id === stateId)) return screen
    moved = screen.states.find((state) => state.id === stateId)
    return { ...screen, states: screen.states.filter((state) => state.id !== stateId) }
  })
  if (!moved) return doc

  return {
    ...doc,
    screens: removed.map((screen) =>
      screen.id === toScreenId
        ? {
            ...screen,
            states: insertRelative(screen.states, moved!, refStateId, position, (state) => state.id),
          }
        : screen,
    ),
  }
}

export function moveFlowInDoc(
  doc: ProjectDoc,
  flowId: string,
  parent: FlowParent,
  refFlowId: string | null,
  position: InsertPosition,
): ProjectDoc {
  const flow = doc.flows.find((candidate) => candidate.id === flowId)
  if (!flow) return doc
  if (parent && 'flowId' in parent) {
    if (parent.flowId === flowId || flowIsAncestor(doc, flowId, parent.flowId)) return doc
  }

  const moved: Flow = {
    ...flow,
    parentFlowId: parent && 'flowId' in parent ? parent.flowId : undefined,
    startsFromScreenId: parent && 'screenId' in parent ? parent.screenId : undefined,
  }
  const remaining = doc.flows.filter((candidate) => candidate.id !== flowId)

  return {
    ...doc,
    flows: insertRelative(remaining, moved, refFlowId, position, (candidate) => candidate.id),
  }
}

export function setDeviceInDoc(doc: ProjectDoc, deviceId: string): ProjectDoc {
  return doc.deviceId === deviceId ? doc : { ...doc, deviceId }
}

export function addScreenToDoc(
  doc: ProjectDoc,
  parent?: { flowId: string },
  options?: { surface?: ScreenSurface },
): ProjectDoc {
  const index = doc.screens.length
  const id = makeId('screen')
  const screen: Screen = {
    id,
    name: `newScreen${index + 1}`,
    meta: 'Draft',
    surface: options?.surface ?? 'preview',
    position: { x: (index % 5) * 260, y: 540 },
    states: [],
  }
  const targetId = parent?.flowId ?? doc.flows.find((flow) => flow.kind === 'main')?.id
  const flows = targetId
    ? doc.flows.map((flow) =>
        flow.id === targetId ? { ...flow, screenIds: [...flow.screenIds, id] } : flow,
      )
    : doc.flows

  return { ...doc, screens: [...doc.screens, screen], flows }
}

export function setScreenSurfaceInDoc(
  doc: ProjectDoc,
  id: string,
  surface: ScreenSurface,
): ProjectDoc {
  return {
    ...doc,
    screens: doc.screens.map((screen) => (screen.id === id ? { ...screen, surface } : screen)),
  }
}

export function setScreenLiveContentInDoc(
  doc: ProjectDoc,
  id: string,
  liveContent: 'htmlFile' | 'htmlFolder',
): ProjectDoc {
  return {
    ...doc,
    screens: doc.screens.map((screen) =>
      screen.id === id ? { ...screen, liveContent } : screen,
    ),
  }
}

/** Mark a screen's preview as an image. The bytes live in the surfaceStore (→
    disk under preview/); `previewImage` is only a web/legacy fallback data URL
    (undefined on disk backends), passed in by the caller. */
export function setScreenPreviewImageInDoc(
  doc: ProjectDoc,
  id: string,
  previewImage: string | undefined,
): ProjectDoc {
  return {
    ...doc,
    screens: doc.screens.map((screen) =>
      screen.id === id ? { ...screen, previewImage, previewContent: 'image' } : screen,
    ),
  }
}

export function addFlowToDoc(
  doc: ProjectDoc,
  parent?: { flowId: string } | { screenId: string },
): ProjectDoc {
  const flow: Flow = { id: makeId('flow'), name: 'newFlow', kind: 'sub', screenIds: [] }
  if (parent && 'screenId' in parent) flow.startsFromScreenId = parent.screenId
  else if (parent && 'flowId' in parent) flow.parentFlowId = parent.flowId
  return { ...doc, flows: [...doc.flows, flow] }
}

export function renameFlowInDoc(doc: ProjectDoc, id: string, name: string): ProjectDoc {
  const nextName = slugifyName(name)
  return {
    ...doc,
    flows: doc.flows.map((flow) => (flow.id === id ? { ...flow, name: nextName } : flow)),
  }
}

export function removeFlowFromDoc(doc: ProjectDoc, id: string): ProjectDoc {
  const dropFlows = collectFlowClosure(doc, [id])
  const flows = doc.flows.filter((flow) => !dropFlows.has(flow.id))
  const removedFlowScreens = new Set(
    doc.flows.filter((flow) => dropFlows.has(flow.id)).flatMap((flow) => flow.screenIds),
  )
  const stillReferenced = new Set(flows.flatMap((flow) => flow.screenIds))
  const dropScreens = new Set(
    [...removedFlowScreens].filter((screenId) => !stillReferenced.has(screenId)),
  )

  return {
    ...doc,
    flows,
    screens: doc.screens.filter((screen) => !dropScreens.has(screen.id)),
    edges: doc.edges.filter(
      (edge) => !dropScreens.has(edge.source) && !dropScreens.has(edge.target),
    ),
  }
}

export function addStateToDoc(doc: ProjectDoc, screenId: string): ProjectDoc {
  const state: ScreenState = { id: makeId('state'), name: 'newState' }
  return {
    ...doc,
    screens: doc.screens.map((screen) =>
      screen.id === screenId ? { ...screen, states: [...screen.states, state] } : screen,
    ),
  }
}

export function renameStateInDoc(doc: ProjectDoc, id: string, name: string): ProjectDoc {
  const nextName = slugifyName(name)
  return {
    ...doc,
    screens: doc.screens.map((screen) => ({
      ...screen,
      states: screen.states.map((state) =>
        state.id === id ? { ...state, name: nextName } : state,
      ),
    })),
  }
}

export function removeStateFromDoc(doc: ProjectDoc, id: string): ProjectDoc {
  return {
    ...doc,
    screens: doc.screens.map((screen) => ({
      ...screen,
      states: screen.states.filter((state) => state.id !== id),
    })),
  }
}
