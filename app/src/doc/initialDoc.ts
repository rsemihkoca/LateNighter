import { DEFAULT_MOCKUP_ID } from '../components/mockups'
import { slugifyName } from './slug'
import { DOC_VERSION, type ProjectDoc } from './types'

/** A fresh project starts empty: one project-named main flow, no dummy screens. */
export function createInitialDoc(name: string): ProjectDoc {
  const mainFlowName = slugifyName(name)

  return {
    version: DOC_VERSION,
    name,
    deviceId: DEFAULT_MOCKUP_ID,
    flows: [
      {
        id: 'flow-main',
        name: mainFlowName,
        kind: 'main',
        screenIds: [],
      },
    ],
    screens: [],
    edges: [],
  }
}
